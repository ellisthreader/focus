const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const files = [
  "main.cjs",
  "preload.cjs",
  "medical-vault.cjs",
  "assistant-service.cjs",
  "local-assistant-service.cjs",
  "local-ai-runtime.cjs",
  "pc-performance.cjs",
  "focusModel.js",
  "src/app.mjs"
];

for (const directory of ["src/core", "src/ui", "src/features"]) {
  for (const name of readdirSync(join(process.cwd(), directory))) {
    if (name.endsWith(".mjs")) files.push(join(directory, name));
  }
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
