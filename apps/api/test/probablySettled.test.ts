import { describe, expect, it } from 'vitest';
import { probablySettled } from '../src/views/betsView';

const now = new Date('2026-09-28T02:00:00Z');
const state = (s: string) => ({ state: s }) as never;
const game = (startAt: string | null, st: string | null) => ({ startAt, state: st ? state(st) : null });

describe('probablySettled', () => {
  it('flags a bet whose games are all final', () => {
    expect(probablySettled([game('2026-09-27T17:00:00Z', 'FINAL'), game('2026-09-27T20:25:00Z', 'FINAL')], now)).toBe('ALL_GAMES_FINAL');
  });

  it('does not flag while any game is live or upcoming', () => {
    expect(probablySettled([game('2026-09-27T17:00:00Z', 'FINAL'), game('2026-09-28T00:20:00Z', 'LIVE')], now)).toBeNull();
    expect(probablySettled([game('2026-09-27T17:00:00Z', 'FINAL'), game('2026-09-29T00:15:00Z', 'SCHEDULED')], now)).toBeNull();
  });

  it('treats games without live data as over 5 h after kickoff', () => {
    expect(probablySettled([game('2026-09-27T17:00:00Z', 'FINAL'), game('2026-09-27T16:00:00Z', null)], now)).toBe('ALL_GAMES_LONG_OVER');
    expect(probablySettled([game('2026-09-27T22:00:00Z', null)], now)).toBeNull();
  });

  it('needs at least one game with a start time', () => {
    expect(probablySettled([], now)).toBeNull();
    expect(probablySettled([game(null, null)], now)).toBeNull();
  });
});
