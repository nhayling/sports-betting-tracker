import type { CSSProperties, ReactNode } from 'react';
import type { GameView, PickView } from '../api';
import type { PickState } from '../betState';
import { binaryWords, dateTime, gameMargin, marketLabel, metricUnit, quarter, UNAVAILABLE_REASONS } from '../format';
import { Icon } from './Icon';

type Tone = 'hit' | 'hold' | 'run' | 'miss' | 'risk' | 'hollow' | '';

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

/**
 * How far an under has gone over: "6.5 over". No plus sign, which would read as a spread line;
 * a strict under passed at the line itself has no margin to show.
 */
const overBy = (current: number, line: number) => {
  const by = Number((current - line).toFixed(1));
  return by > 0 ? `${by} over` : 'Over';
};

/** Joins what there is to say; a stat with no unit name leaves no stray separator. */
const parts = (...bits: string[]) => bits.filter(Boolean).join(' · ');

/** The pick's game in one line: the score and clock once it has started, the kickoff before. */
function gameLine(game: GameView): string {
  const st = game.state;
  const scored = st && (st.state === 'LIVE' || st.state === 'FINAL');
  if (!st || !scored) {
    if (st && st.state !== 'SCHEDULED') return `${game.name ?? ''} · ${st.detail ?? st.state}`;
    const started = !st && game.startAt && Date.parse(game.startAt) < Date.now();
    return `${game.name ?? ''} · ${started ? '' : 'kicks off '}${dateTime(game.startAt)}`;
  }
  const score = `${st.away.abbreviation ?? game.awayName} ${st.awayScore ?? 0} – ${st.homeScore ?? 0} ${st.home.abbreviation ?? game.homeName}`;
  if (st.state === 'FINAL') return `${score} · final`;
  const when = /halftime|end of/i.test(st.detail ?? '') ? st.detail : `${quarter(st.period)} ${st.clock ?? ''}`.trim();
  return `${score} · ${when}`;
}

/** `live` is false for settled bets: only Island Luck's result is shown then. */
export function PickRow({ pick: p, game, live, state }: { pick: PickView; game: GameView; live: boolean; state: PickState }) {
  const official = KAMBI_PICK[p.status];
  return (
    <div className={`pick pick-${state}`}>
      <div className="pick-what">
        <span className="pick-name">{p.participantName ?? p.selectionLabel}</span>
        <span className="pick-market">{marketLabel(p.marketName, p.selectionLabel, p.selectionSide)}</span>
        <span className="pick-game">
          {game.state?.state === 'LIVE' && <span className="live-dot" aria-hidden />}
          {gameLine(game)}
        </span>
      </div>
      <div className="pick-state">
        {live && <Progress pick={p} game={game} state={state} />}
        {official &&
          (live ? (
            <span className={`official ${official.cls}`}>Island Luck: {official.label}</span>
          ) : (
            <Plate tone={official.tone} icon={official.icon} text={official.label} />
          ))}
      </div>
    </div>
  );
}

function Progress({ pick: p, game, state }: { pick: PickView; game: GameView; state: PickState }) {
  if (p.type === 'MONEYLINE') return <MoneylineScore pick={p} game={game} />;
  if (p.type === 'SPREAD') return <SpreadScore pick={p} game={game} />;
  if (p.type === 'TOTAL') return <TotalScore pick={p} game={game} />;

  const pr = p.progress;
  if (p.type === 'OTHER') {
    // Markets without live tracking (e.g. new Kambi market types).
    return p.status === 'OPEN' ? (
      <>
        {noStats}
        {note('Market not tracked')}
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
        {note(pr.unavailableReason ? (UNAVAILABLE_REASONS[pr.unavailableReason] ?? pr.unavailableReason) : 'Progress unavailable')}
      </>
    );
  }
  if (pr.status === 'NOT_STARTED') return notStarted;

  const reached = pr.status === 'TARGET_REACHED' || pr.status === 'FINAL_HIT';
  const missed = pr.status === 'FINAL_MISSED';
  // Past the line mid-game. The stat can still come back, so it is not a miss yet.
  const atRisk = pr.status === 'TARGET_EXCEEDED';

  if (p.display === 'BINARY') {
    const words = binaryWords(pr.metric);
    if (reached) return <Plate tone="hit" icon="check" text={words.hit} />;
    if (missed) return <Plate tone="miss" icon="cross" text={words.missed} />;
    return <Plate text={words.pending} />;
  }

  const current = pr.current ?? 0;
  const unit = metricUnit(pr.metric);
  const over = pr.operator === 'GTE' || pr.operator === 'GT';
  if (!over) {
    // Unders: show how close to going over; no fill.
    return (
      <>
        {/* Over the line: the plate says by how much, the note keeps the raw stat. */}
        <Plate
          tone={missed ? 'miss' : atRisk ? 'risk' : reached ? 'hit' : 'run'}
          icon={missed ? 'cross' : reached ? 'check' : undefined}
          text={atRisk ? overBy(current, pr.target ?? 0) : String(current)}
        />
        {note(atRisk ? parts(`${current} ${unit}`.trim(), `under ${pr.target}`, 'over for now') : parts(unit, `under ${pr.target}`, missed ? 'went over' : ''))}
      </>
    );
  }
  // Reached mid-game on a stat that can still drop back under the line.
  const holding = state === 'reached';
  const needed = pr.operator === 'GT' ? Math.floor(pr.target ?? 0) + 1 : (pr.target ?? 0);
  const fraction = needed > 0 ? Math.min(current / needed, 1) : 1;
  return (
    <>
      {reached || missed ? (
        <Plate tone={reached ? (holding ? 'hold' : 'hit') : 'miss'} icon={reached ? 'check' : 'cross'} text={`${current} / ${needed}`} />
      ) : (
        <span
          key={current}
          className="plate run fill"
          style={{ '--at': `${fraction * 100}%` } as CSSProperties}
          role="progressbar"
          aria-label={`${p.participantName ?? p.selectionLabel ?? ''} ${unit}`}
          aria-valuenow={current}
          aria-valuemax={needed}
          aria-valuetext={`${current} of ${needed} ${unit}`}
        >
          {current} / {needed}
        </span>
      )}
      {note(parts(unit, reached ? (holding ? 'there for now' : 'target reached') : missed ? 'fell short' : `${needed - current} to go`))}
    </>
  );
}

