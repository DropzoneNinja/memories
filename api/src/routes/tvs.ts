import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { regenerateQueue, getNextPlaylistItems, getUpcomingPreview, queueItemToPresentation } from '../playlist/queue.js';
import { requireAuth } from '../auth/middleware.js';
import * as realtimeHub from '../realtime/hub.js';

const PAIRING_CODE_TTL_MS = 10 * 60_000;
// A TV heartbeats every 30s (tv/src/main.ts) — 3x that gives a generous
// buffer against one missed beat before the dashboard calls it offline.
const ONLINE_THRESHOLD_MS = 90_000;
const NEXT_PREVIEW_COUNT = 5;

function isOnline(lastSeenAt: Date | null): boolean {
  return lastSeenAt !== null && Date.now() - lastSeenAt.getTime() < ONLINE_THRESHOLD_MS;
}

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
  maxCollageImages: z.number().int().min(2).max(9).optional(),
  collageFrequency: z.number().int().min(0).optional(),
});

const commandBodySchema = z.object({
  type: z.enum(['NEXT', 'PREVIOUS', 'PAUSE', 'RESUME']),
});

const heartbeatBodySchema = z.object({
  presentationId: z.string().optional(),
  paused: z.boolean().optional(),
});

// TV registry, pairing, configuration, playlist, heartbeat, and command
// endpoints (PROJECT.md §5.9, §5.10, §6, §7). Split by caller:
//  - "device-facing" (keyed by `deviceId`, the TV's own self-chosen id):
//    pairing request, playlist, heartbeat, command polling.
//  - "admin-facing" (keyed by the internal `id`): everything Memories Web
//    calls — listing TVs, completing pairing, setting config, enqueuing
//    commands. Requires a logged-in session (auth/middleware.ts).
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
        items: result.items.map(queueItemToPresentation),
      };
    },
  );

  // Push channel (Phase 7, PROJECT.md §5.10) — a TV connects here after
  // pairing and gets a `config-changed` message whenever an admin saves a
  // new config for it (see the PUT .../config handler below). No auth
  // (device-facing, §6/§13 — the TV has no login concept); a dead/unknown
  // deviceId just never gets subscribed rather than erroring, since a
  // socket failing to attach must never block the TV's own startup — it
  // falls back to picking up the change on its next heartbeat regardless.
  app.get<{ Params: { deviceId: string } }>('/api/v1/tvs/:deviceId/ws', { websocket: true }, (socket, request) => {
    const { deviceId } = request.params;
    realtimeHub.subscribe(deviceId, socket);
    socket.on('close', () => realtimeHub.unsubscribe(deviceId, socket));
  });

  app.post<{ Params: { deviceId: string } }>('/api/v1/tvs/:deviceId/heartbeat', async (request, reply) => {
    // Body is optional/best-effort from the TV's side (§5.10 — a
    // heartbeat must never fail hard), so an empty/invalid body just
    // means "alive, no status update" rather than a 400.
    const parsed = heartbeatBodySchema.safeParse(request.body ?? {});
    const status = parsed.success ? parsed.data : {};

    const tv = await prisma.tv
      .update({
        where: { deviceId: request.params.deviceId },
        data: {
          lastSeenAt: new Date(),
          ...(status.presentationId !== undefined && { currentPresentationId: status.presentationId }),
          ...(status.paused !== undefined && { paused: status.paused }),
        },
      })
      .catch(() => null);
    if (!tv) return reply.code(404).send({ error: 'TV not found' });

    // The heartbeat is the TV's *guaranteed* fallback for learning about a
    // config change (Phase 7, §5.10) — it's called unconditionally on a
    // fixed interval regardless of whether the WS push above is connected,
    // so piggybacking these fields here means correctness never depends on
    // a socket staying open. Also doubles as the "retry the API every N
    // minutes in the background" signal: a successful heartbeat response
    // is definitionally "reconnected."
    const config = await prisma.configuration.findFirst({
      where: { tvId: tv.id },
      orderBy: { version: 'desc' },
    });

    return {
      ok: true,
      configurationVersion: config?.version ?? 0,
      cacheSize: config?.cacheSize ?? 8,
      disconnectedBehavior: config?.disconnectedBehavior ?? 'CONTINUE_QUEUE',
    };
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

  // --- admin-facing (Memories Web, Phase 6) — everything below requires
  // a logged-in session. Device-facing routes above never do (§6, §13:
  // the TV has no login concept at all).

  app.get('/api/v1/tvs', { preHandler: requireAuth }, async () => {
    const tvs = await prisma.tv.findMany({ orderBy: { createdAt: 'desc' } });
    const configs = await Promise.all(
      tvs.map((tv) => prisma.configuration.findFirst({ where: { tvId: tv.id }, orderBy: { version: 'desc' } })),
    );
    return tvs.map((tv, i) => ({ ...tv, online: isOnline(tv.lastSeenAt), config: configs[i] ?? null }));
  });

  app.get<{ Params: { id: string } }>('/api/v1/tvs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const tv = await prisma.tv.findUnique({ where: { id: request.params.id } });
    if (!tv) return reply.code(404).send({ error: 'TV not found' });

    const [config, currentItem, nextItems] = await Promise.all([
      prisma.configuration.findFirst({ where: { tvId: tv.id }, orderBy: { version: 'desc' } }),
      tv.currentPresentationId
        ? prisma.queueItem.findUnique({ where: { presentationId: tv.currentPresentationId } })
        : Promise.resolve(null),
      getUpcomingPreview(tv.id, tv.currentPresentationId, NEXT_PREVIEW_COUNT),
    ]);

    return {
      ...tv,
      online: isOnline(tv.lastSeenAt),
      config,
      current: currentItem ? queueItemToPresentation(currentItem) : null,
      next: nextItems.map(queueItemToPresentation),
    };
  });

  app.post<{ Body: { pairingCode: string; name: string } }>(
    '/api/v1/tvs/pairing/complete',
    { preHandler: requireAuth },
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

  app.put<{ Params: { id: string } }>(
    '/api/v1/tvs/:id/config',
    { preHandler: requireAuth },
    async (request, reply) => {
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
          maxCollageImages: parsed.data.maxCollageImages ?? latest?.maxCollageImages ?? 6,
          collageFrequency: parsed.data.collageFrequency ?? latest?.collageFrequency ?? 0,
        },
      });

      await regenerateQueue(tv.id, config);
      realtimeHub.notifyConfigChanged(tv.deviceId, config.version);
      return config;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/tvs/:id/commands',
    { preHandler: requireAuth },
    async (request, reply) => {
      const tv = await prisma.tv.findUnique({ where: { id: request.params.id } });
      if (!tv) return reply.code(404).send({ error: 'TV not found' });

      const parsed = commandBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      return prisma.command.create({ data: { tvId: tv.id, type: parsed.data.type } });
    },
  );

  // Unpairs and permanently removes a TV — every fresh `npm run deploy`
  // wipes the app's localStorage and re-pairs under a new device id
  // (known Phase 3 behaviour), which otherwise leaves stale rows behind
  // indefinitely with no way to clean them up. Configurations/QueueItems/
  // Commands/TvPermissions cascade-delete with it (schema.prisma); its
  // AuditLog rows are kept, with tvId set to null, so removing a TV
  // doesn't erase its history. If the deleted TV is still physically
  // running, it simply starts getting 404s from every endpoint it polls
  // (all of which already handle "TV not found" gracefully) — there's no
  // separate "unpair" signal to push to a device with no login concept
  // of its own (§6, §13).
  app.delete<{ Params: { id: string } }>(
    '/api/v1/tvs/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const tv = await prisma.tv.findUnique({ where: { id: request.params.id } });
      if (!tv) return reply.code(404).send({ error: 'TV not found' });

      await prisma.tv.delete({ where: { id: tv.id } });
      return reply.code(204).send();
    },
  );
}
