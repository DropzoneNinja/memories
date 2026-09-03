// Dashboard session tokens — a signed, stateless JWT (no server-side
// session store needed for a household-scale system), verified with
// SESSION_SECRET (PROJECT.md §7, already the designated secret for this).
// This is the only thing SESSION_SECRET is used for.
import jwt from 'jsonwebtoken';

export interface SessionPayload {
  userId: string;
  email: string;
}

const TOKEN_TTL = '30d';

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET must be set (see .env.example)');
  return value;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: TOKEN_TTL });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === 'string') return null;
    const { userId, email } = decoded as Partial<SessionPayload>;
    if (typeof userId !== 'string' || typeof email !== 'string') return null;
    return { userId, email };
  } catch {
    return null;
  }
}
