import { Router } from 'express';
import { authOf } from '../auth';
import type { Db } from '../db';

/** GET /api/notifications, POST /api/notifications/read { ids?: string[] } (no ids = all). */
export function notificationsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { userId } = authOf(res);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const [items, unread] = await Promise.all([
      db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit }),
      db.notification.count({ where: { userId, readAt: null } }),
    ]);
    res.json({ unread, items });
  });

  router.post('/read', async (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Expected application/json' });
      return;
    }
    const ids: unknown = req.body?.ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string'))) {
      res.status(400).json({ error: 'ids must be an array of strings' });
      return;
    }
    const { count } = await db.notification.updateMany({
      where: { userId: authOf(res).userId, readAt: null, ...(ids ? { id: { in: ids as string[] } } : {}) },
      data: { readAt: new Date() },
    });
    res.json({ marked: count });
  });

  return router;
}
