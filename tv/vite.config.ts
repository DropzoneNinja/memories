import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Baked in at build time so the diagnostics view (diagnostics/
// DiagnosticsView.ts, Phase 8) can show which build is actually running on
// a given TV without a separate manifest fetch.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf-8"),
);

export default defineConfig({
  server: {
    port: 8081,
  },
  build: {
    // Conservative target for the Frame TV's built-in WebKit runtime.
    // Revisit once Phase 1 confirms the actual Tizen browser-engine version
    // on QA32LS03CBWXXY.
    target: "es2017",
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
