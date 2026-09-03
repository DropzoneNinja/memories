import type { FastifyInstance } from 'fastify';
import { getImmichClient } from '../immich/config.js';
import { requireAuth } from '../auth/middleware.js';

// Album/asset endpoints for the web dashboard's album picker and, later,
// the composition/colour engines. The TV never hits these directly or
// talks to Immich itself — only Memories Web and the TV's own playlist
// endpoint (Phase 3) do, and both go through this API (PROJECT.md §6).
//
// The list/assets routes are dashboard-only, so they require a logged-in
// session (Phase 6) — but the thumbnail proxy below is called directly by
// the TV itself (every Presentation's asset URL points at it, §5.1), and
// the TV has no login concept at all (§6, §13), so it stays open.
export async function albumRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/albums', { preHandler: requireAuth }, async () => {
    const immich = getImmichClient();
    return immich.listAlbums();
  });

  app.get<{ Params: { id: string } }>(
    '/api/v1/albums/:id/assets',
    { preHandler: requireAuth },
    async (request) => {
      const immich = getImmichClient();
      return immich.listAlbumAssets(request.params.id);
    },
  );

  app.get<{ Params: { id: string }; Querystring: { size?: 'thumbnail' | 'preview' } }>(
    '/api/v1/assets/:id/thumbnail',
    async (request, reply) => {
      const immich = getImmichClient();
      const { body, contentType } = await immich.fetchThumbnail(
        request.params.id,
        request.query.size ?? 'preview',
      );
      reply.header('Content-Type', contentType);
      return reply.send(Buffer.from(body));
    },
  );
}
