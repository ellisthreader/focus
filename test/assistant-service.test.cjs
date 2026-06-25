"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  extractResponseText,
  parseAssistantPlan,
  readCredentialConfig,
  requestAssistantPlan,
  transcribeAudio,
  writeCredentialConfig
} = require("../assistant-service.cjs");

const API_KEY = "sk-test-secret-value";

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return value;
    }
  };
}

function workSchedulePlan() {
  return {
    message: "I prepared your weekday work schedule for approval.",
    actions: [{
      version: 1,
      name: "create_calendar_schedule",
      arguments: {
        title: "Work",
        start_date: "2026-06-08",
        end_date: "2026-12-31",
        start_time: "17:00",
        end_time: "23:00",
        weekdays: [1, 2, 3, 4, 5],
        category: "work",
        location: "",
        notes: ""
      }
    }]
  };
}

test("requestAssistantPlan constructs a strict Responses API request", async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return jsonResponse({ output_text: JSON.stringify(workSchedulePlan()) });
  };

  const result = await requestAssistantPlan({
    apiKey: API_KEY,
    fetchImpl,
    prompt: "Add work Monday to Friday from 5 PM to 11 PM for the rest of this year.",
    currentDate: "2026-06-08",
    timeZone: "Europe/Isle_of_Man"
  });

  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.authorization, `Bearer ${API_KEY}`);
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, "gpt-5.4-mini");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.match(body.instructions, /Europe\/Isle_of_Man/);
  assert.deepEqual(result.actions[0].arguments.weekdays, [1, 2, 3, 4, 5]);
});

test("extractResponseText and parseAssistantPlan accept nested output and reject untrusted fields", async () => {
  const plan = workSchedulePlan();
  const text = extractResponseText({
    output: [{
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(plan) }]
    }]
  });
  const parsed = parseAssistantPlan(text);
  const { normalizeAssistantAction } = await import("../src/core/assistant-actions.mjs");
  assert.deepEqual(normalizeAssistantAction(parsed.actions[0]), parsed.actions[0]);
  assert.equal("location" in parsed.actions[0].arguments, false);
  assert.equal("notes" in parsed.actions[0].arguments, false);

  const malicious = structuredClone(plan);
  malicious.actions[0].arguments.command = "rm -rf /";
  assert.throws(
    () => parseAssistantPlan(JSON.stringify(malicious)),
    (error) => error.code === "INVALID_PLAN" && /unsupported fields/.test(error.message)
  );

  const localTime = structuredClone(plan);
  localTime.actions[0].arguments.start_time = "5 PM";
  assert.throws(
    () => parseAssistantPlan(localTime),
    (error) => error.code === "INVALID_PLAN" && /HH:MM/.test(error.message)
  );
});

test("parseAssistantPlan accepts constrained calendar renames and deletions", () => {
  const parsed = parseAssistantPlan({
    message: "I prepared the calendar cleanup.",
    actions: [
      {
        version: 1,
        name: "update_calendar_events",
        arguments: {
          match_title: "Work",
          start_date: null,
          end_date: null,
          start_time: "17:00",
          end_time: "23:00",
          weekdays: [0, 1, 4, 5, 6],
          new_title: "Chinese"
        }
      },
      {
        version: 1,
        name: "delete_calendar_events",
        arguments: {
          match_title: "Chinese",
          start_date: null,
          end_date: null,
          start_time: "00:00",
          end_time: null,
          weekdays: [0, 1, 4, 5, 6]
        }
      }
    ]
  });

  assert.deepEqual(parsed.actions[0].arguments, {
    match_title: "Work",
    start_time: "17:00",
    end_time: "23:00",
    weekdays: [0, 1, 4, 5, 6],
    new_title: "Chinese"
  });
  assert.equal(parsed.actions[1].name, "delete_calendar_events");
});

test("credential config uses injected safeStorage and returns metadata only", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "focus-assistant-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "openai.json");
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from([...value].reverse().join(""), "utf8"),
    decryptString: (value) => [...value.toString("utf8")].reverse().join("")
  };

  const saved = await writeCredentialConfig({ filePath, apiKey: API_KEY, safeStorage });
  const status = await readCredentialConfig({ filePath });
  const stored = await fs.promises.readFile(filePath, "utf8");

  assert.deepEqual(saved, { configured: true, protected: true });
  assert.deepEqual(status, { configured: true, protected: true });
  assert.equal(stored.includes(API_KEY), false);
  assert.equal(JSON.stringify(saved).includes(API_KEY), false);
});

test("request failures never include the API key or upstream response body", async () => {
  await assert.rejects(
    requestAssistantPlan({
      apiKey: API_KEY,
      prompt: "Create a task",
      fetchImpl: async () => {
        throw new Error(`network failed with ${API_KEY}`);
      }
    }),
    (error) => {
      assert.equal(error.code, "NETWORK_ERROR");
      assert.equal(error.message.includes(API_KEY), false);
      return true;
    }
  );

  await assert.rejects(
    requestAssistantPlan({
      apiKey: API_KEY,
      prompt: "Create a task",
      fetchImpl: async () => jsonResponse({
        error: { message: `invalid credential ${API_KEY}` }
      }, 401)
    }),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.message.includes(API_KEY), false);
      assert.equal(error.message.includes("invalid credential"), false);
      return true;
    }
  );

  const unsafePlan = workSchedulePlan();
  unsafePlan.message = `Leaked ${API_KEY}`;
  await assert.rejects(
    requestAssistantPlan({
      apiKey: API_KEY,
      prompt: "Create a task",
      fetchImpl: async () => jsonResponse({ output_text: JSON.stringify(unsafePlan) })
    }),
    (error) => {
      assert.equal(error.code, "INVALID_RESPONSE");
      assert.equal(error.message.includes(API_KEY), false);
      return true;
    }
  );
});

test("transcribeAudio posts multipart audio with gpt-4o-mini-transcribe", async () => {
  let captured;
  const text = await transcribeAudio({
    apiKey: API_KEY,
    audio: Buffer.from("audio bytes"),
    filename: "voice note.webm",
    mimeType: "audio/webm",
    language: "en",
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse({ text: "Add work to my calendar." });
    }
  });

  assert.equal(captured.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.authorization, `Bearer ${API_KEY}`);
  assert.equal("content-type" in captured.init.headers, false);
  assert.ok(captured.init.body instanceof FormData);
  assert.equal(captured.init.body.get("model"), "gpt-4o-mini-transcribe");
  assert.equal(captured.init.body.get("language"), "en");
  assert.equal(captured.init.body.get("file").name, "voice-note.webm");
  assert.equal(captured.init.body.get("file").type, "audio/webm");
  assert.equal(text, "Add work to my calendar.");
});
