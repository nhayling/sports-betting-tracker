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
      <GameStrip game={game} state={couponOpen ? game.state : null} />
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

/** The score bug for one game: teams and scores once it has started, the matchup and kickoff before. */
function GameStrip({ game, state }: { game: GameView; state: GameStateView | null }) {
  const scored = state && (state.state === 'LIVE' || state.state === 'FINAL');
  if (!state || !scored) {
    const started = !state && game.startAt && Date.parse(game.startAt) < Date.now();
    const when = state && state.state !== 'SCHEDULED' ? (state.detail ?? state.state) : started ? dateTime(game.startAt) : `Kicks off ${dateTime(game.startAt)}`;
    return (
      <div className="game-strip">
        <span className="matchup">{game.name}</span>
        <span className="clock">{when}</span>
      </div>
    );
  }

  const live = state.state === 'LIVE';
  const when = !live ? 'Final' : /halftime|end of/i.test(state.detail ?? '') ? state.detail : `${quarter(state.period)} ${state.clock ?? ''}`;
  const sit = live ? state.situation : null;
  const ball = sit?.possessionTeamId
    ? sit.possessionTeamId === state.home.id
      ? state.home.abbreviation
      : sit.possessionTeamId === state.away.id
        ? state.away.abbreviation
        : null
    : null;

  return (
    <>
      <div className="game-strip">
        <span className="team">{state.away.abbreviation ?? game.awayName}</span>
        <strong className="score">{state.awayScore ?? 0}</strong>
        <span className="team">{state.home.abbreviation ?? game.homeName}</span>
        <strong className="score">{state.homeScore ?? 0}</strong>
        <span className={`clock ${live ? 'live' : 'final'}`}>
          {live && <span className="live-dot" aria-hidden />}
          {when}
        </span>
      </div>
      <div className="game-sub">
        {game.name}
        {ball && (
          <>
            {' · '}
            <Icon name="football" /> {ball} ball{sit?.downDistance ? `, ${sit.downDistance}` : ''}
            {sit?.redZone && <span className="red-zone">RED ZONE</span>}
          </>
        )}
      </div>
    </>
  );
}
