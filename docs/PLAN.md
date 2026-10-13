# Sports Better: Island Luck importer and live prop progress

## What the real capture showed (2026-09-27)

- Money, odds and lines are all ×1000: stake 5000 = $5.00, odds 12866 = 12.866.
  The tracker stores cents. The brief's ÷100 assumption was wrong, and a
  stake×odds = payout check can't detect a money-scale error because it holds
  at any scale.
- Lost bets have `betOdds` and `potentialPayout` set to 0. The parser uses
  `playedOdds` and recomputes the potential payout, marking it
  `potentialPayoutDerived`.
- **Lines are explicit**: "80+ Rushing Yards" has `line: 80000`, and O/U labels
  read "Bijan Robinson - Over 38.5". The market classifier should take the
  target from `line` and only use the criterion text to pick the metric and
  operator (`N+` / Yes → GTE, Over → GT, Under → LT).
- There's no participant name field. It comes from the label, plus `participantId`.
- Bet-builder outcomes are settled individually while the row is still OPEN.
  That's free Kambi-side partial settlement to show next to live progress.
- `rewardType` (FREE_BET / INSURANCE / SECOND_CHANCE) matters for P&L, since a
  free bet's stake isn't money risked.
- Team names are short forms ("KC Chiefs @ MIA Dolphins", "vs" at neutral
  venues), and NCAAF names carry rankings ("(1) Texas"), which the matcher must strip.

## Principles

- **Two independent sources, joined in the tracker.** Kambi owns what was bet
  and how it settled. A sports-data provider owns live stats. Neither module
  imports the other.
- **Kambi is authoritative for settlement.** Live stats can say "target
  reached". Only a Kambi sync can change a bet from OPEN.
- **Never fabricate.** Unknown markets, unmatched players, and missing stats
  show as "Progress unavailable".
- Money is stored as integer minor units (cents) everywhere, and odds/lines
  keep the raw Kambi ×1000 integer. Conversions live only in `packages/kambi/src/money.ts`
  and `odds.ts`.

## Repository layout (greenfield)

```
packages/
  kambi/          sportsbook parser: raw coupon JSON → normalized coupons   ← built
  markets/        tracker-owned: Kambi market text → {metric, operator, target}
  sports-data/    SportsDataProvider interface + NFL provider
  matching/       event/participant matching + name normalization
apps/
  api/            Express + Prisma + Postgres: sync endpoint, poller, read API
  web/            React + Vite tracker UI
  extension/      Chrome/Edge MV3, passive capture + sync   ← built
docs/
```

TypeScript, npm workspaces, Vitest. `kambi` has no runtime deps, so the API and
the extension can both use it.

## Normalized schema (Prisma sketch)

```prisma
model SportsbookAccount {
  id        String   @id @default(uuid())
  provider  SportsbookProvider          // ISLAND_LUCK_KAMBI
  label     String
  coupons   Coupon[]
}

model Coupon {
  id                   String   @id @default(uuid())
  sportsbookAccountId  String
  externalCouponRef    String
  externalCouponUuid   String?
  placedAt             DateTime
  currency             String
  status               SettlementStatus   // OPEN WON LOST VOID CASHED_OUT MIXED UNKNOWN
  rawStatus            String?
  totalStakeMinor      Int
  potentialPayoutMinor Int?
  actualPayoutMinor    Int?
  rawPayload           Json
  rawPayloadHash       String             // detect "unchanged" cheaply
  parserVersion        Int
  createdAt, updatedAt, lastSyncedAt  DateTime
  bets                 Bet[]
  @@unique([sportsbookAccountId, externalCouponRef])
}

model Bet {
  id, couponId, externalBetRef, kind (SINGLE|COMBINATION|SYSTEM|UNKNOWN)
  oddsRaw Int?, stakeMinor Int, potentialPayoutMinor Int?, payoutMinor Int?
  status SettlementStatus, rawStatus String?
  legs BetLeg[]  (via BetLegOnBet: a row can belong to several bets on system coupons)
  @@unique([couponId, externalBetRef])
}

model BetLeg {           // one Kambi coupon row
  id, couponId, externalRowIndex, selectionType (SIMPLE|BET_BUILDER)
  eventId, eventName, homeName, awayName, sport, league, eventStartAt
  oddsRaw Int?, status, rawStatus
  selections LegSelection[]
  @@unique([couponId, externalRowIndex])
}

model LegSelection {
  id, betLegId, externalOutcomeId, externalBetOfferId, externalParticipantId
  participantName, marketName, selectionLabel, outcomeType, lineRaw Int?
  status, rawStatus, rawOutcome Json, rawBetOffer Json
  // tracker-derived (packages/markets), nullable = not supported:
  metric       PropMetric?      // NFL_RUSHING_YARDS, NFL_ANYTIME_TD, …
  operator     PropOperator?    // GTE (for "80+"), LTE, EQ
  target       Decimal?
  marketParserVersion Int?
  @@unique([betLegId, externalOutcomeId])
}

model BetLegProgress {    // latest value only, one row per selection
  id, legSelectionId @unique, provider, externalEventId, externalPlayerId
  metric, target, currentValue Decimal?, period, clock, gameStatus
  matchConfidence Float, matchMethod String, updatedAt
}

model ExternalEventMapping {
  sportsbookEventId, provider, providerEventId, confidence, method, confirmedAt?
  @@unique([sportsbookEventId, provider])
}

model ExternalParticipantMapping {
  sportsbookParticipantId, participantName, provider, providerParticipantId,
  confidence, method, confirmedAt?
  @@unique([sportsbookParticipantId, provider])
}

model ProviderSnapshot {  // debugging only, pruned (e.g. keep last N per event, 7 days)
  id, provider, providerEventId, fetchedAt, payload Json
}
```

