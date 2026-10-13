/**
 * Read-only dry run of live progress for OPEN bets: DB → ESPN → matching →
 * markets. Prints to the terminal and stores nothing. The persistent
 * version (saved mappings, BetLegProgress, poller) builds on the same steps.
 *
 *   npm run progress -w @sports-better/api
 */
import { decimalToAmerican, formatMoney } from '@sports-better/kambi';
import { classifyMarket, evaluateProgress, gameMarket, type Progress } from '@sports-better/markets';
import { matchEvent, matchPlayer, sportForLeague, teamMatches } from '@sports-better/matching';
import { EspnProvider, ProviderError, type EventSnapshot, type EventState, type ProviderEvent, type ProviderPlayer, type Sport } from '@sports-better/sports-data';
import { prisma } from '../db';

const TZ = 'America/Nassau';
const espn = new EspnProvider();

const coupons = await prisma.coupon.findMany({
  where: { status: 'OPEN' },
  orderBy: { placedAt: 'desc' },
  include: { bets: true, legs: { orderBy: { externalRowIndex: 'asc' }, include: { selections: true } } },
});

// ESPN scoreboards are per US Eastern calendar day.
const easternDay = (iso: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(iso);
const eventsBySport = new Map<Sport, ProviderEvent[]>();
for (const sport of ['NFL', 'NCAAF'] as const) {
  const days = [...new Set(coupons.flatMap((c) => c.legs).filter((l) => sportForLeague(l.league) === sport && l.eventStartAt).map((l) => easternDay(l.eventStartAt!)))];
  if (days.length) eventsBySport.set(sport, await espn.listEvents(sport, days));
}

const snapshots = new Map<string, EventSnapshot | Error>();
const rosters = new Map<string, ProviderPlayer[]>();
async function snapshot(sport: Sport, id: string) {
  if (!snapshots.has(id)) snapshots.set(id, await espn.getEventSnapshot(sport, id).catch((e: Error) => e));
  return snapshots.get(id)!;
}
async function roster(sport: Sport, teamId: string) {
  if (!rosters.has(teamId)) rosters.set(teamId, await espn.getRoster(sport, teamId).catch(() => []));
  return rosters.get(teamId)!;
}

const time = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d) : '';
const american = (raw: number | null) => {
  if (!raw || raw <= 1000) return '—';
  const a = decimalToAmerican(raw / 1000);
  return a > 0 ? `+${a}` : String(a);
};
const bar = (f: number) => '█'.repeat(Math.round(f * 12)).padEnd(12, '░');

for (const c of coupons) {
  const bet = c.bets[0]!;
  const picks = c.legs.flatMap((l) => l.selections);
  console.log(`\n${formatMoney(c.totalStakeMinor ?? 0)} · ${american(bet.oddsRaw)} · to pay ${formatMoney(c.potentialPayoutMinor ?? 0)} · ${picks.length} picks · placed ${time(c.placedAt)} · Island Luck: ${c.status}`);

  let hitLive = 0;
  let tracked = 0;
  let settledWon = 0;
  for (const leg of c.legs) {
    const sport = sportForLeague(leg.league);
    let header = `  ${leg.eventName} · ${time(leg.eventStartAt)}`;
    let snap: EventSnapshot | Error | null = null;
    let event: ProviderEvent | null = null;
    if (sport && leg.homeName && leg.awayName && leg.eventStartAt) {
      const m = matchEvent({ sport, homeName: leg.homeName, awayName: leg.awayName, startAt: leg.eventStartAt.toISOString() }, eventsBySport.get(sport) ?? []);
      if (m.ok) {
        event = m.event;
        // Box scores are only needed for player props; the scoreboard already has game state.
        if (leg.selections.some((s) => !gameMarket(s.marketName))) snap = await snapshot(sport, m.event.id);
        header += `\n      ${gameLine(m.event, m.event.state)}`;
      } else header += ` — game not found on ESPN (${m.reason})`;
    } else header += ` — no live data for ${leg.league ?? 'this league'}`;
    console.log(header);

    for (const s of leg.selections) {
      const label = `    ${(s.participantName ?? s.selectionLabel ?? '?').padEnd(22)} ${shortMarket(s.marketName, s.selectionLabel).padEnd(20)}`;
      if (s.status === 'WON') settledWon++;
      const official = s.status !== 'OPEN' ? `  [Island Luck: ${s.status}]` : '';

      if (gameMarket(s.marketName)) {
        console.log(`${label} ${event ? pickScore(sport!, s.participantName, event) : 'Game unavailable'}${official}`);
        continue;
      }

      const cls = classifyMarket({ sport: leg.sport, marketName: s.marketName, selectionSide: s.selectionSide, line: s.lineRaw === null ? null : s.lineRaw / 1000 });
      if (!cls.supported) {
        console.log(`${label} Progress unavailable (${cls.reason.toLowerCase().replaceAll('_', ' ')})${official}`);
        continue;
      }
      if (!snap || snap instanceof Error || !event || !s.participantName) {
        console.log(`${label} Progress unavailable (${snap instanceof Error ? (snap as ProviderError).kind : 'no game data'})${official}`);
        continue;
      }
      const pool = [...snap.players.map((p) => p.player), ...(await roster(sport!, event.home.id)), ...(await roster(sport!, event.away.id))];
      const pm = matchPlayer(s.participantName, pool);
      if (!pm.ok || !pm.autoLink) {
        console.log(`${label} Progress unavailable (player ${pm.ok ? 'needs confirmation' : pm.reason.toLowerCase()})${official}`);
        continue;
      }
      const stats = snap.players.find((p) => p.player.id === pm.player.id)?.stats;
      const live = snap.state.state === 'LIVE' || snap.state.state === 'FINAL';
      // On the roster but no box score line yet during a live game = 0 so far.
      const current = stats?.[cls.metric] ?? (live ? 0 : null);
      const p = evaluateProgress(cls, current, snap.state.state);
      tracked++;
      if (p && (p.status === 'TARGET_REACHED' || p.status === 'FINAL_HIT')) hitLive++;
      console.log(`${label} ${render(cls.display, p)}${official}`);
    }
  }
  const summary = [tracked ? `${hitLive} / ${tracked} picks hit by live stats` : null, settledWon ? `${settledWon} settled WON by Island Luck` : null].filter(Boolean);
  if (summary.length) console.log(`  → ${summary.join(' · ')}`);
}

