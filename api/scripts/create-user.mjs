#!/usr/bin/env node
// Creates (or updates the password of) a Memories Web user. There's no
// self-registration UI on purpose (PROJECT.md §12: single admin-capable
// user model for now) — this script is the only way to provision an
// account.
//
// Usage: node scripts/create-user.mjs --email you@example.com --password 'a real password' [--admin]
'use strict';

import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

function parseArgs(argv) {
  const args = { admin: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') args.email = argv[++i];
    else if (argv[i] === '--password') args.password = argv[++i];
    else if (argv[i] === '--admin') args.admin = true;
  }
  return args;
}

async function main() {
  const { email, password, admin } = parseArgs(process.argv.slice(2));
  if (!email || !password) {
    console.error('Usage: node scripts/create-user.mjs --email you@example.com --password \'...\' [--admin]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, isAdmin: admin },
      update: { passwordHash, isAdmin: admin },
    });
    console.log(`OK: ${user.email} (${user.isAdmin ? 'admin' : 'member'})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
