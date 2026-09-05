import { prisma } from '../db.js';
import { decryptSecret } from './crypto.js';
import { ImmichClient } from './ImmichClient.js';

// Thrown when a user has no Immich API key saved yet — routes catch this
// specifically to return a friendly 400 ("connect your account first")
// instead of a generic 500.
export class ImmichNotConfiguredError extends Error {
  constructor() {
    super('Connect your Immich account in Settings first');
    this.name = 'ImmichNotConfiguredError';
  }
}

// Per-user client: each household member holds their own Immich API key
// (see immich/crypto.ts, routes/settings.ts) rather than the whole app
// sharing one credential from .env — nothing else in this codebase
// should read IMMICH_API_KEY or decrypt a key directly (PROJECT.md §6).
// Deliberately not cached/singleton like the old env-based client: a key
// can be rotated or disconnected at any time, and constructing an
// ImmichClient is cheap (just holds two strings), so there's no real cost
// to always building fresh from the current DB row.
export async function getImmichClientForUser(userId: string): Promise<ImmichClient> {
  const baseUrl = process.env.IMMICH_BASE_URL;
  if (!baseUrl) {
    throw new Error('IMMICH_BASE_URL must be set (see .env.example)');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.immichApiKeyEncrypted) {
    throw new ImmichNotConfiguredError();
  }

  const apiKey = decryptSecret(user.immichApiKeyEncrypted);
  return new ImmichClient({ baseUrl, apiKey });
}
