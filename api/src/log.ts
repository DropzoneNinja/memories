import pino from 'pino';

// Shared structured logger (PROJECT.md §9.15) — the same pino instance is
// handed to Fastify's own `logger` option (main.ts) and imported directly
// by every app-level module below the HTTP layer (queue generation, the
// Immich client, pairing/config routes), so everything lands in one
// consistent structured stream instead of a mix of pino JSON and bare
// console.log/console.error. `LOG_LEVEL` defaults to 'info': quiet enough
// for normal operation, loud enough to still show the events that matter
// (queue regeneration, Immich retries/failures, pairing, config saves,
// Immich account connect/disconnect). Per-request HTTP tracing is
// deliberately NOT part of this — main.ts disables Fastify's automatic
// request/response logging, since a heartbeat/playlist poll every few
// seconds at 'info' would drown out everything else. Never log API keys,
// credentials, or tokens (§9.15) — true of every call site that uses this.
export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
