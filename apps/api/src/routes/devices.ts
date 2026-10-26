import { Router } from 'express';
import { authOf } from '../auth';
import type { Db } from '../db';

/** The label the phone install link gives its key (see phoneSync.ts). */
export const PHONE_LABEL = 'Phone userscript';

/**
 * What can sync to your account (extension and phone keys) and where you're
 * signed in on the web, so a lost phone or a leaked install link can be cut off.
 * Session-only: mounted after requireSessionAuth. Tokens and hashes never leave.
 *
 *   GET    /api/devices                         { devices, sessions }, newest first
 *   DELETE /api/devices/:id                     remove a key; it gets a 401 on its next sync
 *   DELETE /api/devices/sessions/:id            sign out one other web sign-in
 *   POST   /api/devices/sessions/revoke-others  sign out everywhere but here
 */
export function devicesRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const { userId, sessionId } = authOf(res);
    const [keys, sessions] = await Promise.all([
      db.apiKey.findMany({ where: { userId }, select: { id: true, label: true, createdAt: true, lastUsedAt: true }, orderBy: { createdAt: 'desc' } }),
      db.session.findMany({
        where: { userId, expiresAt: { gt: new Date() } },
        select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true },
        orderBy: { lastSeenAt: 'desc' },
      }),
    ]);
    res.json({
      devices: keys.map((k) => ({
        id: k.id,
        kind: k.label === PHONE_LABEL ? 'phone' : 'extension',
        label: k.label,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        current: s.id === sessionId,
      })),
    });
  });

  router.post('/sessions/revoke-others', async (_req, res) => {
    const { userId, sessionId } = authOf(res);
    const { count } = await db.session.deleteMany({ where: { userId, id: { not: sessionId } } });
    res.json({ signedOut: count });
  });

  router.delete('/sessions/:id', async (req, res) => {
    const { userId, sessionId } = authOf(res);
    if (req.params.id === sessionId) {
      res.status(400).json({ error: 'That’s this browser. Use Sign out instead.' });
      return;
    }
    const { count } = await db.session.deleteMany({ where: { id: req.params.id, userId } });
    if (!count) {
      res.status(404).json({ error: 'No such sign-in' });
      return;
    }
    res.json({ signedOut: 1 });
  });

  router.delete('/:id', async (req, res) => {
    // Scoped to you, so someone else's id behaves like a missing one.
    const { count } = await db.apiKey.deleteMany({ where: { id: req.params.id, userId: authOf(res).userId } });
    if (!count) {
      res.status(404).json({ error: 'No such device' });
      return;
    }
    res.json({ removed: true });
  });

  return router;
}
