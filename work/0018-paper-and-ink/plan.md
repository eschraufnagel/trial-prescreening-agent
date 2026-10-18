# plan: 0018 paper and ink

**Intent:** `work/0018-paper-and-ink/intent.md` · **Spec:** `work/0018-paper-and-ink/spec.md`
**Branch:** `0018-paper-and-ink`, from `main` at `3c86777`; intent and spec `b29b7ec`.

---

## Context

The page works, but it wears the default web-app palette (near-white, one blue, light grey), so neither the page nor the README's images say anything about what the project is. The owner looked at three mockups laid over the current page in fake mode and picked option A, "Paper & Ink": warm paper, evergreen ink, terracotta as the one bright note, and serif headings. The spec carries its values and adds a dark mode in the same family, so the mockups don't need to be kept.

This slice is a restyle. It changes `src/web/styles.css`, the favicon's colour and the preview card's HTML, then retakes the images. **No `.tsx` file changes, no class name changes, no test changes, no dependency.** Nothing calls a model until the images are retaken on the local model in stage B.

**Baseline**, from `npm run check` on `b29b7ec`: 1169 passed and 8 expected fail (1177). `npm run test:e2e`: 11 cases.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. The restyle** | 1–5 | **Gate** | `npm run app -- --fake` in the new look; headless screenshots of every screen, light and dark, at 1280 and 390 px; the contrast table |
| **B. Images and write-up** | 6–9 | PR | `test:e2e` passing, the README's five images, the preview card and the demo retaken, roadmap, review passes |

**Gate: is this the look, in both modes, on every screen?** Stage B retakes six images and the demo on the local model, with oMLX running and the app started for capture. A change of look afterwards means doing all of that twice. The mockups showed three screens in light mode only; the checklist, Screenings, Reviews, Settings, dark mode and phone width are seen for the first time here, so "change X first" is a real possible answer. No clinical judgment is needed.

Stage B has no gate before the PR: the images are looked at as they're taken (0016's rule), and nothing later depends on them.

### Steps

Each step is one commit, through `npm run check && git commit`. No Co-Authored-By trailer. No test mocks a module or stubs a global.

**Stage A: the restyle**

1. **Commit this plan** as `work/0018-paper-and-ink/plan.md`.

2. **Tokens and type (spec §1, §2), `src/web/styles.css`.**
   - The `:root` block takes spec §1's light values, adds `--terracotta`, `--terracotta-ink`, `--rule`, `--serif` and `--sans`, sets `--radius: 6px`, and sets `font-family: var(--sans)`.
   - The `@media (prefers-color-scheme: dark)` block takes §1's dark values, including the three new tokens.
   - The file's opening comment gains one line: the look is "Paper & Ink" (slice 0018), and colours live only in the two token blocks.
   - Any literal colour outside the token blocks is checked with `grep -n "#[0-9a-fA-F]\{3,6\}" src/web/styles.css`; each one that's left is either a token use or listed in spec §3 (field backgrounds, shadows).

3. **Rules (spec §2, §3), `src/web/styles.css`.** Edits to the existing rules, in the file's existing order, each under its existing section comment. No new section; no rule for a class that doesn't exist in `src/web/*.tsx` (checked with grep before adding any selector):
   - **Frame:** `.header` (background, top and bottom borders), `.brand` (serif, 1.3 rem), `.brand-mark` (`--terracotta`), `.nav a` and `.nav a[aria-current="page"]` (underline instead of pill; the 390 px media rule keeps its smaller padding), `.pill` (4 px corners, `--panel`).
   - **Type:** the serif on the selectors in spec §2; `.page h1` at 2.4 rem.
   - **Cards:** the shared border and warm shadow on the card selectors in spec §3, with the dark-mode shadow in the dark block.
   - **Buttons and fields:** 4 px corners; `.secondary` transparent with a `--text` border; `button.danger` words in `--panel`; fields' light colours, and the dark block's field rule.
   - **Labels:** `.badge` and `.tag` in small capitals; `.chips li` unchanged in case; `.step-name` in `--terracotta-ink`, capitals.
   - **Chat:** `.bubble` corners and padding; `.bubble.from-agent` serif with a terracotta left border.
   - **Accents:** `.words.plain` border, `.id` colour, `.review-notes`, `.counts strong` and `.review-count strong`.
   - `.review-finding` and every `review-*` selector that isn't named above stay as they are. The boundary test's "styles rows by group only" reads `ReviewPage.tsx`, which doesn't change; the rule that no CSS colours a finding is checked by grep at step 9.

4. **Favicon and preview card (spec §6).**
   - `src/web/index.html`: the data URL's stroke `%232f5bd3` → `%23c2603a`.
   - `e2e/capture/social-card.html`: its `:root` takes §1's light values for the tokens it uses; `.brand` and `h1` take the serif stack; `.tags span` become 3 px small-capital labels in `--accent` on `--accent-soft`; the shot's shadow takes the warm shadow. Its comment's "the page's own light tokens" stays true. Its screenshot is taken at step 7, after `review.png`.

