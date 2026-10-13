---
name: Sports Better
description: Your Island Luck bets, wearing the graphics of the game you are watching.
colors:
  navy: "#0b1f3a"
  navy-2: "#12305a"
  yellow: "#ffd200"
  yellow-pale: "#fff1a8"
  green: "#1fb86a"
  red: "#c8102e"
  white: "#ffffff"
  ground-light: "#e6ebf2"
  cell-light: "#d9e1ec"
  plate-cell-light: "#eef2f7"
  muted-dark: "#a9b9d0"
  plate-muted-dark: "#b4c2d6"
  rule-dark: "#2a4a7a"
  plate-rule-dark: "#2f507f"
  muted-light: "#4a5b75"
  plate-muted-light: "#52637d"
  rule-light: "#c3cedd"
  plate-rule-light: "#d6dde8"
  good-text-dark: "#5fe0a0"
  good-text-light: "#0b6e3c"
  bad-text-dark: "#ff8a98"
  bad-text-light: "#b00d27"
  warn-text-light: "#6b5200"
typography:
  display:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
  headline:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "normal"
  title:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "0.01em"
  plate:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "0.01em"
  strip:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "normal"
  body:
    fontFamily: "'Barlow', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  body-strong:
    fontFamily: "'Barlow', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  meta:
    fontFamily: "'Barlow', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.05em"
  label-small:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.06em"
rounded:
  none: "0"
spacing:
  hairline: "1px"
  tight: "6px"
  sm: "8px"
  row: "10px"
  inset: "12px"
  stack: "14px"
  gutter: "16px"
components:
  plate:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
    typography: "{typography.plate}"
    rounded: "{rounded.none}"
    padding: "4px 8px"
    width: "96px"
  plate-hit:
    backgroundColor: "{colors.green}"
    textColor: "{colors.navy}"
  plate-run:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.navy}"
  plate-miss:
    backgroundColor: "{colors.red}"
    textColor: "{colors.white}"
  plate-hollow:
    backgroundColor: "transparent"
    textColor: "{colors.plate-muted-dark}"
    typography: "{typography.label}"
  plate-small:
    typography: "{typography.label}"
    padding: "2px 8px"
  bet:
    backgroundColor: "{colors.navy-2}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
  bet-light:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy}"
  game-strip:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
    typography: "{typography.strip}"
    padding: "6px 12px"
    height: "38px"
  score-cell:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy}"
    typography: "{typography.headline}"
    width: "46px"
  clock-live:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.navy}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted-dark}"
    rounded: "{rounded.none}"
    padding: "10px 0"
  tab-active:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.navy}"
  totals-cell:
    backgroundColor: "{colors.navy-2}"
    textColor: "{colors.white}"
    typography: "{typography.display}"
    padding: "12px 16px"
  button:
    backgroundColor: "transparent"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "5px 12px"
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.navy}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "11px"
  button-primary-light:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
  segment-on:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.navy}"
    typography: "{typography.label}"
    padding: "5px 12px"
  input:
    backgroundColor: "{colors.navy-2}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.plate-muted-dark}"
    typography: "{typography.label-small}"
    rounded: "{rounded.none}"
    padding: "0 6px"
  count-badge:
    backgroundColor: "{colors.red}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    height: "18px"
---

# Design System: Sports Better

## Overview

**Creative North Star: "The Score Bug"**

Sports Better dresses a bettor's own bets in the on-screen graphics of the game they are watching. The header is a broadcast-navy band, each game inside a bet is a score strip with white score cells and a clock, and every pick row ends in a plate: a flat, square, condensed-caps slab whose fill colour says hit, running or missed before the text is read. The system is shared by the web app (`apps/web`) and the extension popup (`apps/extension`), which carries the same tokens at a smaller base size.

Density is high and deliberate: the screen is checked for a few seconds mid-game, mostly on a phone. Rank comes from two things only, filled plates and 2px rules. There are no rounded cards, no soft elevation between surfaces and no thin progress bars; progress is a fill inside the plate itself. Light and dark follow the device. The shell (header, tabs, totals, score strips, sign-in backdrop) is navy in both themes; the page ground and the bet plates follow the theme, navy-2 with white text in dark and white with navy text in light.

**Key Characteristics:**
- Navy shell in both themes; ground and plates follow the device theme.
- Every pick ends in a fixed-minimum-width state plate (96px), right aligned, so states stack into a readable column.
- Square corners on every surface and control.
- Barlow Condensed in heavy caps for anything that is a label, number or state; Barlow for names and sentences.
- Tabular numerals everywhere.
- One motion: a horizontal wipe when a plate's value changes.

## Colors

Broadcast navy carries the structure, signal yellow marks what is current, and green and red are spent on results and alerts.

