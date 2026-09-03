// Password hashing via Node's built-in scrypt — no extra native
// dependency (unlike bcrypt), and scrypt is a well-established,
// memory-hard KDF suitable for password storage. Never log or return a
// password or its hash anywhere (PROJECT.md §9.15).
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  // Lengths must match before timingSafeEqual will even compare — a
  // corrupt/foreign hash format must never throw past this point.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