Notes:
- Legs hang off `Coupon` rather than `Bet`, because on system coupons one row
  belongs to several bets. For singles and parlays the join is 1:1.
- The prop classification (`metric/operator/target`) is stored on
  `LegSelection`, but `packages/markets` computes it, not the Kambi parser. The
  parser deliberately doesn't read "80+" out of market names.
- Progress keeps only the latest value. Snapshots are for debugging and get pruned.

## Sync (`POST /api/integrations/island-luck/sync`)

The extension sends the **raw** coupons it captured, and the server runs
`@sports-better/kambi`. Parser fixes then ship without reinstalling the
extension, and stored `rawPayload` can be re-normalized whenever the parser
changes.

```
body: { provider: 'ISLAND_LUCK_KAMBI', accountLabel, capturedAt, coupons: RawCoupon[] }
auth: Authorization: Bearer <the user's extension token>
→ per coupon, in one transaction:
   hash raw → equal to stored hash? → "unchanged", touch lastSyncedAt
   else upsert Coupon on (accountId, externalCouponRef)
        upsert Bets / Legs / Selections on their external keys
        captures older than the stored one are ignored ("stale"), so a cached page can't undo a settlement
        newer captures always apply (Kambi is authoritative, incl. regrades); settled → OPEN is kept but flagged
→ { created, updated, unchanged, stale, failed, warnings[], errors[] }
```

This is idempotent by construction: every write is an upsert on an external key.

## Extension (apps/extension) — built

It captures passively (see [island-luck-auth.md](island-luck-auth.md)). The
page's own `history.json` responses are copied into `chrome.storage.local`,
merged by `couponRef`. A coupon is marked "not yet synced" only when it's new or
its content changed, so an OPEN → WON change is re-sent once and upserted over
the existing record.

- The popup shows last sync, counts (found / open / settled / not yet synced),
  and **Sync Bets**, and the result shows created/updated/unchanged.
  Settings covers the tracker URL and sign-in, *Download captured JSON* (the
  fixture source), and Clear.
- Permissions: `storage`, plus content scripts on Island Luck. Tracker host
  access is optional and requested only for the configured tracker origin.
- If the tracker is unreachable, captured coupons stay "not yet synced" and go
  out on the next sync.
- Settlement updates depend on visiting My Bets. The tracker should flag OPEN
  bets whose events finished more than 12 h ago as "open My Bets to refresh
  settlement".

## Live progress (tracker server-side)

```ts
interface SportsDataProvider {
  id: string;
  findEvents(q: { sport; startsAfter; startsBefore }): Promise<ProviderEvent[]>;
  getEventState(eventId): Promise<{ status: 'SCHEDULED'|'LIVE'|'FINAL'|...; period; clock }>;
  getPlayerStats(eventId): Promise<ProviderPlayerLine[]>;  // one call per game, not per player
  listRoster?(eventId): Promise<ProviderPlayer[]>;
}
```

A metric registry maps `PropMetric → (stats) => number | null` for each
provider. `null` means "provider doesn't expose it" and shows as
"Progress unavailable".

Poller loop (every 30–60 s, backed off on 429s):
1. Select events with OPEN bets where `eventStartAt` is between now − 5 h and
   now + 15 min.
2. Resolve `ExternalEventMapping` (match once, then reuse).
3. `getEventState`, skipping unless LIVE (or just FINAL, for one last pull).
4. One `getPlayerStats` per live game, then update `BetLegProgress` for each
   mapped selection.

**NFL provider candidates**
- *ESPN public site API* (scoreboard + game summary box score): free, live, and
  has athlete IDs, but it's unofficial with no SLA and could change. Good enough
  to start for personal use.
- *SportsDataIO NFL*: official, with play-by-play and box scores. Paid, and the
  free trial scrambles values, so it's the upgrade path.
- *API-Sports American Football*: cheap, but player stats support should be
  checked before relying on it.

Recommendation: start with ESPN behind the interface. I haven't checked any of
these endpoints yet; that happens at the start of Phase 5.

## Matching

- **Teams**: a canonical table of the 32 teams with aliases ("KC", "KC Chiefs",
  "Kansas City Chiefs"). An event matches on sport, both teams (order-insensitive,
  to absorb home/away naming differences), and a start time within ±3 h.
- **Players**: normalize by NFKD-stripping accents, lowercasing, dropping
  punctuation, and dropping suffixes (jr, sr, ii, iii, iv, v). Match against that
  game's rosters only. Confidence is 1.0 for an exact normalized full name, 0.9
  when the initial and last name are unique in the game, and anything lower is
  left unlinked for manual confirmation.
