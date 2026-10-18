import { describe, expect, it } from 'vitest';
import { notificationEvents } from '../src/notifications/generate';
import type { BetsView, CouponView, GameView, PickView } from '../src/views/betsViewTypes';

const state = (s: string, home: number, away: number) => ({
  state: s,
  period: s === 'FINAL' ? 4 : 3,
  clock: s === 'FINAL' ? '0:00' : '4:59',
  detail: null,
  homeScore: home,
  awayScore: away,
  home: { id: '23', abbreviation: 'PIT' },
  away: { id: '4', abbreviation: 'CIN' },
  situation: null,
  updatedAt: '2026-09-27T19:00:00Z',
});

const pick = (over: Partial<PickView>): PickView => ({
  id: 'p1',
  participantName: 'Chase Brown',
  marketName: '50+ Rushing Yards By The Player - Including Overtime',
  selectionLabel: 'Chase Brown - Yes',
  selectionSide: 'YES',
  line: 50,
  status: 'OPEN',
  betBuilderGroup: null,
  type: 'STAT',
  display: 'PROGRESS',
  moneylineSide: null,
  progress: null,
  ...over,
});

const progress = (status: string, current: number, target = 50, operator = 'GTE', metric = 'RUSHING_YARDS') => ({
  status,
  metric,
  operator,
  target,
  current,
  unavailableReason: null,
  updatedAt: '2026-09-27T19:00:00Z',
});

function view(picks: PickView[], game: Partial<GameView> = {}, coupon: Partial<CouponView> = {}): BetsView {
  return {
    generatedAt: '2026-09-27T19:00:00Z',
    lastSyncedAt: null,
    coupons: [
      {
        id: 'c1',
        externalCouponRef: '1',
        placedAt: null,
        status: 'OPEN',
        rewardType: null,
        currency: 'USD',
        kind: 'COMBINATION',
        oddsRaw: 25937,
        stakeMinor: 500,
        potentialPayoutMinor: 12969,
        potentialPayoutDerived: false,
        payoutMinor: 0,
        pickCount: picks.length,
        picksHit: 0,
        lastSyncedAt: '2026-09-27T19:00:00Z',
        probablySettled: null,
        games: [
          { eventId: 'e1', name: 'CIN Bengals @ PIT Steelers', league: 'NFL', startAt: null, homeName: 'PIT Steelers', awayName: 'CIN Bengals', state: state('LIVE', 17, 20) as never, picks, ...game },
        ],
        ...coupon,
      },
    ],
  };
}

