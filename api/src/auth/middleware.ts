// Applied as a preHandler on every dashboard/admin-facing route
// (PROJECT.md §7). Device-facing TV routes (pairing request, playlist,
// heartbeat, command polling) never get this — the TV has no login
// concept at all (§6, §13).
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifySessionToken, type SessionPayload } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionPayload;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const session = token ? verifySessionToken(token) : null;

  if (!session) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  request.user = session;
}
