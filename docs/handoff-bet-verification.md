# Handoff: verified bets

Slip Club is opening to the public, and people will tail each other's bets, so they need to know a bet is real. Today the server believes any coupon sent with a valid sync key. Anyone can fake bets into their own account: send them straight to the sync endpoint, edit Island Luck's reply in DevTools, or run a modified extension. Other people then see those fakes on profiles, the leaderboard and anything they tail.

Only Island Luck knows a user's real bets, and Slip Club can't ask it. Phases 1 and 2 don't prove a bet is real. They make faking pointless. Phase 3 is the only option that really proves it.

## Already done

**Pick lock.** Before an already-synced coupon is updated, the incoming copy is compared with the stored one (`changedWager` in `apps/api/src/sync/wager.ts`, called from `syncOne` in `apps/api/src/sync/syncCoupons.ts`):

- **Refused:** a different placement time, a different set of bets, different picks (event, outcome or line), or higher odds.
- **Allowed:** status, payouts, settlement, a lower stake (partial cash-out), lower odds (a void leg shortens a parlay) and moved start times.

The test is in `apps/api/test/sync.integration.test.ts` ("won't let a later sync change what was bet").

## Phase 1: the server's own checks

Each check produces a reason, and the bet is **verified** only if it passes all of them. Store the reasons, for example as `Bet.verification` (`VERIFIED`, `UNVERIFIED` or `PENDING`) plus `verificationReasons String[]`, so the UI can say why.

1. **Seen before the game.** Use the server's own clock, never the client's `placedAt` or `capturedAt`. `Coupon` needs a `firstSeenAt` that is set on create and never updated; check whether `createdAt` already serves (`schema.prisma`).
   - A pre-game pick passes only if `firstSeenAt` is before its leg's `eventStartAt`.
   - Live picks (`BetLeg.placedLive`) can't pass this check. Label them "live" in the UI rather than failing them.
   - Use the earliest start time seen for the leg: `eventStartAt` is client-supplied too, and pushing it later would fake a pass. Phase 1.3 cross-checks it against Kambi's feed.
2. **Result matches ESPN.** The poller already grades game picks. See `notificationEvents` in `apps/api/src/notifications/generate.ts` and `gameMargin` in `@sports-better/display`.
   - When Kambi's status is settled and the game is `FINAL`, compare the two.
   - On a mismatch, mark the bet unverified with the reason "result doesn't match the final score".
   - Stat props: compare with the final `BetLegProgress` (`FINAL_HIT` or `FINAL_MISSED`).
   - Unsupported markets stay `PENDING` and should be shown as "can't be checked", not as failed.
3. **Odds and game match Kambi's public feed.**
   - The feed is `https://eu.offering-api.kambicdn.com/offering/v2018/islandluck/betoffer/event/<eventId>.json?lang=en_US&market=BS&client_id=200&channel_id=1`. No login is needed (see `apps/api/src/scripts/catalog.ts`).
   - Each outcome has `id` (the same as `LegSelection.externalOutcomeId`) and `odds` (×1000, the same scale as `oddsRaw`). The event gives its names and start time.
   - **Timing:** the feed only has current odds, so the check must run when the bet is first seen, before the game. Do it in a queue, not inside the sync request.
   - **Tolerance:** allow roughly 15% on odds. Odds move, but a 2-to-1 pick claimed at 50-to-1 must fail.
   - **Missing outcomes:** props leave the feed once a game starts. A pick whose outcome is no longer offered is `PENDING`, not failed.
   - **Rate:** one request per new event per 1.5 s, as the catalog script does. The feed is shared with every Island Luck customer, and Kambi can change it without notice, so failures must leave bets `PENDING`, never failed.

## Phase 2: capture bets the moment they're placed

The "seen before the game" check is unfair to honest people who only open My Bets after their game. The extension and userscript should also copy Island Luck's reply to **placing** a bet, so that placing the bet is enough to sync it.

1. Use DevTools on islandluck.com with a real $ bet to record the placement request: its URL, method, and the shape of the reply. Nobody has looked at it yet.
2. Hook it in the same places as history: `HISTORY_URL` in `apps/extension/src/capture-main.js`, `apps/extension/src/lib.js` and `apps/api/src/userscript/island-luck-sync.user.js`. Keep the Kambi-host anchoring.
3. If the reply doesn't contain the full coupon, trigger a history fetch, or wait for the next one. Don't make up fields.
4. Bump the userscript `@version` and the extension version.

## Phase 3, optional: proof the data came from Kambi (TLS notarization)

TLS notarization proves that a reply really came from `cf-al-auth-api.kambicdn.com`. It does this without the server ever seeing the user's Kambi login. With it, Kambi's own `placedDate`, odds, stakes and results would be trustworthy, and Phases 1 and 2 become extra checks. Options:

- **TLSNotary:** open source, with a Chrome extension. As of mid-2026 the store listing is version 0.1.x and says the software hasn't been audited.
- **Reclaim Protocol:** zkTLS, with JS and mobile SDKs and a hosted "attestor".

What it would take:

- **Change the "never makes its own Kambi requests" design** (`docs/island-luck-auth.md`). The client must run the history request itself through the notary. The user's Kambi token still never reaches Slip Club.
- **Run a notary or verifier server,** or trust a provider's.
- **Mobile is the hard part.** The iOS Userscripts app can't run TLSNotary. Reclaim's mobile flow is a separate app hand-off.
- **Bind each Island Luck account to one Slip Club user.** The first notarized account ID claims it. Otherwise someone could notarize a friend's winning account as their own.

Treat this as a spike to try before committing to it. Phases 1 and 2 stand on their own.

## UI

- **Bet card:** a small "Verified" mark, or "Live" or "Can't be checked yet", with the reason on tap.
- **Profiles:** show the share of bets that are verified.
- **Leaderboard and tailing:** use verified bets only, or at least default to them.

Copy should be plain. Say "verified", not "attested" or "proved". Don't accuse anyone: say "We couldn't confirm this one", not "fake".

## Tests

Use the integration setup in `apps/api/test/` with `TEST_DATABASE_URL`. The ESPN fake and fixtures are in `pollCycle.integration.test.ts`. Mock the Kambi feed the same way; never call it in tests.

1. A bet first seen after kick-off is unverified.
2. A bet first seen before kick-off with a matching result is verified.
3. A settled WON whose ESPN final says it lost is unverified, with the reason.
4. Odds 10× the feed's are unverified. Odds within tolerance pass. An outcome missing from the feed is pending.
5. A live pick shows as live, not failed.
