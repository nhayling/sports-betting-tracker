/**
 * Requests to join from the sign-up page, and who's on the tracker. The admin site (admin.<domain>) does the same.
 *
 *   npm run access -w @sports-better/api                         # waiting requests, and accounts without an email
 *   npm run access -w @sports-better/api -- approve <username>   # lets them sign in
 *   npm run access -w @sports-better/api -- decline <username>   # deletes the request; the username and email are free again
 *   npm run access -w @sports-better/api -- admin <username>     # lets them sign in to the admin site
 *
 * Approving only works on a waiting request; declining never touches an active account.
 */
import { prisma } from '../db';
import { approveRequest, declineRequest } from '../auth/access';
import { postmarkMailer } from '../email/mailer';
import { printable } from '../printable';

const TZ = 'America/Nassau';
const when = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(d);
const [action, rawName] = process.argv.slice(2);
const username = rawName?.trim().toLowerCase();

if (action === 'approve' || action === 'decline' || action === 'admin') {
  if (!username) {
    console.error(`usage: npm run access -w @sports-better/api -- ${action} <username>`);
    process.exit(1);
  }
  if (action === 'admin') {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || user.status !== 'ACTIVE') {
      console.error(user ? `${username} hasn’t been approved yet.` : `No account called ${username}.`);
      process.exit(1);
    }
    await prisma.user.update({ where: { id: user.id }, data: { admin: true } });
    console.log(`${username} can sign in to the admin site now.`);
  } else {
    const answer = await (action === 'approve' ? approveRequest : declineRequest)(prisma, postmarkMailer(), username);
    if (!answer.ok) {
      console.error(answer.error);
      process.exit(1);
    }
    console.log(action === 'approve' ? `Approved ${username}. They can sign in now with their username or ${printable(answer.email ?? '')}.` : `Declined ${username}; the request is deleted.`);
    console.log(answer.emailed ? `Emailed them at ${printable(answer.email ?? '')}.` : 'They weren’t emailed, so tell them yourself.');
  }
} else if (action) {
  console.error('usage: npm run access -w @sports-better/api [-- approve|decline|admin <username>]');
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
