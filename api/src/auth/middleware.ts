// Applied as a preHandler on every dashboard/admin-facing route
// (PROJECT.md §7). Device-facing TV routes (pairing request, playlist,
// heartbeat, command polling) never get this — the TV has no login
// concept at all (§6, §13).
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifySessionToken, type SessionPayload } from './jwt.js';
import { prisma } from '../db.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionPayload;
  }
}

// JWT verification only — no DB hit, cheap on every call. Exported
// separately from `requireAuth` below for the two routes that must stay
// reachable even for a user whose `mustChangePassword` flag is set:
// `GET /auth/me` (the dashboard's only way to actually learn that flag
// after logging in) and `PUT /me/password` (the only way to clear it).
// Every other admin/dashboard-facing route uses `requireAuth` instead.
export async function verifySession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const session = token ? verifySessionToken(token) : null;

  if (!session) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  request.user = session;
}

// A temporary password (routes/admin.ts's create-user/reset-password) is
// a lower-security shared secret by design — printed once for an admin to
// hand off out-of-band — and shouldn't stay valid for continued use once
// someone has actually logged in with it. Blocks everything else in the
// dashboard until `PUT /me/password` clears the flag.
async function requirePasswordCurrent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: request.user!.userId } });
  if (!user) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  if (user.mustChangePassword) {
    reply.code(403).send({ error: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your password before continuing' });
  }
}

export const requireAuth = [verifySession, requirePasswordCurrent];

// Admin-only routes (routes/admin.ts) use `[...requireAuth, requireAdmin]`.
// `isAdmin` deliberately isn't in the JWT payload (kept minimal/stable
// there across a 30-day token lifetime) — this always checks the current
// DB value, so revoking admin rights takes effect on a user's very next
// request rather than waiting for their token to expire.
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: request.user!.userId } });
  if (!user?.isAdmin) {
    reply.code(403).send({ error: 'Admin access required' });
  }
}
