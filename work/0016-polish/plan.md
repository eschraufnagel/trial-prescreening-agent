# plan: 0016 polish

**Intent:** `work/0016-polish/intent.md` (`bd1dd99`) · **Spec:** `work/0016-polish/spec.md` (`e86d7e8`)
**Branch:** `0016-polish`, from `main` at `cdad520`. PR into `main`.

---

## Context

Someone opening the repository today sees fake mode. All four README images carry the "Scripted agent" badge, and the screening shows "(scripted)" questions. The page shows internal vocabulary: `eval NCT00077350-v2-labels`, "From 0009's eval run", and 30 example rows repeating five long titles. Nothing moves above the fold, and the GitHub page has no description or card. The owner will publish a new repository from these files, without this one's history.

This slice:
- makes the page speak plainly and look finished;
- captures the README's images and a short demo from the real local model;
- writes the GitHub page's words and card;
- records a going-public check of the files.

The agent, parser, prompts, labels and committed results don't change.

**Nothing here spends money.** The model calls are local oMLX: one parse of NCT05854498 for each test that adds it, plus a handful of screening replies. One fetch of NCT05854498 goes to clinicaltrials.gov through the app's Add button, the existing exception. No `--spend`, no `.env`, no npm dependency. `ffmpeg` 9.0.2 is installed by the owner, and oMLX is healthy with `Qwen3.6-35B-A3B-MLX-8bit`.

**Baseline**, from `npm test` on `e86d7e8`: 75 test files, 1112 passed and 8 expected fail (1120). `npm run test:e2e`: 10 cases, plus the screenshot spec's 3, skipped.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. The page, polished** | 1–3 | **Gate** | Fake-mode screenshots of Trials, Screenings, Reviews and a review at 1280 light, 1280 dark and 390, in this plan's Records. `test:e2e` 10/10 |
| **B. Capture on the real model** | 4–5 | — | `npm run screenshots` and `npm run demo` committed. Five images and a GIF under `docs/images/` |
| **C. Words and the check** | 6–8 | PR | README, docs, CLAUDE.md, `github.md`, `going-public.md`, roadmap, review passes |

**Gate: is this the look to capture? (intent, Gates)**

- **What's decided.** Whether the polished page, in fake mode, is what the README should show. The answer is go, or a list of changes.
- **What it costs to be wrong.** Every image and the demo are taken from this page in stage B. A change of look afterwards means re-running the whole capture against oMLX (about 10 minutes of model time, plus encoding) and re-reviewing every image. Taste can't be tested, so only the owner can answer.
- **What the owner reads.**
  - Twelve screenshots, pasted into Records as paths under the scratchpad: four pages × three views.
  - §4's wording table with the after column as built.
  - Any place the build differs from spec §4 or §5.
- **The answer can be no.** Changes are made in stage A, the screenshots are retaken, and the gate is asked again. Stage B doesn't start until it's go.

Stage B has no gate. Its output is images, which the owner judges in the PR, and nothing downstream is built on them. Stage C is words.

### Steps

- Each step is one commit, made through `npm run check && git commit`.
- `npm run test:e2e` runs at the end of steps 2, 3 and 4, since each touches `src/web/` or `e2e/`.
- No commit carries a Co-Authored-By trailer (CLAUDE.md).

**Stage A: the page, polished**

1. **Commit this plan** as `work/0016-polish/plan.md`.
   - In the same commit, `spec.md` §5.3 is amended: the Trials page has no empty-state card to copy (its first-run panel is a `hero`), so "Finished" reuses the row's `card` class.
   - `.claude/launch.json`, the local preview config used for looking at the page, stays untracked. It goes in `.git/info/exclude`, a local file, not in `.gitignore`.

