import { americanOdds, marketLabel, metricUnit, money, quarter } from '@sports-better/display';
import type { BetsView, CouponView, GameView, PickView } from '../views/betsViewTypes';

/**
 * Turns the current bets view into notification events. Pure: the caller
 * stores them with a unique dedupe key, so each event fires once even though
 * this runs every poll cycle.
 *
 * Events (chosen 2026-09-27):
 *  - PICK_HIT: a pick reaches its target by live stats (or a moneyline team wins).
 *  - PICK_MISSED: a game ends without the pick being met.
 *  - PROBABLY_SETTLED: every game in an open bet is over but Island Luck still shows it open.
 * All of these are live-stats suggestions; none changes Kambi settlement.
 */

export type NotificationKind = 'PICK_HIT' | 'PICK_MISSED' | 'PROBABLY_SETTLED';

export interface NotificationEvent {
  kind: NotificationKind;
  dedupeKey: string;
  couponId: string;
  legSelectionId: string | null;
  title: string;
  body: string;
}

export function notificationEvents(view: BetsView): NotificationEvent[] {
  const events: NotificationEvent[] = [];
  for (const c of view.coupons) {
    if (c.status !== 'OPEN') continue;
    for (const g of c.games) {
      for (const p of g.picks) {
        // Already settled by Island Luck: nothing new to say.
        if (p.status !== 'OPEN') continue;
        const outcome = p.type === 'MONEYLINE' ? moneylineOutcome(p, g) : statOutcome(p);
        if (!outcome) continue;
        events.push({
          kind: outcome,
          dedupeKey: `${outcome}:${p.id}`,
          couponId: c.id,
          legSelectionId: p.id,
          ...text(outcome, p, g, c),
        });
      }
    }
    if (c.probablySettled) {
      events.push({
        kind: 'PROBABLY_SETTLED',
        dedupeKey: `PROBABLY_SETTLED:${c.id}`,
        couponId: c.id,
        legSelectionId: null,
        title: `All games over: ${money(c.stakeMinor)} ${americanOdds(c.oddsRaw)} bet`,
        body: 'Island Luck still shows it open. Open My Bets on Island Luck to sync the result.',
      });
    }
  }
  return events;
}

function statOutcome(p: PickView): 'PICK_HIT' | 'PICK_MISSED' | null {
  if (p.type !== 'STAT' || !p.progress) return null;
  if (p.progress.status === 'TARGET_REACHED' || p.progress.status === 'FINAL_HIT') return 'PICK_HIT';
  if (p.progress.status === 'FINAL_MISSED') return 'PICK_MISSED';
  return null;
}

function moneylineOutcome(p: PickView, g: GameView): 'PICK_HIT' | 'PICK_MISSED' | null {
  const st = g.state;
  if (!st || st.state !== 'FINAL' || !p.moneylineSide || st.homeScore === null || st.awayScore === null) return null;
  if (st.homeScore === st.awayScore) return null;
  const homeWon = st.homeScore > st.awayScore;
  return (p.moneylineSide === 'home') === homeWon ? 'PICK_HIT' : 'PICK_MISSED';
}

function text(kind: 'PICK_HIT' | 'PICK_MISSED', p: PickView, g: GameView, c: CouponView): { title: string; body: string } {
  const who = p.participantName ?? p.selectionLabel ?? 'Pick';
  const market = marketLabel(p.marketName, p.selectionLabel, p.selectionSide);
  const st = g.state;
  const score = st ? `${st.away.abbreviation} ${st.awayScore ?? 0} – ${st.homeScore ?? 0} ${st.home.abbreviation}` : (g.name ?? '');
  const when = st?.state === 'FINAL' ? 'Final' : st ? `${quarter(st.period)} ${st.clock ?? ''}`.trim() : '';
  const bet = `${money(c.stakeMinor)} ${americanOdds(c.oddsRaw)} bet`;

  if (p.type === 'MONEYLINE') {
    return {
      title: kind === 'PICK_HIT' ? `✓ ${who} won` : `✗ ${who} lost`,
      body: `Moneyline · Final ${score} · ${bet}`,
    };
  }
  const pr = p.progress!;
  if (p.display === 'BINARY' && pr.metric === 'SACKS') {
    return {
      title: kind === 'PICK_HIT' ? `✓ ${who} got a sack` : `✗ ${who} had no sack`,
      body: `${market} · ${when} ${score} · ${bet}`,
    };
  }
  if (p.display === 'BINARY') {
    return {
      title: kind === 'PICK_HIT' ? `✓ ${who} scored a TD` : `✗ ${who} didn't score`,
      body: `${market} · ${when} ${score} · ${bet}`,
    };
  }
  const needed = pr.operator === 'GT' ? Math.floor(pr.target ?? 0) + 1 : pr.target;
  const value = `${pr.current ?? 0} / ${needed} ${metricUnit(pr.metric)}`.trim();
  return {
    title: kind === 'PICK_HIT' ? `✓ ${who}: ${market}` : `✗ ${who}: ${market}`,
    body: `${value} · ${when} ${score} · ${bet}`,
  };
}
