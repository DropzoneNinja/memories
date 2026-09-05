FROM node:20-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY package.json ./
EXPOSE 4000
# Applies any pending Prisma migrations before the server starts — without
# this, "the entire backend/web stack runs from a single docker-compose
# up" (PROJECT.md §11.3) wasn't actually true for a genuinely fresh clone:
# a brand-new Postgres volume had no tables at all until someone remembered
# to run `prisma migrate deploy` by hand. `migrate deploy` (not `dev`) is
# the non-interactive, production-safe form — applies what exists, never
# prompts, never generates a new migration.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
