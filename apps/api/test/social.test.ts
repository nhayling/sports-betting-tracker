import { parseHistoryResponse, type RawHistoryResponse } from '@sports-better/kambi';
import { describe, expect, it } from 'vitest';
import captured from '../../../packages/kambi/fixtures/captured/history-2026-09-27.json';
import { accessTo } from '../src/social/store';
import type { Relation } from '../src/social/types';
import { betUnits, inPeriod, netMinor, rank, unitStats, type UnitBet } from '../src/social/units';
import { asSeenByOthers, MIN_BET_MINOR } from '../src/views/betsView';
import type { BetsView, CouponView } from '../src/views/betsViewTypes';

const bet = (status: string, oddsRaw: number | null, stakeMinor = 500, payoutMinor = 0, extra: Partial<UnitBet> = {}): UnitBet => ({
  status,
  oddsRaw,
  stakeMinor,
  payoutMinor,
  rewardType: null,
  placedAt: new Date('2026-10-07T18:00:00Z'),
  ...extra,
});

describe('betUnits: every bet is one unit', () => {
  it('scores wins by the odds and losses as one unit', () => {
    expect(betUnits(bet('WON', 4000, 500, 2000))).toBe(3); // +300
    expect(betUnits(bet('WON', 1500, 500, 750))).toBe(0.5); // -200
    expect(betUnits(bet('WON', 12870, 500, 6435))).toBeCloseTo(11.87); // +1187
    expect(betUnits(bet('LOST', 12870))).toBe(-1);
  });

  it('scores a cash out at what it returned per unit staked', () => {
    expect(betUnits(bet('CASHED_OUT', 267205, 500, 475))).toBeCloseTo(-0.05);
    expect(betUnits(bet('CASHED_OUT', 8000, 500, 1250))).toBe(1.5);
  });

  it('scores a system coupon (no single price) on its return', () => {
    expect(betUnits(bet('WON', null, 1500, 4500))).toBe(2);
    expect(betUnits(bet('MIXED', null, 1500, 900))).toBeCloseTo(-0.4);
  });

  it('leaves out bets with no result', () => {
    expect(betUnits(bet('OPEN', 4000))).toBeNull();
    expect(betUnits(bet('VOID', 4000, 500, 500))).toBeNull();
    expect(betUnits(bet('UNKNOWN', 4000))).toBeNull();
  });

  it('counts a free bet like any other pick', () => {
    expect(betUnits(bet('LOST', 4000, 500, 0, { rewardType: 'FREE_BET' }))).toBe(-1);
    expect(betUnits(bet('WON', 4000, 500, 1500, { rewardType: 'FREE_BET' }))).toBe(3);
  });
});

describe('unitStats', () => {
  const picks: Array<[string, number]> = [
    ['WON', 4000],
    ['LOST', 12870],
    ['WON', 1500],
    ['LOST', 2000],
  ];

  it('adds up a record', () => {
    expect(unitStats(picks.map(([s, o]) => bet(s, o)))).toEqual({ bets: 4, won: 2, lost: 2, other: 0, units: 1.5, roi: 0.375, bestHitOddsRaw: 4000 });
  });

  it('is the same whether the stakes were $5 or $500, so it cannot give the stakes away', () => {
    const at = (stake: number) => unitStats(picks.map(([s, o]) => bet(s, o, stake, s === 'WON' ? (stake * o) / 1000 : 0)));
    expect(at(500)).toEqual(at(50_000));
  });

  it('is empty with nothing settled', () => {
    expect(unitStats([bet('OPEN', 4000)])).toEqual({ bets: 0, won: 0, lost: 0, other: 0, units: 0, roi: null, bestHitOddsRaw: null });
  });

  it('matches the real capture: 8 lost and one cash out at 95¢ on the dollar', () => {
    const real = parseHistoryResponse(captured as unknown as RawHistoryResponse).map(
      (c): UnitBet => ({
        status: c.status,
        oddsRaw: c.bets.length === 1 ? c.bets[0]!.oddsRaw : null,
        stakeMinor: c.totalStakeMinor ?? 0,
        payoutMinor: c.actualPayoutMinor ?? 0,
        rewardType: c.rewardType,
        placedAt: c.placedAt ? new Date(c.placedAt) : null,
      }),
    );
    expect(unitStats(real)).toMatchObject({ bets: 9, won: 0, lost: 8, other: 1, units: -8.05, bestHitOddsRaw: null });
    // $4.75 back on $35 of own money (two of the nine $5 bets were free bets).
    expect(netMinor(real)).toBe(-3025);
  });
});

