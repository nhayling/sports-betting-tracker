import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseHistoryResponse, type RawHistoryResponse } from '@sports-better/kambi';
import { describe, expect, it } from 'vitest';
import { classifyMarket, evaluateProgress, gameMarket, spreadPick, type PropTarget } from '../src';

const captured = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../kambi/fixtures/captured/history-2026-09-27.json', import.meta.url)), 'utf8'),
) as RawHistoryResponse;
const selections = parseHistoryResponse(captured).flatMap((c) =>
  c.bets.flatMap((b) => b.legs.flatMap((l) => l.selections.map((s) => ({ ...s, sport: l.sport })))),
);

const fb = (marketName: string, selectionSide: 'YES' | 'NO' | 'OVER' | 'UNDER' | null, line: number | null) =>
  classifyMarket({ sport: 'AMERICAN_FOOTBALL', marketName, selectionSide, line });

describe('classifyMarket', () => {
  it.each([
    ['80+ Rushing Yards By The Player - Including Overtime', 'YES', 80, { metric: 'RUSHING_YARDS', operator: 'GTE', target: 80, display: 'PROGRESS' }],
    ['60+ Receiving Yards By The Player - Including Overtime', 'YES', 60, { metric: 'RECEIVING_YARDS', operator: 'GTE', target: 60 }],
    ['3+ Receptions By The Player - Including Overtime', 'YES', 3, { metric: 'RECEPTIONS', operator: 'GTE', target: 3 }],
    ['200+ Passing Yards By The Player - Including Overtime', 'YES', 200, { metric: 'PASSING_YARDS', operator: 'GTE', target: 200 }],
    ['2+ Touchdown Passes By The Player - Including Overtime', 'YES', 2, { metric: 'PASSING_TDS', operator: 'GTE', target: 2 }],
    ['80+ Rushing Yards By The Player - Including Overtime', 'NO', 80, { metric: 'RUSHING_YARDS', operator: 'LT', target: 80 }],
    ['Total Receiving Yards by the Player - Including Overtime', 'OVER', 38.5, { metric: 'RECEIVING_YARDS', operator: 'GT', target: 38.5 }],
    ['Total Receptions by the Player - Including Overtime', 'UNDER', 5.5, { metric: 'RECEPTIONS', operator: 'LT', target: 5.5 }],
    ['Touchdown Scorer', 'YES', 1, { metric: 'TOUCHDOWNS', operator: 'GTE', target: 1, display: 'BINARY' }],
    // Seen on Island Luck 2026-09-28 (D'Andre Swift - Yes).
    ['75+ Rushing & Receiving Yards By The Player - Including Overtime', 'YES', 75, { metric: 'RUSHING_RECEIVING_YARDS', operator: 'GTE', target: 75 }],
    ['Total Rushing & Receiving Yards by the Player - Including Overtime', 'OVER', 88.5, { metric: 'RUSHING_RECEIVING_YARDS', operator: 'GT', target: 88.5 }],
    ['100+ Rushing and Receiving Yards By The Player', 'YES', 100, { metric: 'RUSHING_RECEIVING_YARDS', operator: 'GTE', target: 100 }],
    // Seen on Island Luck 2026-10-01 (TJ Watt - Yes; game Over 3.5).
    ['Player to have at least 0.5 Sacks - Including Overtime', 'YES', 0.5, { scope: 'PLAYER', metric: 'SACKS', operator: 'GTE', target: 0.5, display: 'BINARY' }],
    ['Player to have at least 1.5 Sacks - Including Overtime', 'YES', 1.5, { metric: 'SACKS', operator: 'GTE', target: 1.5, display: 'PROGRESS' }],
    ['Total Successful Field Goals', 'OVER', 3.5, { scope: 'GAME', metric: 'FIELD_GOALS_MADE', operator: 'GT', target: 3.5 }],
    ['Total Successful Field Goals', 'UNDER', 3.5, { scope: 'GAME', metric: 'FIELD_GOALS_MADE', operator: 'LT', target: 3.5 }],
    // Names from Island Luck's NFL offers 2026-10-11. Pass attempts has no "By The Player" or overtime suffix.
    ['20+ Pass Completions By The Player - Including Overtime', 'YES', 20, { scope: 'PLAYER', metric: 'PASS_COMPLETIONS', operator: 'GTE', target: 20, display: 'PROGRESS' }],
    ['Total Pass Completions by the Player - Including Overtime', 'OVER', 17.5, { metric: 'PASS_COMPLETIONS', operator: 'GT', target: 17.5 }],
    ['Total Pass Completions by the Player - Including Overtime', 'UNDER', 17.5, { metric: 'PASS_COMPLETIONS', operator: 'LT', target: 17.5 }],
    ['25+ Pass Attempts', 'YES', 25, { scope: 'PLAYER', metric: 'PASS_ATTEMPTS', operator: 'GTE', target: 25, display: 'PROGRESS' }],
    ['Total Pass Attempts', 'OVER', 29.5, { metric: 'PASS_ATTEMPTS', operator: 'GT', target: 29.5 }],
    ['Total Pass Attempts', 'UNDER', 29.5, { metric: 'PASS_ATTEMPTS', operator: 'LT', target: 29.5 }],
  ] as const)('%s / %s', (name, side, line, expected) => {
    expect(fb(name, side, line)).toMatchObject({ supported: true, ...expected });
  });

  it.each([
    ['Moneyline', null, null, 'UNSUPPORTED_MARKET'],
    ['80+ Rushing Yards By The Player - 1st Half', 'YES', 80, 'UNSUPPORTED_MARKET'],
    ['Longest Rush By The Player', 'OVER', 20.5, 'UNSUPPORTED_MARKET'],
    ['25+ Pass Attempts - First Half', 'YES', 25, 'UNSUPPORTED_MARKET'],
    ['Total Yards of Longest Completed Pass by the Player - Including Overtime', 'OVER', 36.5, 'UNSUPPORTED_MARKET'],
    ['25+ Pass Attempts', 'YES', 30, 'LINE_MISMATCH'],
    ['80+ Rushing Yards By The Player - Including Overtime', 'YES', 70, 'LINE_MISMATCH'],
    ['Total Receiving Yards by the Player - Including Overtime', 'OVER', null, 'MISSING_LINE'],
    ['Total Receiving Yards by the Player - Including Overtime', 'YES', 38.5, 'UNSUPPORTED_SIDE'],
    ['Total Successful Field Goals', null, 3.5, 'UNSUPPORTED_SIDE'],
    ['Player to have at least 0.5 Sacks - Including Overtime', 'YES', 1.5, 'LINE_MISMATCH'],
  ] as const)('does not guess: %s / %s', (name, side, line, reason) => {
    expect(fb(name, side, line)).toEqual({ supported: false, reason });
  });

  it('only handles football', () => {
    expect(classifyMarket({ sport: 'BASKETBALL', marketName: 'Touchdown Scorer', selectionSide: 'YES', line: 1 })).toEqual({
      supported: false,
      reason: 'UNSUPPORTED_SPORT',
    });
  });

  it('classifies every player prop in the real capture, and nothing else', () => {
    const results = selections.map((s) => ({ s, c: classifyMarket({ sport: s.sport, marketName: s.marketName, selectionSide: s.selectionSide, line: s.line }) }));
    const unsupportedProps = results.filter(({ s, c }) => s.marketType === 'Player Occurrence Line' && !c.supported);
    expect(unsupportedProps.map(({ s }) => `${s.marketName} | ${s.selectionLabel}`)).toEqual([]);
    const supportedOther = results.filter(({ s, c }) => s.marketType !== 'Player Occurrence Line' && c.supported);
    expect(supportedOther).toEqual([]);
  });
});

