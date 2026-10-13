import { parseHistoryResponse, type ParsedCoupon, type RawHistoryResponse } from '@sports-better/kambi';
import { describe, expect, it } from 'vitest';
import captured from '../../../packages/kambi/fixtures/captured/history-2026-09-27.json';
import { computeAnalysis, weekOf, type AnalysisCoupon, type AnalysisLeg } from '../src/analysis/compute';

/** Parsed Kambi coupons → analysis input (no live data). */
function fromParsed(c: ParsedCoupon, extra: Partial<AnalysisCoupon> = {}): AnalysisCoupon {
  const bet = c.bets[0]!;
  return {
    id: c.externalCouponRef,
    status: c.status,
    rewardType: c.rewardType,
    placedAt: c.placedAt ? new Date(c.placedAt) : null,
    stakeMinor: c.totalStakeMinor ?? 0,
    payoutMinor: c.actualPayoutMinor ?? 0,
    potentialPayoutMinor: c.potentialPayoutMinor,
    oddsRaw: bet.oddsRaw,
    legs: bet.legs.map(
      (l): AnalysisLeg => ({
        selectionType: l.selectionType,
        oddsRaw: l.oddsRaw,
        sport: l.sport,
        league: l.league,
        eventName: l.eventName,
        game: null,
        selections: l.selections.map((s) => ({
          status: s.status,
          marketName: s.marketName,
          participantName: s.participantName,
          participantId: s.externalParticipantId,
          selectionSide: s.selectionSide,
          line: s.line,
          moneylineSide: null,
          progress: null,
        })),
      }),
    ),
    ...extra,
  };
}

const real = parseHistoryResponse(captured as unknown as RawHistoryResponse).map((c) => fromParsed(c));
const a = computeAnalysis(real, new Date('2026-09-27T20:00:00Z'));

describe('analysis of the real capture (numbers checked independently against the raw JSON)', () => {
  it('counts money honestly: free-bet stakes are not your money', () => {
    expect(a.money).toMatchObject({
      settledBets: 9,
      stakedMinor: 4500,
      realStakedMinor: 3500,
      returnedMinor: 475,
      netMinor: -3025,
      openBets: 6,
      openRealStakedMinor: 3000,
    });
    expect(a.money.roi).toBeCloseTo(-3025 / 3500);
  });

  it('splits funding (under 20× payout) from fun bets', () => {
    // Funding: +160 single (lost) and the +988 / +1066 / +1187 parlays (open).
    expect(a.styles.fundingMaxOdds).toBe(20);
    expect(a.styles.funding).toMatchObject({ bets: 4, settled: 1, won: 0, open: 3, returnedMinor: 0, netMinor: -500, winRate: 0 });
    expect(a.styles.fun).toMatchObject({ bets: 11, settled: 8, won: 0, lost: 7, cashedOut: 1, open: 3, returnedMinor: 475 });
    // Free bets aren't your money: fun net = 4.75 returned − 6 real-money $5 stakes.
    expect(a.styles.fun.netMinor).toBe(475 - 3000);
  });

  it('moves the cutoff when asked', () => {
    const wide = computeAnalysis(real, new Date(), 50);
    expect(wide.styles.funding.bets).toBe(8);
    expect(wide.styles.funding.bets + wide.styles.fun.bets).toBe(15);
  });

  it('breaks down promos', () => {
    const byType = Object.fromEntries(a.money.promos.map((p) => [p.rewardType, p]));
    expect(byType.FREE_BET).toMatchObject({ bets: 2, settled: 2, won: 0, returnedMinor: 0 });
    expect(byType.INSURANCE!.bets).toBe(5);
    expect(byType.SECOND_CHANCE!.bets).toBe(1);
  });

  it('groups bets into Monday-start weeks (Nassau time)', () => {
    expect(a.money.weeks.map((w) => [w.weekOf, w.bets])).toEqual([
      ['2026-09-14', 4], // Sun 9/20 bets
      ['2026-09-21', 11],
    ]);
  });

  it('uses every officially settled pick for the hit rate', () => {
    expect(a.parlaySize.settledPicks).toBe(58);
    expect(a.parlaySize.pickHitRate).toBeCloseTo(28 / 58);
  });

  it('compares bet sizes with the chance of every pick hitting', () => {
    const tenPlus = a.parlaySize.buckets.find((b) => b.label === '10+ picks')!;
    // Two lost 12–14 pick parlays plus the cashed-out 14-pick one.
    expect(tenPlus.bets).toBe(3);
    expect(tenPlus.won).toBe(0);
    // Well under 1%: 12–14 picks at ~48% each.
    expect(tenPlus.chanceAtYourRate!).toBeLessThan(0.001);
    const single = a.parlaySize.buckets.find((b) => b.label === '1 pick')!;
    expect(single).toMatchObject({ bets: 1, won: 0 });
    expect(single.chanceByOdds).toBeCloseTo(1 / 2.6);
  });

  it('reports hit rate by market, flagged early under 30 picks', () => {
    const ml = a.markets.find((m) => m.market === 'Moneyline')!;
    expect(ml).toMatchObject({ picks: 29, won: 15, early: true });
    // Two moneylines sat inside same-game groups, which share one price.
    expect(ml.pricedPicks).toBe(27);
    expect(ml.impliedRate!).toBeGreaterThan(0.4);
    expect(a.markets.find((m) => m.market === 'Anytime TD')).toBeDefined();
    expect(a.markets.every((m) => m.market !== 'Other')).toBe(true);
  });

  it('shows how many picks missed on each lost bet', () => {
    expect(a.howClose.lostBets).toBe(8);
    expect(a.howClose.lostByOne).toBe(1);
    expect(a.howClose.missedDistribution).toEqual([
      { missed: '1', bets: 1 },
      { missed: '2', bets: 1 },
      { missed: '3', bets: 2 },
      { missed: '4', bets: 0 },
      { missed: '5', bets: 3 },
      { missed: '6', bets: 1 },
    ]);
  });

  it('keeps a record per player and per team', () => {
    expect(a.players.find((p) => p.name === 'Kenneth Walker III')).toEqual({ name: 'Kenneth Walker III', picks: 5, won: 1, lost: 1, open: 3 });
    expect(a.teams.length).toBeGreaterThan(10);
    expect(a.players.some((p) => p.name.endsWith('Chiefs'))).toBe(false);
  });

  it('cannot judge the cash-out without final scores', () => {
    expect(a.cashOuts).toHaveLength(1);
    expect(a.cashOuts[0]).toMatchObject({ verdict: 'PENDING', cashedOutMinor: 475, potentialPayoutMinor: 133603, picks: 14, picksUnknown: 14 });
  });
});

