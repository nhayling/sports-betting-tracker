import type { GameStateView, GameView, PickView } from '../api';
import { dateTime, quarter } from '../format';
import { Icon } from './Icon';
import { PickRow } from './PickRow';

export function GameBlock({ game, couponOpen }: { game: GameView; couponOpen: boolean }) {
  // Consecutive picks from the same bet builder are shown as one same-game group.
  const groups: PickView[][] = [];
  for (const p of game.picks) {
    const last = groups.at(-1);
    if (last && p.betBuilderGroup !== null && last[0]!.betBuilderGroup === p.betBuilderGroup) last.push(p);
    else groups.push([p]);
  }

  return (
    <section className="game">
      <div className="game-head">
        <span className="game-name">{game.name}</span>
        <GameLine game={game} state={couponOpen ? game.state : null} />
      </div>
      {groups.map((g, i) =>
        g.length > 1 ? (
          <div key={i} className="same-game" aria-label="Same game parlay">
            <span className="same-game-label">Same game</span>
            {g.map((p) => (
              <PickRow key={p.id} pick={p} game={game} live={couponOpen} />
            ))}
          </div>
        ) : (
          <PickRow key={g[0]!.id} pick={g[0]!} game={game} live={couponOpen} />
        ),
      )}
    </section>
  );
}

function GameLine({ game, state }: { game: GameView; state: GameStateView | null }) {
  if (!state) {
    const started = game.startAt && Date.parse(game.startAt) < Date.now();
    return <span className="game-line muted">{started ? dateTime(game.startAt) : `Kicks off ${dateTime(game.startAt)}`}</span>;
  }
  const score = `${state.away.abbreviation} ${state.awayScore ?? 0} – ${state.homeScore ?? 0} ${state.home.abbreviation}`;

  if (state.state === 'SCHEDULED') return <span className="game-line muted">Kicks off {dateTime(game.startAt)}</span>;
  if (state.state === 'FINAL') return <span className="game-line">Final · {score}</span>;
  if (state.state !== 'LIVE') return <span className="game-line muted">{state.detail ?? state.state}</span>;

  const when = /halftime|end of/i.test(state.detail ?? '') ? state.detail : `${quarter(state.period)} ${state.clock ?? ''}`;
  const sit = state.situation;
  const ball = sit?.possessionTeamId
    ? sit.possessionTeamId === state.home.id
      ? state.home.abbreviation
      : sit.possessionTeamId === state.away.id
        ? state.away.abbreviation
        : null
    : null;

  return (
    <span className="game-line live">
      <span className="live-dot" aria-hidden /> {when} · <strong>{score}</strong>
      {ball && (
        <span className="possession">
          <span className="sep"> · </span>
          <Icon name="football" /> {ball} ball{sit?.downDistance ? `, ${sit.downDistance}` : ''}
          {sit?.redZone && <span className="red-zone">RED ZONE</span>}
        </span>
      )}
    </span>
  );
}
