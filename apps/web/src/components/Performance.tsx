import { useEffect, useState, type ReactNode } from 'react';
import { fetchPerformance, SignedOutError, type Performance as PerformanceData, type MarketStats, type Period, type StyleStats } from '../api';
import { americanOdds, dateTime, inSentence, money, REWARD_LABELS, sportName } from '../format';
import { Icon } from './Icon';
import { PeriodPicker } from './Leaderboard';
import { LoadError } from './LoadError';

const MIN_SAMPLE = 30;
const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
const signed = (minor: number) => `${minor > 0 ? '+' : minor < 0 ? '−' : ''}${money(Math.abs(minor))}`;
/** 0.0033 → "1 in 300". */
function oneIn(p: number | null): string {
  if (p === null || p <= 0) return '—';
  const n = 1 / p;
  if (n < 1.05) return 'almost certain';
  const rounded = n < 10 ? Math.round(n * 10) / 10 : n < 100 ? Math.round(n) : n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100;
  return `1 in ${rounded.toLocaleString('en-US')}`;
}
const weekLabel = (iso: string) =>
  `Week of ${new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

/** The longest odds that still count as funding, as American odds; sent as decimal (+200 → 3). */
const CUTOFFS = [100, 200, 300, 500];
const DEFAULT_CUTOFF = 200;
const CUTOFF_KEY = 'sports-better:funding-cutoff';
const decimalOf = (american: number) => 1 + american / 100;

const PERIOD_KEY = 'sports-better:performance-period';
const PERIOD_WORDS: Record<Period, string> = { week: 'this week', month: 'this month', all: 'overall' };

function readPeriod(): Period {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    return v === 'week' || v === 'month' ? v : 'all';
  } catch {
    return 'all';
  }
}

/** The four questions Performance answers, in order; each is a section the nav jumps to. */
const SECTIONS: Array<[string, string]> = [
  ['up', 'Up or down'],
  ['works', 'What works'],
  ['funding', 'Funding vs fun'],
  ['close', 'How close'],
];

function readCutoff(): number {
  try {
    // An older saved cutoff (10×, 20×, 50×) isn't one of these and falls back.
    const v = Number(localStorage.getItem(CUTOFF_KEY));
    return CUTOFFS.includes(v) ? v : DEFAULT_CUTOFF;
  } catch {
    return DEFAULT_CUTOFF;
  }
}

export function Performance({ onSignedOut }: { onSignedOut: () => void }) {
  const [a, setA] = useState<PerformanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cutoff, setCutoffState] = useState(readCutoff);
  const setCutoff = (v: number) => {
    setCutoffState(v);
    try {
      localStorage.setItem(CUTOFF_KEY, String(v));
    } catch {
      // not remembered; still applies now
    }
  };

  const [period, setPeriodState] = useState(readPeriod);
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      // not remembered; still applies now
    }
  };
  // Any bet with the sport, or with `only`, bets in nothing else, as on Settled.
  const [sport, setSport] = useState<{ sport: string; only: boolean } | null>(null);
  const sportKey = sport ? `${sport.sport}${sport.only ? '|only' : ''}` : '';
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null);
    fetchPerformance(decimalOf(cutoff), period, sport).then(setA, (err) => (err instanceof SignedOutError ? onSignedOut() : setError(String(err.message ?? err))));
    // sportKey stands in for the sport object, which is new on every pick.
  }, [onSignedOut, cutoff, period, sportKey, attempt]);

  if (error && !a) return <LoadError onRetry={() => setAttempt((n) => n + 1)}>Can’t load your performance.</LoadError>;
  if (!a)
    return (
      <p className="muted center" role="status">
        Loading…
      </p>
    );
  const m = a.money;
  const freeStaked = m.stakedMinor - m.realStakedMinor;
  const { funding, fun } = a.styles;
  const won = funding.won + fun.won;
  const lost = funding.lost + fun.lost;
  const cashed = funding.cashedOut + fun.cashedOut;
  const when = PERIOD_WORDS[a.period];
  // "basketball" or "basketball-only", for sentences about these bets.
  const sportWords = a.sport && `${inSentence(sportName(a.sport))}${a.sportOnly ? '-only' : ''}`;
  const retry = () => setAttempt((n) => n + 1);
  const pickSport = (value: string) => {
    const [s, only] = value.split('|');
    setSport(s ? { sport: s, only: only === 'only' } : null);
  };
  // A chosen sport stays on offer even when the period has none of it.
  const sports = a.sport && !a.sports.some((x) => x.sport === a.sport) ? [...a.sports, { sport: a.sport, bets: 0, only: 0 }] : a.sports;

  const controls = (
    <div className="performance-controls">
      <div className="performance-filters">
        <PeriodPicker value={period} onChange={setPeriod} />
        {/* One sport is nothing to choose between. A bet can span sports, so each one is offered with others or alone. */}
        {(sports.length > 1 || a.sport) && (
          <span className="filter-pick">
            {a.sport ? `${sportName(a.sport)}${a.sportOnly ? ' only' : ''}` : 'All sports'}
            <Icon name="chevron" />
            <select aria-label="Sport" value={sportKey} onChange={(e) => pickSport(e.target.value)}>
              <option value="">All sports</option>
              {sports.map((x) => (
                <optgroup key={x.sport} label={sportName(x.sport)}>
                  <option value={x.sport}>
                    Any with {inSentence(sportName(x.sport))} ({x.bets})
                  </option>
                  <option value={`${x.sport}|only`}>
                    {sportName(x.sport)} only ({x.only})
                  </option>
                </optgroup>
              ))}
            </select>
          </span>
        )}
      </div>
      {m.settledBets > 0 && (
        <nav className="jumps" aria-label="Stats sections">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className="jump" onClick={() => jumpToSection(id)}>
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );

  if (m.settledBets === 0)
    return (
      <div className="performance">
        {controls}
        {a.sport ? (
          <div className="filter-empty">
            <p className="muted">
              No settled {sportWords} bets{a.period === 'all' ? '' : ` placed ${when}`}.
            </p>
            <button className="btn" onClick={() => pickSport('')}>
              Show all sports
            </button>
          </div>
        ) : (
          <p className="muted center">
            {a.period === 'all' ? 'Nothing settled yet. Stats appear once Island Luck settles your first bet.' : `No bets placed ${when} have settled yet.`}
          </p>
        )}
      </div>
    );

  return (
    <div className="performance">
      {controls}
      {error && <LoadError onRetry={retry}>Can’t update your performance. Showing the last figures.</LoadError>}

      {/* How you're doing: the one answer, before any detail. */}
      <section className="panel standing-panel">
        <h2>How you’re doing</h2>
        <p className="lede">
          You’re <strong className={m.netMinor > 0 ? 'good' : m.netMinor < 0 ? 'bad' : undefined}>{m.netMinor > 0 ? `up ${money(m.netMinor)}` : m.netMinor < 0 ? `down ${money(-m.netMinor)}` : 'even'}</strong> {when} on{' '}
          {m.settledBets} settled {sportWords && `${sportWords} `}bet{m.settledBets === 1 ? '' : 's'}.
        </p>
        <div className="summary">
          <div className="stat">
            <span className={`stat-value ${m.netMinor >= 0 ? 'good' : 'bad'}`}>{signed(m.netMinor)}</span>
            <span className="stat-label">Net</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {won}–{lost}
            </span>
            <span className="stat-label">Won–lost{cashed > 0 && ` · ${cashed} cashed out`}</span>
          </div>
          <div className="stat">
            <span className={`stat-value ${m.roi !== null && m.roi > 0 ? 'good' : m.roi !== null && m.roi < 0 ? 'bad' : ''}`}>{m.roi !== null && m.roi > 0 ? `+${pct(m.roi)}` : m.roi !== null && m.roi < 0 ? `−${pct(-m.roi)}` : pct(m.roi)}</span>
            <span className="stat-label">Return on your money</span>
          </div>
        </div>
        <p className="muted small">
          {money(m.realStakedMinor)} of your money staked, {money(m.returnedMinor)} returned
          {freeStaked > 0 && ` · ${money(freeStaked)} in free bets not counted as your money`}
          {m.openBets > 0 && ` · ${m.openBets} open (${money(m.openRealStakedMinor)} at stake)`}
        </p>
      </section>

      <Group id="up" title="Am I up or down">
        <section className="panel">
          <h3 className="panel-title">By week</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Week</th>
                <th className="num">Bets</th>
                <th className="num">Staked</th>
                <th className="num">Returned</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {m.weeks.map((w) => (
                <tr key={w.weekOf}>
                  <td>{weekLabel(w.weekOf)}</td>
                  <td className="num">{w.bets}</td>
                  <td className="num">{money(w.realStakedMinor)}</td>
                  <td className="num">{money(w.returnedMinor)}</td>
                  <td className={`num ${w.netMinor >= 0 ? 'good' : 'bad'}`}>
                    {w.settled ? signed(w.netMinor) : '—'}
                    {w.settled < w.bets && <span className="muted small block">{w.bets - w.settled} open</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {m.promos.some((p) => p.rewardType !== 'NONE') && (
          <section className="panel">
            <h3 className="panel-title">Promos</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Promo</th>
                  <th className="num">Bets</th>
                  <th className="num">Won</th>
                  <th className="num">Returned</th>
                </tr>
              </thead>
              <tbody>
                {m.promos.map((p) => (
                  <tr key={p.rewardType}>
                    <td>{p.rewardType === 'NONE' ? 'No promo' : (REWARD_LABELS[p.rewardType] ?? p.rewardType)}</td>
                    <td className="num">{p.bets}</td>
                    <td className="num">
                      {p.won} / {p.settled}
                    </td>
                    <td className="num">{money(p.returnedMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Insurance or second-chance refunds paid as free bets don't show up in Island Luck's history.</p>
          </section>
        )}
      </Group>

      <Group id="works" title="Which bets work">
        <section className="panel">
          <h3 className="panel-title">Hit rate by market</h3>
          <p className="muted small">Settled {a.sport ? `${inSentence(sportName(a.sport))} ` : ''}picks from {a.period === 'all' ? `all your ${sportWords ? `${sportWords} ` : ''}bets` : `${sportWords ? `${sportWords} ` : ''}bets placed ${when}`}. Rates under {MIN_SAMPLE} picks are marked early: a couple of weekends can swing them a lot.</p>
          <ul className="markets">
            {a.markets.map((mk) => (
              <MarketRow key={mk.market} m={mk} />
            ))}
          </ul>
        </section>
        <section className="panel">
          <h3 className="panel-title">Picks per bet vs your chances</h3>
          <p className="lede">
            You've hit <strong>{pct(a.parlaySize.pickHitRate)}</strong> of your picks ({a.parlaySize.settledPicks} settled). Every pick has to hit, so each one
            you add multiplies the odds against you.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Picks</th>
                <th className="num">Bets</th>
                <th className="num">Won</th>
                <th className="num">At your hit rate</th>
                <th className="num">Island Luck's odds</th>
              </tr>
            </thead>
            <tbody>
              {a.parlaySize.buckets
                .filter((b) => b.bets > 0)
                .map((b) => (
                  <tr key={b.label}>
                    <td>{b.label}</td>
                    <td className="num">{b.bets}</td>
                    <td className="num">{b.won}</td>
                    <td className="num">{oneIn(b.chanceAtYourRate)}</td>
                    <td className="num">{oneIn(b.chanceByOdds)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="muted small">
            "At your hit rate" is the chance every pick in a bet that size hits, if each hits {pct(a.parlaySize.pickHitRate)} of the time.
          </p>
        </section>
        <section className="panel two-col">
          <RecordTable title="Players you back" rows={a.players} />
          <RecordTable title="Teams (moneyline, spread)" rows={a.teams} />
        </section>
      </Group>

      <Group id="funding" title="Funding vs fun">
        <StylesPanel split={a.styles} cutoff={cutoff} onCutoff={setCutoff} />
      </Group>

      <Group id="close" title="How close you get">
        <section className="panel">
          <h3 className="panel-title">Lost bets</h3>
          <p className="lede">
            Lost by one pick: <strong>{a.howClose.lostByOne}</strong> of {a.howClose.lostBets} lost bets.
          </p>
          <MissedChart data={a.howClose.missedDistribution} />
          {a.howClose.nearMisses.length > 0 && (
            <>
              <h4>Yardage and catches that fell short</h4>
              <ul className="near-misses">
                {a.howClose.nearMisses.slice(0, 12).map((n, i) => (
                  <li key={i}>
                    <span>
                      <strong>{n.participantName}</strong> <span className="muted">{n.market.toLowerCase()}</span>
                      {n.bets > 1 && <span className="muted"> · in {n.bets} bets</span>}
                    </span>
                    <span className="num">
                      {n.current} / {n.needed} {n.unit} · <span className="bad">{n.shortBy} short</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted small">From live stats, tracked since the live poller started.</p>
            </>
          )}
        </section>
        {a.cashOuts.length > 0 && (
          <section className="panel">
            <h3 className="panel-title">Cash-out check</h3>
            <ul className="cashouts">
              {a.cashOuts.map((c) => (
                <li key={c.couponId}>
                  <div>
                    <strong>{americanOdds(c.oddsRaw)}</strong> · {c.picks} picks · <span className="muted">placed {dateTime(c.placedAt)}</span>
                  </div>
                  <div>
                    Cashed out <strong>{money(c.cashedOutMinor)}</strong>.{' '}
                    {c.verdict === 'WOULD_HAVE_WON' && <span className="bad">Holding would have paid {money(c.potentialPayoutMinor)}.</span>}
                    {c.verdict === 'WOULD_HAVE_LOST' && (
                      <span className="good">
                        Good call: {c.picksLost} pick{c.picksLost === 1 ? '' : 's'} lost, so holding would have paid nothing.
                      </span>
                    )}
                    {c.verdict === 'PENDING' && (
                      <span className="muted">
                        {c.picksWon} won, {c.picksUnknown} still to be decided{c.picksUnknown === c.picks ? ' (no final scores yet)' : ''}.
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Group>
    </div>
  );
}

/** Brings a question into view and moves focus to its heading, so the keyboard carries on from there. */
function jumpToSection(id: string) {
  const section = document.getElementById(`performance-${id}`);
  if (!section) return;
  section.scrollIntoView({ block: 'start' });
  section.querySelector<HTMLElement>('.group-head')?.focus({ preventScroll: true });
}

/** One of Performance's questions: a heading on the page ground over its panels. */
function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="performance-group" id={`performance-${id}`} aria-labelledby={`performance-${id}-title`}>
      <h2 className="group-head" id={`performance-${id}-title`} tabIndex={-1}>
        {title}
      </h2>
      <div className="group-panels">{children}</div>
    </section>
  );
}

function MarketRow({ m }: { m: MarketStats }) {
  const hit = m.hitRate ?? 0;
  return (
    <li className="market">
      <div className="market-head">
        <span className="market-name">
          {m.market}
          {m.early && <span className="chip">early</span>}
        </span>
        <span className="num">
          <strong>{pct(m.hitRate)}</strong> <span className="muted">{m.won}/{m.picks}</span>
        </span>
      </div>
      <div
        className="rate-bar"
        role="img"
        aria-label={`${m.market}: ${pct(m.hitRate)} hit${m.impliedRate !== null ? `, odds implied ${pct(m.impliedRate)}` : ''}`}
        title={`${m.won} of ${m.picks} hit${m.impliedRate !== null ? ` · odds implied ${pct(m.impliedRate)} on ${m.pricedPicks} single picks (which hit ${pct(m.pricedHitRate)})` : ''}`}
      >
        <span className="rate-fill" style={{ width: `${hit * 100}%` }} />
        {m.impliedRate !== null && <span className="rate-mark" style={{ left: `${m.impliedRate * 100}%` }} />}
      </div>
      {m.impliedRate !== null && (
        <div className="muted small">
          Odds implied {pct(m.impliedRate)} on your {m.pricedPicks} single picks; those hit {pct(m.pricedHitRate)}.
        </div>
      )}
    </li>
  );
}

function MissedChart({ data }: { data: Array<{ missed: string; bets: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.bets));
  return (
    <figure className="missed-chart" aria-label="Lost bets by number of picks missed">
      <div className="columns">
        {data.map((d) => (
          <div key={d.missed} className="column" title={`${d.bets} bet${d.bets === 1 ? '' : 's'} missed ${d.missed === '6' ? '6 or more' : d.missed} pick${d.missed === '1' ? '' : 's'}`}>
            <span className="column-value">{d.bets}</span>
            <span className="column-bar" style={{ height: `${(d.bets / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="columns labels">
        {data.map((d) => (
          <span key={d.missed}>{d.missed === '6' ? '6+' : d.missed}</span>
        ))}
      </div>
      <figcaption className="muted small">Picks missed per lost bet</figcaption>
    </figure>
  );
}

