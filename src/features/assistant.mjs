import { icon } from "../ui/icons.mjs";

export const page = Object.freeze({
  id: "assistant",
  label: "Focus AI",
  icon: "spark"
});

const bindings = new WeakMap();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function assistantState(state, ctx) {
  return ctx?.assistant || state?.assistant || {};
}

function isConfigured(assistant) {
  if (typeof assistant.configured === "boolean") return assistant.configured;
  if (typeof assistant.isConfigured === "boolean") return assistant.isConfigured;
  return ["configured", "ready", "connected"].includes(
    String(assistant.configurationStatus || assistant.connectionStatus || "").toLowerCase()
  );
}

function firstText(...values) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return value ? value.trim() : "";
}

function providerLabel(assistant) {
  const provider = firstText(
    assistant.providerLabel,
    assistant.provider,
    assistant.source,
    assistant.providerName
  );
  if (!provider || provider.toLowerCase() === "none") return "Local";
  return provider.replace(/(^|[-_ ])\w/g, (match) => match.toUpperCase()).replaceAll("_", " ");
}

function modelLabel(assistant) {
  return firstText(assistant.modelLabel, assistant.model, assistant.modelName) || "Default model";
}

function readinessFrom(assistant, configured) {
  const readiness = firstText(
    assistant.readiness,
    assistant.readinessStatus,
    assistant.providerStatus,
    assistant.connectionStatus
  ).toLowerCase();
  const runtimeUnavailable = assistant.runtimeAvailable === false;
  const modelUnavailable = assistant.modelInstalled === false;
  const unavailable = runtimeUnavailable
    || modelUnavailable
    || assistant.available === false
    || assistant.providerAvailable === false
    || assistant.localAvailable === false
    || assistant.ready === false
    || assistant.isReady === false
    || ["offline", "unavailable", "not ready", "setup required", "not configured"].includes(readiness);
  if (!configured || unavailable) {
    return {
      ready: false,
      label: runtimeUnavailable
        ? "Runtime offline"
        : modelUnavailable
          ? "Model required"
          : readiness === "offline"
            ? "Offline"
            : configured
              ? "Needs attention"
              : "Setup required"
    };
  }
  return { ready: true, label: "Ready" };
}

function isLocalProvider(assistant) {
  const provider = firstText(assistant.provider, assistant.source, assistant.providerName).toLowerCase();
  return !provider
    || provider === "none"
    || ["local", "ollama", "lm studio", "lm-studio", "localhost"].some((name) => provider.includes(name));
}

function voiceCapability(assistant, ready) {
  if (assistant.voiceAvailable === false) {
    return { available: false, label: "Voice input unavailable" };
  }
  if (!ready) {
    return { available: false, label: "Voice input requires local AI to be ready" };
  }
  return { available: true, label: "Start voice recording" };
}

function messagesFrom(state, assistant) {
  const messages = assistant.messages || assistant.conversation || state?.assistantMessages;
  return Array.isArray(messages) ? messages.filter(Boolean) : [];
}

function proposalFrom(assistant) {
  return assistant.proposedAction || assistant.proposal || assistant.pendingAction || null;
}

function messageText(message) {
  if (typeof message === "string") return message;
  return message?.content ?? message?.text ?? message?.message ?? "";
}

function messageRole(message) {
  const role = String(message?.role || message?.author || "assistant").toLowerCase();
  return role === "user" ? "user" : role === "system" ? "system" : "assistant";
}

function messageTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    dateTime: date.toISOString(),
    label: new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(date)
  };
}

function renderMessage(message, index) {
  const role = messageRole(message);
  const label = role === "user" ? "You" : "Focus AI";
  const time = messageTime(message?.createdAt || message?.timestamp || message?.time);
  return `
    <li class="assistant-message assistant-message--${role}" data-assistant-message data-role="${role}">
      <div class="assistant-message__avatar" aria-hidden="true">
        ${role === "user" ? escapeHtml(label.slice(0, 1)) : icon("spark", 15)}
      </div>
      <div class="assistant-message__body">
        <div class="assistant-message__meta">
          <strong>${label}</strong>
          ${time ? `<time datetime="${escapeHtml(time.dateTime)}">${escapeHtml(time.label)}</time>` : ""}
        </div>
        <div class="assistant-message__content">${escapeHtml(messageText(message) || `Message ${index + 1}`)}</div>
      </div>
    </li>
  `;
}

