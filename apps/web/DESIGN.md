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
  risk-dark: "#ff4252"
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
    letterSpacing: "0.02em"
  plate:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "0.01em"
  bet-title:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "0.01em"
  tab:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.05em"
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
  micro: "3px"
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
  plate-hold:
    backgroundColor: "transparent"
    textColor: "{colors.good-text-dark}"
  plate-risk:
    backgroundColor: "transparent"
    textColor: "{colors.risk-dark}"
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
  pick-cell:
    backgroundColor: "{colors.navy}"
    rounded: "{rounded.none}"
    height: "12px"
  pick-cell-hit:
    backgroundColor: "{colors.green}"
  pick-cell-hold:
    backgroundColor: "transparent"
  pick-cell-run:
    backgroundColor: "{colors.yellow}"
  pick-cell-wait:
    backgroundColor: "transparent"
  pick-cell-risk:
    backgroundColor: "transparent"
  pick-cell-miss:
    backgroundColor: "{colors.red}"
  hit-fold:
    backgroundColor: "transparent"
    textColor: "{colors.plate-muted-dark}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
    height: "44px"
  banner-error:
    backgroundColor: "{colors.red}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted-dark}"
    typography: "{typography.tab}"
    rounded: "{rounded.none}"
    padding: "10px 0"
  tab-bar-phone:
    backgroundColor: "{colors.navy}"
    height: "52px"
  tab-active:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.navy}"
  totals-cell:
    backgroundColor: "{colors.navy-2}"
    textColor: "{colors.white}"
    typography: "{typography.display}"
    padding: "12px 16px"
  standings-tally:
    backgroundColor: "{colors.navy-2}"
    textColor: "{colors.white}"
    typography: "{typography.headline}"
    rounded: "{rounded.none}"
    padding: "10px 16px"
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

Sports Better dresses a bettor's own bets in the on-screen graphics of the game they are watching. The header is a broadcast-navy band, each bet is a slip that opens with a standing plate and a strip of one cell per pick, and every pick row ends in a plate: a flat, square, condensed-caps slab whose fill colour says hit, running or missed before the text is read. The bet slip is the unit. A bet can span several games and sports, so a game is one small line on each pick, never a strip or a section of its own. The system is shared by the web app (`apps/web`) and the extension popup (`apps/extension`), which carries the same tokens at a smaller base size.

Density is high and deliberate: the screen is checked for a few seconds mid-game, mostly on a phone. Rank comes from two things only, filled plates and 2px rules. There are no rounded cards, no soft elevation between surfaces and no progress bar beside a pick; a pick's progress is a fill inside its plate, repeated once in the bet's cell strip. Fill also carries certainty: a filled green or red plate is a result that cannot change, an outlined one is a state that can still move. Light and dark follow the device. The shell (header, tabs, totals, sign-in backdrop) is navy in both themes; the page ground and the bet plates follow the theme, navy-2 with white text in dark and white with navy text in light.

**Key Characteristics:**
- Navy shell in both themes; ground and plates follow the device theme.
- Every open bet opens with a standing plate and a cell per pick, so a folded bet still shows where it stands.
- Every pick ends in a fixed-minimum-width state plate (96px), right aligned, so states stack into a readable column.
- Filled means final; outlined means it can still move.
- Square corners on every surface and control.
- Barlow Condensed in heavy caps for anything that is a label, number or state; Barlow for names and sentences.
- Tabular numerals everywhere.
- One motion: a horizontal wipe when a plate's value changes.

## Colors

Broadcast navy carries the structure, signal yellow marks what is current, and green and red are spent on results and alerts.

