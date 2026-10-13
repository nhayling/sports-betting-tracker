import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** A single-use registration link token. Only its hash is stored, so it is shown once. */
export async function createInvite(db: Db, ttlMs = INVITE_TTL_MS) {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.invite.create({ data: { tokenHash: hashInviteToken(token), expiresAt } });
  return { token, expiresAt };
}

/** The invite if it exists, hasn't been used and hasn't expired. */
export async function findUsableInvite(db: Db, token: string) {
  const invite = await db.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } });
  return invite && !invite.usedAt && invite.expiresAt.getTime() > Date.now() ? invite : null;
}
