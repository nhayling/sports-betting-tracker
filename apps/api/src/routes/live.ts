import { Router } from 'express';
import type { PollerStatus } from '../live/poller';

/** GET /api/live/status — poller health, last cycle, provider request budget. */
export function liveRouter(getStatus: () => PollerStatus | null): Router {
  const router = Router();
  router.get('/status', (_req, res) => {
    res.json(getStatus() ?? { running: false, reason: 'LIVE_POLLER=off' });
  });
  return router;
}