function MoneylineScore({ pick: p, game }: { pick: PickView; game: GameView }) {
  const st = game.state;
  if (!st || st.state === 'SCHEDULED') return p.status === 'OPEN' ? notStarted : null;
  if (!p.moneylineSide) return null;
  const sign = p.moneylineSide === 'home' ? 1 : -1;
  const margin = sign * ((st.homeScore ?? 0) - (st.awayScore ?? 0));
  const final = st.state === 'FINAL';
  const text = margin === 0 ? 'Tied' : final ? (margin > 0 ? `Won by ${margin}` : `Lost by ${-margin}`) : margin > 0 ? `Up ${margin}` : `Down ${-margin}`;
  // Yellow is kept for measured progress; a lead is only a lead until the final whistle.
  const tone: Tone = !final || margin === 0 ? '' : margin > 0 ? 'hit' : 'miss';
  return <Plate tone={tone} text={text} />;
}

/**
 * Spread: covers, or how many more points it needs to (a push on the line still needs one).
 * The note keeps the plain score from the pick's side and the line.
 */
function SpreadScore({ pick: p, game }: { pick: PickView; game: GameView }) {
  const st = game.state;
  if (!st || st.state === 'SCHEDULED') return p.status === 'OPEN' ? notStarted : null;
  const margin = gameMargin(p, st);
  if (margin === null || p.line === null) return null;
  const score = margin - p.line;
  const line = p.line > 0 ? `+${p.line}` : String(p.line);
  const detail = note(parts(score === 0 ? 'Tied' : score > 0 ? `Up ${score}` : `Down ${-score}`, line));
  if (st.state === 'FINAL') {
    return (
      <>
        {margin === 0 ? (
          <Plate tone="hollow" text="Push" />
        ) : (
          <Plate tone={margin > 0 ? 'hit' : 'miss'} icon={margin > 0 ? 'check' : 'cross'} text={margin > 0 ? 'Covered' : 'Not covered'} />
        )}
        {detail}
      </>
    );
  }
  // Navy while live, as with a moneyline lead: covering now isn't measured progress.
  return (
    <>
      <Plate text={margin > 0 ? 'Covers' : `Needs ${Math.floor(-margin) + 1}`} />
      {detail}
    </>
  );
}

/** Points an under can still take and stay under: 6 at 41 on 47.5; 5 at 41 on 47, where 6 more would push. */
const spare = (total: number, line: number) => Math.max(0, Number.isInteger(line) ? line - total - 1 : Math.floor(line - total));

/**
 * Total points: read like a stat over or under, on the game's combined score.
 * Points only go up, so an over that passes its line has hit and an under that
 * passes it has missed, mid-game.
 */
function TotalScore({ pick: p, game }: { pick: PickView; game: GameView }) {
  const st = game.state;
  if (!st || st.state === 'SCHEDULED') return p.status === 'OPEN' ? notStarted : null;
  if (p.line === null || (p.selectionSide !== 'OVER' && p.selectionSide !== 'UNDER')) return null;
  const total = (st.homeScore ?? 0) + (st.awayScore ?? 0);
  const final = st.state === 'FINAL';
  const push = final && total === p.line;
  if (push) {
    return (
      <>
        <Plate tone="hollow" text="Push" />
        {note(parts(`${total} pts`, 'on the line'))}
      </>
    );
  }
  if (p.selectionSide === 'UNDER') {
    const over = total > p.line;
    return (
      <>
        <Plate tone={over ? 'miss' : final ? 'hit' : 'run'} icon={over ? 'cross' : final ? 'check' : undefined} text={String(total)} />
        {note(parts('pts', `under ${p.line}`, over ? 'went over' : final ? '' : `${spare(total, p.line)} to spare`))}
      </>
    );
  }
  const needed = Math.floor(p.line) + 1;
  if (total > p.line || final) {
    const hit = total > p.line;
    return (
      <>
        <Plate tone={hit ? 'hit' : 'miss'} icon={hit ? 'check' : 'cross'} text={`${total} / ${needed}`} />
        {note(parts('pts', hit ? 'over' : 'fell short'))}
      </>
    );
  }
  return (
    <>
      <span
        key={total}
        className="plate run fill"
        style={{ '--at': `${Math.min(total / needed, 1) * 100}%` } as CSSProperties}
        role="progressbar"
        aria-label="Total points"
        aria-valuenow={total}
        aria-valuemax={needed}
        aria-valuetext={`${total} of ${needed} points`}
      >
        {total} / {needed}
      </span>
      {note(parts('pts', `${needed - total} to go`))}
    </>
  );
}