describe('notificationEvents', () => {
  it('announces a pick hitting its target by live stats', () => {
    const [e] = notificationEvents(view([pick({ progress: progress('TARGET_REACHED', 53) })]));
    expect(e).toEqual({
      kind: 'PICK_HIT',
      dedupeKey: 'PICK_HIT:p1',
      couponId: 'c1',
      legSelectionId: 'p1',
      title: '✓ Chase Brown: 50+ rushing yards',
      body: '53 / 50 rush yds · Q3 4:59 CIN 20 – 17 PIT · $5.00 +2494 bet',
    });
  });

  it('announces a game ending without the pick being met', () => {
    const final = { state: state('FINAL', 17, 20) as never };
    const [e] = notificationEvents(view([pick({ progress: progress('FINAL_MISSED', 38) })], final));
    expect(e).toMatchObject({ kind: 'PICK_MISSED', title: '✗ Chase Brown: 50+ rushing yards' });
    expect(e!.body).toMatch(/^38 \/ 50 rush yds · Final CIN 20 – 17 PIT/);
  });

  it('uses scored / did not score for TD picks, and whole numbers for half-point overs', () => {
    const td = pick({ marketName: 'Touchdown Scorer', display: 'BINARY', progress: progress('TARGET_REACHED', 1, 1, 'GTE', 'TOUCHDOWNS') });
    expect(notificationEvents(view([td]))[0]!.title).toBe('✓ Chase Brown scored a TD');
    const over = pick({
      marketName: 'Total Receiving Yards by the Player - Including Overtime',
      selectionLabel: 'Chase Brown - Over 38.5',
      selectionSide: 'OVER',
      progress: progress('TARGET_REACHED', 41, 38.5, 'GT', 'RECEIVING_YARDS'),
    });
    expect(notificationEvents(view([over]))[0]!.body).toMatch(/^41 \/ 39 rec yds/);
  });

  it('says "got a sack" for sack picks, not "scored a TD"', () => {
    const sack = pick({
      participantName: 'TJ Watt',
      marketName: 'Player to have at least 0.5 Sacks - Including Overtime',
      display: 'BINARY',
      progress: progress('TARGET_REACHED', 1, 0.5, 'GTE', 'SACKS'),
    });
    const [e] = notificationEvents(view([sack]));
    expect(e).toMatchObject({ title: '✓ TJ Watt got a sack' });
    expect(e!.body).toMatch(/^To record a sack · /);
  });

  it('settles moneylines only at the final whistle', () => {
    const ml = pick({ type: 'MONEYLINE', display: null, participantName: 'CIN Bengals', marketName: 'Moneyline', moneylineSide: 'away' });
    expect(notificationEvents(view([ml]))).toEqual([]);
    const won = notificationEvents(view([ml], { state: state('FINAL', 17, 20) as never }));
    expect(won[0]).toMatchObject({ kind: 'PICK_HIT', title: '✓ CIN Bengals won', body: 'Moneyline · Final CIN 20 – 17 PIT · $5.00 +2494 bet' });
    const lost = notificationEvents(view([ml], { state: state('FINAL', 24, 20) as never }));
    expect(lost[0]).toMatchObject({ kind: 'PICK_MISSED', title: '✗ CIN Bengals lost' });
  });

  it('settles spreads on the final score plus the line, and stays quiet on a push', () => {
    const sp = pick({ type: 'SPREAD', display: null, participantName: 'CIN Bengals +5.0', marketName: 'Point Spread - Including Overtime', line: 5, moneylineSide: 'away' });
    expect(notificationEvents(view([sp], { state: state('LIVE', 30, 20) as never }))).toEqual([]);
    const covered = notificationEvents(view([sp], { state: state('FINAL', 24, 20) as never }));
    expect(covered[0]).toMatchObject({ kind: 'PICK_HIT', title: '✓ CIN Bengals +5.0 covered', body: 'Point spread · Final CIN 20 – 24 PIT · $5.00 +2494 bet' });
    const missed = notificationEvents(view([sp], { state: state('FINAL', 27, 20) as never }));
    expect(missed[0]).toMatchObject({ kind: 'PICK_MISSED', title: "✗ CIN Bengals +5.0 didn't cover" });
    expect(notificationEvents(view([sp], { state: state('FINAL', 25, 20) as never }))).toEqual([]);
  });

  it('settles totals on combined points: an over as soon as it passes, an under when it goes over or at the final', () => {
    const over = pick({ type: 'TOTAL', display: null, participantName: null, selectionLabel: 'Over 47.5', selectionSide: 'OVER', marketName: 'Total Points', line: 47.5 });
    expect(notificationEvents(view([over], { state: state('LIVE', 21, 20) as never }))).toEqual([]);
    expect(notificationEvents(view([over], { state: state('LIVE', 28, 20) as never }))[0]).toMatchObject({ kind: 'PICK_HIT', title: '✓ Over 47.5 points hit' });
    expect(notificationEvents(view([over], { state: state('FINAL', 24, 20) as never }))[0]).toMatchObject({ kind: 'PICK_MISSED', title: '✗ Over 47.5 points fell short' });
    const under = { ...over, selectionLabel: 'Under 47.5', selectionSide: 'UNDER' };
    expect(notificationEvents(view([under], { state: state('LIVE', 28, 20) as never }))[0]).toMatchObject({ kind: 'PICK_MISSED', title: '✗ Under 47.5 points went over' });
    expect(notificationEvents(view([under], { state: state('FINAL', 24, 20) as never }))[0]).toMatchObject({ kind: 'PICK_HIT' });
  });

  it('stays quiet for in-progress picks, picks Island Luck already settled, and settled bets', () => {
    expect(notificationEvents(view([pick({ progress: progress('IN_PROGRESS', 20) })]))).toEqual([]);
    expect(notificationEvents(view([pick({ status: 'WON', progress: progress('TARGET_REACHED', 53) })]))).toEqual([]);
    expect(notificationEvents(view([pick({ progress: progress('TARGET_REACHED', 53) })], {}, { status: 'LOST' }))).toEqual([]);
  });

  it('nudges to sync when every game is over', () => {
    // A pick live stats can't decide (an untracked market), so the bet is waiting on Island Luck.
    const events = notificationEvents(view([pick({ type: 'OTHER', display: null, progress: null })], {}, { probablySettled: 'ALL_GAMES_FINAL' }));
    expect(events).toEqual([
      {
        kind: 'PROBABLY_SETTLED',
        dedupeKey: 'PROBABLY_SETTLED:c1',
        couponId: 'c1',
        legSelectionId: null,
        title: 'Needs sync: $5.00 +2494 bet',
        body: 'All games are over but Island Luck still shows it open. Open My Bets on Island Luck to sync it.',
      },
    ]);
  });

  it('treats a moneyline lost on the final score as decided, though Island Luck still has it open', () => {
    const ml = pick({ type: 'MONEYLINE', display: null, participantName: 'CIN Bengals', marketName: 'Moneyline', moneylineSide: 'away' });
    const events = notificationEvents(view([ml], { state: state('FINAL', 24, 20) as never }, { probablySettled: 'ALL_GAMES_FINAL' }));
    expect(events.find((x) => x.kind === 'PROBABLY_SETTLED')).toMatchObject({ title: 'All games over: $5.00 +2494 bet' });
  });

  it('keeps "needs sync" for undecided bets: a bet already dead by live stats gets plain words', () => {
    const missed = pick({ status: 'LOST', progress: progress('FINAL_MISSED', 30) });
    const [e] = notificationEvents(view([missed], { state: state('FINAL', 17, 20) as never }, { probablySettled: 'ALL_GAMES_FINAL' })).filter((x) => x.kind === 'PROBABLY_SETTLED');
    expect(e).toMatchObject({ title: 'All games over: $5.00 +2494 bet', body: 'Island Luck still shows it open. Open My Bets on Island Luck to settle it.' });
  });
});
