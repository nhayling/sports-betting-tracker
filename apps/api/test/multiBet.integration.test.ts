import { PrismaClient } from '@prisma/client';
import type { RawHistoryResponse } from '@sports-better/kambi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import captured from '../../../packages/kambi/fixtures/captured/multi-bet-coupons-2026-10-24.json';
import { loadPerformance } from '../src/performance/load';
import { loadLeaderboard } from '../src/social/store';
import { syncCoupons } from '../src/sync/syncCoupons';
import { loadBetsView } from '../src/views/betsView';
import { createTestUser, hasTestDb, setupTestDb } from './testDb';

/** Several singles placed on one ticket (one checkout): Kambi's one coupon, several bets. */
const coupons = (captured as unknown as RawHistoryResponse).coupons!;

describe.skipIf(!hasTestDb)('several bets on one coupon', () => {
  let db: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    db = await setupTestDb();
    userId = (await createTestUser(db, 'friend')).id;
    await syncCoupons(db, { userId, accountLabel: 'Island Luck', capturedAt: new Date('2026-10-24T20:00:00Z'), coupons });
  }, 60_000);
  afterAll(() => db?.$disconnect());

  it('shows each bet as its own single, not one parlay', async () => {
    const all = await loadBetsView(db, { userId, view: 'all', limit: 50 });
    expect(all.coupons).toHaveLength(6);
    expect(all.coupons.every((c) => c.kind === 'SINGLE' && c.pickCount === 1 && c.games.length === 1)).toBe(true);
    expect(new Set(all.coupons.map((c) => c.id)).size).toBe(6);

    const cook = all.coupons.find((c) => c.games[0]!.picks[0]!.participantName === 'Cam Cook')!;
    expect(cook).toMatchObject({ status: 'WON', oddsRaw: 1910, stakeMinor: 2000, potentialPayoutMinor: 3820, payoutMinor: 3820 });
  });

  it('puts the open single under Open and the settled ones under Settled', async () => {
    const open = await loadBetsView(db, { userId, view: 'open', limit: 50 });
    expect(open.coupons.map((c) => [c.games[0]!.picks[0]!.participantName, c.status, c.stakeMinor, c.potentialPayoutMinor])).toEqual([
      ['Chris Barnes', 'OPEN', 2000, 3660],
    ]);
    const settled = await loadBetsView(db, { userId, view: 'settled', limit: 50 });
    expect(settled.coupons.map((c) => c.status).sort()).toEqual(['LOST', 'LOST', 'WON', 'WON', 'WON']);
  });

  it('counts live games in open bets only', async () => {
    expect((await loadBetsView(db, { userId, view: 'all', limit: 50 })).liveGames).toBe(0);
    // Colorado @ Oklahoma State (Chris Barnes, open) and West Virginia @ TCU (Cam Cook, settled), both under way.
    const team = (id: string, location: string, name: string) => ({ id, abbreviation: null, location, name, displayName: `${location} ${name}` });
    for (const [kambi, espn, home, away] of [
      ['1027553193', 'e1', team('h1', 'Oklahoma State', 'Cowboys'), team('a1', 'Colorado', 'Buffaloes')],
      ['1027553171', 'e2', team('h2', 'TCU', 'Horned Frogs'), team('a2', 'West Virginia', 'Mountaineers')],
    ] as const) {
      await db.externalEventMapping.create({ data: { sportsbookEventId: kambi, provider: 'espn', sport: 'NCAAF', providerEventId: espn, confidence: 1, method: 'TEST', status: 'CONFIRMED' } });
      await db.providerEventState.create({ data: { provider: 'espn', providerEventId: espn, sport: 'NCAAF', startAt: new Date(), homeTeam: home, awayTeam: away, state: 'LIVE' } });
    }
    // Asked for either list, it's the same count: one game, in the open single.
    expect((await loadBetsView(db, { userId, view: 'open', limit: 50 })).liveGames).toBe(1);
    expect((await loadBetsView(db, { userId, view: 'settled', limit: 50 })).liveGames).toBe(1);
    await db.providerEventState.deleteMany();
    await db.externalEventMapping.deleteMany();
  });

  it('counts each bet in performance and on the leaderboard', async () => {
    const a = await loadPerformance(db, { userId });
    expect(a.money).toMatchObject({ settledBets: 5, openBets: 1, stakedMinor: 3 * 500 + 2 * 2000, returnedMinor: 890 + 945 + 3820 });
    expect(a.parlaySize.buckets.filter((b) => b.bets > 0).map((b) => [b.minPicks, b.bets, b.won])).toEqual([[1, 5, 3]]);

    const board = await loadLeaderboard(db, userId, 'all');
    expect(board.rows.find((r) => r.isYou)).toMatchObject({ bets: 5, won: 3, lost: 2 });
  });
});
