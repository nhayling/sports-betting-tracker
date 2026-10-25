import { Router } from 'express';
import type { PollerStatus } from '../live/poller';

/**
 * GET /api/live/status — whether live stats are on, paused, and how many games are live.
 * A cycle's report covers every user's bets (event names, counts, errors), so the rest
 * stays in the server log: `npm run deploy:logs`.
 */
export function liveRouter(getStatus: () => PollerStatus | null): Router {
  const router = Router();
  router.get('/status', (_req, res) => {
    const status = getStatus();
    if (!status) {
      res.json({ running: false, reason: 'LIVE_POLLER=off' });
      return;
    }
    const { lastReport, provider } = status;
    res.json({
      running: status.running,
      lastReport: lastReport && { at: lastReport.at, liveEvents: lastReport.liveEvents },
      provider: { pausedUntil: provider.pausedUntil },
    });
  });
  return router;
}
