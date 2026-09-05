# Memories

A self-hosted photo-frame system for a Samsung Frame TV, sourced from a
self-hosted [Immich](https://immich.app) library. See
[INSTALLATION.md](INSTALLATION.md) to stand up the stack and deploy the TV
app, [PROJECT.md](PROJECT.md) for the full spec, and [TASKS.md](TASKS.md)
for the build checklist. `PROJECT_OLD.md` is superseded and kept for
historical reference only.

## Layout

- `api/` — Memories API (Node.js, TypeScript, Fastify, Prisma/PostgreSQL) —
  the brain: Immich integration, composition/colour engines, TV registry,
  user accounts, queue generation.
- `web/` — Memories Web dashboard (React, TypeScript, Vite) — pair/manage
  TVs, pick albums, connect your own Immich account.
- `tv/` — Memories TV client (Tizen Web Application, TypeScript, Vite) — a
  thin renderer with no settings UI of its own (PROJECT.md §6).
- `docker-compose.yml` — runs `api` + `web` + `postgres`. `tv/` is **not**
  part of Compose — it's built, signed, and installed on the physical TV
  instead (see [INSTALLATION.md](INSTALLATION.md#tv-build--deploy)).

## Status

Phases 0-8 substantially complete — see [TASKS.md](TASKS.md) for the full
phase-by-phase build log. One thing genuinely isn't "done" in the normal
sense: **soak testing** (running continuously for 24h+/multi-day, watching
for memory growth or degradation) is a real-time activity, not something
that can be checked off by writing code — see TASKS.md's Phase 8 section
for exactly what's been set up to make that observation possible (logging,
the diagnostics view, an automated bounded-growth regression test) and
what's still an open, real-time task.

## Dev workflow

Each package runs independently outside Docker for faster iteration:

```sh
# API — needs DATABASE_URL, IMMICH_BASE_URL, SESSION_SECRET,
# ENCRYPTION_KEY in the environment (or api/.env)
cd api && npm install && npm run dev

# Web dashboard — needs VITE_API_BASE_URL pointed at the API above
cd web && npm install && npm run dev

# TV client — runs in a normal desktop browser; Samsung-specific bits
# (remote keys, device info) are isolated behind TizenAdapter and no-op
# gracefully off-device (PROJECT.md §10)
cd tv && npm install && npm run dev
```

Run `npx prisma migrate dev` from `api/` after changing
`api/prisma/schema.prisma`.

## Testing

Every package has its own unit test suite (`node:test`, no framework):

```sh
cd api && npm test
cd web && npx tsc --noEmit   # web has no unit test suite yet — type-check stands in
cd tv && npm test
```

`api`'s suite includes a real Immich integration test that's skipped
automatically unless `IMMICH_BASE_URL`/`IMMICH_API_KEY` are set in the
shell (deliberately separate from the app's own per-user credential
storage — this is just a convenient way to point one test at a real
instance from a dev machine).

## Logs & diagnostics

Both the API and the TV log structured events rather than a full request/
response trace — quiet in normal operation, detailed enough to explain a
TV that "just stopped updating" days later (PROJECT.md §9.15). Neither
ever logs API keys, credentials, or tokens.

- **API** (`api/src/log.ts`, pino JSON to stdout — `docker compose logs
  api`): Immich connection/retries/failures, queue regeneration, pairing,
  config saves, Immich account connect/disconnect, periodic memory
  samples. Routine per-request polling (heartbeat, playlist, commands) is
  deliberately *not* logged — set `LOG_LEVEL=debug` in `.env` for
  per-composition detail, or `warn`/`error` for even quieter output.
- **TV** (`tv/src/log/Logger.ts`): the same idea, printed to the browser/
  WebKit console and also kept in a 200-entry ring buffer in memory —
  readable via the **hidden diagnostics view**: press the remote's **Up**
  button 3 times within 2 seconds to toggle it. It shows connection
  status, current/next photo, cache size, last sync time, last
  warning/error, live memory usage (where the browser engine exposes it),
  and the running app version — a small corner overlay, never shown
  during normal playback otherwise.

## Installing / deploying

See [INSTALLATION.md](INSTALLATION.md) for first-time setup (Docker
Compose, provisioning a login, connecting Immich) and building/installing
the TV app on real hardware — including pointing a TV at a specific
server deployment and troubleshooting real issues hit during development.
