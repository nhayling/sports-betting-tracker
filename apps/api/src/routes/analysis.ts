import { Router } from 'express';
import { authOf } from '../auth';
import type { Db } from '../db';
import { loadAnalysis } from '../analysis/load';

/** GET /api/analysis[?fundingMaxOdds=20][&period=week|month|all] — betting record stats for the Analysis tab. */
export function analysisRouter(db: Db): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    // ?fundingMaxOdds=20 → bets paying under 20× the stake count as "funding".
    const cutoff = Number(req.query.fundingMaxOdds);
    const fundingMaxOdds = Number.isFinite(cutoff) && cutoff > 1 && cutoff <= 10_000 ? cutoff : undefined;
    // ?period=week|month → only bets placed this week or month (Nassau time); anything else is all time.
    const period = req.query.period === 'week' || req.query.period === 'month' ? req.query.period : 'all';
    res.json(await loadAnalysis(db, { userId: authOf(res).userId, fundingMaxOdds, period }));
  });
  return router;
}
