# Icons

`icon.svg` is the app icon (option B, chosen 2026-09-27): a check mark whose
stroke rises into an arrow, in the tracker's emerald `#22c55e` on dark `#0c1410`.
`options.png` shows the three concepts considered.

Generated files (re-run after editing `icon.svg`; needs Chrome running with
`--remote-debugging-port=9333`):

```
node render.mjs icon.svg 32 32 ../../apps/web/public/favicon-32.png transparent
node render.mjs icon-square.svg 180 180 ../../apps/web/public/apple-touch-icon.png   # iOS rounds corners itself
for s in 16 32 48 128; do node render.mjs icon.svg $s $s ../../apps/extension/icons/icon-$s.png transparent; done
cp icon.svg ../../apps/web/public/favicon.svg
```
