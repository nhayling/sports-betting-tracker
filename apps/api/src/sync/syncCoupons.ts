import { PARSER_VERSION, parseCoupon, type ParsedCoupon, type RawCoupon } from '@sports-better/kambi';
import type { Db } from '../db';
import { hashPayload } from './hash';
import { betFields, couponFields, legFields, selectionFields } from './records';
import { flagUntracked, untrackedIn, type UntrackedSeen } from './untrackedMarkets';
import { changedWager } from './wager';

export interface SyncInput {
  /** The tracker user these bets belong to. */
  userId: string;
  accountLabel: string;
  /** When the extension captured these coupons from the page. */
  capturedAt: Date;
  coupons: RawCoupon[];
}

export interface SyncResult {
  created: number;
  updated: number;
  unchanged: number;
  /** Older than what's stored; ignored so a stale capture can't undo a settlement. */
  stale: number;
  failed: number;
  warnings: string[];
  errors: Array<{ couponRef: string; error: string }>;
  /** Markets seen for the first time that the tracker can't follow. */
  untrackedMarkets: string[];
}

type Outcome = 'created' | 'updated' | 'unchanged' | 'stale';

/**
 * Idempotent: every write is an upsert on a sportsbook external key, so
 * re-sending the same coupons never creates duplicates. Kambi is
 * authoritative for settlement, so a newer capture always wins, including
 * settled → settled regrades.
 */
export async function syncCoupons(db: Db, input: SyncInput): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, unchanged: 0, stale: 0, failed: 0, warnings: [], errors: [], untrackedMarkets: [] };

  const account = await db.sportsbookAccount.upsert({
    where: { userId_provider_label: { userId: input.userId, provider: 'ISLAND_LUCK_KAMBI', label: input.accountLabel } },
    create: { userId: input.userId, provider: 'ISLAND_LUCK_KAMBI', label: input.accountLabel },
    update: {},
  });

  // Checked on every capture, unchanged coupons too, so bets synced before a market was flagged still count.
  const untracked: UntrackedSeen[] = [];
  for (const raw of input.coupons) {
    const ref = String(raw?.couponRef ?? '');
    try {
      if (!ref) throw new Error('missing couponRef');
      const parsed = parseCoupon(raw);
      result.warnings.push(...parsed.warnings.map((w) => `coupon ${ref}: ${w}`));
      const outcome = await syncOne(db, account.id, parsed, input.capturedAt, result.warnings);
      result[outcome]++;
      if (outcome !== 'stale') untracked.push(...untrackedIn(parsed));
    } catch (err) {
      result.failed++;
      result.errors.push({ couponRef: ref || '(unknown)', error: err instanceof Error ? err.message : String(err) });
    }
  }
  try {
    const fresh = await flagUntracked(db, [...new Map(untracked.map((m) => [`${m.sport}|${m.marketName}`, m])).values()]);
    result.untrackedMarkets = fresh.map((m) => m.marketName);
  } catch (err) {
    // Flagging is bookkeeping; it never fails a sync.
    console.error('[untracked-market] flagging failed', err);
  }
  // Never move lastCapturedAt backwards: a delayed older capture can arrive after a newer one.
  await db.sportsbookAccount.update({
    where: { id: account.id },
    data: {
      lastSyncedAt: new Date(),
      ...(!account.lastCapturedAt || input.capturedAt > account.lastCapturedAt ? { lastCapturedAt: input.capturedAt } : {}),
    },
  });
  return result;
}

async function syncOne(
  db: Db,
  accountId: string,
  parsed: ParsedCoupon,
  capturedAt: Date,
  warnings: string[],
): Promise<Outcome> {
  const hash = hashPayload(parsed.raw);
  const key = { sportsbookAccountId_externalCouponRef: { sportsbookAccountId: accountId, externalCouponRef: parsed.externalCouponRef } };

  const existing = await db.coupon.findUnique({
    where: key,
    select: { id: true, rawPayloadHash: true, parserVersion: true, capturedAt: true, status: true },
  });

  if (existing && existing.capturedAt > capturedAt) return 'stale';

  if (existing && existing.rawPayloadHash === hash && existing.parserVersion === PARSER_VERSION) {
    await db.coupon.update({ where: { id: existing.id }, data: { capturedAt, lastSyncedAt: new Date() } });
    return 'unchanged';
  }

  if (existing) {
    const stored = await db.coupon.findUniqueOrThrow({ where: { id: existing.id }, select: { rawPayload: true } });
    const changed = changedWager(parseCoupon(stored.rawPayload as unknown as RawCoupon), parsed);
    if (changed) throw new Error(`this bet was already synced with different picks or odds (${changed}); only its status and payout can change`);
  }

  if (existing && existing.status !== 'OPEN' && parsed.status === 'OPEN') {
    warnings.push(`coupon ${parsed.externalCouponRef}: Kambi moved it from ${existing.status} back to OPEN`);
  }

  const fields = couponFields(parsed, { hash, parserVersion: PARSER_VERSION, capturedAt });

  await db.$transaction(async (tx) => {
    const coupon = await tx.coupon.upsert({
      where: key,
      create: { ...fields, sportsbookAccountId: accountId, externalCouponRef: parsed.externalCouponRef },
      update: fields,
    });

    // Legs are coupon rows; a bet references them by row index.
    const legIdByRow = new Map<number, string>();
    const seenRows = new Set<number>();
    for (const bet of parsed.bets) {
      for (const leg of bet.legs) {
        if (seenRows.has(leg.externalRowIndex)) continue;
        seenRows.add(leg.externalRowIndex);
        const row = await tx.betLeg.upsert({
          where: { couponId_externalRowIndex: { couponId: coupon.id, externalRowIndex: leg.externalRowIndex } },
          create: { ...legFields(leg), couponId: coupon.id, externalRowIndex: leg.externalRowIndex },
          update: legFields(leg),
        });
        legIdByRow.set(leg.externalRowIndex, row.id);

        for (const sel of leg.selections) {
          await tx.legSelection.upsert({
            where: { betLegId_externalOutcomeId: { betLegId: row.id, externalOutcomeId: sel.externalOutcomeId } },
            create: { ...selectionFields(sel), betLegId: row.id, externalOutcomeId: sel.externalOutcomeId },
            update: selectionFields(sel),
          });
        }
      }
    }

    for (const bet of parsed.bets) {
      const row = await tx.bet.upsert({
        where: { couponId_externalBetRef: { couponId: coupon.id, externalBetRef: bet.externalBetRef } },
        create: { ...betFields(bet), couponId: coupon.id, externalBetRef: bet.externalBetRef },
        update: betFields(bet),
      });
      await tx.betLegLink.createMany({
        data: bet.legs.map((l) => ({ betId: row.id, betLegId: legIdByRow.get(l.externalRowIndex)! })),
        skipDuplicates: true,
      });
    }
  }, { timeout: 15_000 });

  return existing ? 'updated' : 'created';
}
