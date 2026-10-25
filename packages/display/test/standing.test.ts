import { describe, expect, it } from 'vitest';
import { betStanding, gameMargin, pickState, type StandingGame, type StandingPick } from '../src';

const spread = (line: number, side: 'home' | 'away' = 'away'): StandingPick => ({
  status: 'OPEN',
  type: 'SPREAD',
  display: null,
  moneylineSide: side,
  line,
  progress: null,
});
const game = (state: string, homeScore: number, awayScore: number, picks: StandingPick[] = []): StandingGame => ({
  state: { state, homeScore, awayScore },
  picks,
});

describe('spreads', () => {
  it('adds the line to the score margin from the pick’s side', () => {
    // LV +5 away, down 3: covering by 2.
    expect(gameMargin(spread(5), { homeScore: 3, awayScore: 0 })).toBe(2);
    expect(gameMargin(spread(-7.5, 'home'), { homeScore: 14, awayScore: 10 })).toBe(-3.5);
    expect(gameMargin({ type: 'MONEYLINE', moneylineSide: 'home', line: 5 }, { homeScore: 3, awayScore: 0 })).toBe(3);
  });

  it('runs while live and settles at the final, a push voiding the pick', () => {
    expect(pickState(spread(5), game('SCHEDULED', 0, 0))).toBe('waiting');
    expect(pickState(spread(5), game('LIVE', 10, 0))).toBe('running');
    expect(pickState(spread(5), game('FINAL', 24, 20))).toBe('hit');
    expect(pickState(spread(5), game('FINAL', 27, 20))).toBe('missed');
    expect(pickState(spread(5), game('FINAL', 25, 20))).toBe('void');
  });

  it('waits when the line is unknown', () => {
    expect(pickState({ ...spread(5), line: null }, game('FINAL', 24, 20))).toBe('waiting');
  });

  it('counts a missed spread against the bet', () => {
    const g = game('FINAL', 27, 20, [spread(5)]);
    expect(betStanding({ probablySettled: null, games: [g] }).state).toBe('dead');
  });
});

describe('totals', () => {
  const total = (side: 'OVER' | 'UNDER', line = 47.5): StandingPick => ({ status: 'OPEN', type: 'TOTAL', display: null, moneylineSide: null, line, selectionSide: side, progress: null });

  it('measures combined points against the line from the pick’s side', () => {
    expect(gameMargin(total('OVER'), { homeScore: 28, awayScore: 20 })).toBe(0.5);
    expect(gameMargin(total('UNDER'), { homeScore: 28, awayScore: 20 })).toBe(-0.5);
  });

  it('decides mid-game once the line is passed, because points only go up', () => {
    expect(pickState(total('OVER'), game('LIVE', 21, 20))).toBe('running');
    expect(pickState(total('OVER'), game('LIVE', 28, 20))).toBe('hit');
    expect(pickState(total('UNDER'), game('LIVE', 21, 20))).toBe('running');
    expect(pickState(total('UNDER'), game('LIVE', 28, 20))).toBe('missed');
  });

  it('counts only its own side’s score for a team total, and waits until that side is known', () => {
    const team = (side: 'home' | 'away' | null, ou: 'OVER' | 'UNDER', line = 23.5): StandingPick => ({ ...total(ou, line), type: 'TEAM_TOTAL', moneylineSide: side });
    expect(gameMargin(team('home', 'OVER'), { homeScore: 28, awayScore: 20 })).toBe(4.5);
    expect(gameMargin(team('away', 'OVER'), { homeScore: 28, awayScore: 20 })).toBe(-3.5);
    expect(gameMargin(team(null, 'OVER'), { homeScore: 28, awayScore: 20 })).toBeNull();
    expect(pickState(team('home', 'OVER'), game('LIVE', 28, 20))).toBe('hit');
    expect(pickState(team('away', 'UNDER'), game('LIVE', 28, 20))).toBe('running');
    expect(pickState(team('away', 'UNDER'), game('LIVE', 20, 28))).toBe('missed');
    expect(pickState(team(null, 'OVER'), game('LIVE', 28, 20))).toBe('waiting');
  });

  it('settles at the final, a push on a whole line voiding the pick', () => {
    expect(pickState(total('UNDER'), game('FINAL', 24, 20))).toBe('hit');
    expect(pickState(total('OVER'), game('FINAL', 24, 20))).toBe('missed');
    expect(pickState(total('OVER', 44), game('FINAL', 24, 20))).toBe('void');
  });
});
