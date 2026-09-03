# Memories

See [PROJECT.md](PROJECT.md) for the full spec and [TASKS.md](TASKS.md) for
the build checklist. `PROJECT_OLD.md` is superseded and kept for historical
reference only.

## Layout

- `api/` — Memories API (Node.js, TypeScript, Fastify, Prisma/PostgreSQL)
- `web/` — Memories Web dashboard (React, TypeScript, Vite)
- `tv/` — Memories TV client (Tizen Web Application, TypeScript, Vite)
- `docker-compose.yml` — runs `api` + `web` + `postgres`. `tv/` is not part
  of Compose — it's packaged and installed on the physical TV instead.

## Status

Phases 0-6 complete (infra/Tizen toolchain, TV shell, API+Immich, TV<->API
pairing/playlist, server-side composition engine, colour/mat engine +
faux-3D framing, and the Memories Web dashboard with real login/auth) —
see TASKS.md for the full phase-by-phase build log. Full setup/dev/
deploy/troubleshooting instructions still land in Phase 8; in the
meantime, `docker compose up`, then `npm run create-user` in `api/` to
provision a dashboard login (see that script's usage message).
