import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same reasoning as api's `cors: { origin: true }` (main.ts) — this is
    // a local-network-only household system (PROJECT.md §3), reached by
    // whatever LAN IP/mDNS name (docker.local, a router-assigned hostname,
    // ...) a given machine happens to use, not a fixed one worth
    // enumerating. Vite's Host-header check (added against DNS-rebinding
    // attacks from the public internet) has no real target to defend here.
    allowedHosts: true,
  },
  preview: {
    port: 5173,
    allowedHosts: true,
  },
});
