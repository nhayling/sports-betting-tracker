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
const competitor = (c) => ({ ...pick(c, ['id', 'homeAway', 'score']), team: team(c.team) });
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
          ...pick(s, ['name', 'keys', 'labels']),
          athletes: s.athletes.map((a) => ({ athlete: athlete(a.athlete), stats: a.stats })),
        })),
      })),
    },
  };
}

function trimRoster(d) {
  return {
    team: team(d.team),
    athletes: d.athletes.map((g) => ({
      position: g.position,
      items: g.items.map((a) => ({
        ...athlete(a),
        position: pick(a.position, ['abbreviation', 'name']),
        status: pick(a.status, ['type', 'name']),
      })),
    })),
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
