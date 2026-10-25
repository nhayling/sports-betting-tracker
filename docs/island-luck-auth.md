# Island Luck / Kambi: how the extension gets bet history

## Decision: passive capture

The extension never makes its own Kambi requests and never handles auth. A
MAIN-world content script on the Island Luck page wraps `fetch` and
`XMLHttpRequest`. When the page's Kambi client loads `coupon/history.json`, the
script copies the response body and passes it to the extension. Request headers,
cookies and tokens are never read.

This means:

- Only what the page has loaded gets synced. Open bets refresh when you open
  My Bets on Island Luck, and older history comes in as you scroll or page back.
- An expired session shows up as the page failing to load history. The
  extension doesn't need to detect 401/403 itself; it just sees nothing new.
- Kambi changes to auth can't break the extension. Changes to the URL or
  response shape can: the hook matches `/player/api/v*/…/coupon/history.json`
  on Kambi's own servers (any `kambicdn.com` or `kambicdn.org` host, so page
  script can't pass off another site's reply as bet history),
  and an unrecognized body gets stored so it can be downloaded and inspected.

## Endpoint (for reference)

```
GET https://cf-al-auth-api.kambicdn.com/player/api/v2019/islandluck/coupon/history.json
    ?lang=en_US&market=BS&client_id=200&channel_id=1
    &range_size=25&range_start=0&toDate=<ISO>
```

## Verified (2026-09-27)

- The hook fires: DevTools shows `capture-main.js` in the initiator stack for
  Kambi calls. The Kambi client uses `fetch` from the top frame, so no iframe
  handling is needed.
- The `history.json` response shape is confirmed and captured in
  `packages/kambi/fixtures/captured/`. It contained no account identifiers.
- Island Luck returns the same coupons under either `coupons` or
  `historyCoupons` (both seen on 2026-09-27); the extension and the parser
  accept both. A response the extension can't read is kept, and re-processed
  with its original capture time once an update understands it.

## `open.json` (resolved: not bet data)

The page polls
`https://eu.offering-api.kambicdn.com/offering/v2018/islandluck/event/live/open.json`,
Kambi's public live-events/odds feed. It holds no bets, so the extension
doesn't capture it, and there's no Kambi open-bets feed to hook. Settlement
still arrives through `history.json` when My Bets is opened.

Possible later use: it's keyed by the same Kambi `eventId`s as the coupons, so
it could tell the live-progress poller which events are in play without any
fuzzy matching. That would put a sportsbook feed into the live path, which the
plan avoids, so it isn't planned.
