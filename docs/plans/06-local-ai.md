# Local AI Implementation Plan

## Goal

Focus should provide a useful assistant without requiring an OpenAI API key.
Typed requests run through a model on the user's computer, produce validated
calendar/task/reminder proposals, and keep the existing explicit approval step
before any application data changes.

## Reviewed Decisions

- The default provider is `local`.
- Ollama is the local model server because it provides a small localhost API,
  model lifecycle management, and NVIDIA acceleration without coupling Focus to
  model file formats.
- The default model is `qwen3:4b-instruct`. Its size is appropriate for this machine's
  GTX 1080 (8 GB VRAM) and 16 GB RAM while retaining useful instruction and
  structured-output behavior.
- Focus never falls back from local inference to OpenAI automatically.
- OpenAI remains an optional advanced provider for users who explicitly choose
  it and provide a credential.
- The existing strict action schema, validator, preview, 400-change cap, and
  user approval step remain provider-independent security boundaries.
- Local voice is reported as unavailable until an offline transcription runtime
  is deliberately provisioned. A microphone control must not imply that audio
  will be sent locally when no local speech model exists.

## Architecture

### Local inference service

Add a focused CommonJS module that:

- checks Ollama health through `http://127.0.0.1:11434/api/version`;
- lists installed models through `/api/tags`;
- requests non-streaming structured output through `/api/generate`;
- supplies the existing JSON schema as Ollama's `format`;
- uses deterministic generation settings and a bounded context window;
- parses every response with the existing `parseAssistantPlan` validator;
- applies request timeouts and returns stable, user-safe error codes.

Only loopback addresses are accepted by the local provider. Model prose is
never executed directly.

### Runtime lifecycle

Add a runtime manager that:

- discovers `ollama` in `PATH` or `~/.local/bin`;
- starts `ollama serve` detached only when the local API is unavailable;
- stores process logs under Electron's user-data directory;
- checks whether `qwen3:4b-instruct` is installed;
- provisions the model through the local API;
- avoids `sudo`, shell interpolation, and app-start model downloads.

Focus startup performs only a cheap health/status check. Model loading occurs
on the first prompt, and a short keep-alive avoids paying that cost repeatedly.

### Provider state

Persist non-secret provider preferences separately from the encrypted OpenAI
credential:

```json
{
  "provider": "local",
  "localModel": "qwen3:4b-instruct"
}
```

Electron IPC exposes:

- current provider, model, runtime, model, and voice readiness;
- provider selection;
- local runtime/model setup;
- provider-routed plan generation;
- provider-routed transcription with an explicit unsupported-local-voice error.

Renderer code treats `configured` as "ready to accept a request", not merely
"a preference exists".

## User Experience

- The full-height right-side Focus AI dock remains permanently available.
- A compact status line identifies `Local` and the active model.
- When Ollama or its model is missing, the dock offers one setup/retry action.
- Settings presents Local AI as the primary private choice.
- OpenAI credential controls live in an advanced cloud section.
- The microphone is disabled when local transcription is unavailable and its
  accessible label explains why.
- Errors distinguish runtime missing, service unavailable, model missing,
  timeout, invalid model output, and optional cloud credential failure.

## Installation

For this workstation, install Ollama under the user's home directory because
passwordless `sudo` is unavailable. Provision `qwen3:4b-instruct`, start the local
service, and verify `/api/version`, `/api/tags`, and one structured generation.

The application integration must also work when Ollama was installed separately
or is already running.

## Validation

1. Unit-test local API health, model matching, structured generation, timeout,
   invalid response, and redacted errors.
2. Unit-test binary discovery, detached startup arguments, health polling, and
   model provisioning.
3. Run syntax checks for Electron and renderer modules.
4. Run the complete existing test suite to protect persistence, reducers,
   assistant actions, and OpenAI's optional path.
5. Launch Focus with no OpenAI key, confirm the dock reports Local AI, submit a
   calendar request, inspect the proposal, and verify no state changes before
   approval.
6. Capture desktop screenshots and inspect the dock at supported widths.

## Plan Review

- **Core outcome:** Focus can understand typed requests without a paid API key.
- **Privacy:** local mode contacts loopback only and has no hidden cloud
  fallback.
- **Performance:** a 4B model fits the available GPU; startup avoids model load.
- **Permissions:** all proposed data mutations still require approval.
- **Simplicity:** one local default, one recovery action, cloud controls hidden
  as an advanced choice.
- **Failure safety:** unavailable runtime/model and unsupported voice are visible
  states, not silent degradation.
- **Scope:** four independent implementation workstreams are sufficient;
  additional agents would overlap shared Electron integration files.
