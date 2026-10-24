import { describe, expect, it } from 'vitest';
import { parseCoupon, parseHistoryResponse, type RawCoupon, type RawHistoryResponse } from '../src';
import { parseOutcomeLabel } from '../src/parse';
import captured from '../fixtures/captured/history-2026-09-27.json';

const coupons = parseHistoryResponse(captured as unknown as RawHistoryResponse);
const byRef = (ref: string) => coupons.find((c) => c.externalCouponRef === ref)!;

describe('real capture (2026-09-27)', () => {
  it('parses all 15 coupons without warnings', () => {
    expect(coupons).toHaveLength(15);
    expect(coupons.flatMap((c) => c.warnings)).toEqual([]);
  });

  describe('open $5 parlay with bet builder rows', () => {
    const c = byRef('13164001585');
    const bet = c.bets[0]!;

    it('keeps coupon identity, money and promotion', () => {
      expect(c).toMatchObject({
        externalCouponUuid: 'b93a3d9d-d5e3-459b-8c1f-b6b5286d5648',
        placedAt: '2026-09-27T16:38:17.617Z',
        currency: 'USD',
        channel: 'WEB',
        rewardType: 'INSURANCE',
        status: 'OPEN',
        totalStakeMinor: 500,
        potentialPayoutMinor: 6433,
      });
    });

    it('is one combination bet, not one bet per outcome', () => {
      expect(c.bets).toHaveLength(1);
      expect(bet).toMatchObject({ kind: 'COMBINATION', oddsRaw: 12866, odds: 12.866, potentialPayoutDerived: false });
    });

    it('represents each coupon row as a leg', () => {
      expect(bet.legs.map((l) => [l.externalRowIndex, l.selectionType, l.oddsRaw, l.selections.length])).toEqual([
        [0, 'BET_BUILDER', 3650, 2],
        [1, 'BET_BUILDER', 2500, 2],
        [2, 'SIMPLE', 1410, 1],
      ]);
    });

    it('resolves events for each leg', () => {
      expect(bet.legs[0]).toMatchObject({
        eventId: '1028811700',
        eventName: 'KC Chiefs @ MIA Dolphins',
        homeName: 'MIA Dolphins',
        awayName: 'KC Chiefs',
        sport: 'AMERICAN_FOOTBALL',
        league: 'NFL',
        eventStartAt: '2026-09-27T17:00:00.000Z',
      });
    });

    it('extracts player, market, side and line from each selection', () => {
      expect(bet.legs[0]!.selections[0]).toMatchObject({
        externalParticipantId: '1007779124',
        participantName: 'Kenneth Walker III',
        marketName: '100+ Rushing Yards By The Player - Including Overtime',
        marketType: 'Player Occurrence Line',
        selectionLabel: 'Kenneth Walker III - Yes',
        selectionSide: 'YES',
        lineRaw: 100000,
        line: 100,
        status: 'OPEN',
      });
    });

    it('keeps selection-level settlement inside an open bet builder row', () => {
      const [rush, td] = bet.legs[0]!.selections;
      expect(bet.legs[0]!.status).toBe('OPEN');
      expect(rush!.status).toBe('OPEN');
      expect(td).toMatchObject({ marketName: 'Touchdown Scorer', status: 'WON', line: 1 });
    });
  });

  it('recomputes potential payout when Kambi zeroes it on a lost bet', () => {
    const bet = byRef('13142231341').bets[0]!;
    expect(bet).toMatchObject({ status: 'LOST', oddsRaw: 497000, potentialPayoutMinor: 248500, potentialPayoutDerived: true, payoutMinor: 0 });
    expect(bet.legs.map((l) => [l.status, l.payoutOddsRaw])).toEqual([
      ['WON', 7000],
      ['LOST', 0],
    ]);
    expect(bet.legs[1]!.selections.map((s) => s.settledResult)).toEqual([['No'], ['No'], ['Yes'], ['No']]);
  });

  it('reads every stake as $5.00', () => {
    expect(new Set(coupons.map((c) => c.totalStakeMinor))).toEqual(new Set([500]));
  });

  it('shows what a lost bet would have paid', () => {
    // Island Luck's UI hides this once a bet loses; Kambi zeroes it, the parser recomputes it.
    const lost = coupons.filter((c) => c.status === 'LOST');
    expect(lost).toHaveLength(8);
    for (const c of lost) {
      expect(c.bets[0]!.potentialPayoutDerived).toBe(true);
      expect(c.potentialPayoutMinor).toBeGreaterThan(c.totalStakeMinor!);
    }
  });

  it('keeps cash outs distinct from wins', () => {
    const c = byRef('13157998989');
    expect(c).toMatchObject({ status: 'CASHED_OUT', potentialPayoutMinor: 133603, actualPayoutMinor: 475 });
    // Rows stay OPEN after a cash out; the bet status is what counts.
    expect(c.bets[0]!.legs.every((l) => l.status === 'OPEN')).toBe(true);
  });

  it('treats moneyline teams as participants without a side', () => {
    const s = byRef('13157998989').bets[0]!.legs[0]!.selections[0]!;
    expect(s).toMatchObject({ participantName: 'CAR Panthers', marketName: 'Moneyline', selectionSide: null, line: null });
  });

  it('parses over/under player props', () => {
    const sel = coupons
      .flatMap((c) => c.bets.flatMap((b) => b.legs.flatMap((l) => l.selections)))
      .find((s) => s.selectionLabel === 'Bijan Robinson - Over 38.5')!;
    expect(sel).toMatchObject({ participantName: 'Bijan Robinson', selectionSide: 'OVER', line: 38.5 });
  });

  it('keeps free bet and insurance promotions', () => {
    expect(new Set(coupons.map((c) => c.rewardType))).toEqual(new Set([null, 'FREE_BET', 'INSURANCE', 'SECOND_CHANCE']));
  });

  it('handles college events', () => {
    expect(byRef('13157998025').bets[0]!.legs[0]).toMatchObject({ league: 'NCAAF', eventName: '(1) Texas @ (14) Tennessee' });
  });
});

