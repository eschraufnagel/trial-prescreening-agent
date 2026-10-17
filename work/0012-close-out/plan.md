# plan: 0012 close-out

**Intent:** `work/0012-close-out/intent.md` · **Spec:** `work/0012-close-out/spec.md`
**Branch:** `0012-close-out` (from `main` at `d81cd3b`; intent `3a5d30f`, revised `b193fa1`; spec `1da0d6e`)

---

## Context

The README is written for its builder. It's about 480 lines, opens with slice numbers, and has no pictures. The people the owner will send it to include non-technical readers. They should see three things quickly:

- the product: an AI agent that helps a person check whether they might fit a trial, and hands a coordinator the answers;
- what it found;
- how it was built: the AI-native SDLC, with the verification loop agents use to check their own work.

This slice adds a plain-language top layer with two Mermaid diagrams and three screenshots, keeps today's technical sections below it, and closes the roadmap. The owner accepted the intent's decisions in 2026-09.

**No model is called, nothing is spent, and there is no new dependency.** No file under `src/` changes. Screenshots come from the page in `--fake` mode and the committed eval run.

**Baseline:** `npm run check` exits 0, 1,010 tests.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. Screenshots** | 1–2 | no gate | `npm run screenshots` writes three PNGs, byte-identical over two runs, and I've looked at them |
| **B. README and roadmap** | 3–5 | **Gate** | The README's new top layer on GitHub, diagrams drawn, from the pushed branch |
| **C. Review** | 6 | PR | Review passes recorded |

**Stage A has no gate.** The images are checked by running twice and by looking at them, and nothing downstream spends anything.

**Gate, before the PR: does the top of the README say what the owner would say, to the people they.ll send it to?** The owner reads it on GitHub, where Mermaid draws, from the pushed branch. It covers the product claim, the plain-language findings, the SDLC account and the screenshots. *What it guards:* the PR makes this the repository's front page. **The owner's**, about fifteen minutes.

### Steps

Each step is one commit, through `npm run check && git commit ...`. No Co-Authored-By trailer.

**Stage A: screenshots**

1. **Commit this plan** as `work/0012-close-out/plan.md`.

2. **`e2e/screenshots.spec.ts` and `npm run screenshots` (spec §5).**
   - **The spec file:**
     - `test.skip(process.env.SCREENSHOTS !== "1", "run with npm run screenshots")`, so `test:e2e` lists it as skipped. `playwright.config.ts` and `tests/boundary.test.ts` don't change.
     - `test.use({ viewport: { width: 1280, height: 800 } })`.
   - **Three shots:**
     - `review.png`: open eval conversation `NCT00077350-v2-labels` the way `e2e/review.spec.ts` does (`openReview`), and take the top of the page.
     - `transcript.png`: the same page, scrolled so the transcript heading is at the top of the viewport. The locator is found by reading `src/web/` for the transcript section's heading.
     - `tester.png`: start a fake conversation on NCT04316364, the way `e2e/conversation.spec.ts` does (`start`, `answer`), with three made-up answers ("yes", "no", "not sure"), and take the page.
     - Each is written with `page.screenshot({ path: "docs/images/<name>.png" })`.
   - **`package.json`:** `"screenshots": "SCREENSHOTS=1 playwright test e2e/screenshots.spec.ts"`.
   - **Check:**
     - Run it twice and compare the images with `cmp`. If they differ, mask the varying element with `mask:` and record which.
     - Look at each PNG (Read). A view that doesn't show what the caption will say is re-aimed.
     - Record the sizes. If any is over 400 KB, use `type: "jpeg"` or a smaller clip.
   - `npm run test:e2e` still passes: 9 passed, 1 skipped.
   - The helpers are copied, not imported: `e2e/*.spec.ts` don't export them, and changing the specs isn't this slice's job. Recorded as a known duplication.

**Stage B: README and roadmap**

