import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EspnProvider, ProviderError } from '../src';

const fixture = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/espn/${name}.json`, import.meta.url)), 'utf8'));

/** Serves saved responses by URL pattern and records requested URLs. */
function fakeEspn(routes: Array<[RegExp, string]>) {
  const urls: string[] = [];
  const provider = new EspnProvider(async (url) => {
    urls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) throw new ProviderError('NOT_FOUND', url);
    return fixture(hit[1]);
  });
  return { provider, urls };
}

describe('EspnProvider (fixtures captured 2026-09-27, NFL week 3)', () => {
  const { provider, urls } = fakeEspn([
    [/nfl\/scoreboard/, 'nfl-scoreboard-live'],
    [/college-football\/scoreboard/, 'cfb-scoreboard'],
    [/summary\?event=401872952/, 'nfl-summary-kc-mia-live'],
    [/summary\?event=401872954/, 'nfl-summary-nyj-det-live'],
    [/summary\?event=401872958/, 'nfl-summary-ari-sf-pre'],
    [/summary\?event=401872948/, 'nfl-summary-atl-gb-final'],
    [/teams\/12\/roster/, 'nfl-roster-kc'],
    [/teams\/20\/roster/, 'nfl-roster-nyj'],
  ]);

  it('lists games with teams, start times and state', async () => {
    const events = await provider.listEvents('NFL', ['2026-09-27']);
    expect(urls.at(-1)).toBe('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20260927');
    expect(events).toHaveLength(16);

    const kcMia = events.find((e) => e.id === '401872952')!;
    expect(kcMia).toMatchObject({
      sport: 'NFL',
      startAt: '2026-09-27T17:00:00.000Z',
      home: { id: '15', abbreviation: 'MIA', location: 'Miami', name: 'Dolphins' },
      away: { id: '12', abbreviation: 'KC', name: 'Chiefs' },
      state: { state: 'LIVE', detail: 'Halftime', homeScore: 7, awayScore: 14 },
    });
    expect(events.find((e) => e.id === '401872958')!.state).toMatchObject({ state: 'SCHEDULED', homeScore: null });
    expect(events.find((e) => e.id === '401872948')!.state.state).toBe('FINAL');
  });

  it('asks for all FBS games on the college scoreboard', async () => {
    const events = await provider.listEvents('NCAAF', ['2026-09-26']);
    expect(urls.at(-1)).toContain('college-football/scoreboard?dates=20260926&groups=80');
    expect(events.length).toBeGreaterThan(0);
  });

  it('reads live player stats from the box score', async () => {
    const snap = await provider.getEventSnapshot('NFL', '401872952');
    expect(snap.state).toMatchObject({ state: 'LIVE', period: 2, detail: 'Halftime' });

    const walker = snap.players.find((p) => p.player.displayName === 'Kenneth Walker III')!;
    expect(walker.player).toMatchObject({ id: '4567048', teamId: '12' });
    // 10 yd rush TD (Q1) + 5 yd receiving TD (Q2).
    expect(walker.stats).toMatchObject({ RUSHING_ATTEMPTS: 10, RUSHING_YARDS: 52, RUSHING_TDS: 1, RECEPTIONS: 1, RECEIVING_TDS: 1, TOUCHDOWNS: 2 });

    const mahomes = snap.players.find((p) => p.player.displayName === 'Patrick Mahomes')!;
    expect(mahomes.stats).toMatchObject({ PASS_COMPLETIONS: 12, PASS_ATTEMPTS: 13, PASSING_YARDS: 134, PASSING_TDS: 1 });
    // Passing TDs don't count toward Touchdown Scorer.
    expect(mahomes.stats.TOUCHDOWNS).toBe(0);
  });

  it('combines rushing and receiving for a player in both categories', async () => {
    const snap = await provider.getEventSnapshot('NFL', '401872954');
    const gibbs = snap.players.find((p) => p.player.displayName === 'Jahmyr Gibbs')!;
    expect(gibbs.stats).toMatchObject({ RUSHING_YARDS: 60, RUSHING_TDS: 1, RECEPTIONS: 5, RECEIVING_YARDS: 48, TOUCHDOWNS: 1 });
    // Combined for "Rushing & Receiving Yards" props.
    expect(gibbs.stats.RUSHING_RECEIVING_YARDS).toBe(108);
    const stBrownOnlyCatches = snap.players.find((p) => p.player.displayName === 'Amon-Ra St. Brown')!;
    expect(stBrownOnlyCatches.stats.RUSHING_RECEIVING_YARDS).toBe(19);
    const hall = snap.players.find((p) => p.player.displayName === 'Breece Hall')!;
    expect(hall.stats).toMatchObject({ RUSHING_YARDS: 20, RECEIVING_YARDS: 23, TOUCHDOWNS: 0 });
    const stBrown = snap.players.find((p) => p.player.displayName === 'Amon-Ra St. Brown')!;
    expect(stBrown.stats).toMatchObject({ RECEIVING_TDS: 1, TOUCHDOWNS: 1 });
  });

  it('returns no players before kickoff', async () => {
    const snap = await provider.getEventSnapshot('NFL', '401872958');
    expect(snap.state.state).toBe('SCHEDULED');
    expect(snap.players).toEqual([]);
  });

  it('reads a final game', async () => {
    const snap = await provider.getEventSnapshot('NFL', '401872948');
    expect(snap.state).toMatchObject({ state: 'FINAL', homeScore: 14, awayScore: 35 });
    // Field goals from "made/attempted": Folk 2/2, Smack 0/1 → 2 made in the game.
    const folk = snap.players.find((p) => p.player.displayName === 'Nick Folk')!;
    expect(folk.stats).toMatchObject({ FIELD_GOALS_MADE: 2, FIELD_GOAL_ATTEMPTS: 2 });
    expect(snap.players.reduce((n, p) => n + (p.stats.FIELD_GOALS_MADE ?? 0), 0)).toBe(2);
    // Sacks come from the defensive table for every defender listed.
    expect(snap.players.filter((p) => p.stats.SACKS !== undefined).length).toBeGreaterThan(10);
    expect(snap.players.find((p) => p.player.displayName === 'Cameron Thomas')!.stats.SACKS).toBe(1);
    expect(snap.players.length).toBeGreaterThan(20);
  });

  it('lists full rosters with the same ids as the box score', async () => {
    const roster = await provider.getRoster('NFL', '12');
    expect(roster.find((p) => p.displayName === 'Kenneth Walker III')).toMatchObject({
      id: '4567048',
      teamId: '12',
      firstName: 'Kenneth',
      lastName: 'Walker III',
      position: 'RB',
    });
    expect(roster.length).toBeGreaterThan(50);
  });

  describe('live game situation (scoreboard captured mid-Q3)', () => {
    const live = fakeEspn([[/nfl\/scoreboard/, 'nfl-scoreboard-situation']]).provider;
    const byShort = async (name: string) => {
      const events = await live.listEvents('NFL', ['2026-09-27']);
      return events.find((e) => `${e.away.abbreviation} @ ${e.home.abbreviation}` === name)!;
    };

    it('reads possession, down & distance and red zone', async () => {
      const e = await byShort('LAC @ BUF');
      expect(e.state).toMatchObject({ state: 'LIVE', period: 3, clock: '9:31', homeScore: 10, awayScore: 10 });
      expect(e.state.situation).toEqual({
        possessionTeamId: '24',
        downDistance: '1st & Goal at BUF 6',
        redZone: true,
        homeTimeouts: 3,
        awayTimeouts: 3,
        lastPlay: '(Shotgun) J.Herbert pass deep left to L.McConkey ran ob at BUF 6 for 19 yards.',
      });
      expect(e.away.id).toBe('24');
    });

    it('reads 4th downs outside the red zone', async () => {
      const e = await byShort('NE @ JAX');
      expect(e.state.situation).toMatchObject({ possessionTeamId: '17', downDistance: '4th & 1 at NE 47', redZone: false });
    });

    it('has no possession or red zone during a timeout', async () => {
      const e = await byShort('KC @ MIA');
      expect(e.state.situation).toMatchObject({ possessionTeamId: null, downDistance: null, redZone: false });
      expect(e.state.situation!.lastPlay).toBe('Official Timeout at 10:10.');
    });

    it('has no situation for games that are not live', async () => {
      const e = await byShort('ARI @ SF');
      expect(e.state).toMatchObject({ state: 'SCHEDULED', situation: null });
    });
  });

  it('surfaces unexpected shapes as ProviderError', async () => {
    const bad = new EspnProvider(async () => ({ nope: true }));
    await expect(bad.getEventSnapshot('NFL', '1')).rejects.toMatchObject({ kind: 'UNEXPECTED_SHAPE' });
    await expect(bad.listEvents('NFL', ['2026-09-27'])).rejects.toMatchObject({ kind: 'UNEXPECTED_SHAPE' });
    await expect(bad.getRoster('NFL', '1')).rejects.toMatchObject({ kind: 'UNEXPECTED_SHAPE' });
  });
});
