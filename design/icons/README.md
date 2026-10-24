# Icons

`icon.svg` is the Slip Club app icon (2026-10-24): the ticket "I" from the
wordmark, yellow `#FFCD16` on navy `#0B2340`, with rounded corners for the
browser and the extension. `icon-square.svg` is the same full-bleed, for iOS,
which rounds the corners itself. Both are taken from the branding master in
`assets/branding/08/SLIP CLUB/Ticket I/App icon master 1025.svg`; change it
there first.

`bettor-days/` holds the drafts from the short-lived Bettor Days name (a
winning slip was picked, then replaced by the Slip Club branding).
The older files here (`a-…`, `b-…`, `c-…`, `options.png`) are the first round,
from 2026-09-27.

Generated files (re-run after editing `icon.svg` or `icon-square.svg`; macOS
with Chrome in /Applications):

```
node design/icons/render-all.mjs
```

writes `apps/web/public/favicon.svg`, `favicon-32.png` and `apple-touch-icon.png`
(180), and `apps/extension/icons/icon-{16,32,48,128}.png`, each drawn at its own
size. Then `npm run package:extension` for a new extension build.
