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

describe('EspnProvider NBA (fixtures captured 2026-10-22/23)', () => {
  const { provider, urls } = fakeEspn([
    [/nba\/scoreboard/, 'nba-scoreboard-live'],
    [/nba\/summary\?event=401909848/, 'nba-summary-chi-mil-live'],
    [/nba\/summary\?event=401909093/, 'nba-summary-cle-phi-final'],
    [/nba\/teams\/5\/roster/, 'nba-roster-cle'],
  ]);

  it('lists games, with two-word nicknames intact', async () => {
    const events = await provider.listEvents('NBA', ['2026-10-23']);
    expect(urls.at(-1)).toBe('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261023');
    expect(events).toHaveLength(12);
    expect(events.find((e) => e.id === '401909848')).toMatchObject({
      sport: 'NBA',
      home: { abbreviation: 'MIL', name: 'Bucks' },
      away: { abbreviation: 'CHI', name: 'Bulls' },
      state: { state: 'LIVE', period: 2, homeScore: 54, awayScore: 59, situation: { possessionTeamId: null, redZone: false, lastPlay: 'Tyler Herro offensive rebound' } },
    });
    expect(events.find((e) => e.id === '401909852')!.away.name).toBe('Trail Blazers');
  });

  it('reads points, rebounds, assists, steals, blocks and threes from the box score', async () => {
    const snap = await provider.getEventSnapshot('NBA', '401909093');
    expect(snap.state.state).toBe('FINAL');
    const mitchell = snap.players.find((p) => p.player.displayName === 'Donovan Mitchell')!;
    expect(mitchell.player.teamId).toBe('5');
    expect(mitchell.stats).toMatchObject({ POINTS: 32, REBOUNDS: 10, ASSISTS: 3, STEALS: 2, BLOCKS: 1, THREES_MADE: 2 });
    expect(mitchell.stats).toMatchObject({ POINTS_REBOUNDS: 42, POINTS_ASSISTS: 35, REBOUNDS_ASSISTS: 13, POINTS_REBOUNDS_ASSISTS: 45, STEALS_BLOCKS: 3 });
  });

  it('counts double-doubles and triple-doubles', async () => {
    const snap = await provider.getEventSnapshot('NBA', '401909093');
    const stats = (name: string) => snap.players.find((p) => p.player.displayName === name)!.stats;
    expect(stats('LeBron James')).toMatchObject({ DOUBLE_DOUBLE: 1, TRIPLE_DOUBLE: 0 });
    expect(stats('Tyrese Maxey')).toMatchObject({ DOUBLE_DOUBLE: 0, TRIPLE_DOUBLE: 0 });
  });

  it('leaves out players who have not played, and reads a live game', async () => {
    const final = await provider.getEventSnapshot('NBA', '401909093');
    expect(final.players.some((p) => p.player.displayName === 'Riley Minix')).toBe(false);
    const live = await provider.getEventSnapshot('NBA', '401909848');
    expect(live.state).toMatchObject({ state: 'LIVE', period: 2 });
    expect(live.players.find((p) => p.player.displayName === 'Tyler Herro')!.stats).toMatchObject({ POINTS: 12, THREES_MADE: 2 });
  });

  it('lists a flat basketball roster with box score ids', async () => {
    const roster = await provider.getRoster('NBA', '5');
    expect(roster).toHaveLength(14);
    expect(roster.find((p) => p.displayName === 'Jarrett Allen')).toMatchObject({ id: '4066328', teamId: '5', position: 'C' });
  });
});

