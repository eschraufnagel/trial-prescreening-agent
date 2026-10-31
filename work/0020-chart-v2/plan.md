# plan: 0020 chart v2

**Intent:** `work/0020-chart-v2/intent.md` · **Spec:** `work/0020-chart-v2/spec.md`
**Branch:** `0020-chart-v2`, from `main` at `1c2d258` (0019 merged as PR #2).

---

## Context

The handoff in `docs/design_handoff_chart_v2/` replaces 0019's Coral & Plum with Chart v2: Plex and Atkinson bundled, a cool clinical palette, hairline borders, the Record mark. It draws three screens; the rest take its tokens and patterns. The owner set the order and asked for a stop after each part, so every stage ends at a gate.

Markup changes only where the layout needs them: the inline logo, the review's two columns and `<details>` groups, the chat's current-question card. The e2e test drives the page by role and text, so it should hold; any locator that breaks is a sign the markup moved more than it needed to.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What's decided |
| --- | --- | --- | --- |
| **1. Frame** | 1–2 | **Gate 1** | Fonts, tokens, base styles, header, favicon, icons, manifest |
| **2. Review** | 3 | **Gate 2** | The coordinator review |
| **3. Chat** | 4 | **Gate 3** | The screening chat and the testing panel |
| **4. Trials** | 5 | **Gate 4** | Trials home, desktop and phone |
| **5. The rest** | 6 | **Gate 5** | Settings, transcript, checklist, Screenings, Reviews, preview card |
| **6. Images and write-up** | 7–9 | PR | README images, demo, roadmap, review passes |

**Gate 1: are the tokens, type and header right, in both modes?** Every later stage builds on them, so a wrong token or a font that doesn't load costs a redo on every screen after it.

**Gate 2: does the review keep 0007's rule in its new layout?** It's the page that matters most and the one with a rule a test guards. The two-column layout and `<details>` groups are the largest markup change in the slice.

**Gate 3: does the chat read as the patient register?** The current-question card changes how a conversation's turns are laid out, and the testing panel loses its status colours.

**Gate 4: do trial cards work at 390 px and on desktop?** The home screen and the first thing anyone sees.

**Gate 5: are the undrawn screens' choices acceptable?** Every one is Claude's, listed at the gate. Stage 6 retakes the README's images on the local model (oMLX, about two minutes plus the GIF), so the look is settled before that spend.

### Steps

Each step is one commit, through `npm run check && git commit`. No Co-Authored-By trailer. No test mocks a module or stubs a global.

**Stage 1: frame**

1. **Commit this plan**, with the intent and spec, as `work/0020-chart-v2/`, and the handoff as `docs/design_handoff_chart_v2/`. Biome skips the handoff, whose reference HTML uses template syntax it can't parse, and the owner's local `design-handoff/`, which git excludes but Biome doesn't.

2. **Fonts, tokens, base styles, header, icons.**
   - `src/web/fonts/`: the eight WOFF2 files and three licences (spec §1).
   - `src/web/styles.css`: the tokens at the top; then base rules from `components.css` (box sizing, body, links, focus, reduced motion, buttons, card, tag, the header); then a bridge block mapping 0019's token names onto the new ones for screens not yet reached; then the existing screen rules. Delete the rules replaced: 0019's token blocks, `*`, `body`, `a`, `button`, `.button`, `.secondary`, `.quiet`, `:focus-visible`, `code`, `.header`, `.header-inner`, `.brand`, `.brand-mark`, `.nav`, `.pill`, `.pill-dot`, `.banner`, `.card`, `.tag` and the 480 px nav rule.
   - `src/web/App.tsx`: the flask replaced by the inline Record mark.
   - `src/web/public/icons/` and `src/web/public/manifest.webmanifest` (spec §4); `src/web/index.html` takes the head tags.
   - `src/server/app.ts`: content types for `.woff2` and `.webmanifest`, with a case in `tests/server/app.test.ts`.
   - Decided in the work: below 1024 px the model chip takes the full-width strip the handoff gives it on a phone, since beside the nav it overflows at mid widths; the brand link fills the bar's height, so it is a 56 px target; the old reduced-motion rule slowing the spinner is deleted, since the global override now stops it; `favicon.svg` gets its missing `<style>` (spec §4).

**Stage 2: review**

3. **The coordinator review.** `src/web/ReviewPage.tsx`, `src/web/review.ts`, `src/web/styles.css`.
   - Markup: the page is two columns, `.review-summary` (a `<nav>`, as before) then `.review-main` holding the header, groups, transcript and footer. Each summary item is one link: count, heading, what to do. The header shows the NCT ID on its own line above the title: the model's `frame` gains `nctId`, and `title` becomes the registry title alone. Each group's `<summary>` holds its heading, its count and what to do; the count loses its brackets. Each row's `<summary>` is the grid: rule, type (no longer a `.tag`), the criterion's words, the finding, and a chevron drawn by `::after`. The loading, error and not-finished states use `.page`, so they don't sit in the summary's column.
   - Kept: class names the e2e test reads (`section.review-group > details > summary`, `li.review-row`, `#row-… > details > summary`, `.review-finding`, `.review-head`); which group starts open (the first with rows, slice 0014), though the handoff says all; the finding's words in every group. The handoff draws the participant's quoted words in the chart-review column, which the row doesn't have; the column keeps "Participant reported: … Needs the record", set for the whole group at 13/19 in `--ink-2`.
   - Decided in the work: the summary's fill and rule are drawn on the grid's background, so they run the page's length; one column below 1100 px, where the rows would get too narrow beside the summary, with the four counts side by side; three-line rows at 720 px and below; focus drawn inside a group's summaries and rows, which its rounded box would clip; highlighted words in a reply use `--you`, the participant's colour. The transcript and footer are left for stage 5.

**Stage 3: chat**

4. **The screening chat and the testing panel.** `src/web/ConversationView.tsx`, `src/web/ParticipantPane.tsx`, `src/web/TesterPanel.tsx`, `src/screening/templates.ts`, `src/web/styles.css`.
   - Markup: `.conversation` holds `.conversation-main` (the trial's header, then the participant pane) and `.conversation-aside` (the testing panel). The header's title is an `<h1>`, and it adds the opening's last sentence, exported from `templates.ts` as `REASSURANCE`, so the opening and the header are one string. While the agent waits for an answer, its newest message is shown in `.question-card` under "Question N", the count the header already shows; once the participant answers, or the agent is working, or the conversation ends, every message is an earlier turn. The earlier turns sit inside `.messages-inner`, so `.messages` can use a reversed column to start at its end and stay there. The testing panel carries `data-open`, so the stylesheet can widen it.
   - Kept: class names and roles the e2e test reads (`section.tester li.row`, the textbox, the buttons by name); all wording; the scroll to the newest message, now the composer brought into view; the panel's remembered open state.
   - Decided in the work: on a desktop the frame is the window (`.app:has(> .conversation)` is a 100dvh column), so the header, any banner and the conversation fit whatever their heights; one column at 900 px and below, where the panel no longer fits beside the conversation, with the question at 21/31 at 600 px; the panel's state words, "asked, awaiting reply" and "changed" are neutral tags and text, the awaiting card has a darker border instead of an accent outline, and a changed card has no fill; a message not taken has a dashed border instead of faded text, and a notice a neutral left rule, since the design has no warning colour; the count over its limit is `--ink` at 500 instead of red. The bridge loses the names the chat and review used.

**Stage 4: trials**

5. **Trials home.** `src/web/TrialsPage.tsx`, `src/web/styles.css`.
   - Markup: a card's status is a `.tag` instead of a toned `.badge`, busy or settled; nothing else changes.
   - Shared rules restyled here, since Trials is the first page that uses them: `.page` (1040 px, 32 px padding, 20 on a phone), `.page h1` as the display style, `.sub`, `.page h2`, `.section-head` (heading, then its note under it), `.chips` as condition tags, `.help`, `.back` and `.error` (neutral ink, since the design has no error colour). Screenings, Reviews, Settings and the checklist pick these up before stage 5 reaches them.
   - Decided in the work: the registry link on a card is mono, without underline until hovered, and 44 px tall; Remove… and Delete… look like the quiet Refresh beside them, and the confirming Remove or Delete is outlined, not filled crimson, so a card never shows two primary buttons; the first-run screen is left-aligned like every other page, and its three steps are plain cards with a mono label instead of a coral stripe; the spinner is neutral, since `--accent` isn't for status; a card's dropped-criteria warning and problem are small neutral text. The bridge loses seven more names.

**Stage 5: the rest**

6. **The checklist, Screenings, Reviews, Settings, the transcript and the preview card.** `src/web/TrialPage.tsx`, `src/web/styles.css`, `e2e/capture/social-card.html`.
   - Markup: the checklist's status and "who can answer" tags are `.tag`, so no `.badge` is left; `badgeWords`' `tone` is no longer read by the page, and is left in `logic.ts`, where its tests are.
   - None of these screens is drawn in the handoff. Each takes the coordinator register, and these are the choices made:
     - **Notices** (the checklist's note, Settings' two notes, fake mode's Settings note) are hairline boxes in small neutral type, as the review's notes are; a warning (`.note.warn`, dropped criteria) adds a left rule in `--ink-2` instead of a colour.
     - **The checklist**: the trial's heading as the review's (tags, then a 22 px title, then conditions); the three counts as the review's summary counts, in mono 24 px over small words; "Who can join" and "Who can't join" as review groups without the folding, their rows in 14/20 with a neutral tag for who can answer; "The trial's rules as published" as a 44 px summary in a card.
     - **Screenings and Reviews**: study cards and rows are `.card`s with a 16 px semibold title and small neutral meta, ids in mono; an example's trial heading is small semibold `--ink-2` with its id in mono.
     - **Settings**: providers are cards with an 18 px radio; the chosen one has a 2 px `--accent` border, the one place outside actions, links, focus and the nav where the accent marks a choice, since it plays the active nav item's part; fields, selects and the key box are the design's 48 px inputs; a test's result and a cost warning are `--ink`, since there is no success or warning colour.
     - **The transcript**: an open group, its turn numbers and speakers in mono 12, each turn 14/20 with a hairline between; the footer small `--ink-2`.
     - **The preview card**: the light tokens, Plex from `src/web/fonts/` and the Record mark, its three tags as `.tag`s in mono. Its inset is `docs/images/review.png`, retaken in stage 6, when its crop is set for the review's two columns.
   - The bridge is deleted; every `var()` in the stylesheet is a Chart v2 token.

**Stage 6: images and write-up**

7. **Images.** `npm run screenshots` and `npm run demo` on the local model; the preview card's HTML takes the tokens and the mark.
   - Run on oMLX (`Qwen3.6-35B-A3B-MLX-8bit`, healthy and loaded), with the key loaded from the old clone's `.env` into the capture app's process only, on the owner's go: no file written, the value never printed. The app ran with `--examples` and empty scratch folders, so on the local model.
   - `e2e/capture.spec.ts`, three changes the new page needed: the agent's messages are its earlier turns and `.question-text`, since the newest question has its own card (the first run timed out counting bubbles); the mouse is moved off the page before the review's stills, since the first take caught a "Not met" row in its hover colour, which in that image reads as emphasis on an outcome; the demo's four 2.5 s holds are 2 s, since the GIF was 5.27 MB at the smallest setting and is now 4.75 MB at 720 px, 24.5 s.
   - The preview card's inset is shifted past the review's summary column (`margin: -56px 0 0 -226px`).
   - `.provider` loses its border transition, which isn't in the design and was caught mid-fade in the Settings still.
   - Every image and a contact sheet of the GIF were looked at. The screening's first card holds the agent's opening and first question together, as the agent sends them.
8. **Docs and roadmap.** `docs/` where it describes the look; `work/ROADMAP.md`.
9. **Review passes** from `REVIEW.md`.

---

## Files that change (against `main`)

Stage 1: `src/web/styles.css`, `src/web/App.tsx`, `src/web/index.html`, `src/web/fonts/*` (new), `src/web/public/*` (new), `src/server/app.ts`, `tests/server/app.test.ts`. Stage 2: `src/web/ReviewPage.tsx`, `src/web/review.ts`, `src/web/styles.css`. Stage 3: `src/web/ConversationView.tsx`, `src/web/ParticipantPane.tsx`, `src/web/TesterPanel.tsx`, `src/screening/templates.ts`, `src/web/styles.css`. Stage 4: `src/web/TrialsPage.tsx`, `src/web/styles.css`. Stage 5: `src/web/TrialPage.tsx`, `src/web/styles.css`, `e2e/capture/social-card.html`. Stage 6: `docs/images/*` (all seven), `e2e/capture.spec.ts`, `e2e/capture/social-card.html`, `src/web/styles.css`, `docs/running.md`, `docs/coordinator-review.md`, `work/ROADMAP.md`.

## Risks

- **A font silently falls back.** The stacks end in `system-ui`, so a wrong path still looks plausible. Checked by reading the page's font requests and `document.fonts`, not by eye.
- **The bridge outlives its purpose.** Step 6 deletes it, and the gate 5 diff shows it gone.
- **Status colour creeps back into the review.** `tests/boundary.test.ts` and `tests/web/review.test.ts` guard the markup; the CSS is read at gate 2.

## Verification

At each gate: `npm run check`; `npm run test:e2e`; headless screenshots of the screens reached, light and dark, 1280 and 390 px; focus visible on every control by keyboard; with the network blocked except `127.0.0.1`, fonts and icons load.

## Gate record

- **Gate 1** (fonts, tokens, header): passed on the owner's OK, 2026-10.
- **Gate 2** (coordinator review): passed on the owner's OK, 2026-10.
- **Gate 3** (screening chat): passed on the owner's OK, 2026-10.
- **Gate 4** (Trials home): passed on the owner's OK, 2026-10.
- **Gate 5** (the remaining screens): passed on the owner's OK, 2026-10.
