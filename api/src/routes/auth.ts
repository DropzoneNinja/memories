import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signSessionToken } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// No self-registration route on purpose — PROJECT.md §12 defaults to a
// single admin-capable user model for now; accounts are created via
// `npm run create-user` (scripts/create-user.mjs), not a public sign-up
// form. This is a household system, not a multi-tenant product.
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
    return { token, user: { id: user.id, email: user.email, isAdmin: user.isAdmin } };
  });

  app.get('/api/v1/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user!.userId } });
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    return { id: user.id, email: user.email, isAdmin: user.isAdmin };
  });
}
