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

**Stages 2–5** are written in at each gate, with the files and decisions that stage turns out to need. Each ends with the bridge block shorter; step 6 removes it.

**Stage 6: images and write-up**

7. **Images.** `npm run screenshots` and `npm run demo` on the local model; the preview card's HTML takes the tokens and the mark.
8. **Docs and roadmap.** `docs/` where it describes the look; `work/ROADMAP.md`.
9. **Review passes** from `REVIEW.md`.

---

## Files that change (against `main`)

Stage 1: `src/web/styles.css`, `src/web/App.tsx`, `src/web/index.html`, `src/web/fonts/*` (new), `src/web/public/*` (new), `src/server/app.ts`, `tests/server/app.test.ts`. Later stages add their own here.

## Risks

- **A font silently falls back.** The stacks end in `system-ui`, so a wrong path still looks plausible. Checked by reading the page's font requests and `document.fonts`, not by eye.
- **The bridge outlives its purpose.** Step 6 deletes it, and the gate 5 diff shows it gone.
- **Status colour creeps back into the review.** `tests/boundary.test.ts` and `tests/web/review.test.ts` guard the markup; the CSS is read at gate 2.

## Verification

At each gate: `npm run check`; `npm run test:e2e`; headless screenshots of the screens reached, light and dark, 1280 and 390 px; focus visible on every control by keyboard; with the network blocked except `127.0.0.1`, fonts and icons load.

## Gate record

Filled in as each gate is passed.
