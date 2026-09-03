import { defineConfig } from "vite";

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
});