### Primary
- **Broadcast Navy** (`navy`, #0b1f3a): The shell in both themes, the phone tab bar, the dark page ground, the default plate fill, the text and strong rule colour on light plates, and the text on every yellow or green fill.
- **Booth Navy** (`navy-2`, #12305a): The totals strip, the bet and panel plates in dark, and the focus ring in light.

### Secondary
- **Signal Yellow** (`yellow`, #ffd200): Current and live. The active tab, a running plate, the "Needs one" standing plate, a pick cell in play, the filled part of a progress plate or cell, the strip on a bet whose games are all over, the warning parts of the freshness line, the waiting dot on the setup screen, cashed out, the focus ring in dark, and the primary button and chosen segment in dark.
- **Unfilled Yellow** (`yellow-pale`, #fff1a8): Only the not-yet-reached part of a progress plate or cell.

### Tertiary
- **Hit Green** (`green`, #1fb86a): The fill of a plate or cell that has hit for good, or a bet that won, always with navy text. As a 2px outline with no fill, a yardage line reached that can still drop.
- **Alert Red** (`red`, #c8102e): The fill of a final miss, a dead or lost bet, always with white text. As a 3px outline on light plates, a line crossed mid-game that can still come back (Risk Red takes that job on navy). Also the broadcast alert colour: the LIVE indicator, the live dot on a pick's game line, unread counts, error banners and the implied-odds marker on a rate bar.
- **Risk Red** (`risk-dark`, #ff4252): An at-risk line in dark: its ring and its plate numerals. The brand red is too dark to read on navy; this one stays red, not pink, at 3.9:1 for large type and rings. Light uses Alert Red.
- **Result text** (`good-text-dark` #5fe0a0, `good-text-light` #0b6e3c, `bad-text-dark` #ff8a98, `bad-text-light` #b00d27, `warn-text-light` #6b5200): Green, red and yellow re-tuned to work as text on a surface instead of as a fill. Used for payouts, the numerals inside a hold plate, the count on the hit fold, Island Luck's own result on a pick, notification titles and the warning parts of the freshness line on light ground.

### Neutral
- **White** (`white`, #ffffff): Light plates, text on navy and on red.
- **Light ground and cells** (`ground-light` #e6ebf2, `cell-light` #d9e1ec, `plate-cell-light` #eef2f7): The light page ground, a hover or sunken cell on the ground, and the same inside a plate.
- **Muted text** (`muted-dark` #a9b9d0 on navy, `plate-muted-dark` #b4c2d6 on navy-2, `muted-light` #4a5b75 on light ground, `plate-muted-light` #52637d on white): Market and game lines, meta, labels, hollow plates, waiting cells, inactive tabs.
- **Hairlines** (`rule-dark` #2a4a7a, `plate-rule-dark` #2f507f, `rule-light` #c3cedd, `plate-rule-light` #d6dde8): 1px dividers between rows and stat cells, and the line above the phone tab bar.

### Named Rules
**The Navy Shell Rule.** The header, tabs (in the header or in the phone's bottom bar), totals strip and sign-in backdrop are navy in light and dark alike. Only the ground and the plates change with the theme.

**The Yellow Is Now Rule.** Yellow means current, live or waiting on the bettor. It is never decoration, and never information that is merely neutral: the minimum-bet note is muted text for that reason.

**The Measured Yellow Rule.** A pick's plate turns yellow only for measured progress toward a line. A moneyline lead sits on a plain navy plate until the game is final.

**The Fill Is Final Rule.** Filled red is a final miss and nothing else; filled green is a final or irreversible hit. A state that can still move is outlined: red for a line crossed mid-game ("at risk", "over for now"), green for a yardage line reached that can still drop ("there for now"). A bet is called dead only on a final miss.

**The Fill Or Text Rule.** Green and red have a fill value and a text value per theme. Fills take navy (on green, yellow) or white (on red, navy) text; coloured text on a surface uses the good, bad and warn text tokens, never the fill value. An outlined plate draws its ring in the fill value and its text in the text token.

## Typography

**Display Font:** Barlow Condensed, weights 600, 700, 800 (with 'Arial Narrow', ui-sans-serif, system-ui, sans-serif)
**Body Font:** Barlow, weights 400, 500, 600 (with ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif)

Both are self-hosted woff2 with `font-display: swap` in the web app (`public/fonts/`); the extension ships its own subset of four files.

**Character:** A sports-graphics pairing. The condensed face in uppercase reads as lower-thirds and score cells; the regular width keeps player names and sentences comfortable at small sizes.

### Hierarchy
- **Display** (Condensed 800, 28px, line-height 1, 0.01em, uppercase): The product name, the sign-in heading, totals values, the net figure on a style cell. Drops to 24px under 520px for totals and under 380px for the product name.
- **Headline** (Condensed 800, 24px, line-height 1): Odds, stat values, a profile name, the setup screen's heading.
- **Title** (Condensed 800, 19px, line-height 1.15, 0.02em, uppercase): Panel headings.
- **Bet title** (Condensed 800, 18px, line-height 1.15, 0.01em, uppercase): A bet's "2 of 3 hit" line.
- **Plate** (Condensed 800, 20px, line-height 1.15, 0.01em, uppercase): The state at the end of a pick.
- **Body** (Barlow 400, 15px, line-height 1.4): Sentences and lists; prose is capped at 70ch. Names of players, teams and people are weight 600.
- **Meta** (Barlow 400, 12px): Market lines, a pick's game line, a bet's latest change or placed time, the note under a plate, the freshness line. 13px for tables, form labels, the hit fold and the settle strip.
- **Label** (Condensed 700, 15px, 0.05em, uppercase): Buttons, segments, standing plates, hollow and small plates, the live indicator. 16px for the stake and payout foot, 18px for tabs and a full-width primary button.
- **Label small** (Condensed 600 to 700, 12px, 0.06 to 0.08em, uppercase): Stat labels, chips, table headers, the "Still needs" and "Missed" group labels.

The stylesheet tokenizes seven small steps (11, 12, 13, 15, 16, 18, 20px), of which 11px is declared but not used; the condensed sizes above them (19, 24, 28px) are written as raw values.

### Named Rules
**The Two Voices Rule.** Condensed caps are for labels, numbers and states. Anything a person would say aloud as a name or a sentence is Barlow in sentence case.

**The Tabular Rule.** Numerals are tabular everywhere, set once on the root, so scores, odds and money do not shift between refreshes.

## Layout

One centred column: 760px maximum with a 16px gutter (12px under 520px). From 1040px the column widens to 1120px. The bet list becomes two stacks side by side with a 14px gap, dealt alternately so the sorted order still reads top to bottom across them; the two stacks apply to the Open list only (`.list.stacks`), and only when there are two or more bets; a lone bet sits centred at 760px; each Analysis section lays its panels two to a row, a lone or odd-last panel taking the whole row. Social, the account screen and the setup screen stay at 760px.

The shell sits flush to the top, honouring the safe-area inset. It stacks the name row (product name on the left; live plate, bell and account button on the right, wrapping under the name when they do not fit), one freshness line, and on the Open and Settled screens a three-cell totals strip. On Open with two or more bets, the standings tally sits under the totals, inside the same navy-2 band. The four section tabs are equal columns. Above 760px they sit in the shell between the freshness line and the totals. At 760px and under they are a bottom bar fixed to the screen edge, each tab at least 52px tall, padded by the bottom safe-area inset, and the page keeps 76px plus the inset clear beneath its content so nothing ends behind the bar.

Below the shell, plates stack with a 14px gap. Inside a bet the inset is 12px and rows are divided by hairlines, not gaps: head (10px 12px), cell strip (8px 12px), group label, pick rows (8px 12px), hit fold (10px 12px, at least 44px tall), foot (9px 12px). The head is a three-column grid: standing plate, title and meta, odds. A pick row is a two-column grid, the name, market and game on the left and the state on the right in a column at least 96px wide.

Stat groups are grids of equal cells separated by a 1px gap that shows the rule colour through, three across, or four that fold to two under 520px.

Under 520px every control reaches a 44px minimum target, the leaderboard drops its wide-only columns, two-column panels become one, and the notification panel hangs full width from the header row instead of from the bell.

## Elevation & Depth

Flat. Depth is tonal: navy, navy-2 and (in light) white and pale blue-grey layers, separated by 1px hairlines and 2px strong rules. Outlines are drawn as inset rings so they add no size: 1px for the quiet ones (hollow plates, chips, the idle live indicator, a waiting cell), 2px green for a held line and 3px red for a line at risk (hold and risk plates and cells).

### Shadow Vocabulary
- **Overlay drop** (`box-shadow: 0 12px 32px rgb(4 12 26 / 0.45)`): The notification panel only, the one surface that opens over other content.
- **Inset ring** (`box-shadow: inset 0 0 0 1px currentColor`): The outline of a hollow plate, a chip, the idle live indicator, a waiting cell. A line, not a shadow.
- **State ring** (`box-shadow: inset 0 0 0 2px` in Hit Green for hold, `3px` in Risk Red for risk): The outline of a hold or risk plate or cell. A line, not a shadow.

### Named Rules
**The Two Rules Rule.** A 2px rule in the plate's strong colour (white in dark, navy in light) closes a head, opens a foot and underlines a panel or table heading. Everything else is a 1px hairline. A collapsed bet drops its 2px rules to a hairline.

**The Floating Only Rule.** Only the notification panel casts a shadow, because it opens over other content. Nothing in the page flow has one, and the phone's fixed tab bar is set off by a hairline instead.

## Shapes

Square. Every surface, plate, cell, button, input, tab, chip and badge has a radius of 0, set explicitly on native controls. The only curves in the build are the 7px live dot and the strokes of the icon set. Plates and badges are solid rectangles; outlined variants are the same rectangle with an inset ring. Icons are one inline SVG set on a 16px grid with a 1.75 stroke, round caps and joins, drawn in the current text colour at 1em.

## Components

### State plate (signature)
The end of every pick row, the standing at the head of every bet, and the result of a settled bet.
- **Shape:** Square slab, 96px minimum width, 4px 8px padding, centred, nowrap, Plate type.
- **Filled tones:** default navy with white text (a neutral state such as a moneyline lead or a pending yes/no); hit, green with navy text and a check; run, yellow with navy text; miss, red with white text and a cross.
- **Outlined tones:** hold, no fill with a 2px green inset ring and good-text numerals, for a yardage over that is there for now; risk, no fill with a 3px Risk Red inset ring (#ff4252 in dark, Alert Red in light) and numerals in the same red, for an under that is over for now. The plate states the margin ("6.5 over", with no plus sign, which would read as a spread line; "Over" when there is no margin to show) and the note keeps the raw stat and line ("71 rush yds · under 64.5 · over for now"). On a small standing plate the text stays plain and only the ring is red, because the risk red is too faint as 15px text; hollow, no fill with a muted 1px inset ring and Label type ("Not started", "No stats", "Void").
- **Progress:** an over on its way is a run plate with a hard-stopped horizontal gradient, Signal Yellow up to the fraction reached and Unfilled Yellow after it, with the count as its text ("212 / 250") and `role="progressbar"`. Unders show the current number on a run plate with no fill.
- **Small:** 2px 8px, Label type, no minimum width. This is the standing plate and the result plate in a bet's head.
- **Under the plate:** one Meta line in muted text saying the unit and what is left or what just happened ("pass yds · 38 to go", "there for now", "over for now"). When Island Luck has already ruled on a pick in an open bet, its result follows in 12px weight 600 good or bad text.
- **Motion:** a plate is re-keyed by its text or standing, so a changed value wipes in left to right with `clip-path` over 0.28s, `cubic-bezier(0.16, 1, 0.3, 1)`. Removed under reduced motion.

### Standing plate
A small plate at the left of every open bet's head, read from live stats.
- **States:** "Needs one" (run, yellow); "At risk" (risk, outlined red); "N to go" (default navy); "All hit" (hit, green); "Needs sync" (sync, a 2px ring and text in warn-text: the yellow of now in dark, its readable ochre on white, because it is the one standing waiting on you); "Not started" (hollow); "Dead" (miss, red), only when a pick has finally missed.
- **Order:** open bets are sorted by standing in that order, closest to paying first. A dead bet starts folded.
- **Settled bets** carry Island Luck's result in the same place: Won (hit), Lost (miss), Cashed out (run), anything else hollow.

### Pick cells
A strip under the head with one equal-width cell per pick, shown when a bet has more than one pick and kept visible when the bet is folded.
- **Shape:** square cells 12px tall with a 3px gap, in an 8px 12px row closed by a hairline. Decorative to assistive tech; the rows below say the same thing in words.
- **States:** hit, green fill; hold, 2px green ring with no fill; run, yellow, with the same hard-stopped fill as the plate when the pick has a measured fraction and solid yellow when it is in play without one; wait, 1px muted ring (also a void pick); risk, 3px Risk Red ring with no fill (a tint would read as a pale miss); miss, red fill.
- **Order:** left to right hit, hold, run, wait, risk, miss, so the strip reads like the bet filling up.

### Bet plate and panels
- **Background:** navy-2 with white text in dark, white with navy text in light. No border, no radius, no shadow.
- **Head:** standing plate, then Bet title with a reward chip, with a Meta line under it holding the chevron and either the latest hit or miss or the leagues and placed time; odds in Headline on the right; closed by a 2px rule. The whole head is the collapse control: hover lifts it slightly toward the text colour (6% white in dark, 5% navy in light), never darkens it, so the default navy standing plate stays visible; the chevron rotates -90 degrees over 0.15s when collapsed.
- **Notices:** the settle strip, a full-width yellow row with navy 13px 600 text, sits under the cells when every game is over but Island Luck still shows the bet open (see Needs sync); a dead or all-hit bet read from live stats carries one muted Meta row saying Island Luck settles the bet.
- **Pick groups:** in an open bet, picks come as "Missed", then "Still needs", each under a Label small heading in muted text, then the hit fold. A settled bet lists its picks plainly.
- **Pick row:** name in Barlow 600, then the market and the game as two Meta lines. The game line is the score and clock once the game has started, with a 7px red dot while live, and the kickoff time before. A game never gets a strip, header or section of its own inside a bet.
- **Hit fold:** the picks that already hit, folded to one full-width button row: chevron, the count in good text, then their names in muted 13px. Tap to expand the rows beneath it. Hover tints with the cell colour; the chevron turns as on the head.
- **Foot:** stake left, payout right, Label type at 16px, opened by a 2px rule. A dead bet's payout reads "Would have paid" in muted text.
- **Panels** (analysis, social, account, phone sync, setup steps): the same plate with 12px 14px 14px padding and a Title heading underlined by a 2px rule. A panel head may hold a secondary button on the right.

### Buttons
- **Shape:** square (0), Label type.
- **Secondary:** transparent with a 1px border in the text colour, 5px 12px; hover fills with the cell colour.
- **Primary:** filled, yellow with navy text in dark and on the navy shell, navy with white text on light plates; 11px padding and 18px type when it stands alone. Hover is `brightness(1.15)`.
- **Icon buttons:** the bell and the account button in the header are bare 20px icons in muted text, white on hover or while open, with a 44px target under 520px.
- **Disabled:** 55% opacity. **Focus:** 2px outline in the focus colour (yellow in dark and on the shell, navy-2 in light), offset 2px.
- **Destructive (popup):** a secondary button with the bad-text colour for border and label, set apart by a 20px top margin.
- **Text link:** muted and underlined in the flow.

### Tabs and segments
- **Tabs:** four equal columns, 18px condensed 700 caps, muted until hovered. The current tab is a solid yellow cell with navy text; no tab is current while the account screen is open. Focus outline is inset 4px, navy on the active tab.
- **Phone bar:** at 760px and under the tabs are fixed to the bottom edge on navy with a hairline above, each at least 52px tall.
- **Segmented control:** an inline row on the cell colour; the chosen segment is a filled plate in the primary button's colours.
- **Count badge:** a red square, 18px tall, white condensed 13px, on tabs and the bell.

### Chips
- **Style:** Label small in muted text inside a 1px inset ring, 0 6px padding, no fill. Used for bet rewards ("Free bet") and profile facts. Not interactive.

### Inputs / Fields
- **Style:** square, 1px border in the muted colour, the plate colour as background, 16px text, 10px 12px padding (7px 10px inline). Label above in Barlow 500 13px muted. In the popup, placeholder text is the muted colour at full opacity.
- **Focus:** 2px outline in the focus colour, offset 1px. Caret and native checkboxes take the focus colour through `caret-color` and `accent-color`.

### Standings tally
A row under the totals on Open: one count per standing that has bets, in the standing order, so the screen answers "how many are alive, how many are in trouble" before any scrolling.
- **Shape:** each standing is a button holding a count (Condensed 800, 24px, centred in a flat box the width of its cell) over its label (Condensed 700, 12px caps, muted). Cells sit on grid tracks with a 6px gap: at least 64px wide on phones (52px under 380px, where long labels break onto two lines), and 96 to 120px from 1040px up. A count that wraps keeps the first row's width, and a short row stays at the left edge. The row is padded 10px top and bottom and separated from the totals by a 1px navy line.
- **Tones:** the count box wears its standing plate's tone: Needs one yellow fill, At risk outlined in Risk Red (3px ring, red numerals), Running default navy, All hit green fill, Needs sync outlined in yellow, Not started hollow, Dead red fill. Labels match the standing plates except "Running", which stands for every "N to go" bet.
- **Behaviour:** tapping a count scrolls to the first bet in that standing (bets keep a 12px scroll margin), moves focus to that bet's head, and replays its standing plate's wipe so the eye finds where it landed. Each count is rebuilt when it changes, so a shift in standings wipes in like a plate. Each button's accessible name says what it does ("1 dead, show it"). Standings with no bets are left out, and the row is hidden when there are fewer than two open bets.

### Stat cells
- **Style:** value in Headline (Display in the totals strip) over a Label small caption, in an equal grid divided by 1px gaps. The totals strip is navy-2 cells on a navy gap in both themes.

### Header status
- **Live indicator:** a small plate in Label type in the name row: red with white text and a dot when games are live, warn-colour text in a 1px ring when live stats are off or paused, muted in the ring otherwise ("No live games", "Live status unknown").
- **Freshness line:** one Meta line under the name row: when this page last updated, then the last sync from Island Luck, then how many bets need sync, separated by gaps. A part turns to the warn colour when it needs attention: the page has stopped updating, the sync is more than a day old, a bet needs sync. The needs-sync count is a link to Island Luck with an external-link icon, and its accessible name says it opens Island Luck in a new tab.

### Analysis
Answers four questions in order, each a section with a page-ground heading (Condensed 800, 24px, caps, 2px rule): Am I up or down, Which bets work, Funding vs fun, How close you get. Above them sit the period picker (Week, Month, All time, the same periods the leaderboard uses; remembered per device) and a row of jump links to each section, and a "How you're doing" panel: one sentence ("You're up $16.20 this week on 9 settled bets.") over three stat cells (Net, Won–lost, Return on your money) and a meta line. On wide screens a section's panels sit two to a row; a lone panel takes the row. If a refresh fails, the last figures stay with a retry banner.

### Relationship actions
On a profile, one primary step leads (the first that adds something: accept a request, add friend, follow) and every other step waits behind a More button. Steps that end a tie (Unfollow, Unfriend, Remove follower) ask once more: the first tap turns the button into "Tap again to …" in bad-text. In the People list each row offers at most one step (Add friend); requests are accepted with "Accept" for friends and followers alike. The footnote explains the difference once: friends both agree; following is one-way. How you stand with someone is one muted phrase ("Friend · you follow each other"), not a row of chips; only Locked keeps its chip. An armed "Tap again" stands down after four seconds and is announced to screen readers; the More button and its items share one width.

### Leaderboard
Leads with where you stand ("You're 2nd of 3 this week · +3.15u", or "2 more settled bets to rank this week") above the table; an unranked row says the same ("1 more settled bet to rank"). A failed load says so with Retry. Rows centre on the name's tap target.

### Needs sync
One state, one name, one set of bets. A bet needs sync when every game is over, Island Luck still shows it open, and live stats have not decided it (no final miss, not every pick hit). The app says "needs sync" everywhere for exactly those bets, and the header count always equals the tally count: the standing plate and tally ("Needs sync", outlined in yellow), the strip under the bet head ("Needs sync: all games are final. Open My Bets on Island Luck to update this bet."), the freshness line ("1 bet needs sync", a link to Island Luck), the notification ("Needs sync: $5.00 +1187 bet") and the notifications empty state. The bet's remaining picks sit under "Waiting on Island Luck" in place of "Still needs". A bet already dead or all hit whose games are over keeps its own standing; its strip reads "All games are final. Open My Bets on Island Luck to settle this bet." and its notification "All games over: $5.00 +1187 bet".

### Change marks and order
- **Changed since your last visit:** when a bet's newest hit or miss happened while you were away (after this device last left the app and before this visit began), its head line ("Latest: …") turns the yellow of now (warn-text, 600 weight) until you leave again. Changes during the visit are not marked; the plate wipe shows those as they happen. Screen readers hear "New since your last visit". Reloading counts as leaving.
- **Held order:** Open bets sort by standing when you arrive, when you come back to the app and when you switch back to Open; between those, refreshes keep each bet where it is (a bet that changes standing updates its plate in place), a bet that settles leaves a gap, and a newly synced bet waits at the end until the next re-sort. On desktop each bet keeps its stack between re-sorts (a new bet joins the shorter one), so no bet changes column mid-read.
- **Notifications:** an item about a bet the app can still show is a button ("Show bet"; hover underlines it, since the tinted row means unread) that closes the panel, switches to the bet's list and brings the bet into view with focus. Items stay marked new while the panel is open and are marked read when it closes; opening the panel moves focus into it and Escape returns focus to the bell.

### Banner
- **Error:** a full-width red row with white Barlow 500 text, 10px 12px padding, 14px clear beneath it. Used on the ground under the header when the tracker cannot be reached, and inside a panel for a failed action.
- **Retry:** the banner may end in a secondary button outlined in white, whose hover is a 16% white tint. The last loaded bets stay on screen beneath it.

### Setup screen
Shown on Open until the first sync, in place of the totals and the list.
- **Intro:** a Headline heading in caps and a lede, set straight on the ground.
- **Steps:** two panels, sync from your phone and sync from a computer, each a numbered list capped at 70ch. On desktop the computer panel leads.
- **Waiting:** a 13px muted line with a 7px yellow dot saying the page is checking.

### Account screen
Opened from the header's account button in place of the current section. One panel with a "Close" secondary button in its head, who is signed in and a "Sign out" secondary button, followed by the phone sync panel.

### Charts
- **Rate bar:** a 16px track in the rule colour with a square fill in the strong colour and a 3px red marker for what the odds implied.
- **Columns:** square bars in the strong colour on a 2px baseline, value above in condensed 700.

### Extension popup
A 300px surface at a 13px base: navy header band with the icon and name at 22px, one plate with a 2px-ruled "Last sync" row and a three-cell stat grid, a full-width primary button, then settings behind a native disclosure. Buttons are full width; tokens and themes match the web app.

## Do's and Don'ts

### Do:
- **Do** end every pick row in a state plate at least 96px wide, and let its fill carry the state: green hit, yellow running, red missed, navy neutral, hollow for nothing to report.
- **Do** outline instead of fill when a state can still move: a 2px green ring for a line reached that can drop, a 2px red ring for a line crossed that can come back.
- **Do** open every open bet with a standing plate, and give a bet with more than one pick a strip of one cell per pick.
- **Do** show a pick's game as one Meta line on the pick, with a red dot while it is live.
- **Do** show progress as a fill inside the plate, Signal Yellow to Unfilled Yellow at a hard stop, with the count as the plate's text.
- **Do** fold the picks that already hit to one line that expands on tap.
- **Do** keep the shell navy in both themes and let the ground and plates follow the device.
- **Do** put the section tabs in a fixed bottom bar at 760px and under, with at least 52px of height each.
- **Do** put navy text on yellow and green fills and white text on red and navy fills.
- **Do** use the good, bad and warn text tokens for coloured text on a surface, per theme.
- **Do** separate with rules: 2px in the strong colour to close a head or open a foot, 1px hairlines for everything else.
- **Do** set labels, numbers and states in Barlow Condensed caps, and names and sentences in Barlow.
- **Do** keep controls at a 44px minimum target under 520px.
- **Do** say "picks", show American odds and Nassau time.

### Don't:
- **Don't** round a surface or control. Radius is 0; the live dot and icon strokes are the only curves.
- **Don't** add a separate progress bar under or beside a plate. The cell strip is the bet's summary, one cell per pick, and the only other place a fraction is drawn.
- **Don't** fill a plate red, or call a bet dead, on a stat that can still move. Only a final miss is dead.
- **Don't** give a game its own strip, header or section inside a bet.
- **Don't** put a shadow on anything in the page flow; only the notification panel has one.
- **Don't** use yellow for decoration or for neutral information.
- **Don't** turn a pick's plate yellow for a lead that is not measured progress toward a line.
- **Don't** use a fill colour as text on a surface, or coloured text on a fill.
- **Don't** animate anything other than a plate's horizontal wipe and the chevron's turn, and nothing under reduced motion.
- **Don't** add a UI framework, icon package or remote font; fonts are self-hosted and icons are the inline 16px set.
