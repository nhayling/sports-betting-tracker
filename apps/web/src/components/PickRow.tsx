import type { CSSProperties, ReactNode } from 'react';
import type { GameView, PickView } from '../api';
import type { PickState } from '../betState';
import { binaryWords, dateTime, gameMargin, marketLabel, metricUnit, quarter, totalOf, TOTAL_TYPES, UNAVAILABLE_REASONS } from '../format';
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

/** Leagues whose clock reads "Q3 4:12"; the rest (periods, innings, minutes, rounds) take ESPN's own words. */
const QUARTERS = new Set(['NFL', 'NCAAF', 'NBA', 'WNBA']);

/** "KO/TKO R2 2:11", "Submission R1 4:52", "Decision", "Draw": how a fight ended. */
function fightResult(f: NonNullable<GameView['state']>['fight']): string {
  if (!f) return '';
  const clock = f.clockSeconds === null ? '' : `${Math.floor(f.clockSeconds / 60)}:${String(f.clockSeconds % 60).padStart(2, '0')}`;
  const when = f.round === null ? '' : `R${f.round} ${clock}`.trim();
  if (f.method === 'DECISION') return f.winner ? 'Decision' : 'Draw';
  if (!f.winner) return 'No winner';
  return [f.method === 'KO_TKO' ? 'KO/TKO' : f.method === 'SUBMISSION' ? 'Submission' : 'Finish', when].join(' ');
}

/** The pick's game in one line: the score and clock once it has started, the kickoff before. */
function gameLine(game: GameView): string {
  const st = game.state;
  if (st?.fight) {
    // Fighters have no score: the bout, then the round or how it ended.
    const f = st.fight;
    // The plate says how it ended; this says who won.
    const winner = f.winner === 'home' ? st.home : f.winner === 'away' ? st.away : null;
    const last = winner?.displayName?.split(' ').at(-1);
    if (st.state === 'FINAL') return `${game.name ?? ''} · ${last ? `${last} won` : fightResult(f)}`;
    if (st.state === 'LIVE') return `${game.name ?? ''} · ${st.detail ?? `R${f.round ?? ''}`}`;
  }
  const scored = st && (st.state === 'LIVE' || st.state === 'FINAL');
  if (!st || !scored) {
    if (st && st.state !== 'SCHEDULED') return `${game.name ?? ''} · ${st.detail ?? st.state}`;
    const started = !st && game.startAt && Date.parse(game.startAt) < Date.now();
    return `${game.name ?? ''} · ${started ? '' : 'kicks off '}${dateTime(game.startAt)}`;
  }
  const home = `${st.home.abbreviation ?? game.homeName}`;
  const away = `${st.away.abbreviation ?? game.awayName}`;
  // Soccer writes the home side first ("BHA 1 – 0 CRY"); American sports the visitors.
  const score = game.league?.includes(' / ')
    ? `${home} ${st.homeScore ?? 0} – ${st.awayScore ?? 0} ${away}`
    : `${away} ${st.awayScore ?? 0} – ${st.homeScore ?? 0} ${home}`;
  if (st.state === 'FINAL') return `${score} · final`;
  const quarters = QUARTERS.has(game.league ?? '');
  const when = !quarters || /halftime|end of/i.test(st.detail ?? '') ? st.detail : `${quarter(st.period)} ${st.clock ?? ''}`.trim();
  return `${score} · ${when}`;
}

/** `live` is false for settled bets: only Island Luck's result is shown then. */
export function PickRow({ pick: p, game, live, state }: { pick: PickView; game: GameView; live: boolean; state: PickState }) {
  const official = KAMBI_PICK[p.status];
  return (
    <div className={`pick pick-${state}`}>
      <div className="pick-what">
        <span className="pick-name">{p.participantName ?? (p.type === 'FIGHT' ? game.name : p.selectionLabel)}</span>
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
            <Settled pick={p} game={game} official={official} />
          ))}
      </div>
    </div>
  );
}