describe('analysis with live data', () => {
  const [cashed] = parseHistoryResponse(captured as unknown as RawHistoryResponse).filter((c) => c.status === 'CASHED_OUT');

  it('judges a cash out from final scores', () => {
    const allWin = fromParsed(cashed!);
    for (const l of allWin.legs) {
      l.game = { state: 'FINAL', homeScore: 20, awayScore: 10 };
      for (const s of l.selections) s.moneylineSide = 'home';
    }
    expect(computeAnalysis([allWin]).cashOuts[0]).toMatchObject({ verdict: 'WOULD_HAVE_WON', picksWon: 14 });

    const oneLoses = structuredClone(allWin);
    oneLoses.legs[0]!.selections[0]!.moneylineSide = 'away';
    oneLoses.legs[1]!.game = { state: 'LIVE', homeScore: 7, awayScore: 3 };
    expect(computeAnalysis([oneLoses]).cashOuts[0]).toMatchObject({ verdict: 'WOULD_HAVE_LOST', picksLost: 1, picksUnknown: 1 });
  });

  it('lists yardage near misses from final live stats, closest first', () => {
    const c = fromParsed(parseHistoryResponse(captured as unknown as RawHistoryResponse).find((x) => x.externalCouponRef === '13163984834')!);
    const walker = c.legs[0]!.selections.find((s) => s.participantName === 'Kenneth Walker III')!;
    walker.progress = { status: 'FINAL_MISSED', current: 70, target: 80, operator: 'GTE', metric: 'RUSHING_YARDS' };
    const kelce = c.legs[0]!.selections.find((s) => s.participantName === 'Travis Kelce')!;
    kelce.progress = { status: 'FINAL_MISSED', current: 59, target: 60, operator: 'GTE', metric: 'RECEIVING_YARDS' };
    // The same Walker pick in a second bet is listed once, counted twice.
    const second = structuredClone(c);
    second.id = 'other';
    const { nearMisses } = computeAnalysis([c, second]).howClose;
    expect(nearMisses.map((n) => n.bets)).toEqual([2, 2]);
    expect(nearMisses.map((n) => [n.participantName, n.current, n.needed, n.shortBy, n.unit])).toEqual([
      ['Travis Kelce', 59, 60, 1, 'rec yds'],
      ['Kenneth Walker III', 70, 80, 10, 'rush yds'],
    ]);
  });
});

describe('weekOf', () => {
  it('uses Monday-start weeks in Nassau time', () => {
    expect(weekOf(new Date('2026-09-27T23:00:00Z'))).toBe('2026-09-21'); // Sun 7 PM Nassau
    expect(weekOf(new Date('2026-09-28T03:30:00Z'))).toBe('2026-09-21'); // still Sun 11:30 PM Nassau
    expect(weekOf(new Date('2026-09-28T04:30:00Z'))).toBe('2026-09-28'); // Mon 12:30 AM Nassau
  });
});
