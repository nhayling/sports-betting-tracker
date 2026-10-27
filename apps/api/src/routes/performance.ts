import { Router } from 'express';
import { authOf } from '../auth';
import type { Db } from '../db';
import { loadPerformance } from '../performance/load';

/** Kambi's sport ids: "BASKETBALL", "AMERICAN_FOOTBALL". */
const SPORT = /^[A-Z][A-Z_]{0,39}$/;

/** GET /api/performance[?fundingMaxOdds=3][&period=week|month|all][&sport=BASKETBALL[&only=1]] — betting record stats for the Performance tab. */
export function performanceRouter(db: Db): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    // ?fundingMaxOdds=3 → bets paying up to 3× the stake (+200) count as "funding".
    const cutoff = Number(req.query.fundingMaxOdds);
    const fundingMaxOdds = Number.isFinite(cutoff) && cutoff > 1 && cutoff <= 10_000 ? cutoff : undefined;
    // ?period=week|month → only bets placed this week or month (Nassau time); anything else is all time.
    const period = req.query.period === 'week' || req.query.period === 'month' ? req.query.period : 'all';
    // ?sport=BASKETBALL → bets with a basketball pick; &only=1 → bets with nothing else.
    const sport = typeof req.query.sport === 'string' && SPORT.test(req.query.sport) ? req.query.sport : undefined;
    const sportOnly = req.query.only === '1';
    res.json(await loadPerformance(db, { userId: authOf(res).userId, fundingMaxOdds, period, sport, sportOnly }));
  });
  return router;
}
