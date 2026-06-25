import test from "node:test";
import assert from "node:assert/strict";

import { GLOSSARY, attachGlossary } from "../src/ui/glossary.mjs";

test("glossary covers the core jargon", () => {
  for (const term of ["data drift", "dpia", "managed online endpoint", "shap", "fastapi", "blue/green", "precision", "recall"]) {
    assert.ok(GLOSSARY[term] && GLOSSARY[term].length > 0, `missing definition for ${term}`);
  }
});

test("every definition is a non-empty string", () => {
  for (const [term, def] of Object.entries(GLOSSARY)) {
    assert.equal(typeof def, "string", `${term} should map to a string`);
    assert.ok(def.trim().length > 0, `${term} has an empty definition`);
  }
});

test("attachGlossary is safe to call without a DOM and returns a cleanup", () => {
  const cleanup = attachGlossary(null);
  assert.equal(typeof cleanup, "function");
  cleanup(); // should not throw
});
