import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { CouponView, GameView, NotificationItem, PickView } from '../api';
import { betStanding, pickState, type BetState, type PickState } from '../betState';
import { useCollapsed } from '../collapsed';
import { americanOdds, dateTime, money, relativeTime, REWARD_LABELS } from '../format';
import { Icon } from './Icon';
import { PickRow } from './PickRow';

const STATUS_LABEL: Record<string, string> = {
  WON: 'Won',
  LOST: 'Lost',
  VOID: 'Void',
  CASHED_OUT: 'Cashed out',
  MIXED: 'Mixed',
  UNKNOWN: 'Unknown',
};
const STATUS_PLATE: Record<string, string> = { WON: 'hit', LOST: 'miss', CASHED_OUT: 'run' };

/** An open bet's standing by live stats: the plate's look and words. */
const STANDING: Record<BetState, { tone: string; label: (left: number) => string }> = {
  'needs-one': { tone: 'run', label: () => 'Needs one' },
  risk: { tone: 'risk', label: () => 'At risk' },
  alive: { tone: '', label: (left) => `${left} to go` },
  'all-hit': { tone: 'hit', label: () => 'All hit' },
  unsynced: { tone: 'sync', label: () => 'Needs sync' },
  waiting: { tone: 'hollow', label: () => 'Not started' },
  dead: { tone: 'miss', label: () => 'Dead' },
};
const CELL: Record<PickState, string> = { hit: 'hit', reached: 'hold', missed: 'miss', risk: 'risk', running: 'run', waiting: 'wait', void: 'wait' };
/** Cells read left to right like the bet filling up: what has hit, what is on its way, what is in trouble. */
const CELL_ORDER: PickState[] = ['hit', 'reached', 'running', 'waiting', 'void', 'risk', 'missed'];

/** How far a running over has got, 0 to 1; a full cell for everything else. */
function fraction(p: PickView): number {
  const pr = p.progress;
  if (!pr || pr.status !== 'IN_PROGRESS' || !(pr.operator === 'GTE' || pr.operator === 'GT') || !pr.target) return 1;
  const needed = pr.operator === 'GT' ? Math.floor(pr.target) + 1 : pr.target;
  return Math.min((pr.current ?? 0) / needed, 1);
}

/** Keeps a time on one line. */
const nb = (s: string) => s.replace(/ /g, '\u00a0');

type Row = { pick: PickView; game: GameView; state: PickState };
/** A pick, or a same-game bet builder: Kambi prices and settles a builder's picks as one. */
type Unit = { key: string; rows: Row[]; group: number | null; state: PickState };

/** Picks in the order the open list asks for them, so a builder's own picks read the same way. */
const ROW_ORDER: PickState[] = ['missed', 'risk', 'running', 'reached', 'waiting', 'hit', 'void'];
/** A builder's state: any miss sinks it, it runs while any pick does, and it's done only when every pick is. */
const GROUP_ORDER: PickState[] = ['missed', 'risk', 'running', 'waiting', 'reached', 'hit', 'void'];

function units(rows: Row[]): Unit[] {
  const out: Unit[] = [];
  for (const r of rows) {
    const g = r.pick.betBuilderGroup;
    const u = g === null ? undefined : out.find((u) => u.group === g);
    if (u) u.rows.push(r);
    else out.push({ key: r.pick.id, rows: [r], group: g, state: r.state });
  }
  for (const u of out) {
    if (u.rows.length === 1) u.group = null;
    u.state = GROUP_ORDER.find((s) => u.rows.some((r) => r.state === s)) ?? u.state;
    u.rows.sort((a, b) => ROW_ORDER.indexOf(a.state) - ROW_ORDER.indexOf(b.state));
  }
  return out;
}

/**
 * `minBetMinor`: someone else's bet whose owner doesn't share amounts. Its money
 * is what the bet pays at that minimum stake, so the card leaves the stake out
 * and says what the figures are based on.
 * `latest`: the newest hit or miss on this bet, for its head line.
 * `fresh`: that change happened since you last left the app, so the line is marked.
 */