2. **Wording (spec §4).**
   - **`src/web/logic.ts`: new `exampleLabel(id: string): string`.**
     - It matches `/^eval (NCT\d{8})-v(\d+)-(labels|parse)$/`.
     - It returns `Simulated patient ${n} · rules checked by hand` for `labels`, and `· rules read by the AI` for `parse`.
     - Anything else is returned unchanged.
     - Its doc comment says it's display only: the id stays the key everywhere.
   - **`src/web/review.ts`.**
     - `EVAL_RUN_NOTE` becomes spec §4's text.
     - `ReviewModel.frame` gains `label: string`: `exampleLabel(review.id)` when `review.origin === "eval-run"`, else `review.id`. It's set in `reviewModel` beside `id`.
     - `tests/web/review.test.ts`'s `ownWords` walks the frame, so the new label falls under its verdict check without the test changing. The VERDICT pattern can't match the new words, and that is checked by running it, not by editing it.
   - **`src/web/ReviewPage.tsx`.**
     - The header shows `<span className="id" title={frame.id}>{frame.label}</span>`.
     - The transcript says `asked about rule {line.raised}`, and `Shown with rule`/`rules` followed by the links, using `citedBy.length === 1`.
     - `Row`'s code span gets `title={`Rule ${row.criterion.id}, in the protocol's order`}`.
   - **`src/web/ScreeningRow.tsx`.** An eval-run row shows `exampleLabel(c.id) · {c.turns} messages`, and a person's row `{c.id} · {c.turns} messages`.
   - **`src/web/ReviewsPage.tsx`.** The heading becomes "Examples (simulated patients)".
   - **`src/web/index.html`.** `<title>Trial Prescreening</title>`.
   - **Tests.**
     - `tests/web/logic.test.ts` gains `describe("exampleLabel (slice 0016)")`: labels v1/v2/v3, parse, a person's id, and `eval NCT0000-v1-labels`, which isn't 8 digits so it's returned unchanged.
     - `tests/web/review.test.ts` is **not edited**. Its `EVAL_RUN_NOTE` check imports the constant.
     - `e2e/review.spec.ts` and `e2e/start.spec.ts` change `/From the eval run/` to `/Examples \(simulated patients\)/`.
     - `review.spec.ts`'s `openReview` checks the header shows `exampleLabel(CONVERSATION)`, imported from `logic.ts`, in place of the raw id.
     - `e2e/screenshots.spec.ts` gets the same two edits, so it still type-checks until step 4 deletes it.

3. **Finish (spec §5).**
   - **Favicon.** `index.html` gains `<link rel="icon" href="data:image/svg+xml,…">`: the header's flask paths from `App.tsx`, stroke `#2f5bd3` (`--accent` in `styles.css`'s light tokens), URL-encoded.
   - **Examples grouped by trial (`ReviewsPage.tsx`).**
     - `evalRun` is grouped by `c.nctId`, keeping first-seen order. The served run is already ordered by trial, then source.
     - Each group renders `<h3 className="example-trial">{title}</h3>` and its `<ul className="rows-list">`. All of it sits inside one `<div className="example-groups">` under the section's `h2`.
     - An eval-run row no longer repeats its trial's title: `ScreeningRow` names it by `exampleLabel`, with "N messages" below. Eval-run rows only appear under a trial heading, so no prop is needed. *(As built: the plan had a `showTitle` prop, which nothing would have set to true for an eval-run row.)*
     - Rows inside a trial are sorted with labels before parse, then by simulated patient, so v1/v2/v3 labels come before v1/v2/v3 parse. An id it can't read sorts last. A pure helper, `exampleOrder(a, b)`, in `logic.ts`, is unit-tested. *(As built: the plan said "by vignette, then labels before parse", which contradicts the order it named.)*
     - Nothing groups or sorts by outcome. The summary carries no outcome.
   - **The "Finished" empty state.** The Trials page has no empty-state class; its first-run panel is a `hero`. So the line goes in a `<p className="card dim">`, reusing the `card` class the rows use, with no new CSS beyond padding if `card` lacks it.
   - **The review header's notes.** `.review-note` siblings render inside one `<div className="review-notes">`, styled as one block with a 1px divider between notes in `styles.css`. Light and dark tokens only, no new colours.
   - **Tests.**
     - `e2e/start.spec.ts` counts example rows with `page.locator("section[aria-labelledby=eval-h] li")` instead of `following-sibling::ul[1]`. It still expects `review.conversations.length` rows and links, and no Delete.
     - `e2e/review.spec.ts`'s `openReview` finds the row by its trial heading, then by label.
     - `tests/web/logic.test.ts` covers `exampleOrder`.
   - **Then the gate's screenshots**, taken with the browser pane against `npm run app -- --fake` on 5025 with scratch `--chats-dir` and `--trials-dir`. They aren't committed.

