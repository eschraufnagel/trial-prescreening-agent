# plan: 0019 coral and plum

**Intent:** `work/0019-coral-and-plum/intent.md` · **Spec:** `work/0019-coral-and-plum/spec.md`
**Branch:** `0019-coral-and-plum`, from `main` at `d28377d` (0018 merged as PR #1).

This plan was approved as 0018's second pass. PR #1 merged before work began, so it was moved here unchanged in substance: a new number, branch and PR, and "before 0018" (`3c86777`) as the reset point instead of `main`.

---

## Context

0018 replaced the default palette with option A of three mockups, Paper & Ink, and retook every image in it ("From 0018", below). Seen in place, the owner judged its tan colours don't read as a health app, and chose option C, Coral & Plum: blush paper, a plum header band, coral buttons, generous rounding, one sans.

It's a restyle: `src/web/styles.css`, the favicon's colour and the preview card's HTML, then the images. **No `.tsx` file changes, no class name changes, no test changes, no dependency.** Nothing calls a model until the images are retaken in stage B.

**Baseline**, from `npm run check` on `d28377d`: 1169 passed and 8 expected fail (1177). `npm run test:e2e`: 11 cases. Biome reports two warnings in `tests/boundary.test.ts`, present on `main` and not this slice's.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. The restyle** | 1–5 | **Gate** | `npm run app -- --fake` in Coral & Plum; headless screenshots of every screen, light and dark, at 1280 and 390 px; the contrast table |
| **B. Images and write-up** | 6–9 | PR | `test:e2e` passing, the README's five images, the preview card and the demo retaken, roadmap, review passes |

**Gate: is this the look, in both modes, on every screen?** Stage B needs oMLX loaded with about 37 GB free and the key in the capture app's environment, and takes a capture of about two minutes plus the GIF. 0018 showed the answer can change once the look is seen in place, so it's asked before that spend, not after. Dark mode, phone width and five of the screens have never been seen in this look. No clinical judgment is needed.

### Steps

Each step is one commit, through `npm run check && git commit`. No Co-Authored-By trailer. No test mocks a module or stubs a global.

**Stage A: the restyle**

1. **Commit this plan** with the intent and spec, as `work/0019-coral-and-plum/`.

2. **Reset, then tokens and type (spec §1, §2), `src/web/styles.css`.**
   - Start from the file before 0018 (`git show 3c86777:src/web/styles.css`), so no Paper & Ink rule survives by accident.
   - Replace the `:root` block and its dark block with spec §1's tokens, light and dark, and `--sans`; set `font-family: var(--sans)` and `--radius: 22px`.
   - Re-apply what 0018 added that stays (intent, "Kept from 0018"): fields and shadows as tokens (`--field`, `--field-line`, `--shadow`) used by the field and card rules, and the `:focus-visible` rule.
   - The opening comment says the look is "Coral & Plum" (slice 0019), and that colours, fields and shadows live only in the token blocks.

3. **Rules (spec §2, §3), `src/web/styles.css`.** Edits to existing rules in the file's order, under their existing section comments. No selector for a class that isn't in `src/web/*.tsx` (grep before adding). From the rules before 0018:
   - **Frame:** `body` (glow), `.header` (band, shadow, no border), `.brand` and `.brand-mark`, `.nav a` and its current state (pills on the band), `.pill` and `.pill-dot`, and `.header :focus-visible` in `--band-ink`.
   - **Type:** `--heading` on the headings in spec §2; `.page h1` 2.3 rem at weight 800.
   - **Cards:** `--radius`, `--line`, `--shadow` on spec §3's card selectors; `.steps li` with its strip; `.step-name` in `--accent`.
   - **Buttons and fields:** pill corners; primary with `--button-shadow`; secondary on `--accent-soft`; destructive outlined in `--down`; danger with `--panel` words; inputs and selects as pills; the composer at 16 px.
   - **Chips** in `--chip` and `--chip-ink`.
   - **Chat:** bubble corners and padding; the person's gradient.
   - **Accents:** `.words.plain`, `.review-notes`, `.counts strong` and `.review-count strong`.
   - `.review-finding` and every other `review-*` rule stay as before 0018.

4. **Favicon and preview card (spec §6).**
   - `src/web/index.html`: the stroke becomes `%23c4402f`.
   - `e2e/capture/social-card.html`: §1's light tokens; the band top border and glow; the wordmark and headline in `--heading`; tags as coral pills; the shot's corners and shadow. Rendered headlessly to check; its real screenshot comes at step 7.

5. **Looked at, and the contrast check.** Only this plan's Records are committed.
   - **Contrast:** 0018's scratch script (a file outside the repository, taking a CSS path) checks spec §5's 44 pairs in both modes from `styles.css`. A failure moves its foreground value; the change goes in Records and spec §1 in the same commit. The table goes in Records.
   - **Screens:** `npm run app -- --fake --port 5045` with emptied scratch `--chats-dir`, `--trials-dir` and `--settings-dir`. **Restart it after any CSS change:** it builds the page at startup.
   - 0018's scratch Playwright script captures 46 images, at 1280 × 800 and 390 × 844, light and dark:
     - Trials, first run and with `NCT00000000` added;
     - its checklist;
     - Screenings;
     - a conversation on `NCT04316364` with the tester panel open, and the same finished;
     - Reviews;
     - the review of `eval NCT00077350-v2-labels`, folded, with a row open, and its transcript;
     - Settings with Anthropic chosen.
   - **Each image is looked at for:**
     - text hard to read;
     - the band and nav at 390 px (four links on one line);
     - coral and crimson side by side on a trial card (Start screening beside Remove…);
     - the dark band against the dark page;
     - anything left over from 0018 (serif, terracotta, capitals);
     - review rows differing in anything but their own words.
   - **Then the gate.** Contact sheets per mode and width, plus the contrast table, go to the owner. Stop.

**Stage B: images and write-up (after the gate)**

6. **The browser test.** `npm run test:e2e`: 11 passed, specs untouched. A failure is fixed in CSS, never in a spec.

7. **Images (spec §6).**
   - Before starting: oMLX healthy (`curl -s http://127.0.0.1:8000/health`) and at least 37 GB under its ceiling. If either fails, stop and ask the owner. Don't close apps or change oMLX's settings.
   - The capture app needs `OMLX_API_KEY`, and this clone has no `.env`. With the owner's go at the time, it's exported into the app's process from the old clone's `.env`, as in 0018: no file written, value never printed. Then `npm run app -- --examples --port 5035` with empty scratch directories.
   - `npm run screenshots` retakes the six images and the demo's recording. `npm run demo` makes the GIF, with 0018's 720 px fallback.
   - Each image, the card's crop and frames of the GIF are looked at. One commit.

8. **Roadmap.** A 0019 row and item 10 in `work/ROADMAP.md`; 0018's row gains its PR number and "look replaced by 0019". A grep of README, `docs/` and CLAUDE.md for the old look.

9. **Review passes (REVIEW.md), recorded here.** All five against `git diff main`, then `npm run check` and `npm run test:e2e` again. Particular checks:
   - `git diff main --stat` on the not-touched paths is empty;
   - no rule styles the review by outcome;
   - no `@import`, `@font-face` or `url()` font request;
   - `grep -n "serif\|terracotta\|--rule" src/web/styles.css` finds only the `sans-serif` fallback.

   Then stop. The PR is opened on the owner's word, saying the e2e count, the gate, and that the passes were run by the author.

## Files that change (against `main`)

**Modified:**
- `src/web/styles.css`, `src/web/index.html`
- `e2e/capture/social-card.html`
- `docs/images/trials.png`, `screening.png`, `review.png`, `transcript.png`, `settings.png`, `social-card.png`, `demo.gif`
- `work/ROADMAP.md`

**New:** `work/0019-coral-and-plum/intent.md`, `spec.md`, `plan.md`.

**Not touched, checked at step 9:** every `src/web/*.tsx`, `src/web/logic.ts`, `src/web/review.ts`, `src/server/`, `src/transport/`, `src/screening/`, `src/criteria/`, `src/plain/`, `src/models/`, `src/trials/`, `tests/`, `e2e/*.spec.ts`, `e2e/lib/`, `evals/`, `data/`, `package.json`, `package-lock.json`, `scripts/`, `README.md`, `CLAUDE.md`, `work/0018-paper-and-ink/`, `.env` (none in this clone, none made).

## Reused, not rebuilt

- **The token system** from 0014, and 0018's field, shadow and focus additions.
- **0018's scratch tools:** the contrast script, the screens script and the contact sheets. None is committed.
- **`npm run screenshots` and `npm run demo`**, unchanged.

## Risks

- **Coral beside crimson.** Start screening (coral, filled) sits beside Remove… (crimson, outlined) on every added trial's card. They differ in hue, lightness and fill. If they still read as one colour at step 5, `--down` moves cooler.
- **Coral text on blush** passes at 4.61:1, the tightest pair. Small coral text only appears as links, and the check guards it.
- **The dark band.** A plum band on a plum-black page can lose its edge. `--band-shadow` and the lighter `--band-2` are there for it; step 5 looks.
- **Large corners.** 22 px cards and pill fields change how dense screens (the review, the tester panel) feel. Step 5 looks at both at phone width.
- **Fonts off a Mac.** Avenir Next is macOS-only, and the fallback is the system sans. The look survives that better than A's serif did.

## Verification

- `npm run check` at every commit (1169 passed, 8 expected fail).
- Step 5: the contrast table, all passing, and 46 headless screenshots.
- The owner at the gate.
- `npm run test:e2e`: 11 passed at steps 6 and 9.
- Step 7: every retaken image and the GIF, looked at.
- Step 9's checks.

## From 0018: option A, Paper & Ink

Merged as PR #1 (`d28377d`).
- Built warm paper, evergreen ink, terracotta and serif headings, light and dark.
- 35 contrast pairs passed after two values moved.
- **Gate passed.** Retaken on the local model: the README's images, the card and the demo.
- Then the owner chose C (intent).

**What carried over:**
- **The method:** contrast script, screens script, contact sheets, restarting the app after a CSS change.
- **Field and shadow tokens,** and the `:focus-visible` ring. The default ring was the last blue on the page.
- **The demo's 720 px fallback.** A warm page made the GIF 5.8 MB at 800 px; `make-demo`'s test pins the filter graph, so width was the change.
- **Capture prerequisites:** oMLX open; about 37 GB free under its ceiling (the owner closed apps once); `OMLX_API_KEY` exported into the app's process from the old clone's `.env` on the owner's instruction, never written or printed.

**What didn't:** every Paper & Ink colour, the serif, the underline nav, small-capital labels, the terracotta rules, and the phone nav's tighter margins (C's pill nav fits with `main`'s rule).

## Records

## Gate record

## Review passes
