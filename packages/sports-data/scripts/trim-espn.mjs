#!/usr/bin/env node
/**
 * Trims ESPN responses to the fields the provider reads, keeping ESPN's exact
 * structure, so fixtures stay small. Run on *.full.json captures:
 *
 *   node scripts/trim-espn.mjs fixtures/espn/*.full.json
 *
 * writes <name>.json next to each input.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const pick = (o, keys) => (o == null ? o : Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])));
const team = (t) => pick(t, ['id', 'uid', 'abbreviation', 'location', 'name', 'displayName', 'shortDisplayName']);
const status = (s) => ({ ...pick(s, ['clock', 'displayClock', 'period']), type: pick(s?.type, ['id', 'name', 'state', 'completed', 'description', 'detail', 'shortDetail']) });
const competitor = (c) =>
  c.athlete
    ? { ...pick(c, ['id', 'order', 'winner']), athlete: athlete(c.athlete) }
    : { ...pick(c, ['id', 'homeAway', 'score', 'winner']), team: team(c.team) };
const situation = (s) => ({
  ...pick(s, ['down', 'distance', 'yardLine', 'downDistanceText', 'shortDownDistanceText', 'possessionText', 'isRedZone', 'homeTimeouts', 'awayTimeouts', 'possession']),
  ...(s.lastPlay ? { lastPlay: pick(s.lastPlay, ['id', 'text', 'type']) } : {}),
});
const athlete = (a) => pick(a, ['id', 'uid', 'firstName', 'lastName', 'fullName', 'displayName', 'shortName', 'jersey']);

function trimScoreboard(d) {
  return {
    season: pick(d.season, ['type', 'year']),
    week: d.week,
    events: d.events.map((e) => ({
      ...pick(e, ['id', 'uid', 'date', 'name', 'shortName']),
      competitions: e.competitions.map((c) => ({
        ...pick(c, ['id', 'date', 'neutralSite']),
        status: status(c.status),
        competitors: c.competitors.map(competitor),
        ...(c.situation ? { situation: situation(c.situation) } : {}),
        // Fights: scheduled rounds and the result notes.
        ...(c.format ? { format: c.format } : {}),
        ...(c.details ? { details: c.details.map((d) => ({ type: pick(d.type, ['id', 'text']) })) } : {}),
      })),
    })),
  };
}

function trimSummary(d) {
  return {
    header: {
      ...pick(d.header, ['id', 'uid']),
      competitions: d.header.competitions.map((c) => ({
        ...pick(c, ['id', 'date', 'neutralSite']),
        status: status(c.status),
        competitors: c.competitors.map(competitor),
      })),
    },
    boxscore: {
      players: (d.boxscore?.players ?? []).map((t) => ({
        team: team(t.team),
        statistics: t.statistics.map((s) => ({
          ...pick(s, ['name', 'type', 'keys', 'labels']),
          athletes: s.athletes.map((a) => ({ athlete: athlete(a.athlete), stats: a.stats })),
        })),
      })),
      // Soccer team stats (corners).
      ...(d.boxscore?.teams ? { teams: d.boxscore.teams.map((t) => ({ team: team(t.team), statistics: (t.statistics ?? []).map((s) => pick(s, ['name', 'displayValue'])) })) } : {}),
    },
    // Soccer's player stats live in the rosters.
    ...(d.rosters
      ? {
          rosters: d.rosters.map((r) => ({
            ...pick(r, ['homeAway']),
            team: team(r.team),
            roster: (r.roster ?? []).map((p) => ({ ...pick(p, ['starter', 'subbedIn']), athlete: athlete(p.athlete), position: pick(p.position, ['abbreviation']), stats: (p.stats ?? []).map((st) => pick(st, ['name', 'value'])) })),
          })),
        }
      : {}),
  };
}

function trimRoster(d) {
  const player = (a) => ({
    ...athlete(a),
    position: pick(a.position, ['abbreviation', 'name']),
    status: pick(a.status, ['type', 'name']),
  });
  return {
    team: team(d.team),
    // Football groups players by unit ({position, items}); basketball is a flat list.
    athletes: d.athletes.map((g) => (Array.isArray(g.items) ? { position: g.position, items: g.items.map(player) } : player(g))),
  };
}

for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const out = d.boxscore || d.header ? trimSummary(d) : d.athletes && d.team ? trimRoster(d) : d.events ? trimScoreboard(d) : null;
  if (!out) {
    console.error(`skip ${file}: unrecognized shape`);
    continue;
  }
  const dest = file.replace(/(\.full)?\.json$/, '.json');
  writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
  console.log(`${dest}  ${(readFileSync(dest).length / 1024).toFixed(0)} kB`);
}
