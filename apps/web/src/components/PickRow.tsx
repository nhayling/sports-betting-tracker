import type { GameView, PickView } from '../api';
import { binaryWords, marketLabel, metricUnit, UNAVAILABLE_REASONS } from '../format';
import { Icon } from './Icon';

const notStarted = (
  <span className="muted">
    <Icon name="circle" /> Not started
  </span>
);

const KAMBI_PICK: Record<string, { label: string; cls: string }> = {
  WON: { label: 'Won', cls: 'good' },
  LOST: { label: 'Lost', cls: 'bad' },
  VOID: { label: 'Void', cls: 'muted' },
};

/** `live` is false for settled bets: only Island Luck's result is shown then. */
export function PickRow({ pick: p, game, live }: { pick: PickView; game: GameView; live: boolean }) {
  const official = KAMBI_PICK[p.status];
  return (
    <div className="pick">
      <div className="pick-what">
        <span className="pick-name">{p.participantName ?? p.selectionLabel}</span>
        <span className="pick-market muted">{marketLabel(p.marketName, p.selectionLabel, p.selectionSide)}</span>
      </div>
      <div className="pick-progress">
        {live && <Progress pick={p} game={game} />}
        {official && (
          <span className={`official ${official.cls}`} title="Settled by Island Luck">
            Island Luck: {official.label}
          </span>
        )}
      </div>
    </div>
  );
}

function Progress({ pick: p, game }: { pick: PickView; game: GameView }) {
  if (p.type === 'MONEYLINE') return <MoneylineScore pick={p} game={game} />;

  const pr = p.progress;
  if (p.type === 'OTHER') {
    // Markets without live tracking (e.g. new Kambi market types).
    return p.status === 'OPEN' ? <span className="muted small">Progress unavailable</span> : null;
  }
  if (!pr) {
    // The poller hasn't reached this game yet (it starts 15 min before kickoff).
    const upcoming = !game.state || game.state.state === 'SCHEDULED';
    return p.status === 'OPEN' && upcoming ? notStarted : null;
  }
  if (pr.status === 'UNAVAILABLE') {
    return (
      <span className="muted small" title={pr.unavailableReason ?? undefined}>
        Progress unavailable
        {pr.unavailableReason && <span className="block">{UNAVAILABLE_REASONS[pr.unavailableReason] ?? pr.unavailableReason}</span>}
      </span>
    );
  }
  if (pr.status === 'NOT_STARTED') return notStarted;

  const reached = pr.status === 'TARGET_REACHED' || pr.status === 'FINAL_HIT';
  const missed = pr.status === 'FINAL_MISSED' || pr.status === 'TARGET_EXCEEDED';

  if (p.display === 'BINARY') {
    const words = binaryWords(pr.metric);
    if (reached)
      return (
        <span className="good">
          <Icon name="check" /> {words.hit}
        </span>
      );
    if (pr.status === 'FINAL_MISSED')
      return (
        <span className="bad">
          <Icon name="cross" /> {words.missed}
        </span>
      );
    return (
      <span className="muted">
        <Icon name="circle" /> {words.pending}
      </span>
    );
  }

  const current = pr.current ?? 0;
  const over = pr.operator === 'GTE' || pr.operator === 'GT';
  if (!over) {
    // Unders: show how close to going over; no bar.
    return (
      <span className={missed ? 'bad' : ''}>
        {current} {metricUnit(pr.metric)} · under {pr.target}
        {missed && (
          <>
            {' '}
            <Icon name="cross" label="gone over" />
          </>
        )}
      </span>
    );
  }
  const needed = pr.operator === 'GT' ? Math.floor(pr.target ?? 0) + 1 : (pr.target ?? 0);
  const fraction = needed > 0 ? Math.min(current / needed, 1) : 1;
  return (
    <span className="bar-wrap">
      <span className={`bar ${reached ? 'reached' : missed ? 'missed' : ''}`} role="progressbar" aria-valuenow={current} aria-valuemax={needed}>
        <span className="bar-fill" style={{ width: `${fraction * 100}%` }} />
      </span>
      <span className="bar-text">
        <strong>{current}</strong> / {needed} {metricUnit(pr.metric)}
        {reached ? (
          <span className="good">
            {' '}
            <Icon name="check" /> target reached
          </span>
        ) : missed ? (
          <span className="bad">
            {' '}
            <Icon name="cross" label="missed" />
          </span>
        ) : (
          <span className="muted"> · {needed - current} to go</span>
        )}
      </span>
    </span>
  );
}

function MoneylineScore({ pick: p, game }: { pick: PickView; game: GameView }) {
  const st = game.state;
  if (!st || st.state === 'SCHEDULED') return p.status === 'OPEN' ? notStarted : null;
  if (!p.moneylineSide) return null;
  const [us, them] = p.moneylineSide === 'home' ? [st.home, st.away] : [st.away, st.home];
  const [usScore, themScore] = p.moneylineSide === 'home' ? [st.homeScore, st.awayScore] : [st.awayScore, st.homeScore];
  return (
    <span>
      <strong>
        {us.abbreviation} {usScore ?? 0}
      </strong>{' '}
      – {themScore ?? 0} {them.abbreviation}
      {st.state === 'FINAL' && <span className="muted"> (final)</span>}
    </span>
  );
}
