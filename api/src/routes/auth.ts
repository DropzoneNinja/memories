import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { log } from '../log.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signSessionToken } from '../auth/jwt.js';
import { verifySession } from '../auth/middleware.js';

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

function toUserResponse(user: {
  id: string;
  email: string;
  isAdmin: boolean;
  immichKeyLast4: string | null;
  mustChangePassword: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    immichConnected: user.immichKeyLast4 !== null,
    immichKeyLast4: user.immichKeyLast4,
    mustChangePassword: user.mustChangePassword,
  };
}

// No self-registration route on purpose — PROJECT.md §12 defaults to a
// single admin-capable user model for now; accounts are created by an
// admin (routes/admin.ts's "register new user", or the original
// bootstrap-only `npm run create-user` script). This is a household
// system, not a multi-tenant product.
export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Run once at startup against a random, never-used password — gives
  // the "user not found" path a scrypt computation of its own, so login
  // takes roughly the same time whether or not the email exists (avoids
  // a cheap timing side-channel for user enumeration).
  const dummyHash = await hashPassword(randomUUID());

  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'email and password are required' });

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? dummyHash);

    if (!user || !valid) return reply.code(401).send({ error: 'Invalid email or password' });

    const token = signSessionToken({ userId: user.id, email: user.email });
    return { token, user: toUserResponse(user) };
  });

  // Deliberately `verifySession`, not the full `requireAuth` — must stay
  // reachable even for a user whose `mustChangePassword` flag is set, so
  // the dashboard can actually learn that flag right after login and show
  // the forced change-password screen instead of getting a 403 from
  // every route it tries next.
  app.get('/api/v1/auth/me', { preHandler: verifySession }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user!.userId } });
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    return toUserResponse(user);
  });

  // Self-service password change — the only way to clear
  // `mustChangePassword`, so this also uses `verifySession` rather than
  // `requireAuth` (which would otherwise 403 exactly the requests this
  // route exists to unblock).
  app.put('/api/v1/me/password', { preHandler: verifySession }, async (request, reply) => {
    const parsed = changePasswordBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    }

    const user = await prisma.user.findUnique({ where: { id: request.user!.userId } });
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });

    const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return reply.code(401).send({ error: 'Current password is incorrect' });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false },
    });
    log.info({ userId: user.id }, 'password changed');

    return toUserResponse(updated);
  });
}