describe('inPeriod (Nassau time)', () => {
  const now = new Date('2026-10-07T18:00:00Z'); // Wednesday

  it('starts the week on Monday', () => {
    expect(inPeriod(new Date('2026-10-05T04:30:00Z'), 'week', now)).toBe(true); // Mon 00:30 Nassau
    expect(inPeriod(new Date('2026-10-05T03:30:00Z'), 'week', now)).toBe(false); // Sun 23:30 Nassau
  });

  it('uses the calendar month', () => {
    expect(inPeriod(new Date('2026-10-01T04:30:00Z'), 'month', now)).toBe(true);
    expect(inPeriod(new Date('2026-10-01T03:30:00Z'), 'month', now)).toBe(false); // still Sep 30 in Nassau
  });

  it('counts everything for all time, but an undated bet only there', () => {
    expect(inPeriod(new Date('2025-01-01T00:00:00Z'), 'all', now)).toBe(true);
    expect(inPeriod(null, 'all', now)).toBe(true);
    expect(inPeriod(null, 'week', now)).toBe(false);
  });
});

describe('rank', () => {
  const row = (username: string, bets: number, units: number) => ({ username, bets, won: 0, lost: 0, other: 0, units, roi: bets ? units / bets : null, bestHitOddsRaw: null });

  it('orders by units among those with enough bets, and leaves the rest unranked', () => {
    const ranked = rank([row('ann', 3, 1), row('bob', 2, 40), row('cy', 5, 6.5), row('dee', 0, 0)], 'week');
    expect(ranked.map((r) => [r.username, r.rank])).toEqual([
      ['cy', 1],
      ['ann', 2],
      // One +4000 hit on two bets doesn't top the week.
      ['bob', null],
      ['dee', null],
    ]);
  });

  it('breaks a tie on units with the better return per bet', () => {
    expect(rank([row('ann', 10, 4), row('bob', 5, 4)], 'week').map((r) => r.username)).toEqual(['bob', 'ann']);
  });
});

describe('accessTo', () => {
  const target = { id: 'noah', shareAmountsFriends: false, shareAmountsFollowers: false, showOnLeaderboard: true };
  const rel = (r: Partial<Relation>): Relation => ({ friend: 'NONE', following: 'NONE', followsYou: 'NONE', ...r });

  it('shows a stranger the leaderboard record and nothing else', () => {
    expect(accessTo(target, 'x', rel({}))).toEqual({ stats: true, bets: false, amounts: false });
    expect(accessTo({ ...target, showOnLeaderboard: false }, 'x', rel({}))).toEqual({ stats: false, bets: false, amounts: false });
  });

  it('does not count a pending request (friend, or to follow a locked account), or them following you, as access', () => {
    for (const r of [rel({ friend: 'SENT' }), rel({ friend: 'RECEIVED' }), rel({ following: 'REQUESTED' }), rel({ followsYou: 'FOLLOWING' })]) {
      expect(accessTo(target, 'x', r).bets).toBe(false);
    }
  });

  it('shows friends and followers the bets, and amounts only through their own switch', () => {
    expect(accessTo(target, 'x', rel({ friend: 'FRIENDS' }))).toEqual({ stats: true, bets: true, amounts: false });
    expect(accessTo({ ...target, shareAmountsFriends: true }, 'x', rel({ friend: 'FRIENDS' })).amounts).toBe(true);
    expect(accessTo(target, 'x', rel({ following: 'FOLLOWING' }))).toEqual({ stats: true, bets: true, amounts: false });
    expect(accessTo({ ...target, shareAmountsFriends: true }, 'x', rel({ following: 'FOLLOWING' })).amounts).toBe(false);
    expect(accessTo({ ...target, shareAmountsFollowers: true }, 'x', rel({ following: 'FOLLOWING' })).amounts).toBe(true);
    // Someone who is both gets the more generous of the two.
    expect(accessTo({ ...target, shareAmountsFriends: true }, 'x', rel({ friend: 'FRIENDS', following: 'FOLLOWING' })).amounts).toBe(true);
    expect(accessTo({ ...target, shareAmountsFollowers: true }, 'x', rel({ friend: 'FRIENDS' })).amounts).toBe(false);
  });

  it('shows you everything of your own', () => {
    expect(accessTo(target, 'noah', rel({}))).toEqual({ stats: true, bets: true, amounts: true });
  });
});

