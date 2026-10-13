import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db';

export const SESSION_COOKIE = 'sb_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** Sliding expiry is refreshed at most this often, to avoid a write per request. */
const TOUCH_EVERY_MS = 60 * 60_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(db: Db, userId: string, userAgent: string | undefined) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { tokenHash: hashToken(token), userId, userAgent: userAgent?.slice(0, 300), expiresAt } });
  return { token, expiresAt };
}

export async function findSession(db: Db, token: string) {
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, username: true } } } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) } });
  }
  return session;
}

export async function deleteSession(db: Db, token: string) {
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookie(token: string, opts: { maxAgeMs: number; secure: boolean }): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`,
    ...(opts.secure ? ['Secure'] : []),
  ].join('; ');
}
