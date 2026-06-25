import test from "node:test";
import assert from "node:assert/strict";
import * as settings from "../src/features/settings.mjs";

function fakeRoot() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    removeEventListener() {},
    contains() {
      return true;
    }
  };
}

function clickControl(root, action) {
  const control = {
    disabled: false,
    dataset: { action },
    closest(selector) {
      return selector === "[data-action]" ? this : null;
    }
  };
  root.listeners.click({ target: control });
}

test("settings renders local AI as the private default", () => {
  const html = settings.render({}, {
    assistant: {
      provider: "local",
      runtimeAvailable: true,
      modelInstalled: true,
      localModel: "qwen3:4b-instruct"
    }
  });

  assert.match(html, /Local AI \(default\)/);
  assert.match(html, /Prompts and app context stay on this device/);
  assert.match(html, /qwen3:4b-instruct/);
  assert.match(html, /Runtime[\s\S]*Available/);
  assert.match(html, /Advanced cloud provider/);
  assert.match(html, /OpenAI API key/);
});

test("settings exposes persisted PC performance thresholds", () => {
  const html = settings.render({
    settings: {
      pcPerformance: {
        enabled: true,
        notificationsEnabled: true,
        cpuThreshold: 92,
        temperatureThreshold: 88,
        memoryThreshold: 94,
        diskThreshold: 96
      }
    }
  }, {});

  assert.match(html, /PC performance alerts/);
  assert.match(html, /data-performance-setting="enabled"/);
  assert.match(html, /value="92"/);
  assert.match(html, /value="88"/);
});

test("settings progressively discloses controls through accessible categories", () => {
  const html = settings.render({}, {});

  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"[^>]*data-settings-category="general"/);
  assert.match(html, /aria-selected="false"[^>]*data-settings-category="assistant"/);
  assert.match(html, /data-settings-panel="general"/);
  assert.match(html, /data-settings-panel="assistant" hidden/);
  assert.match(html, /data-settings-panel="performance" hidden/);
  assert.match(html, /data-settings-panel="data" hidden/);
  assert.match(html, /data-settings-panel="advanced" hidden/);
  assert.match(html, /data-profile-form/);
  assert.match(html, /data-assistant-settings-form/);
  assert.match(html, /data-mysql-form/);
});

test("settings category controls update tab and panel state", () => {
  function tab(category, selected = false) {
    return {
      dataset: { settingsCategory: category },
      tabIndex: selected ? 0 : -1,
      attributes: { "aria-selected": String(selected) },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      focus() {
        this.focused = true;
      },
      closest(selector) {
        return selector === "[data-settings-category]" ? this : null;
      }
    };
  }
  const tabs = [tab("general", true), tab("assistant")];
  const panels = [
    { dataset: { settingsPanel: "general" }, hidden: false },
    { dataset: { settingsPanel: "assistant" }, hidden: true }
  ];
  const root = fakeRoot();
  root.querySelectorAll = (selector) => selector === "[data-settings-category]" ? tabs : panels;
  settings.bind(root, {});

  root.listeners.click({ target: tabs[1] });

  assert.equal(tabs[0].attributes["aria-selected"], "false");
  assert.equal(tabs[1].attributes["aria-selected"], "true");
  assert.equal(tabs[1].tabIndex, 0);
  assert.equal(tabs[1].focused, true);
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);

  root.listeners.keydown({
    target: tabs[1],
    key: "ArrowLeft",
    preventDefault() {}
  });

  assert.equal(tabs[0].attributes["aria-selected"], "true");
  assert.equal(tabs[0].focused, true);
  assert.equal(panels[0].hidden, false);
  assert.equal(panels[1].hidden, true);
});

test("settings offers local setup and retry states defensively", () => {
  const initial = settings.render({}, { assistant: {} });
  assert.match(initial, /Set up local AI/);
  assert.match(initial, /Runtime[\s\S]*Not detected/);

  const partial = settings.render({}, {
    assistant: {
      local: { runtimeAvailable: true, modelInstalled: false, model: "custom:4b" }
    }
  });
  assert.match(partial, /Retry local AI setup/);
  assert.match(partial, /custom:4b/);
  assert.match(partial, /Not installed/);
});

test("settings preserves legacy OpenAI key status inside advanced options", () => {
  const html = settings.render({}, {
    assistant: {
      configured: true,
      source: "environment",
      model: "gpt-5.4-mini"
    }
  });

  assert.match(html, /Local AI \(default\)/);
  assert.match(html, /Environment variable/);
  assert.match(html, /OPENAI_API_KEY/);
  assert.doesNotMatch(html, /id="assistant-api-key"/);
});

test("settings binds local setup and explicit provider selection", () => {
  const root = fakeRoot();
  const calls = [];
  settings.bind(root, {
    setupLocalAssistant() {
      calls.push(["setup"]);
    },
    setAssistantProvider(provider) {
      calls.push(["provider", provider]);
    }
  });

  clickControl(root, "assistant-setup-local");
  clickControl(root, "assistant-use-openai");
  clickControl(root, "assistant-use-local");

  assert.deepEqual(calls, [
    ["setup"],
    ["provider", "openai"],
    ["provider", "local"]
  ]);
});
