# Handoff: Chart v2 visual redesign (clinical trial prescreening)

## Overview
A new visual design for the prescreening app, called **Chart v2**. It's a calm, clinical system with two registers:
- **Coordinator register** (trials, review, settings): dense, hairline rules, IBM Plex Sans with Plex Mono for IDs and counts.
- **Patient register** (the screening chat): the same colours, but the conversation uses Atkinson Hyperlegible at larger sizes with more space, so it reads as careful rather than diagnostic.

This round covers three screens: the screening chat (desktop), the top of the coordinator review (desktop) and trials home (phone, 390 px). Apply the same tokens and patterns to the remaining screens.

## About the design files
The files in `reference/` are **design references built in HTML**. They show the intended look; they are not production code. Recreate them in the existing React app using its components and the single global stylesheet `src/web/styles.css`.

`tokens.css` and `components.css` **are** meant to be used: paste them into `styles.css` (tokens first) and map the existing class names (`.card`, `.bubble`, `.button`, `.chip`, `.review-row`, `.header`, …) onto the classes here, or rename these to match. Reference files use inline styles and CSS variables with light fallbacks. Where a reference file and `components.css` disagree, use `components.css`.

To view the references, open `reference/Chart v2.dc.html` in a browser (it needs `support.js` next to it and an internet connection for preview fonts only). It shows every screen in light and dark.

## Fidelity
**High fidelity.** Colours, type, spacing, radius and states are final. Match them exactly. Layout widths are desktop targets; reflow rules are in the Responsive section.

## Constraints the implementation must keep
1. **Findings are words in neutral ink.** No green/red, no ticks or crosses, and no colour, icon or weight that changes with whether a rule is met. `--accent` is only for actions, links, focus and the active nav item, never for rule status.
2. **Grouping is by status, in this order:** Settled from the participant's words → Needs chart review → Unresolved → Not raised in the conversation. Rows within each group are in protocol order (L-number). Nothing summarises toward an overall verdict; the four counts are the only summary.
3. **Never show "eligible", "qualified" or a match score**, anywhere.
4. **Keep all on-screen wording as it is.** Copy in this README and the references is the existing copy. The only addition is that the screening header repeats the agent's own opening line: "A study coordinator will review everything you tell me and follow up with you."
5. **WCAG AA in light and dark.** Ratios are listed under Design tokens. Tap targets are at least 44 px (`--tap-min`); primary controls are 48 px.
6. **Offline.** Fonts are bundled as WOFF2 via `@font-face` with relative URLs (see `fonts/FONTS.md`). No CDN or Google Fonts.
7. **Dark mode follows the system** (`prefers-color-scheme`). There is no toggle.

## Screens

### 1. Header (all screens)
- 56 px bar, `--surface`, 1 px bottom border `--line`, padding 0 32 px, gap 40 px.
- Brand: the **Record** mark (20 px inline SVG, `icons/brand-mark-inline.svg`) + 10 px gap + "Trial Prescreening", Plex Sans 600 15 px. The mark is a rounded tile (rx 22 of 100) in `--ink` with three lines (widths 60/46/32 of 100, height 11, left-aligned at x 20): the top line `--mark-lead`, the other two `--mark-line`. In dark mode the tile inverts to light automatically through the tokens. Do not recolour it or use `--accent` as the tile.
- Nav: Trials · Screenings · Reviews · Settings. Plex Sans 500 14 px, `--ink-2`, each link the full bar height, padding 0 14 px. Active link (`aria-current="page"`): `--ink`, 600, 2 px inset bottom bar `--accent`. Hover: `--ink`.
- Model chip, right-aligned: 6 px dot `--accent` and "Local model · Qwen3.6-35B-A3B-MLX-8bit", Plex Mono 400 12 px, `--ink-2`, 1 px `--line` border, radius 4, padding 6×10.
- Phone: brand row 48 px, nav row below (44 px links, 15 px, horizontal scroll if needed), model chip as a full-width strip (11 px mono) under the nav.

