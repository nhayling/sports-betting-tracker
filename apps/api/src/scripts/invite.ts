/**
 * Prints a single-use link someone can open to create their own login.
 *
 *   npm run invite -w @sports-better/api [-- --days 7]
 *
 * The link starts with PUBLIC_URL (e.g. https://bets.example.com).
 */
import { parseArgs } from 'node:util';
import { prisma } from '../db';
import { createInvite } from '../auth/invites';

const { values } = parseArgs({ options: { days: { type: 'string', default: '7' } } });
const days = Number(values.days);
if (!Number.isFinite(days) || days <= 0 || days > 90) {
  console.error('usage: npm run invite -w @sports-better/api [-- --days <1-90>]');
  process.exit(1);
}

const base = (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4100}`).replace(/\/+$/, '');
const { token, expiresAt } = await createInvite(prisma, days * 24 * 60 * 60_000);
// The token sits after "#", so it never reaches server logs.
console.log(`${base}/#invite=${token}`);
console.log(`Works once, until ${expiresAt.toISOString().slice(0, 10)}.`);
await prisma.$disconnect();