- Mappings persist and are reused by ID. Low-confidence matches are never
  linked automatically.

## UI rules

- Display like Island Luck: **American odds** (+1187, not 12.866), times in
  **America/Nassau**, and "picks" (not "legs"). Group a parlay's picks by game;
  a bet builder is several picks in one game. Storage stays decimal ×1000 and UTC.
- Always show the potential payout, including where Island Luck hides it:
  cashed out → "Cashed out $4.75 of a possible $1,336.03", and lost → "Would have
  paid $2,485.00". (Kambi zeroes it on losses; the parser recomputes it from
  stake × played odds.)

- Every game with a pick shows its live state from the scoreboard: quarter +
  clock (or Halftime), score, who has the ball with down & distance, and a
  red-zone flag. Moneyline picks show just that game state and the score from
  the picked team's side, with no progress bar and no verdict.
- Leg progress: threshold props show a bar (`73 / 80 · 7 needed`). Binary props
  show `○ Not yet` / `✓ Scored`. Unknown shows "Progress unavailable".
- A parlay shows `n / m legs completed (live)` separately from the official
  Kambi status badge. "Target reached" never changes the OPEN badge.

## Security

- No Island Luck credentials or Kambi tokens are handled anywhere. The
  extension only copies response bodies the page already received.
- Extension → tracker calls use a per-user token the tracker issues when you
  sign in from the popup. It is stored in `chrome.storage.local`; the password
  is not.
- The tracker's CORS allowlist is the extension origin only.
- `rawPayload` may contain account identifiers, so it's never logged. Test
  fixtures go through `scripts/sanitize.mjs`, and `.gitignore` excludes
  `*.raw.json` and `captures/`.
- Minimum permissions: `storage`, content scripts on Island Luck only, and
  tracker host access requested at runtime. No `cookies` or `<all_urls>`.

## Phone access, accounts, notifications (added 2026-09-27)

- **Access:** home Wi-Fi only (chosen). The API serves the built web app at
  `/`, and `HOST=0.0.0.0` exposes it to the LAN. It's plain HTTP, so it's fine at
  home but the password crosses Wi-Fi unencrypted. Remote access or web push
  would need HTTPS (e.g. Tailscale).
- **Accounts:** username + scrypt password (`npm run user -w @sports-better/api -- <name>`),
  an HttpOnly SameSite=Lax session cookie (30 days, sliding), and 5 failed logins
  per 15 min per client. Sessions can read; only an extension token can sync.
  Bets and notifications belong to a user and every read is scoped to them.
  New people register through a single-use invite link (`npm run invite`).
  Hosting for more than one person: see `docs/deploy.md`.
- **Extension:** auto-syncs 3 s after the page loads history ("Sync now" for
  manual; toggle in Settings).
- **Stale bets:** "Last synced from Island Luck …" line, and a per-bet
  "probably settled" note when every game is final (or long over).
- **Notifications:** PICK_HIT (live target reached / moneyline won),
  PICK_MISSED (game ended without it), PROBABLY_SETTLED, generated each poll
  cycle and deduped per event. There's an in-app bell feed only; delivery
  channel undecided (`Notification.deliveredAt` is reserved for it).

## Analysis tab (added 2026-09-27)

`GET /api/analysis` (`apps/api/src/analysis`; pure `computeAnalysis` + DB loader):
- Money: net / real money staked (free-bet stakes excluded) / returned / ROI,
  by Monday-start week (Nassau), plus a promo breakdown.
- Picks per bet: your settled-pick hit rate ^ picks vs 1 / odds, by size bucket.
- Hit rate by market (Island Luck results), flagged "early" under 30 picks. The
  implied rate uses single picks only, since bet builder picks share one price.
- How close: picks missed per lost bet; yardage/catch near misses from final live
  stats (deduped across bets).
- Player and team (moneyline) records; cash-out check from final scores/stats.
  The poller now also follows games on cashed-out bets for this.

## Phases

1. **Kambi parser**: done against a synthetic fixture. Needs a real capture
   (from the extension's download button) to verify field names.
2. `apps/api`: Prisma schema, sync endpoint, CLI import, read API. Built;
   DB integration tests pending `.env`.
3. `apps/extension`: passive capture + manual Sync. Built, not yet loaded in a real browser.
4. Incremental sync and status transitions.
5. `packages/sports-data` + ESPN provider (NFL + NCAAF). Built.
6. `packages/matching` + saved mappings (ExternalEventMapping /
   ExternalParticipantMapping). Built; low-confidence players are saved as
   NEEDS_REVIEW, with no review UI yet.
7. `packages/markets` + live poller in the API server (every 30 s, rate
   limited; `GET /api/live/status`). Built, and run against live games.
   `LIVE_POLLER=off` disables it.
8. `apps/web` (React + Vite): Open/Settled tabs, picks grouped by game,
   progress bars / ✓○ TD picks / moneyline scores, live game line with
   possession and red zone. It refreshes every 15 s. Built. The Vite dev proxy
   forwards /api to the API server; sign in on the page as usual.
