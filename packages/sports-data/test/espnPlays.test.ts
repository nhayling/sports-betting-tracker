import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EspnProvider, parseSummary } from '../src/espn';
import { parseFootballPlays, periodScore, playValue } from '../src/espnPlays';
import type { EventSnapshot, PlayStats, Sport, StatKey } from '../src/types';

const fixture = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/espn/${name}.json`, import.meta.url)), 'utf8'));
const snapshot = (sport: Sport, name: string) => parseSummary(sport, '1', fixture(name), new Date());

/** Adding up the plays has to land on the box score, for every player, or a period's number can't be trusted either. */
function expectPlaysMatchBox(snap: EventSnapshot, plays: PlayStats, metrics: StatKey[]) {
  expect(snap.players.length).toBeGreaterThan(10);
  for (const p of snap.players) for (const m of metrics) expect([p.player.displayName, m, playValue(plays, snap, p.player.id, m)]).toEqual([p.player.displayName, m, p.stats[m] ?? 0]);
}

describe('stats added up from plays match the box score', () => {
  it('NBA', () => {
    const snap = snapshot('NBA', 'nba-summary-plays-bos-orl-final');
    expectPlaysMatchBox(snap, snap.plays!, ['POINTS', 'REBOUNDS', 'ASSISTS', 'POINTS_REBOUNDS', 'POINTS_ASSISTS', 'REBOUNDS_ASSISTS', 'POINTS_REBOUNDS_ASSISTS']);
  });
  it('NHL', () => {
    const snap = snapshot('NHL', 'nhl-summary-plays-wpg-car-final');
    expectPlaysMatchBox(snap, snap.plays!, ['GOALS', 'ASSISTS', 'POINTS', 'SHOTS_ON_GOAL']);
  });
  it.each(['mlb-summary-plays-tb-cle-final', 'mlb-summary-plays-phi-atl-final'])('MLB %s', (name) => {
    const snap = snapshot('MLB', name);
    expectPlaysMatchBox(snap, snap.plays!, ['HITS']);
  });
  it.each(['bal-buf', 'ari-dal'])('NFL touchdowns, %s', (game) => {
    const snap = snapshot('NFL', `nfl-summary-box-${game}-final`);
    expect(snap.plays).toBeUndefined();
    expectPlaysMatchBox(snap, parseFootballPlays(fixture(`nfl-core-plays-${game}-final`).items), ['PASSING_TDS', 'RUSHING_TDS', 'RECEIVING_TDS']);
  });
});

describe('periods', () => {
  it('counts only the stretch asked for', () => {
    const snap = snapshot('NBA', 'nba-summary-plays-bos-orl-final');
    const scorer = [...snap.players].sort((a, b) => (b.stats.POINTS ?? 0) - (a.stats.POINTS ?? 0))[0]!;
    const quarters = [1, 2, 3, 4].map((q) => playValue(snap.plays!, snap, scorer.player.id, 'POINTS', { from: q, to: q })!);
    expect(quarters.reduce((a, b) => a + b, 0)).toBe(scorer.stats.POINTS);
    expect(playValue(snap.plays!, snap, scorer.player.id, 'POINTS', { from: 1, to: 2 })).toBe(quarters[0]! + quarters[1]!);
  });

  it('adds both teams’ linescores up to the final score', () => {
    const snap = snapshot('MLB', 'mlb-summary-plays-tb-cle-final');
    expect(periodScore(snap, { from: 1, to: 99 })).toBe((snap.state.homeScore ?? 0) + (snap.state.awayScore ?? 0));
    expect(periodScore(snap, { from: 2, to: 2 })).toBe(snap.periodScores![1]!.points);
  });
});

describe('football plays', () => {
  it('finds the first touchdown by the clock, whoever scored it', () => {
    const allen = '3918298';
    const buf = parseFootballPlays(fixture('nfl-core-plays-bal-buf-final').items);
    expect(buf.firstTouchdown).toEqual({ playerId: allen });
    const snap = snapshot('NFL', 'nfl-summary-box-bal-buf-final');
    expect(playValue(buf, snap, allen, 'FIRST_TOUCHDOWN')).toBe(1);
    expect(playValue(buf, snap, '4429582', 'FIRST_TOUCHDOWN')).toBe(0);
    // A fumble return: a defender, so every offensive player's pick misses.
    const dal = parseFootballPlays(fixture('nfl-core-plays-ari-dal-final').items);
    const box = snapshot('NFL', 'nfl-summary-box-ari-dal-final');
    expect(box.players.find((p) => p.player.id === dal.firstTouchdown!.playerId)?.player.displayName).toBe('James Mitchell');
  });

  it('keeps each passer’s longest apart when a team used two, and checks them against the box score', () => {
    const plays = parseFootballPlays(fixture('nfl-core-plays-ari-dal-final').items);
    const snap = snapshot('NFL', 'nfl-summary-box-ari-dal-final');
    const id = (name: string) => snap.players.find((p) => p.player.displayName === name)!.player.id;
    expect(playValue(plays, snap, id('Gardner Minshew II'), 'LONGEST_COMPLETION')).toBe(27);
    expect(playValue(plays, snap, id('Jacoby Brissett'), 'LONGEST_COMPLETION')).toBe(29);
    expect(playValue(plays, snap, id('Dak Prescott'), 'LONGEST_COMPLETION')).toBe(37);
    const off = { ...plays, longestCompletions: { ...plays.longestCompletions, [id('Gardner Minshew II')]: 60 } };
    expect(playValue(off, snap, id('Gardner Minshew II'), 'LONGEST_COMPLETION')).toBeNull();
  });

  it('asks the core feed for its league', async () => {
    const urls: string[] = [];
    const provider = new EspnProvider(async (url) => {
      urls.push(url);
      return { items: [] };
    });
    await provider.getPlayStats('NCAAF', '42');
    expect(urls[0]).toContain('/leagues/college-football/events/42/competitions/42/plays');
    await expect(provider.getPlayStats('NBA', '42')).rejects.toThrow();
  });
});