function renderThinkingMessage(status, startedAt) {
  const started = Number.isFinite(Number(startedAt)) ? Number(startedAt) : Date.now();
  return `
    <li class="assistant-message assistant-message--assistant assistant-message--thinking" data-assistant-thinking data-started-at="${started}">
      <div class="assistant-message__avatar" aria-hidden="true">${icon("spark", 15)}</div>
      <div class="assistant-message__body">
        <div class="assistant-message__meta">
          <strong>Focus AI</strong>
          <span data-assistant-thinking-time>Working now</span>
        </div>
        <div class="assistant-thinking">
          <span class="assistant-thinking__label">${escapeHtml(status || "Generating response")}</span>
          <span class="assistant-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
        <p class="assistant-thinking__hint">Your request is being processed. Local models can take a little longer.</p>
      </div>
    </li>
  `;
}

function proposalDetails(proposal) {
  const details = proposal?.details
    || proposal?.changes
    || proposal?.payload
    || proposal?.action?.arguments;
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  return Object.entries(details)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 8)
    .map(([key, value]) => `
      <div class="assistant-proposal__detail">
        <dt>${escapeHtml(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `).join("");
}

function renderProposalItems(proposal) {
  const items = proposal?.items || proposal?.preview?.items;
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <ul class="assistant-proposal__items">
      ${items.slice(0, 5).map((item) => {
        const payload = item?.payload || item || {};
        const label = payload.title || payload.name || payload.description || payload.label || item?.type || "Change";
        const timing = [payload.start, payload.startedAt, payload.occurredAt, payload.dueAt, payload.dueDate, payload.date].find(Boolean);
        const detail = [
          timing,
          Number.isFinite(payload.amountMinor) ? `${payload.currency || ""} ${(payload.amountMinor / 100).toFixed(2)}`.trim() : "",
          Number.isFinite(payload.calories) ? `${Math.round(payload.calories)} kcal` : "",
          Number.isFinite(payload.proteinGrams) ? `${payload.proteinGrams}g protein` : "",
          Number.isFinite(payload.carbsGrams) ? `${payload.carbsGrams}g carbs` : "",
          Number.isFinite(payload.fatGrams) ? `${payload.fatGrams}g fat` : "",
          Number.isFinite(payload.fiberGrams) ? `${payload.fiberGrams}g fiber` : "",
          Number.isFinite(payload.durationMinutes) ? `${payload.durationMinutes} min` : "",
          payload.confidence === "verified" ? "Verified source" : payload.confidence === "estimated" ? "Estimate" : ""
        ].filter(Boolean).join(" · ");
        const componentMatches = item?.type === "nutrition/add" && payload.notes
          ? String(payload.notes).slice(0, 300)
          : "";
        return `<li><strong>${escapeHtml(label)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}${componentMatches ? `<span>${escapeHtml(componentMatches)}</span>` : ""}</li>`;
      }).join("")}
    </ul>
    ${proposal.truncated ? `<p class="field__hint">And ${Math.max(1, Number(proposal.count || 0) - items.length)} more changes.</p>` : ""}
  `;
}

function renderProposal(proposal) {
  if (!proposal) return "";
  const action = proposal.action && typeof proposal.action === "object" ? proposal.action : proposal;
  const actionName = String(action.name || "").replaceAll("_", " ");
  const title = proposal.title || proposal.label || actionName || "Proposed action";
  const summary = proposal.summary
    || proposal.description
    || (typeof proposal.preview === "string" ? proposal.preview : proposal.preview?.summary)
    || "";
  const details = proposalDetails(proposal);
  const items = renderProposalItems(proposal);
  return `
    <section class="card assistant-proposal" data-assistant-proposal data-proposal-id="${escapeHtml(proposal.id || "")}" aria-labelledby="assistant-proposal-title">
      <header class="card__header">
        <div>
          <p class="eyebrow">Needs your approval</p>
          <h2 class="card__title" id="assistant-proposal-title">${escapeHtml(title)}</h2>
          ${summary ? `<p class="card__description">${escapeHtml(summary)}</p>` : ""}
        </div>
        <span class="badge">Preview</span>
      </header>
      ${details || items ? `
        <div class="card__body assistant-proposal__body">
          ${details ? `<dl class="assistant-proposal__details">${details}</dl>` : ""}
          ${items}
        </div>
      ` : ""}
      <footer class="card__footer">
        <button class="button button--ghost" type="button" data-assistant-action="cancel">Cancel</button>
        <button class="button button--primary" type="button" data-assistant-action="approve">Approve</button>
      </footer>
    </section>
  `;
}

export function renderHomeAssistant(state = {}, ctx = {}) {
  const assistant = assistantState(state, ctx);
  const configured = isConfigured(assistant);
  const proposal = proposalFrom(assistant);
  const status = String(assistant.status || (assistant.busy ? "Working" : "Ready"));
  const setupBusy = Boolean(assistant.setupBusy);
  const busy = Boolean(assistant.busy)
    || setupBusy
    || ["sending", "thinking", "transcribing", "approving"].includes(status.toLowerCase());
  const error = assistant.error?.message || assistant.error || "";
  const messages = messagesFrom(state, assistant);
  const latest = [...messages].reverse().find((message) => messageRole(message) === "assistant");

  return `
    <section class="card focus-ai-home" aria-labelledby="focus-ai-home-title">
      <header class="card__header">
        <div>
          <p class="eyebrow">Focus AI</p>
          <h2 class="card__title" id="focus-ai-home-title">What should I handle?</h2>
          <p class="card__description">${configured
            ? "Ask by typing or speaking. Review the change, then let Focus apply it."
            : "Connect OpenAI once, then ask Focus to manage your plans."}</p>
        </div>
        <div class="cluster">
          <span class="badge">${escapeHtml(status)}</span>
          <button class="button button--ghost button--sm" type="button" data-assistant-action="${configured ? "open" : "settings"}">${configured ? "Open chat" : "Connect"}</button>
        </div>
      </header>

      ${latest && !proposal ? `<p class="focus-ai-home__reply">${escapeHtml(messageText(latest))}</p>` : ""}
      ${renderProposal(proposal)}
      <div class="form-error assistant-error${error ? "" : " is-hidden"}" role="alert" data-assistant-error>${escapeHtml(error)}</div>

      <form class="focus-ai-home__composer" data-assistant-form>
        <label class="sr-only" for="focus-ai-home-prompt">Ask Focus AI</label>
        <textarea
          id="focus-ai-home-prompt"
          name="prompt"
          rows="2"
          maxlength="4000"
          placeholder="${configured ? "For example: Add work Monday to Friday, 5 PM to 11 PM, for this year" : "Connect Focus AI to start"}"
          ${configured && !busy ? "" : "disabled"}
          data-assistant-prompt
        ></textarea>
        <div class="focus-ai-home__actions">
          <div class="assistant-conversation__status" role="status" aria-live="polite" data-assistant-status>
            <span class="assistant-status-dot" aria-hidden="true"></span>
            <span data-assistant-status-text>${escapeHtml(status)}</span>
          </div>
          <div class="cluster">
            <button
              class="button button--secondary"
              type="button"
              data-assistant-action="record"
              aria-label="Start voice recording"
              aria-pressed="false"
              ${configured && !busy ? "" : "disabled"}
            >${icon("spark")} <span data-assistant-record-label>Speak</span></button>
            <button class="button button--primary" type="submit" ${configured && !busy ? "" : "disabled"}>Ask Focus</button>
          </div>
        </div>
      </form>
    </section>
  `;
}

export function renderDockedAssistant(state = {}, ctx = {}) {
  const assistant = assistantState(state, ctx);
  const configured = isConfigured(assistant);
  const readiness = readinessFrom(assistant, configured);
  const voice = voiceCapability(assistant, readiness.ready);
  const provider = providerLabel(assistant);
  const model = modelLabel(assistant);
  const messages = messagesFrom(state, assistant);
  const proposal = proposalFrom(assistant);
  const status = String(assistant.status || (assistant.busy ? "Working" : "Ready"));
  const setupBusy = Boolean(assistant.setupBusy);
  const busy = Boolean(assistant.busy)
    || setupBusy
    || ["sending", "thinking", "transcribing", "approving"].includes(status.toLowerCase());
  const error = assistant.error?.message || assistant.error || "";
  const canSend = readiness.ready && !busy;
  const canRecord = canSend && voice.available;

  return `
    <aside id="focus-ai-dock" class="focus-ai-dock" aria-labelledby="focus-ai-dock-title" data-assistant-readiness="${readiness.ready ? "ready" : "unavailable"}" data-assistant-busy="${busy}">
      <header class="focus-ai-dock__header">
        <div class="focus-ai-dock__identity">
          <p class="eyebrow">Companion</p>
          <h2 id="focus-ai-dock-title">Focus AI</h2>
          <p class="focus-ai-dock__provider" aria-label="Assistant provider and model">
            <span>${escapeHtml(provider)}</span>
            <span aria-hidden="true">·</span>
            <span title="${escapeHtml(model)}">${escapeHtml(model)}</span>
          </p>
        </div>
        <div class="focus-ai-dock__tools">
          <span class="assistant-status-dot" aria-hidden="true"></span>
          <span class="focus-ai-dock__status" role="status" aria-live="polite">
            <span class="sr-only">Assistant readiness: </span>
            <span data-assistant-status-text>${escapeHtml(setupBusy ? "Setting up" : busy ? status : readiness.label)}</span>
          </span>
          ${messages.length ? `<button class="icon-button" type="button" data-assistant-action="clear" aria-label="Clear Focus AI conversation">${icon("reset", 16)}</button>` : ""}
          <button class="icon-button" type="button" data-assistant-action="settings" aria-label="Open Focus AI settings">${icon("settings", 16)}</button>
        </div>
      </header>

      <div class="focus-ai-dock__content" data-assistant-conversation>
        ${renderConversation(messages, {
          configured,
          ready: readiness.ready,
          local: isLocalProvider(assistant),
          provider,
          model,
          setupBusy,
          busy,
          status,
          startedAt: assistant.requestStartedAt
        })}
        ${renderProposal(proposal)}
      </div>

      <div class="form-error assistant-error${error ? "" : " is-hidden"}" role="alert" data-assistant-error>${escapeHtml(error)}</div>

      <form class="focus-ai-dock__composer" data-assistant-form>
        <label class="sr-only" for="focus-ai-dock-prompt">Ask Focus AI</label>
        <textarea
          id="focus-ai-dock-prompt"
          name="prompt"
          rows="3"
          maxlength="4000"
          placeholder="${readiness.ready ? "Ask Focus to handle something..." : "Set up local AI to start"}"
          ${canSend ? "" : "disabled"}
          aria-describedby="focus-ai-dock-hint"
          data-assistant-prompt
        >${escapeHtml(assistant.draft || "")}</textarea>
        <div class="focus-ai-dock__composer-actions">
          <button
            class="icon-button"
            type="button"
            data-assistant-action="record"
            aria-label="${escapeHtml(voice.label)}"
            title="${escapeHtml(voice.label)}"
            aria-pressed="false"
            ${canRecord ? "" : "disabled"}
          >${icon("spark", 17)}<span class="sr-only" data-assistant-record-label>${escapeHtml(voice.available ? "Speak" : voice.label)}</span></button>
          <span class="focus-ai-dock__hint" id="focus-ai-dock-hint">${escapeHtml(voice.available ? "Enter to send · Shift+Enter for a new line" : voice.label)}</span>
          <button class="focus-ai-dock__send" type="submit" aria-label="Send to Focus AI" ${canSend && String(assistant.draft || "").trim() ? "" : "disabled"}>${icon("chevron", 18)}</button>
        </div>
      </form>
    </aside>
  `;
}

function renderConversation(messages, capability) {
  if (typeof capability === "boolean") {
    capability = {
      configured: capability,
      ready: capability,
      local: true,
      provider: "Local",
      model: "Default model",
      setupBusy: false
    };
  }
  if (!capability.ready) {
    const actionLabel = capability.setupBusy
      ? "Setting up..."
      : capability.configured
        ? "Retry local AI"
        : "Set up local AI";
    return `
      <div class="empty-state assistant-empty assistant-local-setup" data-assistant-configuration>
        <div>
          <span class="assistant-empty__icon" aria-hidden="true">${icon("spark", 24)}</span>
          <h2>Local AI is not ready</h2>
          <p>${escapeHtml(capability.provider)} needs to be available before Focus can plan or update your data.</p>
          <p class="assistant-local-setup__model">Model: ${escapeHtml(capability.model)}</p>
          <div class="assistant-local-setup__actions">
            ${capability.local ? `<button class="button button--primary button--sm" type="button" data-assistant-action="setup-local" ${capability.setupBusy ? "disabled aria-busy=\"true\"" : ""}>${actionLabel}</button>` : ""}
            <button class="button button--ghost button--sm" type="button" data-assistant-action="settings">Settings</button>
          </div>
        </div>
      </div>
    `;
  }
  if (!messages.length) {
    return `
      <div class="empty-state assistant-empty">
        <div>
          <span class="assistant-empty__icon" aria-hidden="true">${icon("spark", 24)}</span>
          <h2>What can I do for you?</h2>
          <p>Ask for help planning your day, creating tasks, or preparing calendar changes.</p>
        </div>
      </div>
    `;
  }
  return `
    <ol class="assistant-conversation__list">
      ${messages.map(renderMessage).join("")}
      ${capability.busy ? renderThinkingMessage(capability.status, capability.startedAt) : ""}
    </ol>
  `;
}

export function render(state = {}, ctx = {}) {
  const assistant = assistantState(state, ctx);
  const configured = isConfigured(assistant);
  const messages = messagesFrom(state, assistant);
  const proposal = proposalFrom(assistant);
  const status = String(assistant.status || (assistant.busy ? "Working" : "Ready"));
  const busy = Boolean(assistant.busy) || ["sending", "thinking", "transcribing", "approving"].includes(status.toLowerCase());
  const error = assistant.error?.message || assistant.error || "";

  return `
    <main class="page page--narrow assistant-page" data-page="assistant" aria-labelledby="assistant-title">
      <header class="page-header">
        <div>
          <p class="eyebrow">AI workspace</p>
          <h1 id="assistant-title">Focus AI</h1>
          <p>Ask Focus to help, then review every proposed change before it happens.</p>
        </div>
        ${messages.length ? `<button class="button button--ghost button--sm" type="button" data-assistant-action="clear">Clear conversation</button>` : ""}
      </header>

      <section class="card assistant-conversation" aria-label="Assistant conversation">
        <div class="assistant-conversation__status" role="status" aria-live="polite" data-assistant-status>
          <span class="assistant-status-dot" aria-hidden="true"></span>
          <span data-assistant-status-text>${escapeHtml(status)}</span>
        </div>
        <div class="assistant-conversation__scroll" data-assistant-conversation>
          ${renderConversation(messages, configured)}
        </div>
      </section>

      ${renderProposal(proposal)}

      <div class="form-error assistant-error${error ? "" : " is-hidden"}" role="alert" data-assistant-error>${escapeHtml(error)}</div>

      <form class="card assistant-composer" data-assistant-form>
        <label class="sr-only" for="assistant-prompt">Message the assistant</label>
        <textarea
          id="assistant-prompt"
          name="prompt"
          rows="3"
          maxlength="4000"
          placeholder="${configured ? "Ask Focus to do something..." : "Configure the assistant to start..."}"
          ${configured && !busy ? "" : "disabled"}
          data-assistant-prompt
        ></textarea>
        <div class="assistant-composer__actions">
          <p class="field__hint" data-assistant-recording-hint>Press Enter to send. Use Shift+Enter for a new line.</p>
          <div class="cluster">
            <button
              class="button button--secondary"
              type="button"
              data-assistant-action="record"
              aria-label="Start voice recording"
              aria-pressed="false"
              ${configured && !busy ? "" : "disabled"}
            >${icon("spark")} <span data-assistant-record-label>Record</span></button>
            <button class="button button--primary" type="submit" ${configured && !busy ? "" : "disabled"}>Send</button>
          </div>
        </div>
      </form>
    </main>
  `;
}

function stopTracks(stream) {
  stream?.getTracks?.().forEach((track) => {
    try {
      track.stop();
    } catch {
      // A stopped or detached track needs no further cleanup.
    }
  });
}

function setLocalStatus(root, text, error = "") {
  const status = root.querySelector("[data-assistant-status-text]");
  const errorBox = root.querySelector("[data-assistant-error]");
  if (status && text) status.textContent = text;
  if (errorBox) {
    errorBox.textContent = error;
    errorBox.classList.toggle("is-hidden", !error);
  }
}

function setRecordingUi(root, recording) {
  const button = root.querySelector('[data-assistant-action="record"]');
  if (!button) return;
  button.setAttribute("aria-pressed", String(recording));
  button.setAttribute("aria-label", recording ? "Stop voice recording" : "Start voice recording");
  button.dataset.recording = String(recording);
  const label = button.querySelector("[data-assistant-record-label]");
  if (label) label.textContent = recording ? "Stop" : "Record";
}

function resizePrompt(prompt) {
  if (!prompt) return;
  prompt.style.height = "auto";
  prompt.style.height = `${Math.min(Math.max(prompt.scrollHeight, 72), 180)}px`;
}

export function unbind(root) {
  const binding = bindings.get(root);
  if (!binding) return;
  binding.cleanup();
  bindings.delete(root);
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return () => {};
  unbind(root);

  const session = {
    active: true,
    chunks: [],
    discard: false,
    recorder: null,
    requestId: 0,
    starting: false,
    stream: null
  };
  const proposal = root.querySelector("[data-assistant-proposal]");

  const releaseStream = () => {
    stopTracks(session.stream);
    session.stream = null;
  };

  const stopRecording = (discard = false) => {
    if (session.starting) session.requestId += 1;
    session.discard ||= discard || session.starting;
    session.starting = false;
    const recorder = session.recorder;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (error) {
        setLocalStatus(root, "Recording failed", error?.message || "Unable to stop recording.");
      }
    }
    releaseStream();
    setRecordingUi(root, false);
  };

  const startRecording = async () => {
    const mediaDevices = globalThis.navigator?.mediaDevices;
    if (typeof globalThis.MediaRecorder !== "function" || !mediaDevices?.getUserMedia) {
      setLocalStatus(root, "Voice unavailable", "Voice recording is not supported on this device.");
      return;
    }
    session.starting = true;
    const requestId = ++session.requestId;
    setLocalStatus(root, "Requesting microphone access");
    setRecordingUi(root, true);
    session.discard = false;
    session.chunks = [];
    let stream;
    try {
      stream = await mediaDevices.getUserMedia({ audio: true });
      if (!session.active || requestId !== session.requestId || session.discard) {
        stopTracks(stream);
        if (requestId === session.requestId) setRecordingUi(root, false);
        return;
      }
      session.starting = false;
      session.stream = stream;
      const recorder = new MediaRecorder(stream);
      session.recorder = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) session.chunks.push(event.data);
      });
      recorder.addEventListener("error", (event) => {
        session.discard = true;
        setLocalStatus(root, "Recording failed", event.error?.message || "The microphone stopped unexpectedly.");
        stopRecording(true);
      });
      recorder.addEventListener("stop", async () => {
        stopTracks(stream);
        if (session.stream === stream) session.stream = null;
        setRecordingUi(root, false);
        const chunks = session.chunks.splice(0);
        session.recorder = null;
        if (!session.active || session.discard || !chunks.length) return;
        const audio = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || "audio/webm" });
        setLocalStatus(root, "Transcribing");
        try {
          await actions.assistantTranscribe?.(audio, { mimeType: audio.type });
        } catch (error) {
          setLocalStatus(root, "Transcription failed", error?.message || "Unable to transcribe that recording.");
        }
      }, { once: true });
      recorder.start();
      setRecordingUi(root, true);
      setLocalStatus(root, "Listening");
    } catch (error) {
      stopTracks(stream);
      if (requestId !== session.requestId) return;
      session.starting = false;
      releaseStream();
      session.recorder = null;
      setRecordingUi(root, false);
      setLocalStatus(root, "Microphone unavailable", error?.message || "Microphone access was not granted.");
    }
  };

  const onClick = async (event) => {
    const control = event.target?.closest?.("[data-assistant-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.assistantAction;
    if (action === "record") {
      if (session.starting || session.recorder?.state === "recording") stopRecording();
      else void startRecording();
    } else if (action === "approve") {
      actions.assistantApprove?.(proposal?.dataset.proposalId);
    } else if (action === "cancel") {
      actions.assistantCancel?.(proposal?.dataset.proposalId);
    } else if (action === "clear") {
      actions.assistantClear?.();
    } else if (action === "settings") {
      actions.openAssistantSettings?.();
    } else if (action === "setup-local") {
      control.disabled = true;
      setLocalStatus(root, "Setting up local AI");
      try {
        if (typeof actions.setupLocalAssistant === "function") {
          await actions.setupLocalAssistant();
        } else {
          actions.openAssistantSettings?.();
        }
      } catch (error) {
        setLocalStatus(root, "Local AI unavailable", error?.message || "Could not start the local assistant.");
      } finally {
        if (control.isConnected) control.disabled = false;
      }
    } else if (action === "open") {
      actions.navigate?.("assistant");
    }
  };

  const onSubmit = (event) => {
    const form = event.target?.closest?.("[data-assistant-form]");
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    const prompt = String(new FormData(form).get("prompt") || "").trim();
    if (!prompt) return;
    actions.assistantSend?.(prompt);
  };

  const onInput = (event) => {
    if (!event.target?.matches?.("[data-assistant-prompt]")) return;
    const value = String(event.target.value || "").slice(0, 4000);
    actions.assistantDraft?.(value);
    resizePrompt(event.target);
    const submit = event.target.form?.querySelector?.('[type="submit"]');
    if (submit) submit.disabled = !value.trim();
  };

  const onKeydown = (event) => {
    if (!event.target?.matches?.("[data-assistant-prompt]")) return;
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      event.target.form?.requestSubmit();
    }
  };

  const cleanup = () => {
    if (!session.active) return;
    session.active = false;
    stopRecording(true);
    root.removeEventListener("click", onClick);
    root.removeEventListener("submit", onSubmit);
    root.removeEventListener("keydown", onKeydown);
    root.removeEventListener("input", onInput);
    globalThis.removeEventListener?.("pagehide", cleanup);
    if (session.thinkingTimer) globalThis.clearInterval?.(session.thinkingTimer);
  };

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("input", onInput);
  globalThis.addEventListener?.("pagehide", cleanup, { once: true });
  bindings.set(root, { cleanup });
  const prompt = root.querySelector("[data-assistant-prompt]");
  resizePrompt(prompt);
  const thinking = root.querySelector("[data-assistant-thinking]");
  if (thinking) {
    const updateThinkingTime = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - Number(thinking.dataset.startedAt || Date.now())) / 1000));
      const label = thinking.querySelector("[data-assistant-thinking-time]");
      if (label) label.textContent = elapsed < 2 ? "Working now" : `${elapsed}s`;
    };
    updateThinkingTime();
    session.thinkingTimer = globalThis.setInterval?.(updateThinkingTime, 1000);
  }
  root.querySelector("[data-assistant-conversation]")?.scrollTo?.({
    top: Number.MAX_SAFE_INTEGER,
    behavior: thinking ? "smooth" : "auto"
  });
  return cleanup;
}
