import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseHistoryResponse, type RawHistoryResponse } from '@sports-better/kambi';
import { parseRoster, parseScoreboardEvent } from '@sports-better/sports-data/src/espn';
import type { ProviderEvent, ProviderPlayer } from '@sports-better/sports-data';
import { describe, expect, it } from 'vitest';
import { AUTO_LINK_THRESHOLD, matchEvent, matchPlayer, normalizePersonName, sportForLeague, stripRanking } from '../src';

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
