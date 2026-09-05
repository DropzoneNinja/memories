// Encrypts each user's Immich API key at rest (PROJECT.md §7: "the Immich
// API key (secured — never logged, never exposed to the UI, never
// committed to source control)" — that requirement doesn't go away just
// because the key now lives in Postgres instead of .env). AES-256-GCM
// keyed by ENCRYPTION_KEY (see .env.example) rather than plain scrypt
// (auth/password.ts): a password only ever needs to be *verified*, but an
// Immich API key must be recovered in full to call Immich with it, so this
// has to be reversible encryption, not a one-way hash.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function loadKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('ENCRYPTION_KEY must be set (see .env.example) — generate one with `openssl rand -hex 32`');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes of hex (64 hex characters) — generate one with `openssl rand -hex 32`');
  }
  return key;
}

// Packs iv + authTag + ciphertext into one base64 string so the DB column
// stays a single opaque `String?` rather than three separate fields.
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const key = loadKey();
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function last4(plaintext: string): string {
  return plaintext.slice(-4);
}