### 2. Screening chat (patient register), desktop
- Layout: three-column grid `1fr | 820px | 1fr` under the header. The conversation fills the centre column; the testing panel sits in the right column.
- **Trial context** (top of the centre column, padding 24 0 18, bottom border `--line`):
  - NCT ID (e.g. NCT04316364): Plex Mono 500 12 px `--ink-2`.
  - Trial title: Plex Sans 600 18/25.
  - Reassurance line: Atkinson 15/22 `--ink-2`.
  - "Question 4" on the right: Plex Sans 600 14 `--ink-2`.
- **Earlier turns** (scrolls, bottom-anchored, fades out over the top 90 px with a mask): Atkinson 17/26, gap 16.
  - Agent turns: plain text, `--ink-2`, max-width 640.
  - Participant turns: right-aligned box, `--you` background, `--ink`, radius 6, padding 12×16, max-width 560.
- **Current question card**: `--surface`, 1 px `--line`, radius 6, `--shadow-question`, padding 28×32. Label "Question 4" Plex Sans 600 14 `--accent`, gap 12, then the question in Atkinson 400 24/35 `--ink`. Only the current question is shown at this size; when the agent asks the next one, the previous question moves into earlier turns.
- **Composer** (padding 16 0 28):
  - Textarea min-height 100, Atkinson 18/26, padding 14×16, 1 px `--control-line`, radius 4. Placeholder "Type your answer" in `--placeholder`. Focus: border `--accent` plus a 3 px ring `--ring`.
  - Footer row: "Use made-up answers only. This is a test system." (Atkinson 15 `--ink-2`), the character count "1600" (Plex Mono 13 `--ink-2`, right-aligned), then the Send button (primary, 48 px tall, padding 0 28, 16 px).
- **Testing panel** ("What the agent has recorded"), right column, top-aligned:
  - Collapsed: 188 px wide, `--surface-2`, 1 px `--line`, radius 4, padding 14. Title 600 14 px, note "A view for testing. A person being screened wouldn't see this, and it isn't the coordinator's review." 13/18 `--ink-2`, and a secondary button "Show the rules" (44 px).
  - Expanded: 380 px wide; the button reads "Hide the rules", followed by rule cards.
  - Rule card: `--surface`, 1 px `--line`, radius 4, padding 14. Head row in mono 12 `--ink-2`: rule id (`--ink`, 13 px), tags `inclusion` / `clinical` (`.tag`), state text on the right ("needs chart review", "open"). A "changed" tag uses the same neutral `.tag` style, not a colour. Then PROTOCOL / PLAIN LANGUAGE labels (mono 11, uppercase, 0.06em), protocol text 14/20, plain-language text on a `--bg` panel, meta line in mono 12 ("reason: unknown · person reported: unknown · asked 1×"), and the participant's quote in italics with "turn 2" in mono 12.

### 3. Coordinator review, desktop (top of page)
- Layout: grid `272px | 1fr`.
- **Left column, "What's left for you"** (sticky, `--surface`, right border `--line`, padding 28×24):
  - Label "WHAT'S LEFT FOR YOU" in mono 12 uppercase, 0.04em.
  - Four items, each with a 1 px `--line-soft` top border and padding 12 0, laid out as a 44 px column for the count (Plex Mono 500 24/26) and a column for the label (600 14/20) and description (13/18 `--ink-2`). Items link to their group.
    - 9 · Settled from the participant's words · Check that the words say this.
    - 19 · Needs chart review · Confirm in the medical record. What the participant reported is shown.
    - 1 · Unresolved · Raised, not settled. Follow up or check the record.
    - 8 · Not raised in the conversation · Not asked, by design. Check as usual.
