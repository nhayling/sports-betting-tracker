import { Router } from 'express';
import { authOf } from '../auth';
import type { Db } from '../db';
import { loadBetsView } from '../views/betsView';

/** GET /api/bets?view=open|settled|all — the tracker UI's bet list with live progress. */
export function betsRouter(db: Db): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const view = req.query.view === 'settled' || req.query.view === 'all' ? req.query.view : 'open';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(await loadBetsView(db, { userId: authOf(res).userId, view, limit }));
  });
  return router;
}
