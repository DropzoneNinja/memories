import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { regenerateQueue, getNextPlaylistItems } from '../playlist/queue.js';

const PAIRING_CODE_TTL_MS = 10 * 60_000;

async function generatePairingCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await prisma.tv.findUnique({ where: { pairingCode: code } });
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique pairing code');
}

const configBodySchema = z.object({
  albumIds: z.array(z.string()).optional(),
  intervalSeconds: z.number().int().positive().optional(),
  playbackMode: z.enum(['SEQUENTIAL', 'SHUFFLE']).optional(),
  matMode: z
    .enum([
      'AUTOMATIC',
      'NEUTRAL',
      'WARM',
      'COOL',
      'DARK',
      'LIGHT',
      'COMPLEMENTARY',
      'ANALOGOUS',
      'WHITE',
      'BLACK',
      'WOOD',
    ])
    .optional(),
  disconnectedBehavior: z.enum(['CONTINUE_QUEUE', 'REPEAT_QUEUE', 'FREEZE']).optional(),
  cacheSize: z.number().int().positive().optional(),
});

const commandBodySchema = z.object({
  type: z.enum(['NEXT', 'PREVIOUS', 'PAUSE', 'RESUME']),
});

// TV registry, pairing, configuration, playlist, heartbeat, and command
// endpoints (PROJECT.md §5.9, §5.10, §6, §7). Split by caller:
//  - "device-facing" (keyed by `deviceId`, the TV's own self-chosen id):
//    pairing request, playlist, heartbeat, command polling.
//  - "admin-facing" (keyed by the internal `id`): everything a dashboard
//    would call — listing TVs, completing pairing, setting config,
//    enqueuing commands. Memories Web doesn't exist yet (Phase 6), so
//    these are exercised via curl for now.
export async function tvRoutes(app: FastifyInstance): Promise<void> {
  // --- device-facing ---

  app.post<{ Body: { deviceId: string } }>('/api/v1/tvs/pairing', async (request, reply) => {
    const { deviceId } = request.body ?? {};
    if (!deviceId) return reply.code(400).send({ error: 'deviceId is required' });

    let tv = await prisma.tv.findUnique({ where: { deviceId } });

    if (tv?.pairedAt) {
      return { paired: true, name: tv.name };
    }

    const now = new Date();
    const needsNewCode = !tv?.pairingCode || !tv.pairingCodeExpiresAt || tv.pairingCodeExpiresAt < now;

    if (!tv) {
      const pairingCode = await generatePairingCode();
      tv = await prisma.tv.create({
        data: {
          deviceId,
          pairingCode,
          pairingCodeExpiresAt: new Date(now.getTime() + PAIRING_CODE_TTL_MS),
        },
      });
    } else if (needsNewCode) {
      const pairingCode = await generatePairingCode();
      tv = await prisma.tv.update({
        where: { id: tv.id },
        data: { pairingCode, pairingCodeExpiresAt: new Date(now.getTime() + PAIRING_CODE_TTL_MS) },
      });
    }

    return { paired: false, pairingCode: tv.pairingCode, expiresAt: tv.pairingCodeExpiresAt };
  });

  app.get<{ Params: { deviceId: string }; Querystring: { count?: string } }>(
    '/api/v1/tvs/:deviceId/playlist',
    async (request, reply) => {
      const count = Number(request.query.count ?? 5) || 5;
      const result = await getNextPlaylistItems(request.params.deviceId, count);
      if (!result) return reply.code(404).send({ error: 'TV not found or not paired' });

      return {
        configurationVersion: result.configurationVersion,
        items: result.items.map((item) => ({
          presentationId: item.presentationId,
          duration: item.durationSeconds,
          layout: item.layout,
          background: item.background,
          frame: item.frame,
          transition: item.transition,
          assets: item.assets,
        })),
      };
    },
  );

  app.post<{ Params: { deviceId: string } }>('/api/v1/tvs/:deviceId/heartbeat', async (request, reply) => {
    const tv = await prisma.tv
      .update({ where: { deviceId: request.params.deviceId }, data: { lastSeenAt: new Date() } })
      .catch(() => null);
    if (!tv) return reply.code(404).send({ error: 'TV not found' });
    return { ok: true };
  });

  app.get<{ Params: { deviceId: string } }>('/api/v1/tvs/:deviceId/commands', async (request, reply) => {
    const tv = await prisma.tv.findUnique({ where: { deviceId: request.params.deviceId } });
    if (!tv) return reply.code(404).send({ error: 'TV not found' });

    const pending = await prisma.command.findMany({
      where: { tvId: tv.id, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    if (pending.length > 0) {
      await prisma.command.updateMany({
        where: { id: { in: pending.map((c) => c.id) } },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      });
    }

    return pending.map((c) => ({ id: c.id, type: c.type, createdAt: c.createdAt }));
  });

  // --- admin-facing (stand-ins for Memories Web, Phase 6) ---

  app.get('/api/v1/tvs', async () => {
    return prisma.tv.findMany({ orderBy: { createdAt: 'desc' } });
  });

  app.get<{ Params: { id: string } }>('/api/v1/tvs/:id', async (request, reply) => {
    const tv = await prisma.tv.findUnique({ where: { id: request.params.id } });
    if (!tv) return reply.code(404).send({ error: 'TV not found' });
    return tv;
  });

  app.post<{ Body: { pairingCode: string; name: string } }>(
    '/api/v1/tvs/pairing/complete',
    async (request, reply) => {
      const { pairingCode, name } = request.body ?? {};
      if (!pairingCode || !name) {
        return reply.code(400).send({ error: 'pairingCode and name are required' });
      }

      const tv = await prisma.tv.findUnique({ where: { pairingCode } });
      if (!tv || !tv.pairingCodeExpiresAt || tv.pairingCodeExpiresAt < new Date()) {
        return reply.code(404).send({ error: 'Invalid or expired pairing code' });
      }

      return prisma.tv.update({
        where: { id: tv.id },
        data: { name, pairedAt: new Date(), pairingCode: null, pairingCodeExpiresAt: null },
      });
    },
  );

  app.put<{ Params: { id: string } }>('/api/v1/tvs/:id/config', async (request, reply) => {
    const tv = await prisma.tv.findUnique({ where: { id: request.params.id } });
    if (!tv) return reply.code(404).send({ error: 'TV not found' });

    const parsed = configBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const latest = await prisma.configuration.findFirst({
      where: { tvId: tv.id },
      orderBy: { version: 'desc' },
    });

    const config = await prisma.configuration.create({
      data: {
        tvId: tv.id,
        version: (latest?.version ?? 0) + 1,
        albumIds: parsed.data.albumIds ?? latest?.albumIds ?? [],
        intervalSeconds: parsed.data.intervalSeconds ?? latest?.intervalSeconds ?? 600,
        playbackMode: parsed.data.playbackMode ?? latest?.playbackMode ?? 'SHUFFLE',
        matMode: parsed.data.matMode ?? latest?.matMode ?? 'AUTOMATIC',
        disconnectedBehavior:
          parsed.data.disconnectedBehavior ?? latest?.disconnectedBehavior ?? 'CONTINUE_QUEUE',
        cacheSize: parsed.data.cacheSize ?? latest?.cacheSize ?? 8,
      },
    });

    await regenerateQueue(tv.id, config);
    return config;
  });

  app.post<{ Params: { id: string } }>('/api/v1/tvs/:id/commands', async (request, reply) => {
    const tv = await prisma.tv.findUnique({ where: { id: request.params.id } });
    if (!tv) return reply.code(404).send({ error: 'TV not found' });

    const parsed = commandBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    return prisma.command.create({ data: { tvId: tv.id, type: parsed.data.type } });
  });
}
