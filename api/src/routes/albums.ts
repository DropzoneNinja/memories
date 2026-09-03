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

  // Dashboard-only location lookup (Phase 6, revisiting PROJECT.md §12's
  // "GPS never surfaced anywhere" default now that the dashboard wants a
  // location map). Deliberately a separate on-demand endpoint rather than
  // added to the Presentation/QueueItem the TV consumes — the TV must
  // never receive GPS data at all, not just never render it (§5.7, §13).
  // Fetched fresh per asset rather than cached/stored: called rarely
  // (only for whichever photo the dashboard has focused), no need for
  // the colour-engine-style persistent cache.
  app.get<{ Params: { id: string } }>(
    '/api/v1/assets/:id/location',
    { preHandler: requireAuth },
    async (request, reply) => {
      const immich = getImmichClient();
      const asset = await immich.getAsset(request.params.id).catch(() => null);
      if (!asset) return reply.code(404).send({ error: 'Asset not found' });

      const exif = asset.exifInfo;
      return {
        latitude: exif?.latitude ?? null,
        longitude: exif?.longitude ?? null,
        city: exif?.city ?? null,
        state: exif?.state ?? null,
        country: exif?.country ?? null,
      };
    },
  );
}
