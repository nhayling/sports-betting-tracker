import type { CSSProperties, ReactNode } from 'react';
import type { GameView, PickView } from '../api';
import { binaryWords, marketLabel, metricUnit, UNAVAILABLE_REASONS } from '../format';
import { Icon } from './Icon';

type Tone = 'hit' | 'run' | 'miss' | 'hollow' | '';

const KAMBI_PICK: Record<string, { label: string; cls: string; tone: Tone; icon?: 'check' | 'cross' }> = {
  WON: { label: 'Won', cls: 'good', tone: 'hit', icon: 'check' },
  LOST: { label: 'Lost', cls: 'bad', tone: 'miss', icon: 'cross' },
  VOID: { label: 'Void', cls: 'muted', tone: 'hollow' },
};

/** The state at the end of a pick row. Keyed by its text, so a new value wipes in. */
function Plate({ tone = '', text, icon }: { tone?: Tone; text: string; icon?: 'check' | 'cross' }) {
  return (
    <span key={`${tone}:${text}`} className={`plate ${tone}`}>
      {icon && <Icon name={icon} />}
      {text}
    </span>
  );
}

const notStarted = <Plate tone="hollow" text="Not started" />;
const noStats = <Plate tone="hollow" text="No stats" />;
const note = (children: ReactNode, title?: string) => (
  <span className="pick-note" title={title}>
    {children}
  </span>
);

/** `live` is false for settled bets: only Island Luck's result is shown then. */
export function PickRow({ pick: p, game, live }: { pick: PickView; game: GameView; live: boolean }) {
  const official = KAMBI_PICK[p.status];
  return (
    <div className="pick">
      <div className="pick-what">
        <span className="pick-name">{p.participantName ?? p.selectionLabel}</span>
        <span className="pick-market">{marketLabel(p.marketName, p.selectionLabel, p.selectionSide)}</span>
      </div>
      <div className="pick-state">
        {live && <Progress pick={p} game={game} />}
        {official &&
          (live ? (
            <span className={`official ${official.cls}`} title="Settled by Island Luck">
              Island Luck: {official.label}
            </span>
          ) : (
            <>
              <Plate tone={official.tone} icon={official.icon} text={official.label} />
              {note('Settled by Island Luck')}
            </>
          ))}
      </div>
    </div>
  );
}

function Progress({ pick: p, game }: { pick: PickView; game: GameView }) {
  if (p.type === 'MONEYLINE') return <MoneylineScore pick={p} game={game} />;

  const pr = p.progress;
  if (p.type === 'OTHER') {
    // Markets without live tracking (e.g. new Kambi market types).
    return p.status === 'OPEN' ? (
      <>
        {noStats}
        {note('Progress unavailable')}
      </>
    ) : null;
  }
  if (!pr) {
    // The poller hasn't reached this game yet (it starts 15 min before kickoff).
    const upcoming = !game.state || game.state.state === 'SCHEDULED';
    return p.status === 'OPEN' && upcoming ? notStarted : null;
  }
  if (pr.status === 'UNAVAILABLE') {
    return (
      <>
        {noStats}
        {note(pr.unavailableReason ? (UNAVAILABLE_REASONS[pr.unavailableReason] ?? pr.unavailableReason) : 'Progress unavailable', pr.unavailableReason ?? undefined)}
      </>
    );
  }
  if (pr.status === 'NOT_STARTED') return notStarted;

  const reached = pr.status === 'TARGET_REACHED' || pr.status === 'FINAL_HIT';
  const missed = pr.status === 'FINAL_MISSED' || pr.status === 'TARGET_EXCEEDED';

  if (p.display === 'BINARY') {
    const words = binaryWords(pr.metric);
    if (reached) return <Plate tone="hit" icon="check" text={words.hit} />;
    if (pr.status === 'FINAL_MISSED') return <Plate tone="miss" icon="cross" text={words.missed} />;
    return <Plate text={words.pending} />;
  }

  const current = pr.current ?? 0;
  const unit = metricUnit(pr.metric);
  const over = pr.operator === 'GTE' || pr.operator === 'GT';
  if (!over) {
    // Unders: show how close to going over; no bar.
    return (
      <>
        <Plate tone={missed ? 'miss' : 'run'} icon={missed ? 'cross' : undefined} text={String(current)} />
        {note(
          <>
            {unit} · under {pr.target}
            {missed && ' · gone over'}
          </>,
        )}
      </>
    );
  }
  const needed = pr.operator === 'GT' ? Math.floor(pr.target ?? 0) + 1 : (pr.target ?? 0);
  const fraction = needed > 0 ? Math.min(current / needed, 1) : 1;
  return (
    <>
      {reached || missed ? (
        <Plate tone={reached ? 'hit' : 'miss'} icon={reached ? 'check' : 'cross'} text={`${current} / ${needed}`} />
      ) : (
        <span
          key={current}
          className="plate run fill"
          style={{ '--at': `${fraction * 100}%` } as CSSProperties}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemax={needed}
          aria-valuetext={`${current} of ${needed} ${unit}`}
        >
          {current} / {needed}
        </span>
      )}
      {note(
        <>
          {unit}
          {reached ? ' · target reached' : missed ? ' · missed' : ` · ${needed - current} to go`}
        </>,
      )}
    </>
  );
}

function MoneylineScore({ pick: p, game }: { pick: PickView; game: GameView }) {
  const st = game.state;
  if (!st || st.state === 'SCHEDULED') return p.status === 'OPEN' ? notStarted : null;
  if (!p.moneylineSide) return null;
  const [us, them] = p.moneylineSide === 'home' ? [st.home, st.away] : [st.away, st.home];
  const [usScore, themScore] = p.moneylineSide === 'home' ? [st.homeScore ?? 0, st.awayScore ?? 0] : [st.awayScore ?? 0, st.homeScore ?? 0];
  const margin = usScore - themScore;
  const final = st.state === 'FINAL';
  const text = margin === 0 ? 'Tied' : final ? (margin > 0 ? `Won by ${margin}` : `Lost by ${-margin}`) : margin > 0 ? `Up ${margin}` : `Down ${-margin}`;
  // Yellow is kept for measured progress; a lead is only a lead until the final whistle.
  const tone: Tone = !final || margin === 0 ? '' : margin > 0 ? 'hit' : 'miss';
  return (
    <>
      <Plate tone={tone} text={text} />
      {note(
        <>
          {us.abbreviation} {usScore} – {themScore} {them.abbreviation}
          {final && ' (final)'}
        </>,
      )}
    </>
  );
}
