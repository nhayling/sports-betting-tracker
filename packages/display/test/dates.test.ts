import { describe, expect, it } from 'vitest';
import { addDays, nassauDay, nassauMidnight, nassauWeekStart, sportName } from '../src';

describe('sportName', () => {
  it.each([
    ['AMERICAN_FOOTBALL', 'Football'],
    ['FOOTBALL', 'Soccer'],
    ['ICE_HOCKEY', 'Hockey'],
    ['MARTIAL_ARTS', 'MMA'],
    ['BASKETBALL', 'Basketball'],
    ['TABLE_TENNIS', 'Table tennis'],
  ])('%s → %s', (sport, name) => expect(sportName(sport)).toBe(name));
});

describe('Nassau days', () => {
  it('reads the day in Nassau, not UTC', () => {
    // 02:00 UTC on the 28th is still the evening of the 27th in Nassau.
    expect(nassauDay(new Date('2026-10-28T02:00:00Z'))).toBe('2026-10-27');
  });

  it('starts a day at Nassau midnight in summer and winter time', () => {
    expect(nassauMidnight('2026-07-04').toISOString()).toBe('2026-07-04T04:00:00.000Z');
    expect(nassauMidnight('2026-12-25').toISOString()).toBe('2026-12-25T05:00:00.000Z');
    // The days the clocks change.
    expect(nassauMidnight('2026-03-08').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(nassauMidnight('2026-11-01').toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('finds Monday and moves across months', () => {
    expect(nassauWeekStart(new Date('2026-10-27T15:00:00Z'))).toBe('2026-10-26');
    expect(nassauWeekStart(new Date('2026-11-01T15:00:00Z'))).toBe('2026-10-26');
    expect(nassauWeekStart(new Date('2026-10-26T03:00:00Z'))).toBe('2026-10-19');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});
