import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db';

/** lastUsedAt is refreshed at most this often, to avoid a write per request. */
const TOUCH_EVERY_MS = 60 * 60_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Issues a token for the extension. Only its hash is stored, so it is shown once. */
export async function createApiKey(db: Db, userId: string, label: string | undefined) {
  const token = `sbk_${randomBytes(32).toString('base64url')}`;
  await db.apiKey.create({ data: { tokenHash: hashToken(token), userId, label: label?.slice(0, 300) } });
  return token;
}

export async function findApiKey(db: Db, token: string) {
  if (!token) return null;
  const key = await db.apiKey.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, username: true } } } });
  if (!key) return null;
  const now = Date.now();
  if (!key.lastUsedAt || now - key.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date(now) } });
  }
  return key;
}

export async function deleteApiKey(db: Db, token: string) {
  await db.apiKey.deleteMany({ where: { tokenHash: hashToken(token) } });
}