describe('gameMarket', () => {
  it('recognizes full-game moneylines and spreads', () => {
    expect(gameMarket('Moneyline')).toBe('MONEYLINE');
    expect(gameMarket('Moneyline - Including Overtime')).toBe('MONEYLINE');
    expect(gameMarket('Moneyline - 1st Half')).toBeNull();
    expect(gameMarket('Point Spread')).toBe('SPREAD');
    expect(gameMarket('Point Spread - Including Overtime')).toBe('SPREAD');
    expect(gameMarket('Point Spread - 1st Half')).toBeNull();
    expect(gameMarket('Touchdown Scorer')).toBeNull();
    expect(gameMarket(null)).toBeNull();
  });

  it('covers every non-player market in the real capture', () => {
    const other = selections.filter((s) => s.marketType !== 'Player Occurrence Line');
    expect(other.length).toBeGreaterThan(0);
    expect(other.filter((s) => gameMarket(s.marketName) === null).map((s) => s.marketName)).toEqual([]);
  });
});

describe('evaluateProgress', () => {
  const rush100: PropTarget = { scope: 'PLAYER', metric: 'RUSHING_YARDS', operator: 'GTE', target: 100, display: 'PROGRESS' };
  const over385: PropTarget = { scope: 'PLAYER', metric: 'RECEIVING_YARDS', operator: 'GT', target: 38.5, display: 'PROGRESS' };
  const under55: PropTarget = { scope: 'PLAYER', metric: 'RECEPTIONS', operator: 'LT', target: 5.5, display: 'PROGRESS' };
  const td: PropTarget = { scope: 'PLAYER', metric: 'TOUCHDOWNS', operator: 'GTE', target: 1, display: 'BINARY' };

  it('never draws a bar past empty for negative yardage', () => {
    const rush20: PropTarget = { scope: 'PLAYER', metric: 'RUSHING_YARDS', operator: 'GTE', target: 20, display: 'PROGRESS' };
    expect(evaluateProgress(rush20, -6, 'LIVE')).toMatchObject({ status: 'IN_PROGRESS', current: -6, remaining: 26, fraction: 0 });
  });

  it('tracks combined rushing + receiving yards like any threshold', () => {
    const swift: PropTarget = { scope: 'PLAYER', metric: 'RUSHING_RECEIVING_YARDS', operator: 'GTE', target: 75, display: 'PROGRESS' };
    expect(evaluateProgress(swift, 61, 'LIVE')).toMatchObject({ status: 'IN_PROGRESS', needed: 75, remaining: 14 });
  });

  it('Kenneth Walker III at halftime: 52 / 100', () => {
    expect(evaluateProgress(rush100, 52, 'LIVE')).toEqual({
      status: 'IN_PROGRESS',
      current: 52,
      target: 100,
      needed: 100,
      remaining: 48,
      fraction: 0.52,
    });
  });

  it('target reached while live is not settlement', () => {
    expect(evaluateProgress(rush100, 102, 'LIVE')).toMatchObject({ status: 'TARGET_REACHED', remaining: 0, fraction: 1 });
    expect(evaluateProgress(rush100, 102, 'FINAL')).toMatchObject({ status: 'FINAL_HIT' });
    expect(evaluateProgress(rush100, 73, 'FINAL')).toMatchObject({ status: 'FINAL_MISSED', remaining: 27 });
  });

  it('rounds half-point overs up to the whole number needed', () => {
    expect(evaluateProgress(over385, 38, 'LIVE')).toMatchObject({ needed: 39, remaining: 1 });
    expect(evaluateProgress(over385, 39, 'LIVE')).toMatchObject({ status: 'TARGET_REACHED' });
  });

  it('tracks unders as busted once exceeded', () => {
    expect(evaluateProgress(under55, 5, 'LIVE')).toMatchObject({ status: 'IN_PROGRESS', remaining: null });
    expect(evaluateProgress(under55, 6, 'LIVE')).toMatchObject({ status: 'TARGET_EXCEEDED' });
    expect(evaluateProgress(under55, 5, 'FINAL')).toMatchObject({ status: 'FINAL_HIT' });
  });

  it('anytime TD is 0 / 1 until scored', () => {
    expect(evaluateProgress(td, 0, 'LIVE')).toMatchObject({ status: 'IN_PROGRESS', current: 0, target: 1 });
    expect(evaluateProgress(td, 2, 'LIVE')).toMatchObject({ status: 'TARGET_REACHED' });
  });

  it('shows not started before kickoff', () => {
    expect(evaluateProgress(rush100, null, 'SCHEDULED')).toMatchObject({ status: 'NOT_STARTED', current: 0, remaining: 100 });
  });

  it('never fabricates progress without a stat or a live game', () => {
    expect(evaluateProgress(rush100, null, 'LIVE')).toBeNull();
    expect(evaluateProgress(rush100, 50, 'POSTPONED')).toBeNull();
    expect(evaluateProgress(rush100, 50, 'UNKNOWN')).toBeNull();
  });
});

describe('spreadPick', () => {
  it('splits the line off a coupon label', () => {
    expect(spreadPick('LV Raiders +5.0', null)).toEqual({ team: 'LV Raiders', line: 5 });
    expect(spreadPick('SF 49ers -7.5', null)).toEqual({ team: 'SF 49ers', line: -7.5 });
  });

  it("prefers the outcome's own line and keeps a bare team name", () => {
    expect(spreadPick('LV Raiders +5.0', 5.5)).toEqual({ team: 'LV Raiders', line: 5.5 });
    expect(spreadPick('LV Raiders', 5)).toEqual({ team: 'LV Raiders', line: 5 });
    expect(spreadPick('SF 49ers', -7.5)).toEqual({ team: 'SF 49ers', line: -7.5 });
  });
});
