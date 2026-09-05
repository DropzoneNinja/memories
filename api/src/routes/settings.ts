import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { log } from '../log.js';
import { requireAuth } from '../auth/middleware.js';
import { encryptSecret, last4 } from '../immich/crypto.js';
import { ImmichClient } from '../immich/ImmichClient.js';

const immichKeyBodySchema = z.object({
  apiKey: z.string().min(1),
});

function toUserResponse(user: {
  id: string;
  email: string;
  isAdmin: boolean;
  immichKeyLast4: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    immichConnected: user.immichKeyLast4 !== null,
    immichKeyLast4: user.immichKeyLast4,
  };
}

// Per-user Immich credential settings (PROJECT.md §7 & §12) — each
// household member connects their own Immich API key here instead of
// the whole app sharing one from .env, so they see their own albums
// (routes/albums.ts resolves via whoever is logged in). The Immich server
// address (IMMICH_BASE_URL) stays a shared, env-configured setting — it's
// the same self-hosted instance for the household, only the identity/key
// differs per user.
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.put('/api/v1/me/immich', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = immichKeyBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'apiKey is required' });

    const baseUrl = process.env.IMMICH_BASE_URL;
    if (!baseUrl) return reply.code(500).send({ error: 'Server is missing IMMICH_BASE_URL' });

    // Verify the key actually works before saving it — a bad/expired key
    // should fail loudly here, not silently the next time someone tries
    // to pick an album (PROJECT.md §9.4-style "fail fast" against Immich).
    const candidate = new ImmichClient({ baseUrl, apiKey: parsed.data.apiKey });
    try {
      await candidate.listAlbums();
    } catch {
      // The underlying failure (status/attempt, never the key itself) is
      // already logged by ImmichClient.request() — this just correlates it
      // to a user.
      log.warn({ userId: request.user!.userId }, 'immich key verification failed');
      return reply.code(400).send({
        error: 'Could not verify this API key against Immich — check it is correct and not expired.',
      });
    }

    const user = await prisma.user.update({
      where: { id: request.user!.userId },
      data: {
        immichApiKeyEncrypted: encryptSecret(parsed.data.apiKey),
        immichKeyLast4: last4(parsed.data.apiKey),
      },
    });
    log.info({ userId: user.id }, 'immich account connected');

    return toUserResponse(user);
  });

  app.delete('/api/v1/me/immich', { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.update({
      where: { id: request.user!.userId },
      data: { immichApiKeyEncrypted: null, immichKeyLast4: null },
    });
    log.info({ userId: user.id }, 'immich account disconnected');

    return toUserResponse(user);
  });
}
