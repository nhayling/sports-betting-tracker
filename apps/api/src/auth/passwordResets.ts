import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db';
import type { Mailer } from '../email/mailer';
import { nassauTime } from './access';
import { hashPassword } from './password';

/**
 * Password reset links: single-use, asked for with "Forgot password?" on the sign-in
 * page, or made on the admin site or with `npm run reset`, and emailed to the member
 * when they have an address. Only the newest link per
 * person works. Setting a new password with one signs that person out of every web
 * browser, but leaves the extension and phone sync connected: a forgotten password
 * isn't a stolen one, and reinstalling the phone script is a chore. To cut those off
 * too, use `npm run user`, or remove them under Account → Devices.
 */
export const PASSWORD_RESET_TTL_MS = 24 * 60 * 60_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export type ResetLink =
  | { ok: true; username: string; url: string; expiresAt: Date; email: string | null; emailed: boolean }
  | { ok: false; error: string };

/**
 * A new link for an approved member, replacing any earlier one, and emailed to them if they have an address.
 * `appUrl` is the app's own address (https://slipclub.app); the token goes after "#", so it never reaches server logs.
 */
export async function makePasswordReset(db: Db, mailer: Mailer, username: string, appUrl: string, ttlMs = PASSWORD_RESET_TTL_MS): Promise<ResetLink> {
  const user = await db.user.findUnique({ where: { username } });
  if (!user) return { ok: false, error: `No member called ${username}.` };
  if (user.status !== 'ACTIVE') return { ok: false, error: `${username} hasn’t been approved yet.` };

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.$transaction([
    db.passwordReset.deleteMany({ where: { userId: user.id } }),
    db.passwordReset.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } }),
  ]);
  const url = `${appUrl.replace(/\/+$/, '')}/#reset=${token}`;
  const emailed = user.email ? await mailer.send(user.email, 'password-reset', { username: user.username, reset_url: url, expires_at: nassauTime(expiresAt) }) : false;
  return { ok: true, username: user.username, url, expiresAt, email: user.email, emailed };
}

/** After a link is made, "Forgot password?" makes no other for that person for this long, so nobody can flood their inbox. */
export const FORGOT_COOLDOWN_MS = 2 * 60_000;

/**
 * "Forgot password?" on the sign-in page. Emails a link when `login` (a username or an email)
 * is an approved member with an email address, and otherwise does nothing. The page never says
 * which, so it can't be used to find out who has an account. Returns who was emailed, for the log.
 */
export async function requestPasswordReset(db: Db, mailer: Mailer, login: string, appUrl: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: login.includes('@') ? { email: login } : { username: login },
    include: { passwordResets: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!user?.email || user.status !== 'ACTIVE') return null;
  const last = user.passwordResets[0];
  if (last && Date.now() - last.createdAt.getTime() < FORGOT_COOLDOWN_MS) return null;
  const made = await makePasswordReset(db, mailer, user.username, appUrl);
  return made.ok && made.emailed ? user.username : null;
}

/** Whose password the link resets, if it's still good. */
export async function findUsableReset(db: Db, token: string) {
  const reset = await db.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, username: true, email: true, status: true } } } });
  return reset && reset.expiresAt.getTime() > Date.now() && reset.user.status === 'ACTIVE' ? reset : null;
}

/**
 * Sets the new password and uses up the link, then signs them out of every web browser.
 * Null when the link is gone (used, replaced, expired, or two tabs raced for it).
 */
export async function usePasswordReset(db: Db, token: string, password: string) {
  const reset = await findUsableReset(db, token);
  if (!reset) return null;
  const passwordHash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    // Claim it first, so the same link can't set two passwords.
    const claimed = await tx.passwordReset.deleteMany({ where: { id: reset.id, expiresAt: { gt: new Date() } } });
    if (claimed.count !== 1) return null;
    await tx.passwordReset.deleteMany({ where: { userId: reset.user.id } });
    await tx.user.update({ where: { id: reset.user.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: reset.user.id } });
    return reset.user;
  });
}