describe('asSeenByOthers: amounts restated at the minimum bet', () => {
  const coupon = (over: Partial<CouponView> = {}): CouponView => ({
    id: 'c1',
    externalCouponRef: 'IL-123456',
    placedAt: '2026-10-07T18:00:00.000Z',
    status: 'OPEN',
    rewardType: null,
    currency: 'BSD',
    kind: 'COMBINATION',
    oddsRaw: 12_870, // +1187
    stakeMinor: 10_000,
    potentialPayoutMinor: 128_700,
    potentialPayoutDerived: false,
    payoutMinor: null,
    pickCount: 5,
    picksHit: 1,
    lastSyncedAt: '2026-10-07T18:00:00.000Z',
    probablySettled: 'ALL_GAMES_FINAL',
    games: [],
    ...over,
  });
  const view = (...coupons: CouponView[]): BetsView => ({ generatedAt: '2026-10-07T18:00:00.000Z', lastSyncedAt: null, coupons });
  const money = (c: CouponView) => [c.stakeMinor, c.potentialPayoutMinor, c.payoutMinor];
  const hidden = (c: CouponView) => asSeenByOthers(view(c), false).coupons[0]!;

  it('is Island Luck\'s $5 minimum', () => {
    expect(MIN_BET_MINOR).toBe(500);
  });

  it('shows a $100 bet at +1187 as $5 to pay $64.35, and says so', () => {
    const seen = asSeenByOthers(view(coupon()), false);
    expect(seen.minBetMinor).toBe(500);
    expect(money(seen.coupons[0]!)).toEqual([500, 6435, null]);
    // Odds, picks and status are untouched.
    expect(seen.coupons[0]).toMatchObject({ oddsRaw: 12_870, pickCount: 5, picksHit: 1, status: 'OPEN' });
  });

  it('comes out the same whatever was really staked', () => {
    const at = (stake: number) => money(hidden(coupon({ stakeMinor: stake, potentialPayoutMinor: (stake * 12_870) / 1000 })));
    expect(at(500)).toEqual(at(10_000));
    expect(at(500)).toEqual(at(250_000));
  });

  it('restates results too: paid, lost, cashed out and void', () => {
    expect(money(hidden(coupon({ status: 'WON', payoutMinor: 128_700 })))).toEqual([500, 6435, 6435]);
    // A lost bet still shows what it would have paid.
    expect(money(hidden(coupon({ status: 'LOST', payoutMinor: 0 })))).toEqual([500, 6435, 0]);
    // Cashed out at 95¢ on the dollar, whatever the stake.
    expect(money(hidden(coupon({ status: 'CASHED_OUT', payoutMinor: 9500 })))).toEqual([500, 6435, 475]);
    expect(money(hidden(coupon({ status: 'VOID', payoutMinor: 10_000 })))).toEqual([500, 6435, 500]);
  });

  it('follows what the bet really pays per dollar, so a free bet shows winnings without the stake', () => {
    expect(money(hidden(coupon({ rewardType: 'FREE_BET', potentialPayoutMinor: 118_700 })))).toEqual([500, 5935, null]);
  });

  it('falls back to the odds when the stake or payout is missing', () => {
    expect(money(hidden(coupon({ stakeMinor: null, potentialPayoutMinor: null })))).toEqual([500, 6435, null]);
    expect(money(hidden(coupon({ stakeMinor: null, potentialPayoutMinor: null, oddsRaw: null })))).toEqual([500, null, null]);
  });

  it('keeps the owner-only parts back even when amounts are shared', () => {
    const seen = asSeenByOthers(view(coupon()), true);
    expect(seen.minBetMinor).toBeUndefined();
    expect(money(seen.coupons[0]!)).toEqual([10_000, 128_700, null]);
    expect(seen.coupons[0]).toMatchObject({ externalCouponRef: '', probablySettled: null });
    expect(hidden(coupon())).toMatchObject({ externalCouponRef: '', probablySettled: null });
  });
});