describe('historyCoupons response variant', () => {
  it('parses the same coupons under historyCoupons', () => {
    const { coupons: list, ...rest } = captured as unknown as RawHistoryResponse;
    const variant = parseHistoryResponse({ ...rest, historyCoupons: list });
    expect(variant.map((c) => c.externalCouponRef)).toEqual(coupons.map((c) => c.externalCouponRef));
  });
});

describe('parseOutcomeLabel', () => {
  it.each([
    ['Derrick Henry - Yes', { name: 'Derrick Henry', side: 'YES', labelLine: null }],
    ['Jaxson Dart - No', { name: 'Jaxson Dart', side: 'NO', labelLine: null }],
    ['Drake London - Over 5.5', { name: 'Drake London', side: 'OVER', labelLine: 5.5 }],
    ['Amon-Ra St. Brown - Under 70', { name: 'Amon-Ra St. Brown', side: 'UNDER', labelLine: 70 }],
    ['TB Buccaneers', { name: 'TB Buccaneers', side: null, labelLine: null }],
    // Whole-game totals have no name (Total Successful Field Goals).
    ['Over 3.5', { name: null, side: 'OVER', labelLine: 3.5 }],
    ['Under 44.5', { name: null, side: 'UNDER', labelLine: 44.5 }],
    // Whole-game yes/no (Both Teams To Score, To go the distance).
    ['Yes', { name: null, side: 'YES', labelLine: null }],
    ['No', { name: null, side: 'NO', labelLine: null }],
    // Three-way picks are labelled by position; the tracker maps them to the teams.
    ['X', { name: 'X', side: null, labelLine: null }],
  ])('%s', (label, expected) => {
    expect(parseOutcomeLabel(label)).toEqual(expected);
  });
});

