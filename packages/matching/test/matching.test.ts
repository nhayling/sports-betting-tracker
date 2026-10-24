import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseHistoryResponse, type RawHistoryResponse } from '@sports-better/kambi';
import { parseFightCard, parseRoster, parseScoreboardEvent } from '@sports-better/sports-data/src/espn';
import type { ProviderEvent, ProviderPlayer, Sport } from '@sports-better/sports-data';
import { describe, expect, it } from 'vitest';
import { AUTO_LINK_THRESHOLD, matchEvent, matchPlayer, normalizePersonName, sportForLeague, stripRanking, teamMatches } from '../src';

const read = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const espn = (name: string) => read(`../../sports-data/fixtures/espn/${name}.json`);

const scoreboard: ProviderEvent[] = espn('nfl-scoreboard-live').events.map((e: unknown) => parseScoreboardEvent('NFL', e)!);
const rosters: Record<string, ProviderPlayer[]> = Object.fromEntries(
  [['12', 'kc'], ['15', 'mia'], ['8', 'det'], ['20', 'nyj']].map(([id, n]) => [id, parseRoster(id!, espn(`nfl-roster-${n}`))]),
);

const legs = parseHistoryResponse(read('../../kambi/fixtures/captured/history-2026-09-27.json') as RawHistoryResponse).flatMap(
  (c) => c.bets.flatMap((b) => b.legs),
);

describe('normalizePersonName', () => {
  it.each([
    ['Kenneth Walker III', { full: 'kenneth walker iii', base: 'kenneth walker', suffix: 'iii', first: 'kenneth', last: 'walker' }],
    ['Amon-Ra St. Brown', { full: 'amon ra st brown', base: 'amon ra st brown', suffix: null, first: 'amon', last: 'ra st brown' }],
    ["Ja'Marr Chase", { full: 'jamarr chase', base: 'jamarr chase', suffix: null, first: 'jamarr', last: 'chase' }],
    ['José Núñez Jr.', { full: 'jose nunez jr', base: 'jose nunez', suffix: 'jr', first: 'jose', last: 'nunez' }],
  ])('%s', (name, expected) => {
    expect(normalizePersonName(name)).toEqual(expected);
  });

  it('strips college rankings', () => {
    expect(stripRanking('(1) Texas')).toBe('Texas');
    expect(stripRanking('(14) Tennessee')).toBe('Tennessee');
  });
});

