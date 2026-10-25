/**
 * Fills in final stats and scores for settled bets whose picks stopped
 * updating before their game ended. Until 2026-10-23 the poller dropped a bet
 * the moment Island Luck settled it, so a parlay that lost early kept each
 * other pick's mid-game stat. Replays a poll cycle over each past game window,
 * re-reading the final box score. Notifications are not sent.
 *
 *   npm run backfill -w @sports-better/api            # dry run: what would be fetched
 *   npm run backfill -w @sports-better/api -- --apply # fetch and write
 */
import { classifyMarket, gameMarket } from '@sports-better/markets';
import { sportForLeague } from '@sports-better/matching';
import { defaultFetchJson, EspnProvider } from '@sports-better/sports-data';
import { prisma } from '../db';
import { runPollCycle } from '../live/pollCycle';
import { loadEventStates, stateForLeg } from '../views/betsView';

const apply = process.argv.includes('--apply');
// Must match pollCycle's window: games newer than this are still the live poller's.
const MAX_GAME_MS = 6 * 60 * 60_000;
const PREGAME_MS = 15 * 60_000;
// One request every 1.5 s, well under the live poller's budget; a backfill is never urgent.
const GAP_MS = 1500;

const now = new Date();
const legs = await prisma.betLeg.findMany({
  where: { coupon: { status: { not: 'OPEN' } }, eventId: { not: null }, eventStartAt: { lt: new Date(now.getTime() - MAX_GAME_MS) } },
  include: { selections: { include: { progress: true } } },
});
const states = await loadEventStates(prisma, legs.map((l) => l.eventId!));

const FINAL_PROGRESS = new Set(['FINAL_HIT', 'FINAL_MISSED']);
const stale = legs.filter((leg) => {
  if (!sportForLeague(leg.league)) return false; // no provider covers it
  return leg.selections.some((s) => {
    if (gameMarket(s.marketName)) return stateForLeg(states, leg)?.state !== 'FINAL';
    const cls = classifyMarket({ sport: leg.sport, marketName: s.marketName, selectionSide: s.selectionSide, line: s.lineRaw === null ? null : s.lineRaw / 1000 });
    return cls.supported && !FINAL_PROGRESS.has(s.progress?.status ?? '');
  });
});

// Kickoffs grouped into poll windows: one cycle at `kickoff + 6 h` covers every game from that kickoff to 15 min after it.
const kickoffs = [...new Set(stale.map((l) => l.eventStartAt!.getTime()))].sort((a, b) => a - b);
const windows: number[] = [];
// A window is the cycle's `now`; it reaches back 6 h and forward 15 min.
for (const k of kickoffs) if (!windows.length || k > windows.at(-1)! + PREGAME_MS) windows.push(k + MAX_GAME_MS);
const events = new Set(stale.map((l) => l.eventId!));

const TZ = 'America/Nassau';
const day = (t: number) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(t);
console.log(`${events.size} games on settled bets need final stats (${stale.length} bet rows), in ${windows.length} poll windows.`);

if (!apply) {
  for (const w of windows) {
    const inWindow = (t: number) => t >= w - MAX_GAME_MS && t <= w + PREGAME_MS;
    const games = new Set(stale.filter((l) => inWindow(l.eventStartAt!.getTime())).map((l) => l.eventName));
    console.log(`  ${day(w - MAX_GAME_MS)}: ${[...games].join(', ')}`);
  }
  console.log('\nDry run. Add --apply to fetch from ESPN and write.');
} else {
  let last = 0;
  const paced = async (url: string) => {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return defaultFetchJson(url);
  };
  const provider = new EspnProvider(paced);
  let written = 0;
  for (const w of windows) {
    const r = await runPollCycle(prisma, provider, new Date(w), { refetchFinal: events });
    written += r.progressWritten;
    const { scoreboard, summary, roster } = r.requests;
    console.log(`  ${day(w - MAX_GAME_MS)}: ${scoreboard + summary + roster} requests, ${r.progressWritten} progress rows${r.errors.length ? ` · errors: ${r.errors.join('; ')}` : ''}${r.eventsUnmatched.length ? ` · unmatched: ${r.eventsUnmatched.join('; ')}` : ''}`);
  }
  console.log(`\nDone: ${written} progress rows written.`);
}

await prisma.$disconnect();