3. **The README's top layer (spec §3, §4).**
   - The new first part:
     - "What this is" (§3.1);
     - "See it work" (§3.2): the three images with captions, and the product-flow Mermaid diagram (`flowchart LR`);
     - "What it found" (§3.3): five bullets, each linking to its section below;
     - "How it was built" (§3.4): the playbook link, the SDLC Mermaid diagram (`flowchart TD`, with the verification loop as its own cycle), the stage table, the verification loop in plain words, and "Where it bent for one person and a model".
   - Then `## For engineers`, and today's sections in spec §6's order. "What exists so far" is removed, since the top replaces it.
   - **Numbers don't change.** Checked by extracting every number from the old and new README below the top layer and diffing them (a one-off in the scratchpad, recorded). Only headings move.
   - "Augmentation or replacement" gains its 0011 sentence.

4. **CLAUDE.md.** The commands table gains `npm run screenshots`: "writes the README's screenshots from fake mode and the committed eval run. Run by a person after a page change that alters them. Not part of `npm test` or `test:e2e`." Nothing else changes.

5. **The roadmap closed (spec §7).**
   - The table: 0012 is **Done**; the held comparison stays **Held**; simulator fidelity, more labels, plain-language follow-ups and CI are **Not doing**, each with its reason.
   - "Where the project stands" is rewritten as closed.
   - Open question 1 is marked answered as far as a PoC can.
   - Every "a later … slice" and "a later run" disposition becomes **Not doing** (known limitation).
   - A short "Carried forward from 0012".
   - **Then push the branch → Gate.** The gate record goes in this plan.

**Stage C: review**

6. **Review passes.** The five passes of `REVIEW.md`, recorded here, plus:
   - a fresh clone runs `npx vitest run`;
   - `npm run test:e2e` passes 9, with 1 skipped (Pass 2: `e2e/` and `package.json` changed);
   - `git diff main -- src/` is empty;
   - the number diff from step 3.

   Then the PR, stating the gate's outcome and `test:e2e`'s count, with no attribution line.

---

## Files that change

- **New:** `e2e/screenshots.spec.ts`, `docs/images/review.png`, `docs/images/transcript.png`, `docs/images/tester.png`, `work/0012-close-out/plan.md`
- **Modified:** `README.md`, `CLAUDE.md`, `REVIEW.md`, `work/ROADMAP.md`, `package.json`
- **New after the gate's first reading:** `docs/running.md`, `docs/parser.md`, `docs/screening-agent.md`, `docs/plain-language.md`, `docs/coordinator-review.md`, `docs/models-and-cost.md`, `docs/limitations.md`
- **Not touched:** everything under `src/`, `evals/`, `tests/`, `data/` and `scripts/`, plus `playwright.config.ts`

## Reused, not rebuilt

- `playwright.config.ts`'s fake server on port 5015, its scripted agent, and its emptied chats directory.
- The steps of `e2e/review.spec.ts` (`openReview`) and `e2e/conversation.spec.ts` (`start`, `answer`).
- The committed review file for `EVAL_RUN`, so the review shows the real agent's words from 0009's run with no model.
- The README's existing figures. The top layer quotes, never recomputes.

## Risks

- **Time-varying pixels** (a clock, an id). Found by the twice-run `cmp`, then masked.
- **Mermaid syntax GitHub won't draw.** Checked at the gate on the pushed branch. Diagrams kept to `flowchart` with plain labels.
- **The scripted stand-in looks odd in `tester.png`.** The caption says it's the test page's scripted agent, and the real agent's words are in `transcript.png`.
- **Top-layer claims drifting from the numbers.** Each claim links to its section. The gate and Pass 5 read them against it.

## Verification

- `npm run check` at every commit.
- `npm run screenshots` run twice with identical output, and every image looked at.
- `npm run test:e2e`: 9 passed, 1 skipped.
- A fresh clone passes `npx vitest run`.
- Numbers below the top layer: a diff of old and new shows no change.
- The rendered README on GitHub (the gate).

## Records

- **Step 2.**
  - The transcript heading's locator needed `exact: true`: "Not raised in the conversation" matched "The conversation" too.
  - The images are byte-identical over two runs, with nothing masked: `review.png` 137 KB, `transcript.png` 126 KB, `tester.png` 191 KB.
  - All three were looked at. `review.png` shows L3 settled as met from "just the one chemotherapy regimen", and `transcript.png` turn 6 shows the participant correcting it in a reply about L4. That's 0009's known missed correction, and the README's captions say so.
  - `npm run test:e2e`: 9 passed, **2 skipped**. The screenshot spec holds two tests, not the one the plan expected.