**→ Gate.**

**Stage B: capture on the real model**

4. **The capture tooling (spec §2, §3, §6).**
   - **`playwright.capture.config.ts`.**
     - `testDir: "e2e"`, `testMatch: "capture.spec.ts"`, one worker, no retries.
     - `timeout: 600_000`, `outputDir: "e2e/.out/capture"`.
     - `use: { baseURL: process.env.CAPTURE_URL ?? "http://127.0.0.1:5035", viewport: 1280×800, deviceScaleFactor: 1, colorScheme: "light" }`.
     - No `webServer`: the person starts the real app. Its header comment says so and gives the command.
   - **`e2e/capture.spec.ts`.** It replaces `e2e/screenshots.spec.ts`, which is deleted, and is guarded by `test.skip(process.env.CAPTURE !== "1", …)`.
     - **`beforeAll`:** open `/`, and fail with "Start the app on the local model: npm run app -- --examples --port 5035 …" unless the badge reads `Local model`.
     - **Helpers:**
       - `removeIfPresent(page, nctId)`: Remove…, then Remove, as `e2e/trials.spec.ts` does.
       - `agentBubbles(page)` = `.bubble.from-agent:not(.waiting)`.
       - `reply(page, text)`: fill, Enter, wait for `agentBubbles` count + 1, 90 s timeout.
       - `answerFor(question)`: spec §2.3's table as an array of `[RegExp, string]`, case-insensitive, first match wins.
     - **Test "stills"** (spec §2.4): trials.png, screening.png, review.png, transcript.png. It removes NCT05854498 at the end.
     - **Test "demo"** (spec §3.1).
       - It runs in its own context with `recordVideo: { dir: "e2e/.out/capture/video", size: 1280×800 }`.
       - `t0 = Date.now()` is taken at context creation. A `mark(label)` helper pushes `{ at: (Date.now() - t0) / 1000, label }`.
       - Waits are bracketed by `wait-start` and `wait-end` marks.
       - The caption overlay is a fixed element added with `page.evaluate`. It's styled inline, bottom-centre, white on 80% black, and removed right after each wait.
       - On close it writes `e2e/.out/capture/cuts.json` (`[{from, to, speed}]`), built from the marks: 1× outside waits, and a speed per wait so each lasts 0.6 s. It records the video's path. It removes NCT05854498 at the end.
     - **Test "social card"** (spec §6). It opens `e2e/capture/social-card.html` by `file://` URL at 1280×640 and screenshots `docs/images/social-card.png`. It runs after "stills", since it shows a crop of `review.png`.
   - **`e2e/capture/social-card.html`.** Static, with inline CSS that copies the page's font stack and light tokens, and the flask SVG. It has the project name, the one-line summary from the README and `<img src="../../docs/images/review.png">` cropped by CSS.
   - **`scripts/make-demo.ts`** (`npm run demo`).
     - It reads `cuts.json` and checks `ffmpeg -version` through `execFileSync`, failing with "Install ffmpeg (brew install ffmpeg)" if it's missing.
     - It builds one `-filter_complex`: per cut, `trim=start:end,setpts=(PTS-STARTPTS)/speed`; then `concat=n=N:v=1`, `fps=12`, `scale=960:-1:flags=lanczos`, `split`, `palettegen=stats_mode=diff`, `paletteuse=dither=bayer:bayer_scale=4`.
     - It writes `docs/images/demo.gif`.
     - If the GIF is over 5 MB, it retries at `fps=10`, then at width 800. It prints the size and settings used.
     - No network, no model. `tests/boundary.test.ts` is unaffected (no `fetch`, no adapter, no key names), and `npm run check` shows that.
   - **As built, two additions.**
     - `cutsFromMarks` lives in `scripts/make-demo.ts` beside `filterGraph`, and the capture spec imports it. Both are pure, so `tests/scripts/make-demo.test.ts` covers them: cuts from marks, a short wait not slowed, bad marks refused, the filter graph, and the offset clamped at zero.
     - `e2e/` is type-checked without DOM types, so the captions go in through the body's element handle.
   - **`package.json`.** `"screenshots": "CAPTURE=1 playwright test -c playwright.capture.config.ts"`, and `"demo": "node --import tsx scripts/make-demo.ts"`.
   - **Check.** `npm run test:e2e` gives 10 passed and the capture spec skipped. `CAPTURE=1 npx playwright test -c playwright.capture.config.ts --list` lists 3 tests.