export function CouponCard({ coupon: c, minBetMinor, latest, fresh = false }: { coupon: CouponView; minBetMinor?: number; latest?: NotificationItem; fresh?: boolean }) {
  const open = c.status === 'OPEN';
  const standing = betStanding(c);
  const dead = open && standing.state === 'dead';
  // A dead bet starts folded; its own key keeps that apart from a bet you folded yourself.
  const [toggled, toggle] = useCollapsed(dead ? `${c.id}:dead` : c.id);
  const collapsed = dead ? !toggled : toggled;
  const [showHit, setShowHit] = useState(false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };
  const picksId = `picks-${c.id}`;

  const rows: Row[] = c.games.flatMap((game) => game.picks.map((pick) => ({ pick, game, state: pickState(pick, game) })));
  const all = units(rows);
  // In the order asked for, so the reason a bet is at risk is its first row.
  const of = (...states: PickState[]) => states.flatMap((s) => all.filter((u) => u.state === s));
  const hit = of('hit');
  // Each price on the card is one thing the bet needs; a bet with one has it in the head already.
  const priced = all.length > 1;
  const row = (r: Row, odds: number | null) => <PickRow key={r.pick.id} pick={r.pick} game={r.game} live={open} state={r.state} odds={odds} />;
  const list = (us: Unit[]) =>
    us.map((u) =>
      u.group === null ? (
        row(u.rows[0]!, priced ? u.rows[0]!.pick.oddsRaw : null)
      ) : (
        <section key={u.key} className="sgp" aria-label={`Same game parlay, ${u.rows.length} picks`}>
          <div className="sgp-head">
            <span>Same game parlay</span>
            {priced && u.rows[0]!.pick.oddsRaw && <span className="pick-odds">{americanOdds(u.rows[0]!.pick.oddsRaw)}</span>}
          </div>
          {u.rows.map((r) => row(r, null))}
        </section>
      ),
    );
  const pickName = (r: Row) => r.pick.participantName ?? r.pick.selectionLabel;
  // Soccer leagues come with their country ("England / Premier League"); the header shows the league.
  const leagues = [...new Set(c.games.map((g) => g.league?.split(' / ').at(-1)).filter(Boolean))].join(' + ');
  const plate = open ? STANDING[standing.state] : null;
  const over = c.probablySettled === 'ALL_GAMES_FINAL' ? 'All games are final' : 'All games should be over';

  return (
    <article id={`bet-${c.id}`} className={`bet status-${c.status.toLowerCase()} ${collapsed ? 'collapsed' : ''}`}>
      <header className="bet-head" role="button" tabIndex={0} aria-expanded={!collapsed} aria-controls={picksId} onClick={toggle} onKeyDown={onKey}>
        {plate ? (
          <span key={standing.state} className={`plate small-plate ${plate.tone}`}>
            {plate.label(standing.left)}
          </span>
        ) : (
          <span className={`plate small-plate ${STATUS_PLATE[c.status] ?? 'hollow'}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
        )}
        <div className="bet-main">
          <div className="bet-title">
            <span>{open && standing.counted > 1 ? `${standing.hit} of ${standing.counted} hit` : c.pickCount === 1 ? '1 pick' : `${c.pickCount} picks`}</span>
            {c.rewardType && <span className="chip">{REWARD_LABELS[c.rewardType] ?? c.rewardType}</span>}
          </div>
          <div className={open && latest && fresh ? 'bet-meta fresh' : 'bet-meta'}>
            <span className="chevron">
              <Icon name="chevron" />
            </span>{' '}
            {open && latest && fresh && <span className="sr-only">New since your last visit. </span>}
            {open && latest ? `Latest: ${latest.title}, ${nb(relativeTime(latest.createdAt))}` : [leagues, nb(dateTime(c.placedAt))].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className="odds">{americanOdds(c.oddsRaw)}</span>
      </header>

      {/* One cell per pick, so a folded bet still shows where it stands. */}
      {rows.length > 1 && (
        <div className="cells" aria-hidden>
          {CELL_ORDER.flatMap((s) => rows.filter((r) => r.state === s)).map((r) => (
            <i key={r.pick.id} className={CELL[r.state]} style={r.state === 'running' ? ({ '--at': `${fraction(r.pick) * 100}%` } as CSSProperties) : undefined} />
          ))}
        </div>
      )}

      {c.probablySettled && (
        <div className="settle-nudge">
          {/* "Needs sync" names an undecided bet's standing; a bet already dead or all hit keeps its own and gets plain words. */}
          {standing.state === 'unsynced' ? `Needs sync: ${over.toLowerCase()}` : over}. Open My Bets on{' '}
          <a href="https://islandluck.com/" target="_blank" rel="noreferrer">
            Island Luck
          </a>{' '}
          to {standing.state === 'unsynced' ? 'update' : 'settle'} this bet.
        </div>
      )}
      {open && (standing.state === 'dead' || standing.state === 'all-hit') && !c.probablySettled && (
        <div className="bet-basis">From live stats. Island Luck settles the bet.</div>
      )}

      <div id={picksId} hidden={collapsed}>
        {open ? (
          <>
            {of('missed').length > 0 && <h3 className="picks-label">Missed</h3>}
            {list(of('missed'))}
            {/* Once every game is over, what's left is Island Luck's result, not more play. */}
            {of('risk', 'running', 'reached', 'waiting').length > 0 && <h3 className="picks-label">{standing.state === 'unsynced' ? 'Waiting on Island Luck' : 'Still needs'}</h3>}
            {list(of('risk', 'running', 'reached', 'waiting'))}
            {hit.length > 0 && (
              <>
                <button className="hit-fold" aria-expanded={showHit} onClick={() => setShowHit(!showHit)}>
                  <span className="chevron">
                    <Icon name="chevron" />
                  </span>
                  <span>
                    <strong>{hit.flatMap((u) => u.rows).length} hit:</strong> {hit.map((u) => u.rows.map(pickName).join(' + ')).join(' · ')}
                  </span>
                </button>
                {showHit && list(hit)}
              </>
            )}
            {list(of('void'))}
          </>
        ) : (
          list(all)
        )}
      </div>

      <footer className="bet-foot">
        {minBetMinor === undefined && <span>Stake {money(c.stakeMinor)}</span>}
        <Payout coupon={c} minBetMinor={minBetMinor} dead={dead} />
      </footer>
    </article>
  );
}

function Payout({ coupon: c, minBetMinor, dead }: { coupon: CouponView; minBetMinor?: number; dead: boolean }) {
  // Not the owner's real money: every figure is for a minimum bet, and each card says so.
  const basis = minBetMinor === undefined ? null : <span className="muted small block min-bet">on a {money(minBetMinor).replace(/\.00$/, '')} minimum bet</span>;
  switch (c.status) {
    case 'OPEN':
      return (
        <span className={dead ? 'payout muted' : 'payout'}>
          {dead ? 'Would have paid' : 'To pay'} {money(c.potentialPayoutMinor)}
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
