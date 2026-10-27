# Emails

Postmark templates for asking to join, in the folder layout `postmark-cli` reads and writes. Each template has an HTML body, a text body and a subject (in `meta.json`), and all of them share the `slip-club` layout: the navy header band with the wordmark, a white plate, and the fine print.

| Alias | To | Model |
|---|---|---|
| `access-received` | whoever asked to join | `username`, `email`, `access_note` (optional) |
| `access-approved` | them, once approved | `username` |
| `access-declined` | them, once declined | none |
| `access-requested` | whoever approves requests | `username`, `email`, `access_note` (optional), `requested_at` (already formatted in Nassau time, e.g. `Oct 27, 2026, 1:14 PM`) |

The new-request email links to the admin site (admin.slipclub.app). The wordmark is `apps/web/public/email/wordmark.png` and the fonts are the app's own, both loaded from slipclub.app, so deploy the web app before sending. Mail apps that don't load web fonts fall back to Arial Narrow or Arial.

The app sends them (`src/email/mailer.ts`): `access-received` and `access-requested` when someone asks on the sign-up page, `access-approved` or `access-declined` when a request is answered on the admin site or with `npm run access`. Without `POSTMARK_API_TOKEN` nothing is sent, only logged.

To upload them to the Postmark server, layout first, and send one to yourself with its sample data:

```sh
npm run emails -w @sports-better/api -- push
npm run emails -w @sports-better/api -- test access-approved you@example.com
```

Each `meta.json` has a `TestRenderModel`, used by `test` and by previews in Postmark. Edits made in Postmark's editor are overwritten by the next push, so make them here.
