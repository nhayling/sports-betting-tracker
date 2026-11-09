import type { EventSnapshot, PlayStats, SportKind, StatKey } from './types';

/**
 * Stats by period, added up from ESPN's play-by-play, since box scores only
 * have full-game totals. Each stat here matched the box score for every player
 * on real games (see docs/sports-data.md) and the fixtures keep that checked.
 * NFL yards aren't here: their play-by-play doesn't reliably add up.
 */

function collector() {
  const lines = new Map<string, PlayStats['lines'][number]>();
  const add = (playerId: string | undefined, period: number, stat: StatKey, n = 1) => {
    if (!playerId || !period) return;
    const key = `${playerId}|${period}`;
    const line = lines.get(key) ?? { playerId, period, stats: {} };
    line.stats[stat] = (line.stats[stat] ?? 0) + n;
    lines.set(key, line);
  };
  return { add, lines: () => [...lines.values()] };
}

/** Basketball, hockey and baseball: the summary's own `plays`. */
export function parseSummaryPlays(kind: SportKind, plays: unknown): PlayStats | undefined {
  if (!Array.isArray(plays) || !(kind === 'basketball' || kind === 'hockey' || kind === 'baseball')) return undefined;
  const { add, lines } = collector();
  for (const p of plays as any[]) {
    const period = Number(p?.period?.number);
    const who = (i: number): string | undefined => p?.participants?.[i]?.athlete?.id;
    if (kind === 'basketball') {
      if (p.scoringPlay) {
        for (const stat of ['POINTS', 'POINTS_REBOUNDS', 'POINTS_ASSISTS', 'POINTS_REBOUNDS_ASSISTS'] as const) add(who(0), period, stat, p.scoreValue ?? 0);
        if (/assist/i.test(p.text ?? '')) for (const stat of ['ASSISTS', 'POINTS_ASSISTS', 'REBOUNDS_ASSISTS', 'POINTS_REBOUNDS_ASSISTS'] as const) add(who(1), period, stat);
      } else if (/Rebound/.test(p?.type?.text ?? '')) {
        for (const stat of ['REBOUNDS', 'POINTS_REBOUNDS', 'REBOUNDS_ASSISTS', 'POINTS_REBOUNDS_ASSISTS'] as const) add(who(0), period, stat);
      }
    } else if (kind === 'hockey') {
      const type = p?.type?.text;
      if (type === 'Goal') {
        add(who(0), period, 'GOALS');
        add(who(0), period, 'POINTS');
        add(who(0), period, 'SHOTS_ON_GOAL');
        for (const i of [1, 2]) {
          add(who(i), period, 'ASSISTS');
          add(who(i), period, 'POINTS');
        }
      } else if (type === 'Shot') add(who(0), period, 'SHOTS_ON_GOAL');
    } else if (p?.type?.type === 'play-result' && /^(single|double|triple|home-run)$/.test(p?.alternativeType?.type ?? '')) {
      add(p.participants?.find((x: any) => x.type === 'batter')?.athlete?.id, period, 'HITS');
    }
  }
  return { lines: lines(), firstTouchdown: null, longestCompletions: {} };
}

/** Football's plays have athlete ids only on ESPN's core feed, as $refs. */
export function parseFootballPlays(items: unknown): PlayStats {
  const { add, lines } = collector();
  const longest: Record<string, number> = {};
  const person = (p: any, type: string): string | undefined => /athletes\/(\d+)/.exec(p?.participants?.find((a: any) => a.type === type)?.athlete?.$ref ?? '')?.[1];
  // The feed isn't quite in game order.
  const plays = (Array.isArray(items) ? (items as any[]) : []).filter((p) => !/NULLIFIED/i.test(p?.text ?? '')).sort((a, b) => a?.period?.number - b?.period?.number || b?.clock?.value - a?.clock?.value);
  let firstTouchdown: PlayStats['firstTouchdown'] = null;
  for (const p of plays) {
    const period = Number(p?.period?.number);
    const type: string = p?.type?.text ?? '';
    if (p.scoringPlay && p.scoreValue >= 6) {
      const scorer = person(p, 'scorer');
      firstTouchdown ??= { playerId: scorer ?? null };
      add(scorer, period, 'TOUCHDOWNS');
      if (type === 'Passing Touchdown') {
        add(person(p, 'passer'), period, 'PASSING_TDS');
        add(person(p, 'receiver'), period, 'RECEIVING_TDS');
      } else if (type === 'Rushing Touchdown') add(person(p, 'rusher'), period, 'RUSHING_TDS');
    }
    if (type === 'Pass Reception' || type === 'Passing Touchdown') {
      const yards = /\bfor (\d+) yards?\b/.exec(p.text ?? '');
      const passer = person(p, 'passer');
      if (yards && passer) longest[passer] = Math.max(longest[passer] ?? 0, Number(yards[1]));
    }
  }
  return { lines: lines(), firstTouchdown, longestCompletions: longest };
}

const inPeriod = (period: number, range: { from: number; to: number }) => period >= range.from && period <= range.to;

/** A stat that's read from plays. Null when there's no telling. */
export function playValue(plays: PlayStats, snap: EventSnapshot, playerId: string, metric: StatKey, range?: { from: number; to: number }): number | null {
  if (metric === 'FIRST_TOUCHDOWN') return plays.firstTouchdown?.playerId === playerId ? 1 : 0;
  if (metric === 'LONGEST_COMPLETION') {
    const longest = plays.longestCompletions[playerId] ?? 0;
    if (snap.state.state !== 'FINAL') return longest;
    // A pick isn't graded on text alone: the team's longest play must be its longest catch in the box score.
    const team = snap.players.find((p) => p.player.id === playerId)?.player.teamId;
    const onTeam = snap.players.filter((p) => p.player.teamId === team);
    const fromPlays = Math.max(0, ...onTeam.map((p) => plays.longestCompletions[p.player.id] ?? 0));
    const fromBox = Math.max(0, ...onTeam.map((p) => p.stats.LONG_RECEPTION ?? 0));
    return fromPlays === fromBox ? longest : null;
  }
  return plays.lines.filter((l) => l.playerId === playerId && (!range || inPeriod(l.period, range))).reduce((n, l) => n + (l.stats[metric] ?? 0), 0);
}

/** Both teams' score over a stretch of the game. */
export const periodScore = (snap: EventSnapshot, range: { from: number; to: number }) => (snap.periodScores ?? []).filter((s) => inPeriod(s.period, range)).reduce((n, s) => n + s.points, 0);
