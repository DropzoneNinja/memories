import type { FastifyInstance } from 'fastify';
import { getImmichClientForUser, ImmichNotConfiguredError } from '../immich/config.js';
import { requireAuth } from '../auth/middleware.js';

// Album/asset endpoints for the web dashboard's album picker — dashboard
// only, so both require a logged-in session, and both resolve Immich
// credentials via the *requesting* user's own account (each household
// member connects their own Immich API key, so this is where
// "each user sees their own albums" actually happens). The TV never hits
// these directly or talks to Immich itself (PROJECT.md §6); the
// TV-facing thumbnail proxy and the dashboard's location lookup both need
// a specific TV's *configured* Immich account rather than whoever is
// currently logged in, so they live in routes/tvs.ts instead — see the
// comment on Configuration.immichOwnerId in schema.prisma for why.
export async function albumRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/albums', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const immich = await getImmichClientForUser(request.user!.userId);
      return await immich.listAlbums();
    } catch (err) {
      if (err instanceof ImmichNotConfiguredError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.get<{ Params: { id: string } }>(
    '/api/v1/albums/:id/assets',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const immich = await getImmichClientForUser(request.user!.userId);
        return await immich.listAlbumAssets(request.params.id);
      } catch (err) {
        if (err instanceof ImmichNotConfiguredError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    },
  );
}