- **Step 3.**
  - The top layer is written, and "What exists so far" is folded in. Its install commands and corpus paragraphs moved under "For engineers"; its slice list is replaced by the top.
  - **Number check:** every number in the README from "Try it" on was counted before and after. The only difference is the four added by the 0011 sentence in "Augmentation or replacement" (0011, 120, 183, 84).
  - "For engineers" is a level-one heading, so the existing `##` sections sit under it without being re-levelled.

## Gate record

### The gate, first reading, 2026-09

The owner read the two-layer README (590 lines) on the pushed branch: "That is the longest README.md file that I've ever seen. No one will read that. A readme is what people who see this repo will see and read, so why do things like 'Where the agent fails' exist here?"

**Changed in response** (supersedes spec D1 and §6; spec updated in the same commit):
- **The README is 100 lines:** what it does with the product diagram, the three screenshots, five findings, how it was built with the SDLC diagram and verification loop, how to try it, and an index.
- **The stage table and two adaptation bullets were cut.** The diagram already names the stages.
- **The technical sections moved unchanged into `docs/`**, one file per part: `running.md` (with the corpus and install), `parser.md`, `screening-agent.md`, `plain-language.md`, `coordinator-review.md`, `models-and-cost.md` and `limitations.md`. Cross-references between them became links.
- **Number check:** every number in the old "For engineers" part appears in `docs/`. The only addition is one link anchor ("after-slice-0011").
- **Other files updated:**
  - CLAUDE.md: numbers trace to runs from the README or `docs/`, the README stays short, and "Where things live" lists `README.md` and `docs/`;
  - REVIEW.md Pass 5: asks whether the README is still short and readable, and checks numbers in `docs/`;
  - the roadmap's last note.

### The gate, second reading, 2026-09

The owner read the 100-line README on the pushed branch. **Decision: "Ok, sounds good."** Passed.

## Review passes

Run at step 6 on `0012-close-out`. Run by the author, so not independent.

**Checks run.**
- `npm run check` exits 0: 1,010 tests (1,002 passed, 8 expected fail).
- A fresh clone passes `npx vitest run`: 67 of 67 files.
- `npm run test:e2e`: 9 passed, 2 skipped (the screenshot spec), 14.4 s.
- Every relative link and anchor in the README and `docs/` resolves, checked by a script over GitHub's heading slugs.
- `git diff main` is empty over `src/`, `evals/`, `tests/`, `data/`, `scripts/` and `playwright.config.ts`.

**Pass 1, plan compliance.**
- *Important, recorded:* the one-file README (spec D1, §6) was replaced at the gate by a short README and `docs/`. Spec, plan, CLAUDE.md and REVIEW.md were updated in that commit.
- *Recorded:* `test:e2e` skips 2, not the planned 1.
- *Recorded:* REVIEW.md changed, which the first plan didn't list.

**Pass 2, correctness.** No findings.
- The screenshots are byte-identical over two runs.
- The spec is skipped unless `SCREENSHOTS=1`, so the browser test and the boundary test are unchanged.
- *Nit:* the screenshot helpers repeat the browser specs' steps. Recorded in the spec's comment.

**Pass 3, scope and data discipline.** No findings.
- The screenshots show made-up answers and a vignette-simulated participant.
- No model was called, nothing was spent, and there's no new dependency.
- No attribution line.

**Pass 4, eval integrity.** No findings. No test, spec or grader changed, and every number in `docs/` is the one the README carried before, checked by a count.

**Pass 5, documentation.**
- The README's claims match their docs: 1 in 7 is 24 of 163, 1 in 16 is 9 of 144, "about a quarter" is 61 of 252, and 10 of 15 is the reading.
- *Nit, accepted:* "12 small changes" counts 0012 itself.
- *Nit, accepted:* code comments in `scripts/plain-check.ts` and a few tests still say "the README" where the numbers now live in `docs/`. Comments only.