- **Main column** (padding 28×40, gap 18):
  - Header: NCT00077350 (mono 500 13 `--ink-2`), title (Plex 600 22/29, max-width 860), meta "Simulated patient 2 · rules checked by hand" (14 `--ink-2`).
  - Notice box: `--surface`, 1 px `--line`, radius 4, 13/18. Two rows split by `--line-soft`. Row 1 in `--ink`: "The agent's record of what the participant said, criterion by criterion. It is not a decision. The coordinator decides." Row 2 in `--ink-2`: "An example from the project's test run. The patient was played by an AI from a written description, not by a person."
  - **Groups** (`<details open>`), one per status, in the order above. Container `--surface`, 1 px `--line`, radius 4.
    - Header (`<summary>`, min 44 px): `--surface-2`, bottom border `--line`, padding 12×16. ▾/▸ marker, title 600 15, count in mono 13 `--ink-2`, and the hint right-aligned (13 `--ink-2`).
    - **Finding row**: grid `52px | 84px | 1fr | 300px | 16px`, gap 12, min-height 44, padding 4×16, bottom border `--line-soft`. Columns: L-number (mono 500 13), type (mono 12 `--ink-2`: Inclusion / Exclusion), criterion text (Plex 14/20 `--ink`), finding (Plex **500** 14, right-aligned, `--ink`, and identical styling for every outcome), chevron ▸ (`--ink-2`). Hover: `--surface-2`. Click opens the row's detail (existing behaviour).
    - Finding wording, as it exists: "Met, by the participant's account" / "Not met, by the participant's account" / "Does not apply, by the participant's account".
    - In "Needs chart review" rows, the fourth column shows what the participant reported, in quotation marks: 13/19 `--ink-2`, right-aligned.

### 4. Trials home, phone (390 px)
- Header as in the phone rules above. Content padding 20, gap 16.
- "Your trials": Plex 600 24. Intro 15/22 `--ink-2`.
- Add-trial card (`.card`, radius 6, padding 16):
  - Label "ClinicalTrials.gov link or NCT ID" (600 14).
  - Input, 48 px, placeholder "https://clinicaltrials.gov/study/NCT…".
  - Full-width "Add trial" button. While the field is empty it is disabled: `--disabled` fill, `--ink-2` text.
  - Hint "Paste the study's page address, or just its ID, like NCT06557512. The app fetches it from ClinicalTrials.gov." (13/18 `--ink-2`).
- List heading: "1 trial" (600 15) with the note "Read by the AI from each trial's published rules, not checked by a person. The parser was measured on five lung cancer trials only." (13 `--ink-2`).
- Trial card:
  - Status tag "Ready · 12 criteria" (`.tag`, neutral) and the NCT link (mono 12 `--accent`).
  - Title (600 16/22).
  - Condition tag (`--surface-2`, radius 2, 13 px).
  - Counts "6 the person can answer · 6 need medical records" (13 `--ink-2`).
  - "Start screening" (primary, 48), "See the checklist" (secondary, 48), then "Refresh" and "Remove…" as quiet 44 px buttons side by side.
- "Built-in examples" heading, then the note "The project's own test trials. They come with the app and can't be removed." Cards follow the same pattern; built-in cards use a "Built-in example" tag and have no Remove button.
- Desktop (720 px and up): card becomes a grid `1fr | 240px`, with the actions stacked in the right column.

## Interactions and behaviour
- Hover: primary `--accent` → `--accent-hover`; secondary and quiet buttons and finding rows → `--surface-2`; nav links → `--ink`.
- Focus: `:focus-visible` draws a 2 px `--accent` outline, offset 2. Text inputs and the composer use border `--accent` plus a 3 px `--ring` instead. Mouse focus shows nothing.
- Disabled: `--disabled` fill, `--ink-2` text, `cursor: not-allowed`. Use `aria-disabled` where the button should stay focusable.
- Motion: only 120 ms colour transitions. `prefers-reduced-motion: reduce` sets them to 0 (both in tokens and through a global override).
- The thread scrolls to the latest turn when a new question arrives. Only the newest question uses the question card.
- Review groups are `<details>` elements, open by default. Summary items in the left column link to the group anchors.

## Responsive
At 600 px and below:
- The header stacks.
- Screening becomes one column, with the testing panel full width below the composer and the question at 21/31.
- The review summary moves above the groups (not sticky).
- Finding rows become three lines: L-number and type, then the criterion, then the finding. The finding stays neutral.

Full rules are at the end of `components.css`.

## Design tokens
All tokens are in `tokens.css`: light on `:root`, dark in `@media (prefers-color-scheme: dark) { :root { … } }`, with the same names in both.

