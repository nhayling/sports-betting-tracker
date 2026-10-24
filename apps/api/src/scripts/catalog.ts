/**
 * Every market Island Luck offers on upcoming games, from Kambi's public
 * offering feed (no login), and whether the tracker follows it. Run it to see
 * what a new sport or a new Kambi market would need before anyone bets on it.
 * Reads only; the database isn't touched.
 *
 *   npm run catalog -w @sports-better/api                        # every league the tracker follows
 *   npm run catalog -w @sports-better/api -- basketball/nba --games 6
 *   npm run catalog -w @sports-better/api -- basketball/nba --save ../../packages/kambi/fixtures/offering/nba-markets.json
 *
 * Player props leave the feed once a game starts, so only games that haven't
 * started are read.
 */
import { writeFileSync } from 'node:fs';
import { classifyMarket, gameMarket } from '@sports-better/markets';

const FEED = 'https://eu.offering-api.kambicdn.com/offering/v2018/islandluck';
const QUERY = 'lang=en_US&market=BS&client_id=200&channel_id=1';
const SIDES: Record<string, 'YES' | 'NO' | 'OVER' | 'UNDER'> = { OT_YES: 'YES', OT_NO: 'NO', OT_OVER: 'OVER', OT_UNDER: 'UNDER' };
// A request every 1.5 s; the feed is public but shared with every Island Luck customer.
const GAP_MS = 1500;

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const games = Number(flag('--games') ?? 3);
const save = flag('--save');
const leagues = args.length
  ? args
  : [
      'american_football/nfl',
      'basketball/nba',
      'basketball/wnba',
      'baseball/mlb',
      'ice_hockey/nhl',
      'football/england/premier_league',
      'football/spain/la_liga',
      'ufc_mma/ufc',
    ];

interface Market {
  criterion: string;
  sides: Array<'YES' | 'NO' | 'OVER' | 'UNDER'>;
  /** Kambi ×1000, from the first outcome. */
  line: number | null;
}

let last = 0;
async function get(url: string): Promise<any> {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

const saved: Record<string, { source: string; markets: Market[] }> = {};
for (const league of leagues) {
  const list = await get(`${FEED}/listView/${league}.json?${QUERY}`);
  const upcoming = (list.events ?? []).map((e: any) => e.event).filter((e: any) => e.state === 'NOT_STARTED').slice(0, games);
  if (upcoming.length === 0) {
    console.log(`\n${league}: no upcoming games on the feed.`);
    continue;
  }

  const markets = new Map<string, Market & { games: Set<string> }>();
  let sport: string | null = null;
  for (const e of upcoming) {
    const body = await get(`${FEED}/betoffer/event/${e.id}.json?${QUERY}&includeParticipants=true`);
    sport ??= body.events?.[0]?.sport ?? e.sport ?? null;
    for (const b of body.betOffers ?? []) {
      const criterion: string = b.criterion?.label;
      if (!criterion) continue;
      const m: Market & { games: Set<string> } = markets.get(criterion) ?? { criterion, sides: [], line: b.outcomes?.[0]?.line ?? null, games: new Set<string>() };
      for (const o of b.outcomes ?? []) if (SIDES[o.type] && !m.sides.includes(SIDES[o.type]!)) m.sides.push(SIDES[o.type]!);
      m.games.add(e.name);
      markets.set(criterion, m);
    }
  }

  // Ladders ("10+ Points", "12+ Points"…) are one market for this purpose.
  const groups = new Map<string, { tracked: string | null; reason: string | null; names: number }>();
  for (const m of markets.values()) {
    const key = m.criterion.replace(/^\d+\+ /, 'N+ ');
    const game = gameMarket(m.criterion);
    const line = m.line === null ? null : m.line / 1000;
    const cls = game ? null : m.sides.map((side) => classifyMarket({ sport, marketName: m.criterion, selectionSide: side, line })).find((c) => c.supported) ??
      classifyMarket({ sport, marketName: m.criterion, selectionSide: m.sides[0] ?? null, line });
    const g = groups.get(key) ?? { tracked: null, reason: null, names: 0 };
    g.names++;
    if (game) g.tracked = game;
    else if (cls?.supported) g.tracked = cls.metric;
    else g.reason = cls?.reason ?? null;
    groups.set(key, g);
  }

  const rows = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const tracked = rows.filter(([, g]) => g.tracked);
  const untracked = rows.filter(([, g]) => !g.tracked);
  console.log(`\n${league} (${sport}) · ${upcoming.length} upcoming games: ${upcoming.map((e: any) => e.name).join(', ')}`);
  console.log(`\nTracked (${tracked.length})`);
  for (const [key, g] of tracked) console.log(`  ✓ ${key}  ${g.tracked}`);
  console.log(`\nNot tracked (${untracked.length})`);
  for (const [key, g] of untracked) console.log(`  ✗ ${key}  ${g.reason}`);

  saved[league] = {
    source: `${FEED.replace('https://', '')} betoffer/event, ${upcoming.length} ${league} games, ${new Date().toISOString().slice(0, 10)}`,
    markets: [...markets.values()].map(({ criterion, sides, line }) => ({ criterion, sides: sides.sort(), line })).sort((a, b) => a.criterion.localeCompare(b.criterion)),
  };
}

if (save) {
  // One league per file, in the shape the markets tests read.
  if (Object.keys(saved).length !== 1) throw new Error('--save takes exactly one league');
  writeFileSync(save, JSON.stringify(Object.values(saved)[0], null, 1) + '\n');
  console.log(`\nSaved ${save}`);
}
