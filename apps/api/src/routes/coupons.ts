import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { authOf } from '../auth';
import type { Db } from '../db';

const STATUSES = ['OPEN', 'WON', 'LOST', 'VOID', 'CASHED_OUT', 'MIXED', 'UNKNOWN'] as const;

const detail = {
  bets: { orderBy: { externalBetRef: 'asc' }, include: { legs: { select: { betLegId: true } } } },
  legs: {
    orderBy: { externalRowIndex: 'asc' },
    include: { selections: { omit: { rawOutcome: true, rawBetOffer: true } } },
  },
} satisfies Prisma.CouponInclude;

/** Read API for the tracker UI. Money in cents, odds/lines as raw Kambi ×1000 integers. */
export function couponsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    if (status && !(STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const coupons = await db.coupon.findMany({
      where: { sportsbookAccount: { userId: authOf(res).userId }, ...(status ? { status: status as (typeof STATUSES)[number] } : {}) },
      orderBy: { placedAt: 'desc' },
      take: limit,
      omit: { rawPayload: true },
      include: detail,
    });
    res.json({ coupons });
  });

  router.get('/:id', async (req, res) => {
    const coupon = await db.coupon.findFirst({
      where: { id: req.params.id, sportsbookAccount: { userId: authOf(res).userId } },
      omit: { rawPayload: req.query.raw !== '1' },
      include: detail,
    });
    if (!coupon) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }
    res.json({ coupon });
  });

  return router;
}
