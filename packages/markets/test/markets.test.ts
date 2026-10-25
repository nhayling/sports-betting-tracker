import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseHistoryResponse, type RawHistoryResponse } from '@sports-better/kambi';
import type { FightResult } from '@sports-better/sports-data';
import { describe, expect, it } from 'vitest';
import { classifyMarket, evaluateProgress, fightPick, gameMarket, gradeFight, spreadPick, teamTotalTeam, type PropTarget } from '../src';

const captured = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../kambi/fixtures/captured/history-2026-09-27.json', import.meta.url)), 'utf8'),
) as RawHistoryResponse;
const selections = parseHistoryResponse(captured).flatMap((c) =>
  c.bets.flatMap((b) => b.legs.flatMap((l) => l.selections.map((s) => ({ ...s, sport: l.sport })))),
);

const offering = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../kambi/fixtures/offering/nba-markets-2026-10-23.json', import.meta.url)), 'utf8'),
) as { markets: Array<{ criterion: string; sides: Array<'YES' | 'NO' | 'OVER' | 'UNDER'>; line: number | null }> };

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
    // Seen on Island Luck 2026-10 (Javonte Williams - Yes; Matthew Stafford - Yes).
    ['2+ Touchdown To Be Scored By The Player - Including Overtime', 'YES', 2, { metric: 'TOUCHDOWNS', operator: 'GTE', target: 2, display: 'PROGRESS' }],
    ['1+ Interceptions Thrown By The Player - Including Overtime', 'YES', 1, { metric: 'INTERCEPTIONS_THROWN', operator: 'GTE', target: 1 }],
    ['1+ Interceptions Thrown By The Player - Including Overtime', 'NO', 1, { metric: 'INTERCEPTIONS_THROWN', operator: 'LT', target: 1 }],
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

  it('only handles the sports it has markets for', () => {
    expect(classifyMarket({ sport: 'TENNIS', marketName: 'Touchdown Scorer', selectionSide: 'YES', line: 1 })).toEqual({
      supported: false,
      reason: 'UNSUPPORTED_SPORT',
    });
    expect(classifyMarket({ sport: 'BASKETBALL', marketName: 'Touchdown Scorer', selectionSide: 'YES', line: 1 })).toEqual({
      supported: false,
      reason: 'UNSUPPORTED_MARKET',
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
  it('recognizes full-game moneylines, spreads and totals', () => {
    expect(gameMarket('Moneyline')).toBe('MONEYLINE');
    expect(gameMarket('Moneyline - Including Overtime')).toBe('MONEYLINE');
    expect(gameMarket('Moneyline - 1st Half')).toBeNull();
    expect(gameMarket('Point Spread')).toBe('SPREAD');
    expect(gameMarket('Point Spread - Including Overtime')).toBe('SPREAD');
    expect(gameMarket('Point Spread - 1st Half')).toBeNull();
    expect(gameMarket('Total Points')).toBe('TOTAL');
    expect(gameMarket('Total Points - Including Overtime')).toBe('TOTAL');
    expect(gameMarket('Total Points - 1st Half')).toBeNull();
    expect(gameMarket('Touchdown Scorer')).toBeNull();
    expect(gameMarket(null)).toBeNull();
  });

  it('recognizes full-game team totals and names their team', () => {
    expect(gameMarket('Total Points by DAL Cowboys')).toBe('TEAM_TOTAL');
    expect(teamTotalTeam('Total Points by DAL Cowboys')).toBe('DAL Cowboys');
    expect(teamTotalTeam('Total Runs by NY Yankees')).toBe('NY Yankees');
    expect(teamTotalTeam('Total Goals by TOR Maple Leafs - Inc. OT and Shootout')).toBe('TOR Maple Leafs');
    expect(teamTotalTeam('Total Goals by Paris Saint-Germain')).toBe('Paris Saint-Germain');
    // Halves, quarters and periods, and other team stats, aren't tracked.
    for (const name of ['Total Points by BOS Celtics - 1st Half', 'Total Points by BOS Celtics - Quarter 1', 'Total Goals by TOR Maple Leafs - Regular Time', 'Total Corners by Arsenal', 'Total Touchdowns by SEA Seahawks']) {
      expect(gameMarket(name)).toBeNull();
    }
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

describe('classifyMarket: NBA, every market on the Island Luck feed (2026-10-23)', () => {
  const bb = (marketName: string, selectionSide: 'YES' | 'NO' | 'OVER' | 'UNDER' | null, line: number | null) =>
    classifyMarket({ sport: 'BASKETBALL', marketName, selectionSide, line });

  it.each([
    ['20+ Points Scored By The Player - Including Overtime', 'YES', 20, { metric: 'POINTS', operator: 'GTE', target: 20, scope: 'PLAYER' }],
    ['8+ Rebounds By The Player - Including Overtime', 'YES', 8, { metric: 'REBOUNDS', operator: 'GTE', target: 8 }],
    ['3+ Three-Point Field Goals Made By The Player - Including Overtime', 'YES', 3, { metric: 'THREES_MADE', operator: 'GTE', target: 3 }],
    ['25+ Points, Rebounds & Assists By The Player - Including Overtime', 'YES', 25, { metric: 'POINTS_REBOUNDS_ASSISTS', operator: 'GTE', target: 25 }],
    ['2+ Steals & Blocks By The Player - Including Overtime', 'YES', 2, { metric: 'STEALS_BLOCKS', operator: 'GTE', target: 2 }],
    ['Points scored by the player - Including Overtime', 'OVER', 15.5, { metric: 'POINTS', operator: 'GT', target: 15.5 }],
    ['3-point field goals made by the player - Including Overtime', 'UNDER', 2.5, { metric: 'THREES_MADE', operator: 'LT', target: 2.5 }],
    ['Points, rebounds & assists by the player - Including Overtime', 'OVER', 23.5, { metric: 'POINTS_REBOUNDS_ASSISTS', operator: 'GT', target: 23.5 }],
    ['Points & Rebounds by the player - Including Overtime', 'OVER', 19.5, { metric: 'POINTS_REBOUNDS', operator: 'GT', target: 19.5 }],
    // Kambi sends line 2 on a double-double; the stat itself is 0 or 1.
    ['To record a double-double - Including Overtime', 'YES', 2, { metric: 'DOUBLE_DOUBLE', operator: 'GTE', target: 1, display: 'BINARY' }],
    ['To record a triple-double - Including Overtime', 'YES', 3, { metric: 'TRIPLE_DOUBLE', operator: 'GTE', target: 1, display: 'BINARY' }],
    ['Total Match Assists - Including Overtime', 'OVER', 49.5, { metric: 'ASSISTS', operator: 'GT', target: 49.5, scope: 'GAME' }],
    ['Total Match made Threes - Including Overtime', 'UNDER', 28.5, { metric: 'THREES_MADE', operator: 'LT', target: 28.5, scope: 'GAME' }],
  ] as const)('%s %s %s', (name, side, line, expected) => {
    expect(bb(name, side, line)).toMatchObject({ supported: true, ...expected });
  });

  it('does not read a combined prop as one of its parts', () => {
    expect(bb('Points & Rebounds by the player - Including Overtime', 'OVER', 19.5)).toMatchObject({ metric: 'POINTS_REBOUNDS' });
    expect(bb('Rebounds & Assists by the player - Including Overtime', 'OVER', 9.5)).toMatchObject({ metric: 'REBOUNDS_ASSISTS' });
    expect(bb('20+ Points & Assists By The Player - Including Overtime', 'YES', 20)).toMatchObject({ metric: 'POINTS_ASSISTS' });
  });

  it('tracks the player props and full-game results (team totals too), and nothing it can not measure', () => {
    const tracked = offering.markets.filter((m) => {
      const line = m.line === null ? null : m.line / 1000;
      return gameMarket(m.criterion) || m.sides.some((side) => bb(m.criterion, side, line).supported);
    });
    const names = tracked.map((m) => m.criterion.replace(/^\d+\+ /, 'N+ ')).filter((n, i, a) => a.indexOf(n) === i).sort();
    expect(names).toEqual([
      '3-point field goals made by the player - Including Overtime',
      'Assists by the player - Including Overtime',
      'Blocks by the player - Including Overtime',
      'Moneyline',
      'N+ Assists By The Player - Including Overtime',
      'N+ Blocks By The Player - Including Overtime',
      'N+ Points & Assists By The Player - Including Overtime',
      'N+ Points & Rebounds By The Player - Including Overtime',
      'N+ Points Scored By The Player - Including Overtime',
      'N+ Points, Rebounds & Assists By The Player - Including Overtime',
      'N+ Rebounds & Assists By The Player - Including Overtime',
      'N+ Rebounds By The Player - Including Overtime',
      'N+ Steals & Blocks By The Player - Including Overtime',
      'N+ Steals By The Player - Including Overtime',
      'N+ Three-Point Field Goals Made By The Player - Including Overtime',
      'Point Spread',
      'Points & Assists by the player - Including Overtime',
      'Points & Rebounds by the player - Including Overtime',
      'Points scored by the player - Including Overtime',
      'Points, rebounds & assists by the player - Including Overtime',
      'Rebounds & Assists by the player - Including Overtime',
      'Rebounds by the player - Including Overtime',
      'Steals & Blocks by the player - Including Overtime',
      'Steals by the player - Including Overtime',
      'To record a double-double - Including Overtime',
      'To record a triple-double - Including Overtime',
      'Total Match Assists - Including Overtime',
      'Total Match made Threes - Including Overtime',
      'Total Points - Including Overtime',
      'Total Points by BOS Celtics',
      'Total Points by CHI Bulls',
      'Total Points by LA Clippers',
      'Total Points by LA Lakers',
      'Total Points by MIL Bucks',
      'Total Points by NY Knicks',
      'Total Points by POR Trail Blazers',
      'Total Points by SAC Kings',
    ]);
  });
});

describe.each([
  ['mlb', 'BASEBALL', 16],
  ['nhl', 'ICE_HOCKEY', 21],
  ['wnba', 'BASKETBALL', 25],
  ['epl', 'FOOTBALL', 18],
  ['laliga', 'FOOTBALL', 17],
  ['ufc', 'MARTIAL_ARTS', 34],
] as const)('classifyMarket: %s, every market on the Island Luck feed (2026-10-23)', (file, sport, count) => {
  const { markets } = JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../kambi/fixtures/offering/${file}-markets-2026-10-23.json`, import.meta.url)), 'utf8'),
  ) as typeof offering;
  it(`tracks ${count} of them`, () => {
    const tracked = markets.filter((m) => {
      const line = m.line === null ? null : m.line / 1000;
      return gameMarket(m.criterion) || m.sides.some((side) => classifyMarket({ sport, marketName: m.criterion, selectionSide: side, line }).supported);
    });
    expect(new Set(tracked.map((m) => m.criterion.replace(/^\d+\+ /, 'N+ '))).size).toBe(count);
  });
});

describe('classifyMarket: MLB, NHL and soccer props', () => {
  const lineup = ' - Including Extra Innings (Listed player must be in starting lineup for bets to stand)';
  it.each([
    ['BASEBALL', `2+ Hits by the Player${lineup}`, 'YES', 2, { metric: 'HITS', operator: 'GTE', target: 2 }],
    ['BASEBALL', `3+ Hits, Runs & RBIs Recorded by the Player${lineup}`, 'YES', 3, { metric: 'HITS_RUNS_RBIS', operator: 'GTE', target: 3 }],
    ['BASEBALL', `Total Strikeouts by the Player${lineup}`, 'OVER', 7.5, { metric: 'PITCHER_STRIKEOUTS', operator: 'GT', target: 7.5 }],
    ['BASEBALL', `Total Outs Recorded by the Player${lineup}`, 'UNDER', 15.5, { metric: 'OUTS_RECORDED', operator: 'LT', target: 15.5 }],
    ['BASEBALL', `Player to Hit a Home Run${lineup}`, 'YES', 1, { metric: 'HOME_RUNS', operator: 'GTE', target: 1, display: 'BINARY' }],
    ['BASEBALL', `Player to hit 2 or more Home Runs${lineup}`, 'YES', 2, { metric: 'HOME_RUNS', operator: 'GTE', target: 2, display: 'PROGRESS' }],
    ['ICE_HOCKEY', 'To score - Including Overtime', 'YES', 1, { metric: 'GOALS', operator: 'GTE', target: 1, display: 'BINARY' }],
    ['ICE_HOCKEY', 'Player to score at least 2 points - Including Overtime', 'YES', 2, { metric: 'POINTS', operator: 'GTE', target: 2 }],
    ["ICE_HOCKEY", "Player's shots on goal - Including Overtime", 'OVER', 2.5, { metric: 'SHOTS_ON_GOAL', operator: 'GT', target: 2.5 }],
    ['ICE_HOCKEY', 'Total Shots on Goal - Including Overtime', 'OVER', 52.5, { metric: 'SHOTS_ON_GOAL', scope: 'GAME' }],
    ['FOOTBALL', 'To Score', 'YES', 1, { metric: 'GOALS', operator: 'GTE', target: 1, display: 'BINARY' }],
    ['FOOTBALL', 'To score at least 2 goals', 'YES', 2, { metric: 'GOALS', operator: 'GTE', target: 2 }],
    ['FOOTBALL', 'To Get a Card', 'YES', 1, { metric: 'CARDS', operator: 'GTE', target: 1 }],
    ['FOOTBALL', 'Total Corners', 'UNDER', 7.5, { metric: 'CORNERS', operator: 'LT', scope: 'GAME' }],
  ] as const)('%s: %s %s %s', (sport, name, side, line, expected) => {
    expect(classifyMarket({ sport, marketName: name, selectionSide: side, line })).toMatchObject({ supported: true, ...expected });
  });

  it('leaves what ESPN can not measure untracked', () => {
    expect(classifyMarket({ sport: 'BASEBALL', marketName: `2+ Bases Recorded by the Player${lineup}`, selectionSide: 'YES', line: 2 })).toMatchObject({ supported: false });
    expect(classifyMarket({ sport: 'ICE_HOCKEY', marketName: 'Player To score at least 1 Power Play Points -  Including Overtime', selectionSide: 'YES', line: 1 })).toMatchObject({ supported: false });
    expect(gameMarket('Total Goals - Regular Time')).toBeNull();
    expect(gameMarket('Moneyline - First 5 Innings')).toBeNull();
  });
});

describe('gameMarket: every sport’s full-game lines', () => {
  it.each([
    ['Moneyline - Inc. OT and Shootout', 'MONEYLINE'],
    ['Run Line', 'SPREAD'],
    ['Puck Line - Inc. OT and Shootout', 'SPREAD'],
    ['Spread', 'SPREAD'],
    ['Total Runs', 'TOTAL'],
    ['Total Goals', 'TOTAL'],
    ['Total Goals - Inc. OT and Shootout', 'TOTAL'],
    ['Full Time', 'RESULT'],
    ['Both Teams To Score', 'BTTS'],
    ['Bout Odds', 'FIGHT'],
    ['Kody Steele to Win & Under 1.5 Rounds', 'FIGHT'],
  ])('%s → %s', (name, kind) => {
    expect(gameMarket(name)).toBe(kind);
  });
});

describe('gradeFight', () => {
  const ko: FightResult = { winner: 'away', method: 'KO_TKO', round: 2, clockSeconds: 131, scheduledRounds: 3 };
  const decision: FightResult = { winner: 'home', method: 'DECISION', round: 3, clockSeconds: 300, scheduledRounds: 3 };
  const sideOf = (name: string) => (name === 'Javad Mahjoub' ? 'home' : name === 'Joel Faglier' ? 'away' : null);
  const grade = (market: string, side: string | null, line: number | null, fight: FightResult, pick: string | null = null) =>
    gradeFight(fightPick(market, pick, side, line)!, fight, sideOf);

  it('grades the winner, the method and the rounds from a KO at 2:11 of round 2', () => {
    expect(grade('Bout Odds', null, null, ko, 'Joel Faglier')).toBe(1);
    expect(grade('Bout Odds', null, null, ko, 'Javad Mahjoub')).toBe(-1);
    expect(grade('Total Rounds', 'OVER', 1.5, ko)).toBe(-1);
    expect(grade('Total Rounds', 'UNDER', 1.5, ko)).toBe(1);
    expect(grade('To go the distance', 'NO', null, ko)).toBe(1);
    expect(grade('Joel Faglier to win by Finish', 'YES', null, ko)).toBe(1);
    expect(grade('Joel Faglier to win by Decision', 'YES', null, ko)).toBe(-1);
    expect(grade('Any Fighter to win by KO, TKO or DQ', 'YES', null, ko)).toBe(1);
    expect(grade('Any Fighter to win by Submission', 'YES', null, ko)).toBe(-1);
    expect(grade('Joel Faglier to Win & Under 2.5 Rounds', 'YES', null, ko)).toBe(1);
    expect(grade('Fight to start Round 2', 'YES', null, ko)).toBe(1);
    expect(grade('Fight to start Round 3', 'YES', null, ko)).toBe(-1);
    expect(grade('Any Fighter to win in Round 2', 'YES', null, ko)).toBe(1);
  });

  it('grades a decision as going the distance', () => {
    expect(grade('To go the distance', 'YES', null, decision)).toBe(1);
    expect(grade('Total Rounds', 'OVER', 2.5, decision)).toBe(1);
    expect(grade('Javad Mahjoub to win by Decision', 'YES', null, decision)).toBe(1);
    expect(grade('Any Fighter to win in Round 3', 'YES', null, decision)).toBe(-1);
  });

  it('voids the winner on a draw, and leaves an unknown finish ungraded', () => {
    expect(grade('Bout Odds', null, null, { ...decision, winner: null }, 'Joel Faglier')).toBe(0);
    expect(grade('Any Fighter to win by Submission', 'YES', null, { ...ko, method: null })).toBeNull();
  });
});