/**
 * A settled pick: the stat it finished on, in Island Luck's colour and mark,
 * with the result under it ("Lost · rec yds"). Picks with no stat, or a stat
 * that disagrees with Island Luck, show the result alone.
 */
function Settled({ pick: p, game, official }: { pick: PickView; game: GameView; official: (typeof KAMBI_PICK)[string] }) {
  const stat = finalStat(p, game);
  // The poller stops when a bet settles, so a stat can stop short of what decided it.
  const agrees = stat && (p.status === 'VOID' || stat.hit === (p.status === 'WON'));
  if (!agrees) return <Plate tone={official.tone} icon={official.icon} text={official.label} />;
  return (
    <>
      <Plate tone={official.tone} icon={official.icon} text={stat.text} />
      {note(parts(official.label, stat.detail))}
    </>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : 'Tied');

/** What a pick finished on, read the way its live plate reads it, and whether that hit. */
function finalStat(p: PickView, game: GameView): { text: string; detail: string; hit: boolean } | null {
  const st = game.state;
  if (p.type === 'FIGHT') {
    // A void (draw) or an ungraded finish shows Island Luck's result alone.
    if (st?.state !== 'FINAL' || !st.fight || !p.fightGrade) return null;
    return { text: fightResult(st.fight), detail: '', hit: p.fightGrade > 0 };
  }
  if (p.type === 'RESULT' || p.type === 'BTTS') {
    if (!st || st.state === 'SCHEDULED' || st.homeScore === null || st.awayScore === null) return null;
    const margin = gameMargin(p, st);
    if (margin === null) return null;
    if (p.type === 'BTTS') return { text: Math.min(st.homeScore, st.awayScore) > 0 ? 'Both scored' : 'Not both', detail: '', hit: margin > 0 };
    if (p.moneylineSide === 'draw') return { text: margin > 0 ? 'Draw' : 'No draw', detail: '', hit: margin > 0 };
    return { text: signed(margin), detail: '', hit: margin > 0 };
  }
  if (p.type === 'MONEYLINE' || p.type === 'SPREAD' || TOTAL_TYPES.has(p.type)) {
    if (!st || st.state === 'SCHEDULED' || st.homeScore === null || st.awayScore === null) return null;
    const margin = gameMargin(p, st);
    if (margin === null || (p.type !== 'MONEYLINE' && p.line === null)) return null;
    if (TOTAL_TYPES.has(p.type)) {
      const total = totalOf(p, st)!;
      if (p.selectionSide === 'UNDER') return { text: String(total), detail: parts('pts', `under ${p.line}`), hit: margin > 0 };
      return { text: `${total} / ${Math.floor(p.line!) + 1}`, detail: 'pts', hit: margin > 0 };
    }
    // The pick's side's lead in the final score; a spread's note keeps its line.
    const lead = (p.moneylineSide === 'home' ? 1 : -1) * (st.homeScore - st.awayScore);
    const line = p.type === 'SPREAD' ? (p.line! > 0 ? `+${p.line}` : String(p.line)) : '';
    return { text: signed(lead), detail: line, hit: margin > 0 };
  }

  const pr = p.progress;
  if (p.type !== 'STAT' || !pr || pr.current === null || pr.status === 'UNAVAILABLE' || pr.status === 'NOT_STARTED') return null;
  const current = pr.current;
  const target = pr.target ?? 0;
  const unit = metricUnit(pr.metric);
  if (pr.operator === 'GTE' || pr.operator === 'GT') {
    const needed = pr.operator === 'GT' ? Math.floor(target) + 1 : target;
    return { text: `${current} / ${needed}`, detail: unit, hit: current >= needed };
  }
  return { text: String(current), detail: parts(unit, `under ${target}`), hit: pr.operator === 'LTE' ? current <= target : current < target };
}

function Progress({ pick: p, game, state }: { pick: PickView; game: GameView; state: PickState }) {
  if (p.type === 'MONEYLINE') return <MoneylineScore pick={p} game={game} />;
  if (p.type === 'RESULT') return <ResultScore pick={p} game={game} />;
  if (p.type === 'BTTS') return <BttsScore pick={p} game={game} />;
  if (p.type === 'FIGHT') return <FightScore pick={p} game={game} />;
  if (p.type === 'SPREAD') return <SpreadScore pick={p} game={game} />;
  if (TOTAL_TYPES.has(p.type)) return <TotalScore pick={p} game={game} />;

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

/** Three-way result (soccer's Full Time): a team must win outright; a draw pick wants it level. */
function ResultScore({ pick: p, game }: { pick: PickView; game: GameView }) {
  const st = game.state;
  if (!st || st.state === 'SCHEDULED') return p.status === 'OPEN' ? notStarted : null;
  const margin = gameMargin(p, st);
  if (margin === null) return null;
  const final = st.state === 'FINAL';
  if (p.moneylineSide === 'draw') {
    const text = margin > 0 ? (final ? 'Draw' : 'Level') : final ? 'No draw' : `${-margin} apart`;
    return <Plate tone={final ? (margin > 0 ? 'hit' : 'miss') : ''} icon={final ? (margin > 0 ? 'check' : 'cross') : undefined} text={text} />;
  }
  const text = margin === 0 ? (final ? 'Draw' : 'Level') : final ? (margin > 0 ? `Won by ${margin}` : `Lost by ${-margin}`) : margin > 0 ? `Up ${margin}` : `Down ${-margin}`;
  return <Plate tone={final ? (margin > 0 ? 'hit' : 'miss') : ''} icon={final ? (margin > 0 ? 'check' : 'cross') : undefined} text={text} />;
}

/** Both teams to score: decided early once both have, else at the final whistle. */
function BttsScore({ pick: p, game }: { pick: PickView; game: GameView }) {
  const st = game.state;
  if (!st || st.state === 'SCHEDULED') return p.status === 'OPEN' ? notStarted : null;
  const margin = gameMargin(p, st);
  if (margin === null) return null;
  const both = Math.min(st.homeScore ?? 0, st.awayScore ?? 0) > 0;
  const decided = both || st.state === 'FINAL';
  const blank = [st.homeScore ? null : st.home.abbreviation, st.awayScore ? null : st.away.abbreviation].filter(Boolean).join(' & ');
  return (
    <>
      <Plate tone={decided ? (margin > 0 ? 'hit' : 'miss') : ''} icon={decided ? (margin > 0 ? 'check' : 'cross') : undefined} text={both ? 'Both scored' : decided ? 'Not both' : 'Not yet'} />
      {!both && note(`${blank} ${st.state === 'FINAL' ? 'didn’t score' : 'yet to score'}`)}
    </>
  );
}

/** UFC: graded on the server once the fight is over; the round while it's on. */
function FightScore({ pick: p, game }: { pick: PickView; game: GameView }) {
  const st = game.state;
  if (!st || st.state === 'SCHEDULED') return p.status === 'OPEN' ? notStarted : null;
  if (st.state !== 'FINAL') return <Plate text={st.fight?.round ? `R${st.fight.round}` : 'Live'} />;
  if (p.fightGrade === null) return <Plate tone="hollow" text="Result unclear" />;
  if (p.fightGrade === 0) return <Plate tone="hollow" text="Void" />;
  const won = p.fightGrade > 0;
  return <Plate tone={won ? 'hit' : 'miss'} icon={won ? 'check' : 'cross'} text={fightResult(st.fight)} />;
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
  // A team total whose team couldn't be matched to either side has nothing to count.
  const total = totalOf(p, st);
  if (total === null || p.line === null || (p.selectionSide !== 'OVER' && p.selectionSide !== 'UNDER')) return null;
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