5. **Run the capture and commit the images.**
   - Start `npm run app -- --examples --port 5035 --chats-dir <scratch>/chats --trials-dir <scratch>/trials`, then `npm run screenshots` and `npm run demo`.
   - **Claude checks each image by eye** before committing:
     - no "Scripted" anywhere;
     - badge `Local model · Qwen3.6-35B-A3B-MLX-8bit`;
     - NCT05854498's card shows Ready;
     - the screening shows three real exchanges;
     - the transcript image still shows the turn-6 correction the README describes.

     If the README's turn number moved, step 6 says so.
   - **Commit** `docs/images/{demo.gif,trials.png,screening.png,review.png,transcript.png,social-card.png}`, with `tester.png` deleted.
   - **Records** gets the GIF's size and settings, the parse's criterion count and anything it left unread, and the model's words in the screening, verbatim. They're synthetic answers, so there's no PHI.
   - **If a run goes badly**, for example the model asks something the answer table answers oddly: re-run once. The table isn't tuned, and the oddity is recorded. A model reply is never edited.

**Stage C: words and the check**

6. **README and docs (spec §1).**
   - **`README.md`.**
     - Badges under the title.
     - The demo and its caption after the proof-of-concept note.
     - "See it" with four images, in spec order, `tester.png` → `screening.png`, captions rewritten to match the new images.
     - "How it was built": "sixteen small changes" (17 folders under `work/` minus `0000-product`), "landed as one reviewed change", and the test count checked against `npm test` at this commit ("over 1,000" stays if it's still true).
   - **`docs/running.md`.** A "Making the README's images" section: start the app on the local model, `npm run screenshots`, `npm run demo`, and that `ffmpeg` is needed only for the demo.
   - **`CLAUDE.md`.** The `npm run screenshots` row is rewritten (real model, a running app, images kept rather than regenerated). There's a new `npm run demo` row, and the "Where things live" line for `docs/images/` mentions the demo and card.
   - **`work/0016-polish/github.md`** (spec §6): description, topics, the full `gh repo edit` command with `<owner>/<repo>` left for the owner, and where to upload `social-card.png`.

7. **The going-public check (spec §7).** `work/0016-polish/going-public.md`, from the tree at step 6's commit. Each item lists what was looked for, the command (`git grep`, `git ls-files`, sizes from `git ls-files -z | xargs -0 du -k`) and the result, then the recommendations. Nothing outside the slice folder changes.

8. **Roadmap, review passes, PR.**
   - `work/ROADMAP.md` gets a 0016 row and a short section: what was done, and the fresh-repository plan as the owner's next action. "Carried forward from 0016" lists anything the check recommended and the owner hasn't taken.
   - Run REVIEW.md's passes and fix Important findings.
   - The PR states: `test:e2e` ran (count), the gate's answer, that going public hasn't happened, and that no model call went off this machine.

---

## Files

| Change | Files |
| --- | --- |
| Wording and finish | `src/web/{index.html,logic.ts,review.ts,ReviewPage.tsx,ReviewsPage.tsx,ScreeningRow.tsx,styles.css}` |
| Tests | `tests/web/logic.test.ts`; `e2e/review.spec.ts`, `e2e/start.spec.ts` |
| Capture | `playwright.capture.config.ts`, `e2e/capture.spec.ts`, `e2e/capture/social-card.html`, `scripts/make-demo.ts`, `tests/scripts/make-demo.test.ts`, `package.json`; `e2e/screenshots.spec.ts` deleted |
| Images | `docs/images/{demo.gif,trials.png,screening.png,review.png,transcript.png,social-card.png}`; `tester.png` deleted |
| Words | `README.md`, `docs/running.md`, `CLAUDE.md`, `work/ROADMAP.md`, `work/0016-polish/{plan.md,github.md,going-public.md}` |

Reused, not rewritten:
- `screeningLabel` and `reviewHash` (`src/web/logic.ts`);
- the remove and add flows' selectors from `e2e/trials.spec.ts`;
- `STATE_WORDS` / `Ready · N criteria` from `logic.ts`, for waiting on the parse;
- the `card` class the rows use, for the empty state;
- the flask SVG paths in `App.tsx`.

## Risks

- **Video timestamps drift from the marks.** Playwright's recording starts a little after context creation. Cuts may be off by a fraction of a second. Mitigation: `make-demo.ts` takes an `--offset` (default 0), and Claude watches the GIF frame by frame before committing.
- **The real model asks something the answer table handles badly.** The fallback is "I'm not sure, I'd have to check", which is a truthful-sounding answer the agent handles. Recorded, not tuned.
- **NCT05854498's registry entry changed since 0013.** The app shows what it fetched. If the parse loses criteria, the card says so and the image keeps it (spec §2.2).
- **The GIF is over 5 MB at 800 wide and 10 fps.** Then the demo is shortened: step 5 of the storyboard scrolls less. The owner sees the size in the PR.
- **Grouping the examples could look like a ranking.** Groups are by trial, in the run's order, and their headings are registry titles. Nothing about outcomes is shown or used.

## Verification

- `npm run check` exits 0 at every commit. `tests/web/review.test.ts` and `tests/boundary.test.ts` pass unedited.
- `npm run test:e2e`: 10 passed, the capture spec skipped, after steps 2, 3 and 4.
- The gate's twelve screenshots, by eye.
- The images and GIF, by eye: no scripted chrome, real badge, GIF ≤ 5 MB, loops.
- The README read top to bottom on GitHub's renderer (the PR's file view), checking the badges, GIF and image paths.

