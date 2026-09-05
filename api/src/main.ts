import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { prisma } from "./db.js";
import { log } from "./log.js";
import { albumRoutes } from "./routes/albums.js";
import { tvRoutes } from "./routes/tvs.js";
import { authRoutes } from "./routes/auth.js";
import { settingsRoutes } from "./routes/settings.js";
import { adminRoutes } from "./routes/admin.js";

// Quiet in normal operation (PROJECT.md §9.15): disableRequestLogging
// turns off Fastify's own automatic "incoming request"/"request
// completed" line for every single HTTP call — otherwise a TV's
// heartbeat/playlist/commands polling (every few seconds, per TV, all
// day) would drown out the structured, meaningful events logged
// explicitly throughout the app (queue regeneration, Immich retries,
// pairing, config saves — see log.ts). `logger: log` reuses the same
// pino instance as the rest of the app so everything lands in one
// consistent stream instead of two.
const app = Fastify({ logger: log, disableRequestLogging: true });

// Infrequent, structured memory sample (§9.15's "memory/resource
// problems") — enough to spot slow growth across a multi-day run without
// being the noisy thing in the log itself.
const MEMORY_SAMPLE_INTERVAL_MS = 30 * 60_000;
setInterval(() => {
  const usage = process.memoryUsage();
  log.info(
    { rssMB: Math.round(usage.rss / 1024 / 1024), heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024) },
    'memory sample',
  );
}, MEMORY_SAMPLE_INTERVAL_MS).unref();

// Memories Web runs in an actual browser (unlike the TV, which is a
// packaged Tizen widget — a privileged native-app context that isn't
// subject to standard fetch CORS the way a browser tab is, confirmed
// across every TV<->API call since Phase 3 working without any CORS
// setup at all). `origin: true` reflects whatever Origin the browser
// sends — permissive, but appropriate here: this is a local-network-only
// household system (PROJECT.md §3), not exposed to the public internet,
// and the actual access control is the login/JWT layer (auth/), not
// CORS — locking CORS to a specific origin would just be a configuration
// burden (dev server vs. Docker vs. whatever LAN IP a phone/laptop uses)
// for no real security benefit here.
await app.register(cors, { origin: true });

// Push channel for TV config-change notifications (PROJECT.md §5.10,
// Phase 7) — realtime/hub.ts tracks subscribers, tvRoutes registers the
// actual `/tvs/:deviceId/ws` endpoint. Purely an optimization: the TV's
// heartbeat response is the guaranteed polling fallback, so a TV that
// can't hold a WebSocket open still catches up within one heartbeat.
await app.register(websocket);

// Smoke-test route for Phase 0 — confirms the API boots and can reach
// Postgres. Real TV/dashboard routes land in Phases 2-6.
app.get("/healthz", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok" };
});

await app.register(authRoutes);
await app.register(settingsRoutes);
await app.register(adminRoutes);
await app.register(albumRoutes);
await app.register(tvRoutes);

const port = Number(process.env.PORT ?? 4000);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => log.info({ port }, 'started'))
  .catch((err) => {
    log.error({ err }, 'failed to start');
    process.exit(1);
  });