| Token | Light | Dark | Use |
|---|---|---|---|
| --bg | #F6F7F8 | #0F161C | page |
| --surface | #FFFFFF | #162029 | cards, header, inputs |
| --surface-2 | #EEF1F3 | #1D2934 | group headers, testing panel, hover |
| --line | #D9DEE3 | #2C3A46 | borders |
| --line-soft | #E6EAEE | #243039 | row dividers |
| --control-line | #7D8995 | #6B7B89 | input and secondary button borders |
| --ink | #14202B | #E7ECF0 | text, findings |
| --ink-2 | #4A5866 | #A3B1BD | secondary text |
| --placeholder | #5F6B77 | #8FA0AE | placeholders |
| --accent | #1F5F8B | #7FB6DE | actions, links, focus |
| --accent-hover | #184E73 | #A3CCEA | primary hover |
| --on-accent | #FFFFFF | #0F161C | text on accent |
| --ring | #D3E2EE | #29506E | focus ring |
| --you | #E6EEF5 | #1F3445 | participant's answers |
| --disabled | #E3E7EB | #24303A | disabled fill |

Contrast ratios, light / dark (all pass AA):
- ink on bg: 15.4 / 15.3
- ink on you: 14.1 / 10.8
- ink-2 on surface: 7.3 / 7.5
- ink-2 on surface-2: 6.4 / 6.8
- ink-2 on disabled: 5.9 / 6.1
- placeholder on surface: 5.4 / 6.1
- accent on surface: 6.8 / 7.6
- on-accent on accent: 6.8 / 8.4
- on-accent on accent-hover: 8.8 / 10.8
- control-line on surface (non-text): 3.6 / 3.8

The ratios were calculated from the hex values. The reference file `Chart v2.dc.html` recomputes them live, so check there after any change.

**Type**
- Families: Plex Sans for UI, Plex Mono for data, Atkinson Hyperlegible for the patient conversation.
- Coordinator register:
  - page title 600 22/29
  - display 600 24/30
  - trial title 600 18/25
  - group 600 15/22
  - body 15/22
  - row 14/20
  - small 13/18
  - data mono 500 13/18
  - label mono 500 12/16 uppercase
  - count mono 500 24/26
- Patient register:
  - question 24/35
  - answer 18/26
  - earlier turns 17/26
  - reassurance 15/22

**Spacing**
- Scale: 4 · 8 · 12 · 16 · 24 · 32 · 48.
- The patient screen uses the next step up from coordinator screens (16 → 24, 24 → 32).

**Radius**
- Tags: 2
- Controls: 4
- Cards: 6
- Phone frame in the references only: 28

**Shadow**
- Hairline borders are the default.
- `--shadow-question` (0 1px 2px) for the current question card only.
- `--shadow-overlay` (0 8px 24px) for menus and dialogs.

## Assets
- **Logo: "Record" mark** in `icons/`:
  - `brand-mark-inline.svg`: for the header; styled by `.brand-mark-*` classes.
  - `mark-light.svg`, `mark-dark.svg`: standalone files for documents and slides.
  - `favicon.svg`: switches with `prefers-color-scheme`.
  - `favicon-32.png`, `apple-touch-icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
  - `HEAD.html`: the `<link>` tags and a `manifest.webmanifest` to add.
- Minimum size is 16 px. Keep clear space of a quarter of the mark's width around it.
- There are no other images or icons. Markers are text glyphs (▸ ▾).
- Fonts: see `fonts/FONTS.md`.

## Files
- `tokens.css`: custom properties and `@font-face`. Paste at the top of `src/web/styles.css`.
- `components.css`: component classes, focus, reduced motion and responsive rules.
- `fonts/FONTS.md`: which WOFF2 files to add and where to get them.
- `icons/`: the logo, favicons, app icons and `HEAD.html`.
- `reference/Chart v2.dc.html`: the overview, with all screens in light and dark plus the token sheet.
- `reference/Chart v2 - Screening.dc.html`, `Chart v2 - Review.dc.html`, `Chart v2 - Trials Phone.dc.html`: the individual screens.
- `reference/support.js`: needed to open the reference files.
