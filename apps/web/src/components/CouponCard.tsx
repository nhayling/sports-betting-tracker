import type { KeyboardEvent } from 'react';
import type { CouponView, PickView } from '../api';
import { useCollapsed } from '../collapsed';
import { americanOdds, dateTime, money, REWARD_LABELS } from '../format';
import { GameBlock } from './GameBlock';
import { Icon } from './Icon';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  WON: 'Won',
  LOST: 'Lost',
  VOID: 'Void',
  CASHED_OUT: 'Cashed out',
  MIXED: 'Mixed',
  UNKNOWN: 'Unknown',
};
const STATUS_PLATE: Record<string, string> = { WON: 'hit', LOST: 'miss', CASHED_OUT: 'run' };

/** A pick that can no longer hit: settled lost, or past its line by live stats. */
const pickMissed = (p: PickView) => p.status === 'LOST' || p.progress?.status === 'FINAL_MISSED' || p.progress?.status === 'TARGET_EXCEEDED';

/**
 * `minBetMinor`: someone else's bet whose owner doesn't share amounts. Its money
 * is what the bet pays at that minimum stake, so the card leaves the stake out
 * and says what the figures are based on.
 */
export function CouponCard({ coupon: c, minBetMinor }: { coupon: CouponView; minBetMinor?: number }) {
  const picks = c.pickCount === 1 ? '1 pick' : `${c.pickCount} picks`;
  const games = c.games.length === 1 ? '1 game' : `${c.games.length} games`;
  const [collapsed, toggle] = useCollapsed(c.id);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };
  const gamesId = `games-${c.id}`;
  const open = c.status === 'OPEN';
  // From live stats, while Island Luck still has the bet open.
  const missed = open ? c.games.reduce((n, g) => n + g.picks.filter(pickMissed).length, 0) : 0;
  const tracking = open && c.pickCount > 1 && c.picksHit + missed > 0;

  return (
    <article className={`bet status-${c.status.toLowerCase()} ${collapsed ? 'collapsed' : ''}`}>
      <header
        className="bet-head"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-controls={gamesId}
        onClick={toggle}
        onKeyDown={onKey}
        title={collapsed ? 'Show picks' : 'Hide picks'}
      >
        <div>
          <div className="bet-title">
            {tracking ? (
              <span title="From live stats. Island Luck settles the bet.">
                {c.picksHit} of {c.pickCount} picks hit
                {missed > 0 && <span className="miss-count"> · {missed} missed</span>}
              </span>
            ) : (
              c.pickCount > 0 && <span>{picks}</span>
            )}
            {c.rewardType && <span className="chip">{REWARD_LABELS[c.rewardType] ?? c.rewardType}</span>}
          </div>
          <div className="bet-meta">
            <span className="chevron">
              <Icon name="chevron" />
            </span>{' '}
            Placed {dateTime(c.placedAt)}
            {collapsed && c.games.length > 0 && ` · ${games}`}
          </div>
        </div>
        <div className="bet-result">
          {!open && (
            <span className={`plate small-plate ${STATUS_PLATE[c.status] ?? 'hollow'}`} title="Official status from Island Luck">
              {STATUS_LABEL[c.status] ?? c.status}
            </span>
          )}
          <span className="odds">{americanOdds(c.oddsRaw)}</span>
        </div>
      </header>

      {c.probablySettled && (
        <div className="settle-nudge" title="Island Luck hasn't settled this yet in the tracker. Open My Bets on Island Luck so the extension can sync it.">
          {c.probablySettled === 'ALL_GAMES_FINAL' ? 'All games are final' : 'All games should be over'} · open My Bets on Island Luck to update
        </div>
      )}

      <div className="games" id={gamesId} hidden={collapsed}>
        {c.games.map((g) => (
          <GameBlock key={g.eventId ?? g.name} game={g} couponOpen={open} />
        ))}
      </div>

      <footer className="bet-foot">
        {minBetMinor === undefined && <span>Stake {money(c.stakeMinor)}</span>}
        <Payout coupon={c} minBetMinor={minBetMinor} />
      </footer>
    </article>
  );
}

function Payout({ coupon: c, minBetMinor }: { coupon: CouponView; minBetMinor?: number }) {
  // Not the owner's real money: every figure is for a minimum bet, and each card says so.
  const basis = minBetMinor === undefined ? null : <span className="muted small block min-bet">on a {money(minBetMinor).replace(/\.00$/, '')} minimum bet</span>;
  switch (c.status) {
    case 'OPEN':
      return (
        <span className="payout">
          To pay {money(c.potentialPayoutMinor)}
          {basis}
        </span>
      );
    case 'WON':
      return (
        <span className="payout good">
          Paid {money(c.payoutMinor)}
          {basis}
        </span>
      );
    case 'CASHED_OUT':
      return (
        <span className="payout">
          Cashed out {money(c.payoutMinor)}
          <span className="muted small block">of a possible {money(c.potentialPayoutMinor)}</span>
          {basis}
        </span>
      );
    case 'LOST':
      return (
        <span className="payout muted">
          Would have paid {money(c.potentialPayoutMinor)}
          {basis}
        </span>
      );
    default:
      return c.payoutMinor ? (
        <span className="payout">
          Paid {money(c.payoutMinor)}
          {basis}
        </span>
      ) : null;
  }
}
