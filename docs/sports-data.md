# Live sports data: provider research

Checked live on 2026-09-27 during the NFL Week 3 1 PM games.

## ESPN public site API (recommended first provider)

Unofficial, with no key, no documented rate limit and no SLA. Responses carry
`cache-control: max-age=4`, so data is near real-time.

| Need | Endpoint | Notes |
| --- | --- | --- |
| Find games | `site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` (`?dates=YYYYMMDD`) | Event id, start time, home/away teams (`abbreviation`, `name` = nickname, `displayName`), state `pre`/`in`/`post`, period, clock, score |
| Live player stats | `…/nfl/summary?event=<id>` (~350 kB) | `boxscore.players[team].statistics[category]` with `keys[]` + `athletes[].stats[]` (strings) |
| Players who haven't recorded a stat yet | `…/nfl/teams/<teamId>/roster` | Same athlete ids as the box score |
| College football | same paths with `college-football` | Needed for NCAAF picks |

The box score has everything the first props need, one call per game:

| Metric | Box score |
| --- | --- |
| Rushing yards / carries / rush TDs | `rushing.rushingYards`, `rushingAttempts`, `rushingTouchdowns` |
| Receiving yards / receptions / rec TDs | `receiving.receivingYards`, `receptions`, `receivingTouchdowns` |
| Passing yards / TDs / INTs / completions | `passing.passingYards`, `passingTouchdowns`, `interceptions`, `completions/passingAttempts` (split on `/`) |
| Anytime TD | rushing + receiving + `kickReturns.kickReturnTouchdowns` + `puntReturns.puntReturnTouchdowns` + defensive/return TDs. **Passing TDs don't count** for Touchdown Scorer. |

`scoringPlays` has text only, with no athlete ids, so TD tracking uses the box
score counts.

Spot checks against Island Luck's picks at halftime / mid-Q3:

- Kenneth Walker III: 10 car, 52 yds, 2 TDs (1 rush, 1 catch). That's 52 / 100 toward his 100+
  rushing pick, and his TD pick is scored (Kambi had already settled it WON).
- Jahmyr Gibbs rushing TD at Q3 10:56 → ✓. Breece Hall: 20 rush yds, 0 TD → not yet.

Risks: it's unofficial and could change shape or block without notice, and
ESPN's terms don't permit commercial use (fine for a personal tracker). The
`SportsDataProvider` interface is what keeps it swappable. When a stat is
missing, the tracker shows "Progress unavailable".

## Rate limits (measured 2026-09-27)

ESPN publishes no limits and sends no rate-limit headers, ETags or
Retry-After, only `cache-control: max-age=1–7`. Community guidance is only "be
respectful": one blog claims throttling after "a couple hundred requests a
day", while developers in the endpoint gist poll every 30–60 s.

Measured:
- A burst of 30 sequential scoreboard requests at ~3/s returned 30 × 200, with
  p50 61 ms (served from CDN cache).
- A live box score changed every ~10–30 s. Polling every 30 s means data is at
  most ~35 s old; polling faster gains little.
- gzip is supported: a box score is 43 kB gzipped vs 451 kB raw (Node fetch
  asks for it automatically).

The poller's budget (`apps/api/src/live`):
- A cycle runs every 30 s ±2 s, never overlapping. It makes no requests unless
  an OPEN bet has a game between 15 min before kickoff and 6 h after.
- Per cycle: 1 scoreboard per sport, plus 1 box score per LIVE game with a stat
  pick (one more after FINAL, then never again). Moneyline-only games use only
  the scoreboard. Rosters are fetched only for unmatched players and cached 12 h.
- There's a hard cap of 60 requests/min. On a 429, all ESPN requests pause
  (Retry-After, else 1 → 2 → 4 … 15 min); after 3 network/5xx failures in a
  row, they pause 2 min. A skipped request keeps the last progress.
- Observed live (9 games): the first cycle made 28 requests (18 were rosters
  for first-time matching). Steady state is 10 per cycle ≈ 20/min, with no 429s.

## Paid alternatives (not checked yet)

SportsDataIO (NFL live box scores; the free trial scrambles values),
Sportradar (enterprise pricing) and API-Sports American Football. Evaluate
only if ESPN becomes unreliable.

## Matching Kambi → ESPN

- **Teams**: Kambi uses "KC Chiefs", "WAS Commanders", "LA Rams". ESPN
  abbreviations differ in places (Kambi WAS vs ESPN **WSH**), so match on the
  **nickname** (Kambi's last word = ESPN `team.name`), which is unique in the
  NFL. For college, strip rankings ("(1) Texas") and match Kambi's name to
  ESPN `team.location`.
- **Events**: same sport, same two teams (order-insensitive, because Kambi
  uses "vs" at neutral sites), and start within ±3 h. Persist the mapping.
- **Players**: Kambi `participantName` vs ESPN roster `displayName` for the
  two teams in that event. Normalize accents, punctuation and case; keep
  suffixes as a tiebreaker only. Persist Kambi `participantId` → ESPN athlete id.

## Other sports (checked 2026-10-23)

Same API, same three endpoints, under these paths. `npm run catalog -w @sports-better/api`
lists every Island Luck market for upcoming games and whether it's tracked.

| League | ESPN path | Kambi league (event groups) | Stats ESPN has | Not in ESPN, so not tracked |
| --- | --- | --- | --- | --- |
| NBA, WNBA | `basketball/nba`, `basketball/wnba` | NBA, WNBA | One unnamed box score category: points, rebounds, assists, steals, blocks, threes (`3-7`) | — |
| MLB | `baseball/mlb` | MLB | Unnamed categories with `type` `batting` (hits, runs, RBIs, home runs) and `pitching` (strikeouts, innings `5.1` = 16 outs) | Doubles, total bases, stolen bases |
| NHL | `hockey/nhl` | NHL | `forwards`/`defenses`: goals, assists, `shotsTotal` (shots on goal) | Power-play points; regular-time-only lines (ESPN has no per-period score stored) |
| Premier League, La Liga | `soccer/eng.1`, `soccer/esp.1` | England / Premier League, Spain / La Liga (Kambi has a Premier League in a dozen countries, so the country is kept) | Summary `rosters[].roster[].stats` by name (`totalGoals`, `goalAssists`, `shotsOnTarget`, `yellowCards`, `redCards`); corners are a team stat (`boxscore.teams[].statistics` `wonCorners`) | Card totals (Kambi weights reds), Asian handicaps |
| UFC | `mma/ufc` | UFC | Scoreboard only: a card is an event, each bout a competition with `winner`, final `period` and `clock`, scheduled rounds, and a result note ("Unofficial Winner Kotko" = KO/TKO, "… Submission", "… Decision") | Method when ESPN leaves the note out (the pick stays ungraded) |

Matching: NBA, WNBA, MLB and NHL use the nickname like the NFL ("POR Trail
Blazers", "TOR Maple Leafs"). Soccer clubs match when one name's words
contain the other's ("Brighton" / "Brighton & Hove Albion", "Athletic Bilbao"
/ "Athletic Club"). Bouts match on the fighters' names, with "(C)" and
rankings stripped and a shortened first name allowed ("Alex" / "Alexander
Volkanovski"); ESPN dates every bout at the card's start, so the time window is
12 h. Picks on three-way and fight markets are labelled "1", "X", "2" on the
coupon and are named after the side.
