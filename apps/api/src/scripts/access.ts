/**
 * Requests to join from the sign-up page, and who's on the tracker.
 *
 *   npm run access -w @sports-better/api                         # waiting requests, and accounts without an email
 *   npm run access -w @sports-better/api -- approve <username>   # lets them sign in
 *   npm run access -w @sports-better/api -- decline <username>   # deletes the request; the username and email are free again
 *
 * Approving only works on a waiting request; declining never touches an active account.
 */
import { prisma } from '../db';
import { printable } from '../printable';

const TZ = 'America/Nassau';
const when = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(d);
const [action, rawName] = process.argv.slice(2);
const username = rawName?.trim().toLowerCase();

if (action === 'approve' || action === 'decline') {
  if (!username) {
    console.error(`usage: npm run access -w @sports-better/api -- ${action} <username>`);
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.status !== 'PENDING') {
    console.error(user ? `${username} isn't waiting for approval.` : `No request from ${username}.`);
    process.exit(1);
  }
  if (action === 'approve') {
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    console.log(`Approved ${username}. They can sign in now with their username or ${printable(user.email ?? '')}.`);
  } else {
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`Declined ${username}; the request is deleted.`);
  }
} else if (action) {
  console.error('usage: npm run access -w @sports-better/api [-- approve|decline <username>]');
  process.exit(1);
} else {
  const pending = await prisma.user.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
  console.log(pending.length ? `Waiting for approval (${pending.length})` : 'No requests waiting.');
  // Anyone can ask to join, so what they typed is cleaned before it reaches the terminal.
  for (const u of pending) console.log(`  ${u.username}  <${printable(u.email ?? '')}>  asked ${when(u.createdAt)}${u.accessNote ? `\n    “${printable(u.accessNote)}”` : ''}`);

  const noEmail = await prisma.user.findMany({ where: { status: 'ACTIVE', email: null }, orderBy: { username: 'asc' }, select: { username: true } });
  if (noEmail.length) console.log(`\nNo email yet (${noEmail.length}): ${noEmail.map((u) => u.username).join(', ')}`);
}

await prisma.$disconnect();