function gameLine(e: ProviderEvent, st: EventState): string {
  const score = `${e.away.abbreviation} ${st.awayScore ?? 0} – ${st.homeScore ?? 0} ${e.home.abbreviation}`;
  if (st.state === 'SCHEDULED') return `Kicks off ${time(new Date(e.startAt))}`;
  if (st.state === 'FINAL') return `Final · ${score}`;
  if (st.state !== 'LIVE') return st.detail ?? st.state;
  const when = /halftime|end of/i.test(st.detail ?? '') ? st.detail : `${quarter(st.period)} ${st.clock ?? ''}`.trim();
  const parts = [when, score];
  const sit = st.situation;
  if (sit?.possessionTeamId) {
    const team = sit.possessionTeamId === e.home.id ? e.home.abbreviation : sit.possessionTeamId === e.away.id ? e.away.abbreviation : '?';
    parts.push(`🏈 ${team} ball${sit.downDistance ? `, ${sit.downDistance}` : ''}${sit.redZone ? ' · RED ZONE' : ''}`);
  }
  return parts.join(' · ');
}

function quarter(p: number | null): string {
  if (!p) return '';
  return p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`;
}

/** Moneyline: the score from the picked team's side, no verdict. */
function pickScore(sport: Sport, team: string | null, e: ProviderEvent): string {
  const st = e.state;
  if (st.state === 'SCHEDULED') return '○ Not started';
  const home = team ? teamMatches(sport, team, e.home) : false;
  const away = team ? teamMatches(sport, team, e.away) : false;
  if (home === away) return 'Pick not matched to a team';
  const [us, them] = home ? [e.home, e.away] : [e.away, e.home];
  const [usScore, themScore] = home ? [st.homeScore, st.awayScore] : [st.awayScore, st.homeScore];
  return `${us.abbreviation} ${usScore ?? 0} – ${themScore ?? 0} ${them.abbreviation}${st.state === 'FINAL' ? ' (final)' : ''}`;
}

function render(display: 'PROGRESS' | 'BINARY', p: Progress | null): string {
  if (!p) return 'Progress unavailable';
  if (p.status === 'NOT_STARTED') return '○ Not started';
  if (display === 'BINARY') {
    if (p.status === 'TARGET_REACHED' || p.status === 'FINAL_HIT') return '✓ Scored';
    return p.status === 'FINAL_MISSED' ? '✗ Did not score' : '○ Not yet';
  }
  if (p.fraction === null) {
    return `${p.current} (under ${p.target})${p.status === 'TARGET_EXCEEDED' ? ' ✗ over' : ''}`;
  }
  const tail = p.status === 'TARGET_REACHED' || p.status === 'FINAL_HIT' ? '✓ target reached' : `${p.remaining} to go`;
  return `${bar(p.fraction)} ${p.current} / ${p.needed} · ${tail}`;
}

function shortMarket(market: string | null, label: string | null): string {
  if (!market) return '';
  if (/^Touchdown Scorer$/i.test(market)) return 'Anytime TD';
  const plus = /^(\d+\+) (.+?) By The Player/i.exec(market);
  if (plus) return `${plus[1]} ${plus[2]!.toLowerCase()}`;
  const total = /^Total (.+?) by the Player/i.exec(market);
  if (total) return `${/ - (Over|Under) ([\d.]+)$/.exec(label ?? '')?.slice(1).join(" ") ?? ""} ${total[1]!.toLowerCase()}`.trim();
  return market;
}

await prisma.$disconnect();
