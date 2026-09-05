import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { log } from '../log.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { hashPassword, generateTempPassword } from '../auth/password.js';

const createUserBodySchema = z.object({
  email: z.string().email(),
  isAdmin: z.boolean().optional(),
});

function toUserSummary(user: {
  id: string;
  email: string;
  isAdmin: boolean;
  immichKeyLast4: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    immichConnected: user.immichKeyLast4 !== null,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

// Admin-only account management (PROJECT.md §12's "add roles later if a
// second household user needs restricted access" — this is the "add
// accounts" half of that; per-TV permission scoping via `TvPermission`
// is still unwired, a separate, bigger feature not built here). Every
// route below requires both a valid session AND `isAdmin` — see
// auth/middleware.ts.
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/users', { preHandler: [...requireAuth, requireAdmin] }, async () => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map(toUserSummary);
  });

  // Returns the generated temporary password in the response body exactly
  // once — it's never stored anywhere but as this user's (soon-to-be-
  // replaced) passwordHash, and never logged (only the new user's id/email
  // are).
  app.post('/api/v1/admin/users', { preHandler: [...requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = createUserBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A valid email is required' });

    const tempPassword = generateTempPassword();
    try {
      const user = await prisma.user.create({
        data: {
          email: parsed.data.email,
          passwordHash: await hashPassword(tempPassword),
          isAdmin: parsed.data.isAdmin ?? false,
          mustChangePassword: true,
        },
      });
      log.info({ userId: user.id, createdBy: request.user!.userId }, 'user registered');
      return reply.code(201).send({ user: toUserSummary(user), tempPassword });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({ error: 'A user with that email already exists' });
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>(
    '/api/v1/admin/users/:id/reset-password',
    { preHandler: [...requireAuth, requireAdmin] },
    async (request, reply) => {
      const existing = await prisma.user.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ error: 'User not found' });

      const tempPassword = generateTempPassword();
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
      });
      log.info({ userId: user.id, resetBy: request.user!.userId }, 'password reset by admin');

      return { user: toUserSummary(user), tempPassword };
    },
  );
}
