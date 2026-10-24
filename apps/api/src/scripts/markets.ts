/**
 * Every market on a synced pick, tracked or not, with pick counts; the
 * untracked ones first, with when sync first flagged them. Read-only.
 *
 *   npm run markets -w @sports-better/api
 */
import { classifyMarket, gameMarket, type MarketInput } from '@sports-better/markets';
import { prisma } from '../db';

const TZ = 'America/Nassau';

// One row per sport + market + side; a side can be supported while another isn't (e.g. a "No" on an over/under market).
const rows = await prisma.$queryRaw<Array<{ sport: string | null; marketName: string; selectionSide: string | null; lineRaw: number | null; picks: bigint; open: bigint }>>`
  SELECT l."sport", s."marketName", s."selectionSide"::text AS "selectionSide", MIN(s."lineRaw") AS "lineRaw",
         COUNT(*) AS picks, COUNT(*) FILTER (WHERE s."status" = 'OPEN') AS open
  FROM "LegSelection" s JOIN "BetLeg" l ON l."id" = s."betLegId"
  WHERE s."marketName" IS NOT NULL
  GROUP BY l."sport", s."marketName", s."selectionSide"`;
const flagged = await prisma.untrackedMarket.findMany();

const markets = new Map<string, { sport: string; name: string; tracked: string | null; untracked: string | null; picks: number; open: number }>();
for (const r of rows) {
  const sport = r.sport ?? '';
  const key = `${sport}|${r.marketName}`;
  const m = markets.get(key) ?? { sport, name: r.marketName, tracked: null, untracked: null, picks: 0, open: 0 };
  const game = gameMarket(r.marketName);
  const cls = game ? null : classifyMarket({ sport: r.sport, marketName: r.marketName, selectionSide: r.selectionSide as MarketInput['selectionSide'], line: r.lineRaw === null ? null : r.lineRaw / 1000 });
  if (game) m.tracked = game;
  else if (cls?.supported) m.tracked = cls.metric;
  else m.untracked = cls?.reason ?? null;
  m.picks += Number(r.picks);
  m.open += Number(r.open);
  markets.set(key, m);
}

const day = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(d);
const line = (m: { sport: string; name: string; picks: number; open: number }) => `${m.name}  [${m.sport || 'no sport'}]  ${m.picks} picks${m.open ? `, ${m.open} open` : ''}`;
const all = [...markets.values()].sort((a, b) => b.picks - a.picks);

const untracked = all.filter((m) => m.untracked);
console.log(`\nNot tracked (${untracked.length})`);
for (const m of untracked) {
  const f = flagged.find((x) => x.sport === m.sport && x.marketName === m.name);
  console.log(`  ✗ ${line(m)}  ${m.untracked}${m.tracked ? ` (some sides tracked as ${m.tracked})` : ''}${f ? `  · flagged ${day(f.firstSeenAt)}${f.example ? `, e.g. ${f.example}` : ''}` : ''}`);
}

const tracked = all.filter((m) => !m.untracked);
console.log(`\nTracked (${tracked.length})`);
for (const m of tracked) console.log(`  ✓ ${line(m)}  ${m.tracked}`);

// Flagged once but tracked now: the classifier caught up.
const caughtUp = flagged.filter((f) => !untracked.some((m) => m.sport === f.sport && m.name === f.marketName));
if (caughtUp.length) {
  console.log(`\nFlagged before, tracked now (${caughtUp.length})`);
  for (const f of caughtUp) console.log(`  ✓ ${f.marketName}  [${f.sport || 'no sport'}]  flagged ${day(f.firstSeenAt)}`);
}

await prisma.$disconnect();