5. **Looked at, and the contrast check.** Nothing committed except "Records" in this plan.
   - **Contrast:** a scratch script (in the session's scratchpad, not the repository) reads the two token blocks out of `styles.css`, computes WCAG 2 contrast for every pair in spec §5 in both modes, and prints a table. A failing pair moves its foreground value in `styles.css` until it passes; the change and the final table go in "Records", and spec §1 is updated in the same commit if a value moved.
   - **Screens:** `npm run app -- --fake --port 5045` with emptied scratch `--chats-dir`, `--trials-dir` and `--settings-dir`. A scratch Playwright script (same pattern as the mockups: `chromium` from the repo's `node_modules`, a fresh context per mode) captures, at 1280 × 800 and 390 × 844, in light and dark:
     - Trials (first run), then Trials with `NCT00000000` added and ready;
     - that trial's checklist;
     - Screenings; a conversation on `NCT04316364` after three made-up answers with the tester panel open; and the same conversation finished;
     - Reviews; the review of `eval NCT00077350-v2-labels`, folded and with one row open, and its transcript;
     - Settings with Anthropic chosen and no key.
   - Each image is looked at for: text that's hard to read, the header and nav at 390 px, capitals on a long label, the serif falling where §2 says and nowhere else, and anything in the review that differs between rows other than its own words. Fixes are made in `styles.css` and recorded.
   - **Then the gate.** The images and the contrast table go to the owner. Stop.

**Stage B: images and write-up (after the gate)**

6. **The browser test.** `npm run test:e2e`: 11 passed, specs untouched. If one fails, it's a look-dependent locator or a real fault, and the fix is in CSS, never the spec (CLAUDE.md). No commit if nothing changed.

7. **Images (spec §6).** With oMLX up (`curl -s http://127.0.0.1:8000/health`):
   - start `npm run app -- --examples --port 5035 --chats-dir <tmp> --trials-dir <tmp> --settings-dir <tmp>`, empty settings so it runs on the local model;
   - `npm run screenshots` retakes `trials.png`, `screening.png`, `review.png`, `transcript.png`, `settings.png` and `social-card.png`, and the demo's recording;
   - `npm run demo` makes `docs/images/demo.gif`, under 5 MB;
   - each image and the GIF are looked at. The social card's crop of `review.png` (fixed offsets in its CSS) is checked against the new header height and adjusted in `social-card.html` if it cuts badly.
   - One commit with the images (and the card's HTML if its crop moved).

8. **Docs and roadmap.**
   - `work/ROADMAP.md`: a 0018 row ("Paper & Ink: the page's look, light and dark, and its images retaken. No markup, behaviour or result changes") and an item in "Where the project stands".
   - `grep -rni "blue\|colour\|color" README.md docs CLAUDE.md`: change only lines that describe the old look. Expected: none. The README's shields.io badge colours are GitHub's, not the page's, and stay.
   - `docs/running.md`'s note on the preview card is unchanged unless step 7 changed how it's made.

9. **Review passes (REVIEW.md), recorded here.** All five against `git diff main`, then `npm run check` and `npm run test:e2e` again. Checks particular to this slice:
   - `git diff main --stat -- 'src/**/*.tsx' tests e2e/*.ts` is empty;
   - `grep -n "finding\|holds\|not-hold\|polarity" src/web/styles.css` shows no rule styling the review by outcome (the `.s-*` rules are the tester panel's, unchanged in selector);
   - no font URL, `@import` or `@font-face` in `styles.css`, `index.html` or `social-card.html`.
   - Then stop. The PR is opened on the owner's word, saying the e2e count, that the gate passed (or was skipped), and that the passes were run by the author.

## Files that change

**New:** `work/0018-paper-and-ink/plan.md` (intent and spec already committed).

**Modified:**
- `src/web/styles.css`, `src/web/index.html`
- `e2e/capture/social-card.html`
- `docs/images/trials.png`, `screening.png`, `review.png`, `transcript.png`, `settings.png`, `social-card.png`, `demo.gif`
- `work/ROADMAP.md`; `work/0018-paper-and-ink/spec.md` only if step 5 moves a value

**Not touched, checked at step 9:** every `src/web/*.tsx`, `src/web/logic.ts`, `src/web/review.ts`, `src/server/`, `src/transport/`, `src/screening/`, `src/criteria/`, `src/plain/`, `src/models/`, `src/trials/`, `tests/`, `e2e/*.spec.ts`, `e2e/lib/`, `evals/`, `data/`, `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`.

## Reused, not rebuilt

- **The token system** 0014 set up: every colour already goes through a `:root` variable with a dark-mode twin, so the look is mostly new values.
- **`npm run screenshots` and `npm run demo`** (0016, 0017) for every image, unchanged.
- **The mockup capture pattern** for step 5's headless look: a Playwright script outside the repository, against fake mode, with no committed output.

## Risks

- **Fonts differ off a Mac.** Iowan Old Style and Avenir Next ship with macOS only. Elsewhere it's Georgia and the system sans: plainer, still legible, still in the family. Accepted in the intent; the README's images are taken on a Mac.
- **Serif widths.** The serif is wider than the sans, so long trial titles and the wordmark take more room. Checked at 390 px at step 5.
- **The preview card's crop.** It places `review.png` by fixed offsets; a taller header moves what shows. Checked at step 7.
- **Dark mode's `--down` is light.** Anything drawing white words on `--down` would fail; `button.danger` is the only one (grep at step 3), and spec §3 gives it `--panel` words.

## Verification

- `npm run check` at every commit (no test changes, so 1169 passed and 8 expected fail throughout).
- Step 5: the contrast table, every pair passing, and the headless screenshots, light and dark, 1280 and 390 px.
- The owner at the gate.
- `npm run test:e2e`: 11 passed at steps 6 and 9.
- Step 7: the five README images, the card and the GIF, each looked at.
- Step 9's three greps and `git diff main --stat` on the not-touched paths.

## Records

## Gate record

## Review passes
