# Handoff: "Connected devices" in Account settings

Let people see every extension and phone that can sync to their account, and cut any of them off. Optionally, also show where they're signed in on the web and offer "sign out everywhere else".

## Why

The October 2026 security audit found that a user has no way to see or cancel the sync keys made for their account. The reports are in `~/security-audit-skill/sports-better/run-1/`, lead 2.

- Keys never expire (see `ApiKey` in `apps/api/prisma/schema.prisma`).
- Signing out of the extension deletes only that one key (`DELETE /api/auth/extension-token`).
- Every new phone install link makes a new key, and the old ones stay valid.
- The only way to clear them all today is the operator's password-reset script (`apps/api/src/scripts/user.ts`).

A phone key is the most likely to leak. It sits in the install URL and inside the Island Luck page (see `apps/api/src/userscript/island-luck-sync.user.js`).

Part of this is already fixed: keys can only sync now (`requireSessionAuth` in `apps/api/src/auth.ts`, mounted in `apps/api/src/app.ts`). A leaked key can't read bets or make new keys. It can still upload fake bets into the account until someone deletes it. That last gap is what this page closes.

## Where it goes

The Account screen is `apps/web/src/components/Account.tsx`. It opens from the person button in the header, and it is the app's settings screen. Its sections today are the account panel (email, sign out), `<PhoneSync />` and `<About />`.

Add a **Connected devices** panel between `PhoneSync` and `About`. Phone setup creates a device, so the new device should appear right below it. After `createPhoneSyncLink()` succeeds in `PhoneSync.tsx`, refresh the list. The simplest way is to lift a `reload` callback into `Account`.

## What it shows

One row per key:

- **Name.**
  - If the label is `Phone userscript`, show "Phone (sync script)".
  - Otherwise the label is the browser's User-Agent from `/extension-token`, trimmed to 300 characters. Turn it into something like "Chrome on Mac" or "Firefox on Windows".
  - A small UA-to-words helper is enough. Fall back to "Browser extension".
  - Never show the raw UA string.
- **Added** date and **last used**. Use `dateTime` and `relativeTime` from `@sports-better/display`, re-exported by `apps/web/src/format.ts`. They already use Nassau time.
  - `lastUsedAt` is only refreshed about once an hour (`TOUCH_EVERY_MS` in `apps/api/src/auth/apiKeys.ts`). Say "within the last hour", not "just now".
  - When it's null, say "Never used".
- A **Remove** button. Confirm inline ("Remove this device? It stops syncing until you set it up again."), not in a modal.

Empty state: "No extension or phone is connected. Set up phone sync above, or sign in to the Slip Club Sync extension."

The panel never shows tokens. The server only stores their hashes anyway.

## API

Add these to a new router, `apps/api/src/routes/devices.ts`, mounted at `/api/devices` in `app.ts` after `requireSessionAuth`. A session must be required: a key must never list or delete keys.

| Route | Does |
|---|---|
| `GET /api/devices` | `{ devices: [{ id, kind: 'phone' \| 'extension', label, createdAt, lastUsedAt }] }`, newest first. Query `db.apiKey.findMany({ where: { userId } })`; never select `tokenHash`. |
| `DELETE /api/devices/:id` | `db.apiKey.deleteMany({ where: { id, userId } })`. Return 404 when `count === 0`, so another user's id behaves like a missing one. |

Derive `kind` from the label for now (`label === 'Phone userscript'`). If that feels fragile, add a `kind` column to `ApiKey` with a migration in `apps/api/prisma/migrations/`, set it in `createApiKey`, and backfill existing rows from the label.

When a removed device next syncs, its key gets a 401. The extension already handles that by showing its signed-out state. The userscript shows its error toast. Check that the userscript's message says to make a new install link (`island-luck-sync.user.js`, the toast around the sync call).

Add the client helpers to `apps/web/src/api.ts` next to `createPhoneSyncLink`, using the existing `get` and `del` helpers.

## Optional, same panel: web sign-ins

`Session` (in `schema.prisma`) already stores `userAgent`, `createdAt`, `lastSeenAt` and `expiresAt`. Two ways to use it:

- **Small version:** add a "Sign out everywhere else" button. `POST /api/auth/sessions/revoke-others` deletes every session for the user except the current one (find the current one with `readCookie` and the token hash, as in `apps/api/src/auth/sessions.ts`). This belongs in `authRouter`, which already reads the cookie itself.
- **Full version:** list the sessions like the devices, mark "This browser" for the current one, and add Remove on each of the others.

Session routes must also be session-only. `authRouter` runs before `authenticate`, so check the cookie there, as `/me` and `/email` do.

## Tests

Add to `apps/api/test/auth.integration.test.ts`, or make a new `devices.integration.test.ts` using the same setup. Run them with Node 22 and with `TEST_DATABASE_URL` set in `.env`. `apps/api/test/testDb.ts` explains how that database is chosen and emptied.

1. Listing shows only your own devices, with no token or hash fields in the JSON.
2. Remove works: after `DELETE`, syncing with that key returns 401.
3. You can't remove someone else's device: buddy's id returns 404, and buddy's key still syncs.
4. A key can't call `GET` or `DELETE /api/devices` (403).
5. If you build the session part: "sign out everywhere else" keeps the current cookie working and makes another session's cookie return 401.

There are no web tests in this repo. Check the panel by hand at phone width in both themes. `apps/web/DESIGN.md` covers panels ("Bet plate and panels"), buttons and inputs. Reuse `panel`, `panel-head`, `muted small` and `btn`, as `Account.tsx` does.

## Copy and conventions

- **Brand:** "Slip Club". The extension is "Slip Club Sync".
- **Words:** "device", not "API key" or "token". People don't know what a key is.
- **No red button for every row:** Remove is a normal `btn`. Only the confirm step uses the destructive style, if `DESIGN.md` defines one.

## Out of scope

- Expiry for keys (for example, phone keys that lapse after 90 days without use). It's worth doing later. Decide what the userscript says when its key lapses.
- Email notice when a new device is added. Emails aren't verified or sent yet.
