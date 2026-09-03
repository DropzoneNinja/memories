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

Phase 0 scaffolding — see TASKS.md for what's done and what's next. Full
setup/dev/deploy/troubleshooting instructions land in Phase 8.