describe('parseCoupon edge cases (synthetic)', () => {
  const base = (overrides: Partial<RawCoupon> = {}): RawCoupon => ({
    couponRef: 1,
    currency: 'USD',
    bets: [{ betRef: 2, stake: 1000, playedOdds: 2000, potentialPayout: 2000, betStatus: 'OPEN', couponRowIndexes: [0] }],
    couponRows: [{ index: 0, selectionType: 'SIMPLE', outcomeId: 10, playedOdds: 2000, status: 'OPEN' }],
    outcomes: [{ outcomeId: 10, betOfferId: 20, eventId: 30, label: 'X - Yes', participantId: 40, status: 'OPEN' }],
    betOffers: [{ betOfferId: 20, criterion: 'Touchdown Scorer' }],
    events: [{ eventId: 30, eventName: 'A @ B' }],
    ...overrides,
  });

  it('parses a clean coupon without warnings', () => {
    expect(parseCoupon(base()).warnings).toEqual([]);
  });

  it('keeps unknown statuses trackable as UNKNOWN with the raw value', () => {
    const c = parseCoupon(base({ bets: [{ betRef: 2, stake: 1000, playedOdds: 2000, betStatus: 'SOMETHING_NEW', couponRowIndexes: [0] }] }));
    expect(c.status).toBe('UNKNOWN');
    expect(c.bets[0]).toMatchObject({ status: 'UNKNOWN', rawStatus: 'SOMETHING_NEW' });
    expect(c.bets[0]!.legs).toHaveLength(1);
  });

  it('normalizes VOID', () => {
    const c = parseCoupon(base({ bets: [{ betRef: 2, stake: 1000, playedOdds: 2000, betStatus: 'VOID', payout: 1000, couponRowIndexes: [0] }] }));
    expect(c).toMatchObject({ status: 'VOID', actualPayoutMinor: 100 });
  });

  it('keeps a potential payout on cash outs even if Kambi zeroes it', () => {
    const c = parseCoupon(
      base({ bets: [{ betRef: 2, stake: 5000, playedOdds: 12866, potentialPayout: 0, payout: 4750, betStatus: 'CASHED_OUT', couponRowIndexes: [0] }] }),
    );
    expect(c.bets[0]).toMatchObject({ status: 'CASHED_OUT', payoutMinor: 475, potentialPayoutMinor: 6433, potentialPayoutDerived: true });
  });

  it('warns instead of throwing when an outcome is missing', () => {
    const c = parseCoupon(base({ outcomes: [] }));
    expect(c.bets[0]!.legs[0]!.selections[0]!.externalOutcomeId).toBe('10');
    expect(c.warnings).toContain('outcome 10 not found in coupon.outcomes');
  });

  it('warns when payout does not match stake × odds', () => {
    const c = parseCoupon(base({ bets: [{ betRef: 2, stake: 1000, playedOdds: 2000, potentialPayout: 20, betStatus: 'OPEN', couponRowIndexes: [0] }] }));
    expect(c.warnings.some((w) => w.includes('money/odds scale may be wrong'))).toBe(true);
  });

  it('warns on unknown selection types and non-AND outcome groups', () => {
    const c = parseCoupon(
      base({
        couponRows: [
          { index: 0, selectionType: 'BET_BUILDER', outcomeGroup: { operation: 'OR', groups: [{ operation: 'AND', outcomeIds: [10] }] }, playedOdds: 2000 },
        ],
      }),
    );
    expect(c.warnings).toContain('row 0: outcome group operation OR, expected AND');
    const d = parseCoupon(base({ couponRows: [{ index: 0, selectionType: 'MYSTERY', outcomeId: 10, playedOdds: 2000 }] }));
    expect(d.warnings[0]).toMatch(/unknown selectionType MYSTERY/);
  });

  it('flags system bets as not normalized yet', () => {
    const c = parseCoupon(base({ systemBets: [{}] }));
    expect(c.bets[0]!.kind).toBe('SYSTEM');
    expect(c.warnings.some((w) => w.includes('systemBets'))).toBe(true);
  });
});
