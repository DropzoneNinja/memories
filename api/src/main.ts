import "dotenv/config";
import Fastify from "fastify";
import { prisma } from "./db.js";
import { albumRoutes } from "./routes/albums.js";
import { tvRoutes } from "./routes/tvs.js";

const app = Fastify({ logger: true });

// Smoke-test route for Phase 0 — confirms the API boots and can reach
// Postgres. Real TV/dashboard routes land in Phases 2-6.
app.get("/healthz", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok" };
});

await app.register(albumRoutes);
await app.register(tvRoutes);

const port = Number(process.env.PORT ?? 4000);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
