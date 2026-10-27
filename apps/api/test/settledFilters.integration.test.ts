import type { PrismaClient } from '@prisma/client';
import type { RawCoupon } from '@sports-better/kambi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syncCoupons } from '../src/sync/syncCoupons';
import { loadBetsView } from '../src/views/betsView';
import { createTestUser, hasTestDb, setupTestDb } from './testDb';

let ref = 993000000;
/** A won single on one game, placed at `placedDate`. */
function settled(placedDate: string, sport: string): RawCoupon {
  const couponRef = ++ref;
  return {
    couponRef,
    placedDate,
    currency: 'USD',
    bets: [{ betRef: couponRef + 1, stake: 5000, playedOdds: 2000, betOdds: 2000, potentialPayout: 10000, payout: 10000, betStatus: 'WON', couponRowIndexes: [0] }],
    couponRows: [{ index: 0, selectionType: 'SIMPLE', outcomeId: couponRef * 10, playedOdds: 2000, status: 'WON' }],
    outcomes: [{ outcomeId: couponRef * 10, betOfferId: couponRef * 100, eventId: couponRef, label: 'Home', status: 'WON' }],
    betOffers: [{ betOfferId: couponRef * 100, criterion: 'Moneyline', boType: 'x', boTypeId: 0 }],
    events: [{ eventId: couponRef, eventName: 'Away @ Home', homeName: 'Home', awayName: 'Away', sport, eventGroups: [{ name: sport }, { name: 'League' }], eventStartDate: placedDate }],
  } as unknown as RawCoupon;
}

describe.skipIf(!hasTestDb)('settled bets by date placed', () => {
  let db: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    db = await setupTestDb();
    userId = (await createTestUser(db, 'noah')).id;
    await syncCoupons(db, {
      userId,
      accountLabel: 'Island Luck',
      capturedAt: new Date('2026-10-27T20:00:00Z'),
      coupons: [
        // 11:30 pm on Oct 25 in Nassau, though Oct 26 in UTC.
        settled('2026-10-26T03:30:00Z', 'BASKETBALL'),
        // 12:30 am on Oct 26 in Nassau.
        settled('2026-10-26T04:30:00Z', 'AMERICAN_FOOTBALL'),
        settled('2026-10-27T15:00:00Z', 'FOOTBALL'),
      ],
    });
  });

  afterAll(() => db?.$disconnect());

  const sportsIn = async (range: { from?: string; to?: string }) =>
    (await loadBetsView(db, { userId, view: 'settled', limit: 100, ...range })).coupons.map((c) => c.games[0]!.sport);

  it('carries each game’s sport', async () => {
    expect(await sportsIn({})).toEqual(['FOOTBALL', 'AMERICAN_FOOTBALL', 'BASKETBALL']);
  });

  it('cuts days at Nassau midnight, both ends included', async () => {
    expect(await sportsIn({ from: '2026-10-26' })).toEqual(['FOOTBALL', 'AMERICAN_FOOTBALL']);
    expect(await sportsIn({ to: '2026-10-25' })).toEqual(['BASKETBALL']);
    expect(await sportsIn({ from: '2026-10-26', to: '2026-10-26' })).toEqual(['AMERICAN_FOOTBALL']);
  });
});
