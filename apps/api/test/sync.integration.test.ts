import { PrismaClient } from '@prisma/client';
import { parseCoupon, type RawCoupon, type RawHistoryResponse } from '@sports-better/kambi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import captured from '../../../packages/kambi/fixtures/captured/history-2026-09-27.json';
import { syncCoupons } from '../src/sync/syncCoupons';
import { untrackedIn } from '../src/sync/untrackedMarkets';
import { loadBetsView } from '../src/views/betsView';
import { createTestUser, hasTestDb, setupTestDb } from './testDb';

const all = (captured as unknown as RawHistoryResponse).coupons!;
const t0 = new Date('2026-09-27T17:00:00Z');
const later = new Date('2026-09-27T21:00:00Z');
const earlier = new Date('2026-09-27T12:00:00Z');

describe.skipIf(!hasTestDb)('syncCoupons against Postgres', () => {
  let db: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    db = await setupTestDb();
    userId = (await createTestUser(db, 'noah')).id;
  }, 60_000);
  afterAll(() => db?.$disconnect());

  it('imports the capture and reproduces the real bets', async () => {
    const r = await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: t0, coupons: all });
    expect(r).toMatchObject({ created: 15, updated: 0, unchanged: 0, failed: 0, warnings: [] });

    expect(await db.coupon.count()).toBe(15);
    expect(await db.bet.count()).toBe(15);
    const stake = await db.coupon.aggregate({ _sum: { totalStakeMinor: true } });
    expect(stake._sum.totalStakeMinor).toBe(15 * 500);
    expect(await db.coupon.count({ where: { status: 'OPEN' } })).toBe(6);

    const parlay = await db.coupon.findFirstOrThrow({
      where: { externalCouponRef: '13164001585' },
      include: { legs: { include: { selections: true }, orderBy: { externalRowIndex: 'asc' } }, bets: { include: { legs: true } } },
    });
    expect(parlay.potentialPayoutMinor).toBe(6433);
    expect(parlay.legs.map((l) => [l.selectionType, l.selections.length])).toEqual([
      ['BET_BUILDER', 2],
      ['BET_BUILDER', 2],
      ['SIMPLE', 1],
    ]);
    expect(parlay.bets[0]!.legs).toHaveLength(3);

    expect(await db.sportsbookAccount.findFirstOrThrow()).toMatchObject({ lastCapturedAt: t0 });

    const cashout = await db.coupon.findFirstOrThrow({ where: { externalCouponRef: '13157998989' } });
    expect(cashout).toMatchObject({ status: 'CASHED_OUT', actualPayoutMinor: 475 });
  });

  it('is idempotent: re-sending the same coupons changes nothing', async () => {
    const r = await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: t0, coupons: all });
    expect(r).toMatchObject({ created: 0, updated: 0, unchanged: 15, failed: 0 });
    expect(await db.coupon.count()).toBe(15);
    expect(await db.legSelection.count()).toBe(all.reduce((n, c) => n + (c.outcomes?.length ?? 0), 0));
  });

  it("flags markets it can't track once, on the sync that first sees them", async () => {
    const flagged = await db.untrackedMarket.findMany({ orderBy: { marketName: 'asc' } });
    const expected = [...new Map(all.flatMap((c) => untrackedIn(parseCoupon(c))).map((m) => [`${m.sport}|${m.marketName}`, m])).values()];
    expect(flagged.map((m) => [m.sport, m.marketName])).toEqual(expected.map((m) => [m.sport, m.marketName]).sort((a, b) => a[1]!.localeCompare(b[1]!)));

    // A market Kambi adds later: an already-synced coupon renamed to it. Copied, so the fixture stays as captured.
    const renamed = structuredClone(all.find((c) => c.couponRef === 13164001585)!);
    renamed.betOffers![0]!.criterion = 'First Touchdown Scorer';
    const r = await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: later, coupons: [renamed] });
    expect(r.untrackedMarkets).toEqual(['First Touchdown Scorer']);
    const row = await db.untrackedMarket.findFirstOrThrow({ where: { marketName: 'First Touchdown Scorer' } });
    expect(row).toMatchObject({ sport: 'AMERICAN_FOOTBALL', reason: 'UNSUPPORTED_MARKET', firstSeenAt: row.lastSeenAt });

    // Already flagged: a later sync reports nothing new and keeps the first-seen time.
    const again = await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: later, coupons: [renamed] });
    expect(again.untrackedMarkets).toEqual([]);
    const after = await db.untrackedMarket.findFirstOrThrow({ where: { id: row.id } });
    expect(after.firstSeenAt).toEqual(row.firstSeenAt);
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(row.lastSeenAt.getTime());

    // Put the coupon back as captured for the tests below.
    await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: later, coupons: [all.find((c) => c.couponRef === 13164001585)!] });
  });

  it('updates a coupon in place when Kambi settles it', async () => {
    const open = all.find((c) => c.couponRef === 13164001585)!;
    const settled: RawCoupon = structuredClone(open);
    settled.bets![0]!.betStatus = 'WON';
    settled.bets![0]!.payout = 64330;
    settled.couponRows!.forEach((r) => (r.status = 'WON'));

    const r = await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: later, coupons: [settled] });
    expect(r).toMatchObject({ created: 0, updated: 1 });

    const rows = await db.coupon.findMany({ where: { externalCouponRef: '13164001585' }, include: { bets: true, legs: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'WON', actualPayoutMinor: 6433 });
    expect(rows[0]!.bets).toHaveLength(1);
    expect(rows[0]!.legs.every((l) => l.status === 'WON')).toBe(true);
  });

  it("won't let a later sync change what was bet, only how it went", async () => {
    // Anyone can send a coupon, so once a bet is seen its picks and odds are fixed: otherwise a
    // pick could be swapped for the winning side after the game.
    const open = all.find((c) => c.couponRef !== 13164001585 && c.bets?.[0]?.betStatus === 'OPEN')!;
    const stored = async () =>
      (await db.legSelection.findMany({ where: { betLeg: { coupon: { externalCouponRef: String(open.couponRef) } } }, select: { externalOutcomeId: true } }))
        .map((s) => s.externalOutcomeId)
        .sort();
    const before = await stored();

    const swapped: RawCoupon = structuredClone(open);
    const original = swapped.outcomes!.find((o) => o.outcomeId === swapped.couponRows![0]!.outcomeId)!;
    swapped.outcomes!.push({ ...original, outcomeId: 999_000_001, label: 'The other side' });
    swapped.couponRows![0]!.outcomeId = 999_000_001;
    const longer: RawCoupon = structuredClone(open);
    longer.bets![0]!.playedOdds = (longer.bets![0]!.playedOdds ?? 2000) * 10;

    for (const changed of [swapped, longer]) {
      const r = await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: later, coupons: [changed] });
      expect(r).toMatchObject({ updated: 0, failed: 1 });
      expect(r.errors[0]!.error).toMatch(/picks or odds/);
    }
    expect(await stored()).toEqual(before);
  });

  it('ignores an older capture so it cannot undo a settlement', async () => {
    const open = all.find((c) => c.couponRef === 13164001585)!;
    const r = await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: earlier, coupons: [open] });
    expect(r).toMatchObject({ stale: 1, updated: 0 });
    expect((await db.coupon.findFirstOrThrow({ where: { externalCouponRef: '13164001585' } })).status).toBe('WON');
  });

  it('records syncs with no changes, and never moves the capture time backwards', async () => {
    const account = () => db.sportsbookAccount.findFirstOrThrow({ where: { label: 'Island Luck' } });
    const heartbeat = new Date('2026-09-27T22:00:00Z');
    const r = await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: heartbeat, coupons: [] });
    expect(r).toMatchObject({ created: 0, updated: 0, unchanged: 0 });
    expect((await account()).lastCapturedAt).toEqual(heartbeat);
    await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: earlier, coupons: [] });
    expect((await account()).lastCapturedAt).toEqual(heartbeat);
  });

  it('keeps accounts separate', async () => {
    const r = await syncCoupons(db, { userId, accountLabel: 'Second account', capturedAt: t0, coupons: all.slice(0, 1) });
    expect(r.created).toBe(1);
    expect(await db.coupon.count()).toBe(16);
  });

  it('keeps users separate, even with the same account label and coupons', async () => {
    const buddy = await createTestUser(db, 'buddy');
    const before = await db.coupon.count();
    const r = await syncCoupons(db, { userId: buddy.id, accountLabel: 'Island Luck', capturedAt: t0, coupons: all.slice(0, 2) });
    expect(r).toMatchObject({ created: 2, updated: 0, unchanged: 0 });
    expect(await db.coupon.count()).toBe(before + 2);

    const theirs = await loadBetsView(db, { userId: buddy.id, view: 'all', limit: 500 });
    const mine = await loadBetsView(db, { userId, view: 'all', limit: 500 });
    expect(theirs.coupons).toHaveLength(2);
    expect(mine.coupons).toHaveLength(16);
    expect(mine.coupons.map((c) => c.id)).not.toEqual(expect.arrayContaining(theirs.coupons.map((c) => c.id)));
    // Their sync at t0 doesn't touch my "Last synced".
    expect(theirs.lastSyncedAt).toBe(t0.toISOString());
    expect(mine.lastSyncedAt).toBe('2026-09-27T22:00:00.000Z');
  });
});
