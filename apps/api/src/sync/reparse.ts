import { PARSER_VERSION, type RawCoupon } from '@sports-better/kambi';
import type { Db } from '../db';
import { syncCoupons } from './syncCoupons';

/**
 * Re-normalizes stored coupons parsed by an older parser version, from their
 * saved raw payload and original capture time. Run on startup, so parser fixes
 * apply to existing bets without waiting for Island Luck to resend them.
 */
export async function reparseOutdated(db: Db): Promise<{ checked: number; updated: number; failed: number }> {
  const outdated = await db.coupon.findMany({
    where: { parserVersion: { lt: PARSER_VERSION } },
    select: { rawPayload: true, capturedAt: true, sportsbookAccount: { select: { label: true, userId: true } } },
  });
  let updated = 0;
  let failed = 0;
  for (const c of outdated) {
    const r = await syncCoupons(db, {
      userId: c.sportsbookAccount.userId,
      accountLabel: c.sportsbookAccount.label,
      capturedAt: c.capturedAt,
      coupons: [c.rawPayload as unknown as RawCoupon],
    });
    updated += r.updated;
    failed += r.failed;
  }
  return { checked: outdated.length, updated, failed };
}