describe('matchEvent: Island Luck capture → ESPN scoreboard (Week 3)', () => {
  const week3 = [
    ...new Map(
      legs
        .filter((l) => sportForLeague(l.league) === 'NFL' && l.eventStartAt! >= '2026-09-27' && l.eventStartAt! < '2026-09-29')
        .map((l) => [l.eventId, l]),
    ).values(),
  ];

  it('covers the Week 3 games in the capture', () => {
    expect(week3.length).toBeGreaterThanOrEqual(10);
  });

  it('matches every one of them to exactly one ESPN game', () => {
    const results = week3.map((l) => ({
      kambi: l.eventName,
      m: matchEvent({ sport: 'NFL', homeName: l.homeName!, awayName: l.awayName!, startAt: l.eventStartAt! }, scoreboard),
    }));
    const failed = results.filter((r) => !r.m.ok).map((r) => r.kambi);
    expect(failed).toEqual([]);
    for (const { m } of results) if (m.ok) expect(m.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('handles abbreviation differences (Kambi WAS / ESPN WSH)', () => {
    const m = matchEvent({ sport: 'NFL', homeName: 'WAS Commanders', awayName: 'SEA Seahawks', startAt: '2026-09-27T17:00:00Z' }, scoreboard);
    expect(m).toMatchObject({ ok: true, event: { id: '401872955' }, confidence: 1 });
  });

  it('matches KC Chiefs @ MIA Dolphins', () => {
    const m = matchEvent({ sport: 'NFL', homeName: 'MIA Dolphins', awayName: 'KC Chiefs', startAt: '2026-09-27T17:00:00Z' }, scoreboard);
    expect(m).toMatchObject({ ok: true, event: { id: '401872952' }, confidence: 1, swapped: false });
  });

  it('accepts swapped home/away with lower confidence unless neutral site', () => {
    const m = matchEvent({ sport: 'NFL', homeName: 'KC Chiefs', awayName: 'MIA Dolphins', startAt: '2026-09-27T17:00:00Z' }, scoreboard);
    expect(m).toMatchObject({ ok: true, swapped: true, confidence: 0.95 });
  });

  it('refuses games outside the start window', () => {
    const m = matchEvent({ sport: 'NFL', homeName: 'MIA Dolphins', awayName: 'KC Chiefs', startAt: '2026-09-28T17:00:00Z' }, scoreboard);
    expect(m).toMatchObject({ ok: false, reason: 'NO_CANDIDATE' });
  });
});

describe('matchEvent: Island Luck NBA games → ESPN scoreboard (2026-10-23)', () => {
  const nba: ProviderEvent[] = espn('nba-scoreboard-live').events.map((e: unknown) => parseScoreboardEvent('NBA', e)!);
  const games: Array<{ event: { name: string; homeName: string; awayName: string; start: string; path: Array<{ name: string }> } }> = read(
    '../../kambi/fixtures/offering/nba-games-2026-10-23.json',
  ).events;

  it('reads the NBA league from the event path', () => {
    expect(games.every((g) => sportForLeague(g.event.path.at(-1)!.name) === 'NBA')).toBe(true);
  });

  it('matches every game to exactly one ESPN game, two-word nicknames and shared cities included', () => {
    const results = games.map(({ event: e }) => ({ kambi: e.name, m: matchEvent({ sport: 'NBA', homeName: e.homeName, awayName: e.awayName, startAt: e.start }, nba) }));
    expect(results.filter((r) => !r.m.ok).map((r) => r.kambi)).toEqual([]);
    const id = (name: string) => {
      const m = results.find((r) => r.kambi === name)!.m;
      return m.ok ? [m.event.id, m.method, m.swapped] : null;
    };
    expect(id('POR Trail Blazers @ SAC Kings')).toEqual(['401909852', 'NICKNAME', false]);
    expect(id('LA Clippers @ LA Lakers')).toEqual(['401909851', 'NICKNAME', false]);
    expect(id('NO Pelicans @ UTA Jazz')).toEqual(['401909849', 'NICKNAME', false]);
  });
});

describe.each([
  ['NHL', 'nhl', 'NHL', 14],
  ['MLB', 'mlb', 'MLB', 1],
  ['WNBA', 'wnba', 'WNBA', 1],
  ['EPL', 'epl', 'England / Premier League', 9],
  ['LALIGA', 'laliga', 'Spain / La Liga', 9],
  ['UFC', 'ufc', 'UFC', 14],
] as const)('matchEvent: Island Luck %s → ESPN (games from 2026-10-23)', (sport: Sport, file, league, count) => {
  const board = espn(`${file}-scoreboard-upcoming-2026-10-23`).events;
  const espnGames: ProviderEvent[] = sport === 'UFC' ? board.flatMap((e: unknown) => parseFightCard(e)).filter(Boolean) : board.map((e: unknown) => parseScoreboardEvent(sport, e)!);
  const games: Array<{ event: { name: string; homeName: string; awayName: string; start: string; path: Array<{ name: string }> } }> = read(
    `../../kambi/fixtures/offering/${file}-games-2026-10-23.json`,
  ).events;

  it('maps the league as the kambi parser names it', () => {
    expect(sportForLeague(league)).toBe(sport);
    expect(games).toHaveLength(count);
  });

  it('matches every game to exactly one ESPN game', () => {
    const results = games.map(({ event: e }) => ({ kambi: e.name, m: matchEvent({ sport, homeName: e.homeName, awayName: e.awayName, startAt: e.start }, espnGames) }));
    expect(results.filter((r) => !r.m.ok).map((r) => `${r.kambi}: ${!r.m.ok && r.m.reason}`)).toEqual([]);
    for (const { m } of results) if (m.ok) expect(m.confidence).toBe(1);
    expect(new Set(results.map((r) => r.m.ok && r.m.event.id)).size).toBe(count);
  });
});

describe('matchEvent: names that need care', () => {
  const team = (displayName: string, name = displayName, location = displayName) => ({ id: '1', abbreviation: null, displayName, name, location });
  it.each([
    ['EPL', 'Brighton', team('Brighton & Hove Albion'), true],
    ['EPL', 'Newcastle', team('Newcastle United'), true],
    ['EPL', 'Bournemouth', team('AFC Bournemouth'), true],
    ['EPL', 'Manchester City', team('Manchester United'), false],
    ['EPL', 'Hull City', team('Coventry City'), false],
    ['LALIGA', 'FC Barcelona', team('Barcelona'), true],
    ['LALIGA', 'Athletic Bilbao', team('Athletic Club'), true],
    ['LALIGA', 'Alaves', team('Alavés'), true],
    ['LALIGA', 'Real Madrid', team('Real Sociedad'), false],
    ['NHL', 'TOR Maple Leafs', team('Toronto Maple Leafs', 'Maple Leafs', 'Toronto'), true],
    ['MLB', 'CHI White Sox', team('Chicago Cubs', 'Cubs', 'Chicago'), false],
    ['UFC', '(8) Iasmin Lucindo', team('Iasmin Lucindo'), true],
    ['UFC', '(C) Alex Volkanovski', team('Alexander Volkanovski'), true],
    ['UFC', '(4) Alexander Volkov', team('Alexander Volkanovski'), false],
  ] as const)('%s: %s vs %s → %s', (sport, kambi, espnTeam, ok) => {
    expect(teamMatches(sport, kambi, espnTeam)).toBe(ok);
  });

  it('only maps Premier League with its country', () => {
    expect(sportForLeague('England / Premier League')).toBe('EPL');
    expect(sportForLeague('Egypt / Premier League')).toBeNull();
    expect(sportForLeague('Premier League')).toBeNull();
  });
});

describe('matchPlayer: Island Luck participants → ESPN rosters', () => {
  const inGame = (a: string, b: string) => [...rosters[a]!, ...rosters[b]!];

  it.each([
    ['Kenneth Walker III', '12', '15', '4567048'],
    ['Jahmyr Gibbs', '8', '20', undefined],
    ['Breece Hall', '8', '20', undefined],
    ['Amon-Ra St. Brown', '8', '20', undefined],
  ])('%s', (name, a, b, id) => {
    const m = matchPlayer(name, inGame(a!, b!));
    expect(m).toMatchObject({ ok: true, method: 'EXACT_NAME', confidence: 1, autoLink: true });
    if (id && m.ok) expect(m.player.id).toBe(id);
  });

  it('matches every player pick in KC–MIA and NYJ–DET from the capture', () => {
    const picks = legs
      .filter((l) => ['KC Chiefs @ MIA Dolphins', 'NY Jets @ DET Lions'].includes(l.eventName!))
      .flatMap((l) => l.selections)
      .filter((s) => s.marketType === 'Player Occurrence Line');
    expect(picks.length).toBeGreaterThan(0);
    const pool = [...rosters['12']!, ...rosters['15']!, ...rosters['8']!, ...rosters['20']!];
    const unmatched = picks.map((s) => s.participantName!).filter((n) => !matchPlayer(n, pool).ok);
    expect(unmatched).toEqual([]);
  });

  it('matches a missing suffix, but not a conflicting one', () => {
    const pool = inGame('12', '15');
    expect(matchPlayer('Kenneth Walker', pool)).toMatchObject({ ok: true, method: 'NAME_WITHOUT_SUFFIX', autoLink: true });
    expect(matchPlayer('Kenneth Walker Jr.', pool)).toMatchObject({ ok: false, reason: 'NO_CANDIDATE' });
  });

  it('does not auto-link an initial-only match', () => {
    const m = matchPlayer('K. Walker', inGame('12', '15'));
    expect(m).toMatchObject({ ok: true, method: 'FIRST_INITIAL_LAST_NAME', autoLink: false });
    expect(m.ok && m.confidence).toBeLessThan(AUTO_LINK_THRESHOLD);
  });

  it('reports ambiguity instead of picking one', () => {
    const twins: ProviderPlayer[] = [
      { id: '1', displayName: 'Mike Williams', firstName: 'Mike', lastName: 'Williams', teamId: 'a', position: 'WR' },
      { id: '2', displayName: 'Mike Williams', firstName: 'Mike', lastName: 'Williams', teamId: 'b', position: 'WR' },
    ];
    expect(matchPlayer('Mike Williams', twins)).toMatchObject({ ok: false, reason: 'AMBIGUOUS' });
  });

  it('reports no match for someone not in the game', () => {
    expect(matchPlayer('Derrick Henry', inGame('12', '15'))).toMatchObject({ ok: false, reason: 'NO_CANDIDATE' });
  });
});
