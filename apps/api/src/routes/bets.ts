import { Router } from 'express';
import { authOf } from '../auth';
import type { Db } from '../db';
import { loadBetsView } from '../views/betsView';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown) => (typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);

/** GET /api/bets?view=open|settled|all[&from=YYYY-MM-DD][&to=YYYY-MM-DD] — the tracker UI's bet list with live progress. */
export function betsRouter(db: Db): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const view = req.query.view === 'settled' || req.query.view === 'all' ? req.query.view : 'open';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(await loadBetsView(db, { userId: authOf(res).userId, view, limit, from: day(req.query.from), to: day(req.query.to) }));
  });
  return router;
}
