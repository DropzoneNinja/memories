# Memories

A self-hosted photo-frame system for a Samsung Frame TV, sourced from a
self-hosted [Immich](https://immich.app) library. See [PROJECT.md](PROJECT.md)
for the full spec and [TASKS.md](TASKS.md) for the build checklist.
`PROJECT_OLD.md` is superseded and kept for historical reference only.

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
  instead (see [TV build & deploy](#tv-build--deploy)).

## Status

Phases 0-8 substantially complete — see [TASKS.md](TASKS.md) for the full
phase-by-phase build log. One thing genuinely isn't "done" in the normal
sense: **soak testing** (running continuously for 24h+/multi-day, watching
for memory growth or degradation) is a real-time activity, not something
that can be checked off by writing code — see TASKS.md's Phase 8 section
for exactly what's been set up to make that observation possible (logging,
the diagnostics view, an automated bounded-growth regression test) and
what's still an open, real-time task.

## Prerequisites

- Docker + Docker Compose (runs `api` + `web` + `postgres`)
- Node.js 20+ and npm, for local dev outside Docker and for the TV build
- A running Immich instance reachable from wherever `api` runs
- For building/installing the actual TV app: a Samsung Account (for TV
  certificate signing) — see [TV build & deploy](#tv-build--deploy)

## Setup

1. Copy the env template and fill it in:

   ```sh
   cp .env.example .env
   ```

   - `POSTGRES_*` — any values; Compose provisions the database from these.
   - `IMMICH_BASE_URL` — your Immich server's address. This is the only
     Immich-related value that goes in `.env`: **API keys are no longer
     configured here** — each Memories Web user connects their own from
     the dashboard's Settings panel (see
     [Connecting Immich accounts](#connecting-immich-accounts)).
   - `SESSION_SECRET` — a real random value (signs dashboard login
     tokens). Don't leave it as `changeme`.
   - `ENCRYPTION_KEY` — a real random 32-byte hex value (encrypts each
     user's stored Immich API key at rest). Generate one with:

     ```sh
     openssl rand -hex 32
     ```

   - `WEB_API_BASE_URL` — the address the *browser* (not the TV) reaches
     the API on, e.g. `http://localhost:4000` for local dev or your LAN
     host's address for a real deployment.
   - `LOG_LEVEL` — optional, defaults to `info` (see
     [Logs & diagnostics](#logs--diagnostics)).

2. Bring up the backend/dashboard stack:

   ```sh
   docker compose up -d --build
   ```

   This starts `postgres` (host port `5433`, to avoid clashing with any
   local Postgres on `5432`), `api` (port `4000`), and `web` (port
   `5173`). The API container applies any pending Prisma migrations on
   startup, before it starts serving traffic — a single `docker compose
   up` is genuinely enough for a from-scratch deployment, fresh database
   included.

3. Provision a dashboard login — there's no self-registration form on
   purpose (PROJECT.md §12: a household system, not a multi-tenant
   product):

   ```sh
   cd api
   npm install   # only needed once, for the script's own dependencies
   npm run create-user -- --email you@example.com --password 'a real password' --admin
   ```

4. Open `http://localhost:5173` (or your LAN host's address), sign in,
   and connect your Immich account (below) before pairing a TV.

## Connecting Immich accounts

Each Memories Web user connects their **own** Immich API key from the
dashboard's "Immich Settings" panel (top bar) — generate one in Immich
under Account Settings → API Keys (minimum permissions: `album.read`,
`asset.read`, `asset.view`). The key is verified against Immich before
being saved, then stored encrypted (never returned by any API response).

Whoever last saves a TV's configuration determines which Immich account
that TV's photos come from (`Configuration.immichOwnerId` — see PROJECT.md
§7's addendum). If a TV's album picker shows "connect your Immich
account first," that's this — open Settings, connect a key, then save the
TV's configuration again.

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

## TV build & deploy

Built with the "Tizen TV" VS Code extension's underlying libraries,
scripted rather than IDE-driven:

```sh
cd tv
npm install
npm run build
npm run deploy [tvIp]   # defaults to $MEMORIES_TV_IP, then 10.10.10.80
```

`npm run deploy` builds, signs, installs, and launches on a real TV via
`sdb` (auto-downloaded on first use). First run mints a generic Tizen SDK
sample certificate — enough to produce a validly-*structured* package, but
a genuine retail Samsung TV additionally rejects it
(`Invalid certificate chain with certificate in signature`) until you've
registered a Samsung-issued, device-ID-linked distributor certificate:
install the "Tizen Extension" for VS Code, run its Certificate Manager
against your Samsung Account and the TV's device ID, then import the
resulting `.p12` via `node scripts/import-samsung-cert.cjs`. See
PROJECT.md §10 for the full story.

## Troubleshooting

Real issues hit during development, in case they recur:

- **TV makes zero network requests, not even a failed one** — Tizen's
  WAC-style access whitelist (unrelated to the `internet` privilege)
  silently blocks all outbound `fetch`/XHR unless `config.xml` declares
  `<access origin="*" subdomains="true"/>`. Fails completely silently
  on-device; check this first.
- **API can't reach Immich, but `dns.resolve4()` works fine in the same
  container** — Alpine's musl libc has a `getaddrinfo` bug that breaks
  Node's `fetch()`. `api/Dockerfile` uses `node:20-slim` (Debian), not
  Alpine, for exactly this reason — don't switch it back.
- **Install fails on real hardware but not the emulator**: `Check
  certificate error: Invalid certificate chain with certificate in
  signature` — see [TV build & deploy](#tv-build--deploy); the generic
  Tizen distributor cert isn't accepted by genuine retail units.
- **Tizen Studio doesn't work at all on Apple Silicon** — its
  Emulator/toolchain isn't supported on ARM Macs as of 6.x and the IDE is
  effectively deprecated. Use the "Tizen TV" VS Code extension instead
  (already how `tv/scripts/deploy.cjs` works) — see PROJECT.md §10.
- **A map tile provider returns HTTP 200 but shows a "API key required"
  watermark instead of tiles** — some providers (CARTO) now gate their
  free tiles behind a key while still returning success; invisible to a
  network-status check, only visible by actually looking. The dashboard's
  location map uses plain OpenStreetMap tiles instead.
- **Postgres port conflict** — Compose maps Postgres to host port `5433`,
  not `5432`, specifically to avoid clashing with a local Postgres
  install. Use `5433` for any tool connecting from the host.
- **`prisma migrate dev` can't find a database** — it reads `DATABASE_URL`
  from `api/.env`, which is separate from the root `.env` Compose uses;
  either create `api/.env` or pass `DATABASE_URL=... npx prisma migrate
  dev` inline.