## Records

### The gate (after step 3, 2026-10)

- **Shown:** twelve fake-mode screenshots, of Trials (with the invented study added), Screenings, Reviews and the review of `eval NCT00077350-v2-labels`, each at 1280×800 light, 1280×800 dark and 390×844 light. They were taken with `npx playwright screenshot` against `npm run app -- --fake` on 5025 with scratch directories, and aren't committed.
- **Found while taking them, and fixed before showing:** the review header set the example's name in monospace (`b0be3c7`).
- **Builds that differ from this plan:** `exampleOrder`'s order and `ScreeningRow` without a prop, both noted in step 3.
- **Answer: go** (owner, 2026-10).

### The capture (step 5, 2026-10)

- **App:** `npm run app -- --examples --port 5035` with scratch directories. `/api/info`: `local-model`, `Qwen3.6-35B-A3B-MLX-8bit`, 8bit, temperature 0, seed 20260921, thinking off, source labels.
- **NCT05854498** (Liposomal Irinotecan With TAS102 and Bevacizumab for Patients With Metastatic Colorectal Cancer) parsed to **12 criteria**, with 6 the person can answer and 6 needing records. Nothing was rejected or left unread, so the card shows no warning.
- **First run, a bug in the capture.** `answerFor` read the agent's whole first message. Its greeting names the trial ("…Resectable NSCLC"), so `/surg|resect/` answered a performance-status question with the surgeon line. Fixed by matching the message's last paragraph, which is the question spec §2.3 says to match. The table didn't change. This was the one re-run step 5 allows.
- **The stills' screening (NCT04316364), the second run's words, verbatim:**
  1. Agent: "Thanks. On a scale of 0 to 1, where 0 means fully active and 1 means restricted in physically strenuous activity but ambulatory, how would you describe your current health status?" Answer, the fallback: "I'm not sure, I'd have to check." *(The ECOG row's words, "ECOG|daily activit|performance", didn't match the model's paraphrase. Recorded, not tuned.)*
  2. Agent: "Thanks. Have you been diagnosed with resectable Stage II, IIIA, or Selected IIIB non-small cell lung cancer (NSCLC) that has not yet been treated with cancer therapy?" Answer: "Yes, a biopsy last spring confirmed stage II non-small cell lung cancer."
  3. Agent: "Thanks. Have you started any cancer treatment yet, such as chemotherapy or radiation? Also, has your doctor confirmed that the tumor can be surgically removed?" Answer: the biopsy line again, since "confirmed" matched the first row before "treatment" could. *(Recorded, not tuned. The image shows it.)*
- **The demo's first recording screened the added colorectal trial with lung answers** ("To confirm, are you 18 years of age or older?" drew the biopsy line). That was the storyboard's mistake, not the model's. Spec §3.1 is amended: the demo shows the added trial's checklist, then screens NCT04316364. Re-recorded once with that change.
- **The GIF:** 27.1 s, **4.89 MB at 10 fps, 800 px wide**. It was 7.15 MB at 12 fps/960 and 6.78 MB at 10 fps/960, so `npm run demo` stepped down twice. No `--offset` was needed: the frames line up with the captions on a contact sheet.
- **Checked by eye:** no "Scripted" in any image, the badge reads `Local model · Qwen3.6-35B-A3B-MLX-8bit`, and the transcript still shows the turn-6 correction the README describes.

### Review passes (step 8, REVIEW.md)

- **Pass 1, plan compliance: clean.** All 33 changed files are in the Files table. Every divergence is written into this plan where it happened: `ScreeningRow` without a prop, `exampleOrder`'s order, the header's type, `make-demo.test.ts`, handles for captions, the capture's question matching, and the demo's storyboard (also in spec §3.1).
- **Pass 2, correctness: one Nit, fixed.** `scripts/app.ts` still printed "Prescreening test page" in the terminal. It now prints "Trial Prescreening". `review.ts` now imports `logic.ts`, whose only runtime import is `transport/rules.ts`, so it's still browser-safe and the page-is-browser-code test passes. `npm run test:e2e`: **10 passed, 3 skipped** (the capture spec), after the last change to `e2e/` and `scripts/app.ts`.
- **Pass 3, scope and data: clean.** Every answer typed is from the capture's made-up table. The capture reaches the network only through the app's Add button (the 0013 exception) and calls no model off this machine. The shields.io badges are images GitHub shows a reader, not runtime calls. No secrets, and no hosting: `github.md` leaves the website field empty on purpose.
- **Pass 4, eval integrity: clean, with one note.** `e2e/review.spec.ts` and `e2e/start.spec.ts` changed with the page, and neither got weaker. Case 8 still requires the review to open on that conversation, now checked by its readable name in the header. `start.spec.ts` still counts every example row and link and finds no Delete. `e2e/screenshots.spec.ts` was deleted, but it asserted no behaviour (it was skipped by `test:e2e`), and `e2e/capture.spec.ts` replaces it. `tests/web/review.test.ts` and `tests/boundary.test.ts` are unedited and pass. The capture run's model, quantization, temperature and seed are in Records.
- **Pass 5, documentation: clean.** The README is still short. Its new numbers (12 rules: 6 and 6, sixteen changes, over 1,000 tests with 1121 now) match this commit. `docs/limitations.md` is unchanged and still true. The new limits (images not reproducible, a crude answer table) are in the roadmap's "Carried forward from 0016".