describe('EspnProvider MLB, NHL, WNBA, soccer and UFC (fixtures captured 2026-10-23)', () => {
  const { provider, urls } = fakeEspn([
    [/hockey\/nhl\/scoreboard/, 'nhl-scoreboard-2026-10-22'],
    [/hockey\/nhl\/summary/, 'nhl-summary-nyr-tor-final'],
    [/baseball\/mlb\/summary/, 'mlb-summary-cle-tb-final'],
    [/basketball\/wnba\/summary/, 'wnba-summary-gs-atl-final'],
    [/soccer\/eng\.1\/scoreboard/, 'epl-scoreboard-2026-10-18'],
    [/soccer\/eng\.1\/summary/, 'epl-summary-cry-bha-final'],
    [/soccer\/esp\.1\/summary/, 'laliga-summary-ray-get-final'],
    [/mma\/ufc\/scoreboard\?dates=20261017/, 'ufc-scoreboard-2026-10-17'],
    [/mma\/ufc\/scoreboard\?dates=20261024/, 'ufc-scoreboard-2026-10-24'],
  ]);
  const stats = async (sport: Parameters<typeof provider.getEventSnapshot>[0], name: string) =>
    (await provider.getEventSnapshot(sport, '1')).players.find((p) => p.player.displayName === name)!.stats;

  it('uses each league’s ESPN path', async () => {
    await provider.listEvents('NHL', ['2026-10-22']);
    await provider.listEvents('EPL', ['2026-10-18']);
    expect(urls.slice(-2)).toEqual([
      'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=20261022',
      'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20261018',
    ]);
  });

  it('NHL: goals, assists, points and shots on goal for skaters', async () => {
    expect(await stats('NHL', 'Adam Fox')).toMatchObject({ GOALS: 0, ASSISTS: 4, POINTS: 4, SHOTS_ON_GOAL: 0 });
    expect(await stats('NHL', 'Mika Zibanejad')).toMatchObject({ GOALS: 1, ASSISTS: 1, POINTS: 2, SHOTS_ON_GOAL: 3 });
  });

  it('MLB: batting lines, and pitchers’ strikeouts and outs', async () => {
    expect(await stats('MLB', 'Junior Caminero')).toMatchObject({ HITS: 2, RUNS: 2, RBIS: 2, HOME_RUNS: 1, HITS_RUNS_RBIS: 6 });
    // 5.1 innings = 16 outs.
    expect(await stats('MLB', 'Freddy Peralta')).toMatchObject({ PITCHER_STRIKEOUTS: 3, OUTS_RECORDED: 16 });
  });

  it('WNBA: read like the NBA', async () => {
    expect(await stats('WNBA', 'Angel Reese')).toMatchObject({ POINTS: 21, REBOUNDS: 12, DOUBLE_DOUBLE: 1 });
  });

  it('soccer: goals, shots and cards from the rosters, corners for the game', async () => {
    const snap = await provider.getEventSnapshot('EPL', '401879261');
    expect(snap.state).toMatchObject({ state: 'FINAL', homeScore: 5, awayScore: 0 });
    expect(snap.gameStats).toEqual({ CORNERS: 13 });
    expect(snap.players.find((p) => p.player.displayName === 'Charalambos Kostoulas')!.stats).toMatchObject({ GOALS: 1, ASSISTS: 1, SHOTS_ON_TARGET: 2, CARDS: 0 });
    expect(snap.players.find((p) => p.player.displayName === 'Pascal Gross')!.stats).toMatchObject({ CARDS: 1, RED_CARDS: 0 });
    expect(await stats('LALIGA', 'Martín Satriano')).toMatchObject({ GOALS: 1 });
  });

  it('UFC: each bout is a game between two fighters, with how it ended', async () => {
    const bouts = await provider.listEvents('UFC', ['2026-10-17']);
    expect(bouts).toHaveLength(13);
    expect(bouts.find((b) => b.id === '401929676')).toMatchObject({
      sport: 'UFC',
      neutralSite: true,
      home: { name: 'Javad Mahjoub' },
      away: { name: 'Joel Faglier' },
      state: { state: 'FINAL', homeScore: null, fight: { winner: 'away', method: 'KO_TKO', round: 2, clockSeconds: 131, scheduledRounds: 3 } },
    });
    expect(bouts.find((b) => b.id === '401919643')!.state.fight).toMatchObject({ winner: 'away', method: 'SUBMISSION', round: 3 });
    // A finish with no result note stays unknown rather than guessed.
    expect(bouts.find((b) => b.id === '401914039')!.state.fight).toMatchObject({ winner: 'away', method: null, round: 3 });
    const upcoming = await provider.listEvents('UFC', ['2026-10-24']);
    expect(upcoming.find((b) => b.id === '401930916')).toMatchObject({ home: { name: 'Kody Steele' }, away: { name: 'Noah Gugnon' }, state: { state: 'SCHEDULED', fight: { winner: null, method: null } } });
  });

  it('UFC has no box score to fetch', async () => {
    await expect(provider.getEventSnapshot('UFC', '401929676')).rejects.toMatchObject({ kind: 'UNSUPPORTED_SPORT' });
  });
});
