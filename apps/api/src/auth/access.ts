import type { Db } from '../db';
import type { Mailer } from '../email/mailer';

/**
 * Asking to join and answering it, shared by the sign-up page, `npm run access`
 * and the admin site. Answers only touch a request still waiting: approving
 * never re-approves, and declining never deletes an active account. Each step
 * emails whoever it concerns; `emailed` says whether Postmark took it.
 */
export type AccessAnswer = { ok: true; email: string | null; emailed: boolean } | { ok: false; error: string };

const TZ = 'America/Nassau';
const when = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(d);

async function waiting(db: Db, username: string) {
  const user = await db.user.findUnique({ where: { username } });
  return user?.status === 'PENDING' ? user : user ? `${username} isn’t waiting for approval.` : `No request from ${username}.`;
}

/** Just after someone asks: a receipt for them, and the request for every admin with an email. */
export async function announceRequest(db: Db, mailer: Mailer, user: { username: string; email: string | null; accessNote: string | null; createdAt: Date }) {
  const admins = await db.user.findMany({ where: { admin: true, status: 'ACTIVE', email: { not: null } }, select: { email: true } });
  const model = { username: user.username, email: user.email, access_note: user.accessNote ?? '' };
  await Promise.all([
    user.email ? mailer.send(user.email, 'access-received', model) : null,
    ...admins.map((a) => mailer.send(a.email!, 'access-requested', { ...model, requested_at: when(user.createdAt) })),
  ]);
}

/** They can sign in from now on. */
export async function approveRequest(db: Db, mailer: Mailer, username: string): Promise<AccessAnswer> {
  const user = await waiting(db, username);
  if (typeof user === 'string') return { ok: false, error: user };
  await db.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
  const emailed = user.email ? await mailer.send(user.email, 'access-approved', { username: user.username }) : false;
  return { ok: true, email: user.email, emailed };
}

/** Deletes the request, so the username and email are free again. */
export async function declineRequest(db: Db, mailer: Mailer, username: string): Promise<AccessAnswer> {
  const user = await waiting(db, username);
  if (typeof user === 'string') return { ok: false, error: user };
  await db.user.delete({ where: { id: user.id } });
  const emailed = user.email ? await mailer.send(user.email, 'access-declined', {}) : false;
  return { ok: true, email: user.email, emailed };
}

/** The admin site lives on its own host (admin.slipclub.app, admin.localhost in development), so its sign-in cookie never reaches the app's. */
export const isAdminHost = (host: string | undefined) => !!host && /^admin\./i.test(host);
