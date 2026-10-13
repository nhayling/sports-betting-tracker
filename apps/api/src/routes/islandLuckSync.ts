import { Router } from 'express';
import type { RawCoupon } from '@sports-better/kambi';
import { authOf } from '../auth';
import type { Db } from '../db';
import { syncCoupons } from '../sync/syncCoupons';

const MAX_COUPONS_PER_REQUEST = 500;

/** POST /api/integrations/island-luck/sync — raw Kambi coupons captured by the extension. */
export function islandLuckSyncRouter(db: Db): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { provider, accountLabel, capturedAt, coupons } = req.body ?? {};

    if (provider !== 'ISLAND_LUCK_KAMBI') {
      res.status(400).json({ error: 'provider must be ISLAND_LUCK_KAMBI' });
      return;
    }
    if (!Array.isArray(coupons) || coupons.length > MAX_COUPONS_PER_REQUEST) {
      res.status(400).json({ error: `coupons must be an array of at most ${MAX_COUPONS_PER_REQUEST}` });
      return;
    }
    if (coupons.some((c) => typeof c !== 'object' || c === null || c.couponRef === undefined)) {
      res.status(400).json({ error: 'every coupon needs a couponRef' });
      return;
    }
    const captured = new Date(capturedAt);
    if (Number.isNaN(captured.getTime())) {
      res.status(400).json({ error: 'capturedAt must be an ISO timestamp' });
      return;
    }
    const label = typeof accountLabel === 'string' && accountLabel.trim() ? accountLabel.trim().slice(0, 100) : 'Island Luck';

    const result = await syncCoupons(db, { userId: authOf(res).userId, accountLabel: label, capturedAt: captured, coupons: coupons as RawCoupon[] });
    res.status(result.failed > 0 && result.failed === coupons.length ? 500 : 200).json(result);
  });

  return router;
}