function RecordTable({ title, rows }: { title: string; rows: Array<{ name: string; picks: number; won: number; lost: number; open: number }> }) {
  return (
    <div>
      <h3 className="panel-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="muted small">None yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">Won–Lost</th>
              <th className="num">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">
                  <span className="good">{r.won}</span>–<span className="bad">{r.lost}</span>
                </td>
                <td className="num muted">{r.open || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StylesPanel({
  split,
  cutoff,
  onCutoff,
}: {
  split: PerformanceData['styles'];
  cutoff: number;
  onCutoff: (v: number) => void;
}) {
  const { funding, fun } = split;
  const combined = funding.netMinor + fun.netMinor;
  const settledAny = funding.settled + fun.settled > 0;
  const verdict = !settledAny
    ? 'Nothing settled yet.'
    : funding.settled === 0
      ? "No funding bets have settled yet, so they haven't paid for anything so far."
      : funding.netMinor >= 0 && combined >= 0
        ? `Funding bets are covering the fun: ${signed(combined)} overall.`
        : funding.netMinor > 0
          ? `Funding bets are up ${money(funding.netMinor)}, covering ${Math.round((funding.netMinor / Math.abs(fun.netMinor || 1)) * 100)}% of the fun losses.`
          : `Funding bets haven't paid for the fun yet: ${signed(combined)} overall.`;

  return (
    <section className="panel">
      <div className="panel-head">
        <h3 className="panel-title">Split by payout</h3>
        <div className="segmented" role="group" aria-label="Funding cutoff">
          {CUTOFFS.map((c) => (
            <button key={c} className={cutoff === c ? 'on' : ''} aria-pressed={cutoff === c} onClick={() => onCutoff(c)}>
              +{c}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        Funding = bets at +{cutoff} or shorter (paying {money(decimalOf(cutoff) * 500)} or less on $5). Fun = longer odds.
      </p>
      <div className="styles">
        <StyleCard title="Funding" subtitle="conservative" s={funding} />
        <StyleCard title="Fun" subtitle="long shots" s={fun} />
      </div>
      <p className="lede">{verdict}</p>
    </section>
  );
}

function StyleCard({ title, subtitle, s }: { title: string; subtitle: string; s: StyleStats }) {
  return (
    <div className="style-card">
      <div className="style-title">{title}</div>
      <div className="muted small">{subtitle}</div>
      <div className={`style-net ${s.settled === 0 ? 'muted' : s.netMinor >= 0 ? 'good' : 'bad'}`}>{s.settled ? signed(s.netMinor) : '—'}</div>
      <div className="muted small">
        {s.won}–{s.lost} record{s.cashedOut > 0 && ` · ${s.cashedOut} cashed out`}
      </div>
      <div className="muted small">
        {s.bets} bet{s.bets === 1 ? '' : 's'}
        {s.open > 0 && ` · ${s.open} open`}
      </div>
    </div>
  );
}
