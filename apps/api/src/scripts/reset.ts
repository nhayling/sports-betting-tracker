/**
 * Makes a password reset link for a member, and emails it to them if they have an address.
 *
 *   npm run reset -w @sports-better/api -- <username>
 *
 * The link starts with PUBLIC_URL (e.g. https://slipclub.app), works once, for 24 hours,
 * and replaces any earlier link for them. The admin site's Members tab does the same.
 */
import { prisma } from '../db';
import { postmarkMailer } from '../email/mailer';
import { makePasswordReset } from '../auth/passwordResets';

const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.error('usage: npm run reset -w @sports-better/api -- <username>');
  process.exit(1);
}

const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4100}`;
const made = await makePasswordReset(prisma, postmarkMailer(), username, base);
await prisma.$disconnect();
if (!made.ok) {
  console.error(made.error);
  process.exit(1);
}
console.log(made.url);
console.log(`Works once, until ${made.expiresAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`);
console.log(made.emailed ? `Emailed to ${made.email}.` : made.email ? `Not emailed to ${made.email} (see above); send them the link yourself.` : `${made.username} has no email; send them the link yourself.`);