### Primary
- **Broadcast Navy** (`navy`, #0b1f3a): The shell in both themes, the dark page ground, the default plate fill, the text and strong rule colour on light plates, and the text on every yellow or green fill.
- **Booth Navy** (`navy-2`, #12305a): The totals strip, the bet and panel plates in dark, the score strip in light, and the focus ring in light.

### Secondary
- **Signal Yellow** (`yellow`, #ffd200): Current and live. The active tab, the live game clock, a running plate, the filled part of a progress plate, the "probably settled" strip, the stale-sync line, cashed out, the focus ring in dark, and the primary button and chosen segment in dark.
- **Unfilled Yellow** (`yellow-pale`, #fff1a8): Only the not-yet-reached part of a progress plate.

### Tertiary
- **Hit Green** (`green`, #1fb86a): The fill of a plate that has hit or a bet that won. Always with navy text.
- **Alert Red** (`red`, #c8102e): The fill of a missed plate or lost bet, and the broadcast alert colour: the LIVE indicator, unread counts, the red-zone tag, error banners and the implied-odds marker on a rate bar. Always with white text.
- **Result text** (`good-text-dark` #5fe0a0, `good-text-light` #0b6e3c, `bad-text-dark` #ff8a98, `bad-text-light` #b00d27, `warn-text-light` #6b5200): Green, red and yellow re-tuned to work as text on a surface instead of as a fill. Used for payouts, missed counts, notification titles and the stale-sync line on light ground.

### Neutral
- **White** (`white`, #ffffff): Light plates, score cells in both themes, text on navy and on red.
- **Light ground and cells** (`ground-light` #e6ebf2, `cell-light` #d9e1ec, `plate-cell-light` #eef2f7): The light page ground, a hover or sunken cell on the ground, and the same inside a plate.
- **Muted text** (`muted-dark` #a9b9d0 on navy, `plate-muted-dark` #b4c2d6 on navy-2, `muted-light` #4a5b75 on light ground, `plate-muted-light` #52637d on white): Market lines, meta, labels, hollow plates, inactive tabs.
- **Hairlines** (`rule-dark` #2a4a7a, `plate-rule-dark` #2f507f, `rule-light` #c3cedd, `plate-rule-light` #d6dde8): 1px dividers between rows and stat cells.

### Named Rules
**The Navy Shell Rule.** The header, tabs, totals strip, score strips and sign-in backdrop are navy in light and dark alike. Only the ground and the plates change with the theme.

**The Yellow Is Now Rule.** Yellow means current, live or waiting on the bettor. It is never decoration, and never information that is merely neutral: the minimum-bet note is muted text for that reason.

**The Measured Yellow Rule.** A running plate turns yellow only for measured progress toward a line. A moneyline lead sits on a plain navy plate until the game is final.

**The Fill Or Text Rule.** Green and red have a fill value and a text value per theme. Fills take navy (on green, yellow) or white (on red, navy) text; coloured text on a surface uses the good, bad and warn text tokens, never the fill value.

## Typography

**Display Font:** Barlow Condensed, weights 600, 700, 800 (with 'Arial Narrow', ui-sans-serif, system-ui, sans-serif)
**Body Font:** Barlow, weights 400, 500, 600 (with ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif)

Both are self-hosted woff2 with `font-display: swap` in the web app (`public/fonts/`); the extension ships its own subset of four files.

**Character:** A sports-graphics pairing. The condensed face in uppercase reads as lower-thirds and score cells; the regular width keeps player names and sentences comfortable at small sizes.

### Hierarchy
- **Display** (Condensed 800, 28px, line-height 1, 0.01em, uppercase): The product name, the sign-in heading, totals values, the net figure on a style cell. Drops to 24px under 520px for totals and under 380px for the product name.
- **Headline** (Condensed 800, 24px, line-height 1): Odds, scores, stat values, a profile name.
- **Title** (Condensed 800, 19px, line-height 1.15, 0.01 to 0.02em, uppercase): A bet's "2 of 5 picks hit" line and panel headings.
- **Plate** (Condensed 800, 20px, line-height 1.15, 0.01em, uppercase): The state at the end of a pick. Score strips use the same size at weight 700.
- **Body** (Barlow 400, 15px, line-height 1.4): Sentences and lists; prose is capped at 70ch. Names of players, teams and people are weight 600.
- **Meta** (Barlow 400, 12px): Market lines, placed times, the note under a plate, the sync line. 13px for tables and form labels.
- **Label** (Condensed 700, 15px, 0.05em, uppercase): Buttons, segments, header links, hollow and small plates, the live indicator. 16px for the stake and payout foot, 18px for a full-width primary button.
- **Label small** (Condensed 600 to 700, 12px, 0.06 to 0.08em, uppercase): Stat labels, chips, table headers, the same-game group label.

The stylesheet tokenizes seven small steps (11, 12, 13, 15, 16, 18, 20px), of which 11px is declared but not used; the condensed sizes above them (19, 24, 28px) are written as raw values.

### Named Rules
**The Two Voices Rule.** Condensed caps are for labels, numbers and states. Anything a person would say aloud as a name or a sentence is Barlow in sentence case.

**The Tabular Rule.** Numerals are tabular everywhere, set once on the root, so scores, odds and money do not shift between refreshes.

## Layout

One centred column: 760px maximum with a 16px gutter (12px under 520px). From 1040px the column widens to 1120px and the bet list and analysis panels flow into two CSS columns with a 14px gap, each plate kept whole; social and phone-sync stay at 760px.

The shell sits flush to the top, honouring the safe-area inset, and stacks the name row, the status row, four equal tabs and a three-cell totals strip. Below, plates stack with a 14px gap. Inside a plate the inset is 12px and rows are divided by hairlines, not gaps: head (10px 12px), score strip (minimum 38px tall), pick rows (9px 12px), foot (9px 12px). A pick row is a two-column grid, the name and market on the left and the state on the right in a column at least 96px wide.

Stat groups are grids of equal cells separated by a 1px gap that shows the rule colour through, three across, or four that fold to two under 520px.

Under 520px every control reaches a 44px minimum target, the leaderboard drops its wide-only columns, two-column panels become one, and the notification panel hangs full width from the header row instead of from the bell.

## Elevation & Depth

Flat. Depth is tonal: navy, navy-2 and (in light) white and pale blue-grey layers, separated by 1px hairlines and 2px strong rules. Outlines on hollow plates, chips and the idle status indicator are drawn as 1px inset rings so they add no size.

### Shadow Vocabulary
- **Overlay drop** (`box-shadow: 0 12px 32px rgb(4 12 26 / 0.45)`): The notification panel only, the one surface that floats over other content.
- **Inset ring** (`box-shadow: inset 0 0 0 1px currentColor`): The outline of a hollow plate, a chip, the idle status indicator. A line, not a shadow.

### Named Rules
**The Two Rules Rule.** A 2px rule in the plate's strong colour (white in dark, navy in light) closes a head, opens a foot and underlines a panel or table heading. Everything else is a 1px hairline. A collapsed bet drops its 2px rules to a hairline.

**The Floating Only Rule.** A shadow appears only under a surface that overlaps other content. Nothing in the page flow has one.

## Shapes

Square. Every surface, plate, button, input, tab, chip and badge has a radius of 0, set explicitly on native controls. The only curves in the build are the 7px live dot and the strokes of the icon set. Plates and badges are solid rectangles; outlined variants are the same rectangle with a 1px inset ring. Icons are one inline SVG set on a 16px grid with a 1.75 stroke, round caps and joins, drawn in the current text colour at 1em.

## Components

### State plate (signature)
The end of every pick row and the result of a settled bet.
- **Shape:** Square slab, 96px minimum width, 4px 8px padding, centred, nowrap, Plate type.
- **Tones:** default navy with white text (a neutral state such as a moneyline lead or a pending yes/no); hit, green with navy text and a check; run, yellow with navy text; miss, red with white text and a cross; hollow, no fill with a muted 1px inset ring and Label type ("Not started", "No stats", "Void").
- **Progress:** an over on its way is a run plate with a hard-stopped horizontal gradient, Signal Yellow up to the fraction reached and Unfilled Yellow after it, with the count as its text ("212 / 250") and `role="progressbar"`. There is no separate bar. Unders show the current number on a run plate with no fill.
- **Small:** 2px 8px, Label type, no minimum width; the official status beside a settled bet's odds.
- **Under the plate:** one Meta line in muted text saying the unit and what is left ("pass yds · 38 to go").
- **Motion:** a plate is re-keyed by its text, so a changed value wipes in left to right with `clip-path` over 0.28s, `cubic-bezier(0.16, 1, 0.3, 1)`. Removed under reduced motion.

### Bet plate and panels
- **Background:** navy-2 with white text in dark, white with navy text in light. No border, no radius, no shadow.
- **Head:** Title on the left with a chevron and Meta line under it, odds in Headline on the right; closed by a 2px rule. The whole head is the collapse control: hover tints it with the cell colour, the chevron rotates -90 degrees over 0.15s when collapsed.
- **Foot:** stake left, payout right, Label type at 16px, opened by a 2px rule.
- **Panels** (analysis, social, phone sync): the same plate with 12px 14px 14px padding and a Title heading underlined by a 2px rule.
- **Group label:** picks from one bet builder sit under a single Label small row ("Same game").

### Score strip
- **Style:** a full-width band, navy in dark and navy-2 in light, at least 38px tall, Strip type, white text. Team abbreviations flex; each score is a white cell with navy Headline numerals, at least 46px wide; the clock is the last cell.
- **States:** live, the clock cell fills yellow with navy text and a dot; final, plain white text; not started, the full matchup in Barlow 600 16px with the kickoff time in muted caps.
- **Sub line:** a Meta row on the cell colour with the full matchup, possession, down and distance, and a red "RED ZONE" tag.

### Buttons
- **Shape:** square (0), Label type.
- **Secondary:** transparent with a 1px border in the text colour, 5px 12px; hover fills with the cell colour.
- **Primary:** filled, yellow with navy text in dark and on the navy shell, navy with white text on light plates; 11px padding and 18px type when full width. Hover is `brightness(1.15)`.
- **Disabled:** 55% opacity. **Focus:** 2px outline in the focus colour (yellow in dark and on the shell, navy-2 in light), offset 2px.
- **Destructive (popup):** a secondary button with the bad-text colour for border and label, set apart by a 20px top margin.
- **Text link:** muted and underlined in the flow; in the shell, Label type with no underline.

### Tabs and segments
- **Tabs:** four equal columns in the shell, 17px condensed 700 caps, muted until hovered. The current tab is a solid yellow cell with navy text. Focus outline is inset 4px, navy on the active tab.
- **Segmented control:** an inline row on the cell colour; the chosen segment is a filled plate in the primary button's colours.
- **Count badge:** a red square, 18px tall, white condensed 13px, on tabs and the bell.

### Chips
- **Style:** Label small in muted text inside a 1px inset ring, 0 6px padding, no fill. Used for bet rewards ("Free bet") and profile facts. Not interactive.

### Inputs / Fields
- **Style:** square, 1px border in the muted colour, the plate colour as background, 16px text, 10px 12px padding (7px 10px inline). Label above in Barlow 500 13px muted.
- **Focus:** 2px outline in the focus colour, offset 1px. Caret and native checkboxes take the focus colour through `caret-color` and `accent-color`.

### Stat cells
- **Style:** value in Headline (Display in the totals strip) over a Label small caption, in an equal grid divided by 1px gaps. The totals strip is navy-2 cells on a navy gap in both themes.

### Status row
- **Live indicator:** a small plate in Label type: red with white text when games are live, yellow text in an inset ring when stats are off, muted otherwise. Followed by the last-sync line in Meta, which turns to the warn colour when a bet has probably settled.
- **Settle strip:** a full-width yellow row with navy 13px 600 text inside a bet, between the head and the games.

### Charts
- **Rate bar:** a 16px track in the rule colour with a square fill in the strong colour and a 3px red marker for what the odds implied.
- **Columns:** square bars in the strong colour on a 2px baseline, value above in condensed 700.

### Extension popup
A 300px surface at a 13px base: navy header band with the icon and name at 22px, one plate with a 2px-ruled "Last sync" row and a three-cell stat grid, a full-width primary button, then settings behind a native disclosure. Buttons are full width; tokens and themes match the web app.

## Do's and Don'ts

### Do:
- **Do** end every pick row in a state plate at least 96px wide, and let its fill carry the state: green hit, yellow running, red missed, navy neutral, hollow for nothing to report.
- **Do** show progress as a fill inside the plate, Signal Yellow to Unfilled Yellow at a hard stop, with the count as the plate's text.
- **Do** keep the shell navy in both themes and let the ground and plates follow the device.
- **Do** put navy text on yellow and green fills and white text on red and navy fills.
- **Do** use the good, bad and warn text tokens for coloured text on a surface, per theme.
- **Do** separate with rules: 2px in the strong colour to close a head or open a foot, 1px hairlines for everything else.
- **Do** set labels, numbers and states in Barlow Condensed caps, and names and sentences in Barlow.
- **Do** keep controls at a 44px minimum target under 520px.
- **Do** say "picks", show American odds and Nassau time.

### Don't:
- **Don't** round a surface or control. Radius is 0; the live dot and icon strokes are the only curves.
- **Don't** add a separate progress bar under or beside a plate.
- **Don't** put a shadow on anything in the page flow; only a floating overlay has one.
- **Don't** use yellow for decoration or for neutral information.
- **Don't** turn a plate yellow for a lead that is not measured progress toward a line.
- **Don't** use a fill colour as text on a surface, or coloured text on a fill.
- **Don't** animate anything other than a plate's horizontal wipe and the chevron's turn, and nothing under reduced motion.
- **Don't** add a UI framework, icon package or remote font; fonts are self-hosted and icons are the inline 16px set.
