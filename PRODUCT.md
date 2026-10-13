# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who bet on sports at Island Luck (a Bahamas sportsbook running on Kambi). Today that is the owner and a group of invited friends; the product is meant to grow to any Island Luck bettor.

Their main job is watching live bets: during games they open the tracker, mostly on a phone from the home screen, to see how each open pick is tracking and whether a bet is still alive. Reviewing settled results, reading the analysis and following friends are secondary jobs.

They read bets the way Island Luck shows them: American odds (+1187), times in Nassau local time, and "picks". Typical stakes are small (around $5.00).

## Product Purpose

Sports Better copies the bet history a person already has at Island Luck into their own tracker, then follows each open pick against live game statistics so they can see where a bet stands without working it out by hand. Success is a bettor glancing at their phone mid-game and knowing at once which picks have hit, which are still running, and which have missed.

## Positioning

Island Luck shows a bet as a slip; Sports Better shows it as progress. It reads the bettor's real bets (no manual entry) and tracks every pick, including bet-builder picks grouped by game, against live stats.

## Operating Context

- Bets arrive by sync from Island Luck, never by typing them in: the "Island Luck Bet Sync" browser extension on a computer, or a userscript installed on the phone through a personal install link.
- The server polls live game statistics about every 30 seconds; the web app refreshes every 15 seconds while visible.
- Used during live games, often repeatedly and briefly, on a phone added to the home screen. Also used on desktop.
- New accounts join through an invite link.

## Capabilities and Constraints

Web app (`apps/web`):

- Open bets and settled bets, each bet showing its picks with live progress, grouped by game.
- Totals: open bets, at stake, potential return; settled bets, staked, returned.
- Freshness status: live games count, stats paused or off, last sync from Island Luck, bets that have probably settled and need a re-sync.
- Notifications: pick hit, pick missed, bet probably settled.
- Analysis of the bettor's own history.
- Social: people, friends and followers (accounts can be locked), profiles with other people's bets, a leaderboard by period, and social settings.
- Sign in, register from an invite, sign out, phone sync setup.

Extension (`apps/extension`): a popup showing last sync, bets found, open and settled counts, a "Sync now" action, and settings (tracker URL, sign in, account label, auto-sync, download captured JSON, clear captured bets).

Constraints:

- Stack stays as it is: React + Vite with plain CSS for the web app; plain HTML, CSS and JavaScript for the extension. No new UI framework or dependencies.
- Light and dark themes both work, following the device setting.
- Terminology: "picks" (never "legs"), American odds, Nassau local time.
- Money is stored ×1000 (5000 = $5.00); shared formatting lives in `packages/display`.

Open decisions:

- The names "Sports Better" and "Island Luck Bet Sync" are the current names but were not confirmed as fixed.
- The current feature set was not confirmed as fixed; a rebuild may reorganise or drop screens with the owner's agreement.
- How public sign-up will work once the product opens beyond invites.

## Evidence on Hand

- Real bet, live-stat, analysis and social data from the running API (types in `apps/api/src/views`, `apps/api/src/analysis`, `apps/api/src/social`).
- App icons: `apps/web/public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`; extension icons in `apps/extension/icons/`.
- No testimonials, user counts, press or pricing exist. Do not invent them. The product has no affiliation with Island Luck to claim.

## Product Principles

1. Live first: the state of an open bet right now is the most important thing on any screen.
2. Read at a glance: a bettor checks mid-game for a few seconds; hit, running and missed must be unmistakable.
3. Speak Island Luck's language: the same odds format, times and words the bettor sees on their slip.
4. Be honest about freshness: always show how current the stats and the sync are, and say when a bet has probably settled.
5. Phone first, but not phone only.
