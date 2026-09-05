# Installation

This covers standing up the Memories API/dashboard stack and building and
installing the TV app on a real Samsung Frame TV. See [README.md](README.md)
for the repo layout and dev workflow, and [PROJECT.md](PROJECT.md) for the
full spec.

## Prerequisites

- Docker + Docker Compose (runs `api` + `web` + `postgres`)
- Node.js 20+ and npm, for local dev outside Docker and for the TV build
- A running [Immich](https://immich.app) instance reachable from wherever
  `api` runs — Memories is a presentation layer on top of it, not a
  replacement
- For building/installing the actual TV app: a Samsung Account (for TV
  certificate signing) — see [TV build & deploy](#tv-build--deploy)

## 1. Configure and start the API + dashboard

1. Copy the env template and fill it in:

   ```sh
   cp .env.example .env
   ```

   - `POSTGRES_*` — any values; Compose provisions the database from these.
   - `IMMICH_BASE_URL` — your Immich server's address. This is the only
     Immich-related value that goes in `.env`: **API keys are not
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
     the API on, e.g. `http://localhost:4000` for local dev, or this
     server's real LAN/public address for a real deployment.
   - `LOG_LEVEL` — optional, defaults to `info`.

2. Bring up the backend/dashboard stack:

   ```sh
   docker compose up -d --build
   ```

   This starts `postgres` (host port `5433`, to avoid clashing with any
   local Postgres on `5432`), `api` (port `4000`), and `web` (port
   `5173`). The API container applies any pending Prisma migrations on
   startup, before it starts serving traffic — a single `docker compose
   up` is genuinely enough for a from-scratch deployment, fresh database
   included. Re-run `docker compose build && docker compose up -d` after
   pulling new code to redeploy an update.

3. Provision a dashboard login — there's no self-registration form on
   purpose (PROJECT.md §12: a household system, not a multi-tenant
   product):

   ```sh
   cd api
   npm install   # only needed once, for the script's own dependencies
   npm run create-user -- --email you@example.com --password 'a real password' --admin
   ```

4. Open `http://<this-server>:5173`, sign in, and connect your Immich
   account (below) before pairing a TV.

## Connecting Immich accounts

Each Memories Web user connects their **own** Immich API key from the
dashboard's "Settings" panel (top bar) — generate one in Immich under
Account Settings → API Keys (minimum permissions: `album.read`,
`asset.read`, `asset.view`). The key is verified against Immich before
being saved, then stored encrypted (never returned by any API response).

Whoever last saves a TV's configuration determines which Immich account
that TV's photos/videos come from (`Configuration.immichOwnerId` — see
PROJECT.md §7's addendum). If a TV's album picker shows "connect your
Immich account first," that's this — open Settings, connect a key, then
save the TV's configuration again.

## TV build & deploy

Built with the "Tizen TV" VS Code extension's underlying libraries,
scripted rather than IDE-driven — no Tizen Studio IDE needed (and its own
toolchain isn't supported on Apple Silicon anyway, see
[Troubleshooting](#troubleshooting)).

```sh
cd tv
npm install
npm run deploy [tvIp] [serverUrl]
```

One command builds, signs, installs, and launches the app on a real TV via
`sdb` (auto-downloaded on first use) — no separate `npm run build` step
needed, `deploy` does it for you.

- **`tvIp`** — the TV's LAN address. Defaults to `$MEMORIES_TV_IP`, then
  `10.10.10.80`.
- **`serverUrl`** — which Memories API this TV should talk to (e.g.
  `https://memories.example.com` or `http://10.10.10.103:4000`), baked
  into the build. **Pointing a TV at a different/new server deployment is
  just this argument** — no source changes needed:

  ```sh
  npm run deploy 10.10.10.80 https://memories.newserver.com
  ```

  Once given, the URL is saved to `tv/.env` (gitignored, local to this
  machine) and **every later deploy that omits it reuses the last one
  automatically** — you only need to pass it again when actually
  switching servers. This file lives on the dev machine, not the TV, so
  it survives every redeploy regardless of what happens to the TV's own
  storage (see [Every redeploy re-pairs the TV](#every-redeploy-re-pairs-the-tv)
  below). To update just the server URL while keeping the default TV IP:

  ```sh
  npm run deploy '' https://memories.newserver.com
  ```

### First-time certificate setup

First run mints a generic Tizen SDK sample certificate — enough to
produce a validly-*structured* package, but a genuine retail Samsung TV
additionally rejects it (`Invalid certificate chain with certificate in
signature`) until you've registered a Samsung-issued, device-ID-linked
distributor certificate:

1. Install the "Tizen Extension" for VS Code.
2. Run its Certificate Manager against your Samsung Account and the TV's
   device ID to produce a `.p12`.
3. Register it as the active profile's distributor slot (see
   `~/tizen-studio-data/vscode-tizentv/resource/profiles.xml` — this is
   what `deploy.cjs` reuses automatically once it exists).

See PROJECT.md §10 for the full story. This is a one-time setup per dev
machine, not per deploy.

### Every redeploy re-pairs the TV

`deploy.cjs` uninstalls the app before reinstalling it, which wipes its
`localStorage` — so **every deploy generates a new device ID and the TV
shows a pairing screen afterward**, even if nothing else changed. After
each deploy:

1. Note the pairing code shown on the TV (or check the API/database for
   the newest unpaired `Tv` row if you can't see the screen).
2. In the dashboard, "Pair a TV" → enter the code → name it.
3. Delete the old, now-stale entry for that TV (hover it in the TV list
   for the delete control) to keep the list clean.

### Developer Mode must be enabled and pointed at this machine

Samsung TVs only accept `sdb` connections from an IP explicitly
allow-listed on the TV itself. If `npm run deploy` fails with `error:
failed to connect to remote target` — even though the TV is clearly
online (reachable in `arp -a`, and `nc -zv <tvIp> 26101` succeeds) — this
is almost always the cause, not a real network problem:

1. On the TV: Apps screen → type `12345` on the remote → the Developer
   Mode dialog appears.
2. Set **Host PC IP** to this machine's current LAN address (check with
   `ifconfig`/`ipconfig` — it changes if this machine's DHCP lease
   changes, which silently breaks a deploy that worked yesterday).
3. Make sure Developer Mode is **On**.
4. The TV may need a restart for the change to take effect.

## Troubleshooting

Real issues hit during development, in case they recur:

- **`sdb connect` fails but the TV is clearly online** — see
  [Developer Mode must be enabled and pointed at this machine](#developer-mode-must-be-enabled-and-pointed-at-this-machine)
  above. A raw TCP port answering (`nc -zv <tvIp> 26101`) does not mean
  `sdb`'s own handshake will succeed — that's gated separately by the
  Developer Mode Host PC IP allowlist.
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
  signature` — see [First-time certificate setup](#first-time-certificate-setup);
  the generic Tizen distributor cert isn't accepted by genuine retail
  units.
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
