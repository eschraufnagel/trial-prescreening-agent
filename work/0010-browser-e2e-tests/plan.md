# plan: 0010 browser end-to-end tests

**Intent:** `work/0010-browser-e2e-tests/intent.md` · **Spec:** `work/0010-browser-e2e-tests/spec.md`
**Branch:** `0010-browser-e2e-tests` (from `main` at `1ce72ff`; intent `80326da`, spec `c181ad4`)

---

## Context

Nothing has ever driven the page in a browser, and `npm test` fails 5 of 61 files from a fresh clone. The review reads 60 conversation files from the gitignored cache `evals/results/screening/conversations/`. This slice does four things:

- commits what the review reads, one file per run;
- lets fake mode reach the model-down, agent-working and doesn't-apply states;
- adds `npm run test:e2e` (Playwright, Chromium, against `npm run app -- --fake`);
- after a gate, writes the browser check into CLAUDE.md and REVIEW.md.

The owner accepted the intent's five decisions and its one gate in 2026-09.

**Nothing here calls a model.** The only network steps are two installs, both approved by D1 when this plan is approved:

- `npm install -D --save-exact @playwright/test@1.63.0`;
- `npx playwright install chromium`, run by Claude at step 6.

Claude never passes `--spend` and never touches `.env`.

**Baseline, measured before any change:** `npm test` 892 tests (885 passed, 7 expected fail), 0.73–1.13 s over three runs. A fresh clone fails 5 files: `tests/web/review.test.ts`, `tests/scripts/review-sheet.test.ts` and `tests/scripts/review-score.test.ts` at collection, plus 4 tests in `tests/scripts/app-eval-run.test.ts` and `tests/server/app.test.ts`.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. The review's data** | 1–3 | no gate | Two committed review files. `loadEvalRun` reads them. `npm test` passes from a fresh clone, run and recorded |
| **B. Fake mode** | 4–5 | no gate | `npm run app -- --fake --chats-dir <dir>`. `[down]`, `[slow]` and `n/a` work by hand in the page |
| **C. The browser test** | 6–9 | **Gate** | `npm run test:e2e` green, nine cases. Three timed runs, a failure's output, and the mutation table recorded in this plan |
| **D. The loop, documented** | 10–12 | PR | CLAUDE.md, REVIEW.md, README, roadmap, review passes |

Stages A and B have no gate. Each ends in tests, and nothing downstream spends on them: a wrong review file is caught by §6.1's tests and the clean-clone run, not by judgment.

**Gate: is this check worth what every later page change pays for it? (spec §8)**

Before stage D, the owner sees in this plan's "Gate record":

1. `npm run test:e2e`'s time over three consecutive runs, and whether all three passed. A flake is reported, never retried away.
2. A failure's output: the list reporter's lines for one mutation, and its trace path.
3. The mutation table (spec §8). For each break: the diff, which cases failed, and confirmation that it was reverted. A break no case catches is fixed in the specs and rerun before the gate, or recorded as accepted with a reason.

*Why it guards stage D:* stage D makes the check a rule every later slice obeys for any change on the page's paths. What it costs to be wrong: a rule for a check that catches nothing, or one too slow or flaky for anyone to run. Claude does the mutation pass (delegated in the spec). **The go-ahead is the owner's**, and it can say no. Then stages A–C land, and steps 10's CLAUDE.md and REVIEW.md rule waits for a later slice. The PR says so.

### Steps

Each step is one commit. `npm test`, `npm run typecheck` and `npm run lint` pass at every commit, and lint is read by its exit code (`npx biome check . >/dev/null; echo $?`). No test uses `vi.mock`, `vi.stubGlobal`, `vi.spyOn` or `vi.useFakeTimers`. No commit carries a Co-Authored-By trailer.

**Stage A: the review's data**

1. **Commit this plan.** It goes in as `work/0010-browser-e2e-tests/plan.md`, with the baseline above.

2. **`exportReview` and `npm run review:export` (spec §3.2).** Additive. The loader is unchanged in this step.
   - `scripts/app/eval-run.ts`:
     - Export `REVIEW_DIR` (`evals/results/screening/review`).
     - Export an interface `ReviewFile { runFile; promptVersion; conversations: ReviewConversation[] }`, where `ReviewConversation` is `{ id, nctId, source, criteria, result }`.
     - Add `exportReview(dir, runFile): ReviewFile`. It moves today's body of `loadEvalRun` (key by `run.promptVersion` / `run.simulatorVersion` via `conversationKey`, and the three refusals), but returns `criteria` and `result` without renderings.
     - Add `reviewText(file)`: `JSON.stringify(file, null, 2) + "\n"`.
   - `scripts/review-export.ts`: `npm run review:export -- <run file> [--force]`.
     - Writes `review/<run file>`, creating the directory.
     - If the file exists with identical text, it prints "unchanged". If the text differs, it refuses without `--force`: "the cache no longer matches the committed review file".
     - Its header comment follows `scripts/review-sheet.ts`'s style.
   - `package.json`: `"review:export": "node --import tsx scripts/review-export.ts"`.
   - `biome.jsonc`: `"!evals/results/screening/review"` beside the conversations exclude.
   - `tests/scripts/review-export.test.ts`:
     - The three refusals, using the temp-dir `oldRun` helper, which moves here from `tests/scripts/app-eval-run.test.ts`. It gains variants for a missing file and an unfinished file.
     - Same input gives identical text.
     - An exported file has no key in `EVAL_ONLY_KEYS` (from `tests/fixtures/eval-run.ts`).
     - The CLI's refuse/`--force`/unchanged logic, kept as a pure function `writeDecision(existing, next, force)` so it tests without touching the repo.

3. **Commit the two review files and switch the loader (spec §3.1, §3.3, §6.1).**
   - Run `npm run review:export -- 02-2c46ada9a1d5.json` and `-- 01-c5778afe9cbd.json`. Record each file's size here. Expected about 1.2 MB and 1.0 MB compact, more as two-space JSON. If either passes 2.5 MB, record it and switch `reviewText` to compact, one conversation per line. That's a spec divergence, updated in the same commit.
   - `loadEvalRun(dir, runFile)` in `scripts/app/eval-run.ts`:
     - Reads `dir/review/<runFile>` and the committed run file `dir/<runFile>`.
     - Throws if the file's `runFile` or `promptVersion` differs from the run file's, naming both.
     - Throws "missing, make it with `npm run review:export -- <runFile>`" if absent.
     - Maps each conversation to `FinishedConversation` with `plain: source === "labels" ? displayFor(criteria, loadPlainFile(nctId)) : {}`, as today.
     - No path under `conversations/` is built any more. Update the doc comment.
   - `tests/scripts/app-eval-run.test.ts`:
     - The existing three loader tests stay unchanged.
     - The old-prompt temp-dir test becomes a review-file mismatch test (wrong `runFile`, wrong `promptVersion`, missing file).
     - New: `EVAL_RUN` and `READING_RUN` each have a file under `REVIEW_DIR`. Each committed file has no key in `EVAL_ONLY_KEYS`.
   - **Proof:** a fresh `git clone` of the branch into the scratchpad, `node_modules` symlinked, `npx vitest run`. It passes. Record the count and the three-run `npm test` time here, against 0.73–1.13 s.

**Stage B: fake mode**

4. **`delayMs` on a scripted response (spec §4.2).**
   - `src/models/fake.ts`: `json`, `raw` and `error` gain `delayMs?: number`. `complete` builds its promise as today, then delays settling with `setTimeout` when `delayMs > 0`. The requests recorded and the order are unchanged.
   - `tests/models/fake.test.ts`: a 40 ms delayed response isn't settled when an already-resolved promise is raced against it, and settles afterwards. A delayed error rejects after the delay. Real timers only.

5. **The scripted agent's three replies, the banner, `--chats-dir` (spec §4.1, §4.3).**
   - `scripts/app/scripted-agent.ts`, in `read()`:
     - Strip a leading `[slow]` and remember it.
     - A leading `[down]` returns `{ kind: "error", message: "request failed: [down] was typed, the scripted model is unreachable" }`.
     - A first word `n/a` (case-insensitive, checked before the letters-only cleanup turns it into `na`) reads `does-not-apply`.
     - `[slow]` adds `delayMs: 2000` to the read response.
     - Header comment lists the three.
   - `src/web/App.tsx` banner: "Answers yes, no, n/a or not sure are read literally."
   - `scripts/app.ts`:
     - `--chats-dir <dir>` in `parseArgs`, resolved against the working directory, default `CHATS_DIR`. It's passed as `chatsDir`. `ConversationStore` already creates the directory (`src/server/store.ts:76`), so `src/server/` doesn't change.
     - Header comment: "0004's committed eval run" becomes "the committed eval run `EVAL_RUN` names", and the flag is listed.
   - `tests/scripts/scripted-agent.test.ts`: three cases using the existing `converse` helper and `tests/fixtures/conversation.ts`. `[down]` rejects the turn with `isConnectionFailure(error) === true`, the session state is unchanged, and the next reply proceeds. `[slow] yes` records `holds` with quote `yes`. `n/a` closes a patient criterion `unresolved`/`does-not-apply` and reports a clinical one `chart-review`/`does-not-apply`.
   - If `parseArgs` isn't exported, export it and add a `--chats-dir` case to an existing test file (`tests/scripts/` has no app-args test today; add `tests/scripts/app-args.test.ts`).
   - **By hand:** `npm run app -- --fake --chats-dir <scratch>`, and each of the three replies behaves as the spec's table says.

**Stage C: the browser test**

6. **Playwright, its config, the first spec, the boundary test (spec §5.1, §5.2, §6.2).**
   - `npm install -D --save-exact @playwright/test@1.63.0`, then `npx playwright install chromium`.
   - `playwright.config.ts`, exactly spec §5.2's table.
   - `package.json`: `"test:e2e": "playwright test"`.
   - `.gitignore`: `e2e/.out/`. `biome.jsonc`: `"!e2e/.out"`. `tsconfig.json` include gains `"e2e/**/*.ts"`.
   - `e2e/start.spec.ts`: case 1. It reads `EVAL_RUN`'s review file through `REVIEW_DIR` and `EVAL_RUN` from `scripts/app/eval-run.ts` for the expected count.
   - `tests/boundary.test.ts`, in "the running application stays local":
     - `LOCAL_ONLY` gains the files under `e2e/`, so no spec names `createAdapter`.
     - A new test reads `playwright.config.ts` as text. Its `command:` string contains `npm run app` and `--fake`, and none of `--agent`, `--model`, `--spend`, `--source`.
     - A "would catch it" case.
   - Run `npm run test:e2e` and confirm case 1 passes.

7. **`e2e/conversation.spec.ts`: cases 2–7 (spec §5.4).**
   - A small helper in the same file: `start(page, nctId)` clicks the study's Start and waits for the first agent bubble. `answer(page, text)` fills the textarea and presses Enter, then waits until the reply count grows or the conversation finishes.
   - Words imported from `src/web/review.ts`, `src/web/logic.ts` and `src/server/conversations.ts` (spec §5.3).
   - Case 5 opens tab B with `context.newPage()` on the same `#/c/<id>` before A sends. B isn't brought to the front.
   - Case 6's sequence is spec §5.4's: L1 `n/a`, L2–L6 `yes`, L7 `n/a`, the rest `yes`.

8. **`e2e/review.spec.ts`: cases 8–9.**
   - Opens `eval NCT00077350-v2-labels` from the start page's eval-run list.
   - The ascending-order check is shared with case 3 through a helper file, `e2e/lib/rows.ts`. For each `section.review-group`, the `li.review-row` ids' numbers ascend.

9. **The gate record (spec §8).**
   - Three timed runs of `npm run test:e2e`.
   - One failing run's output.
   - The mutation table: each break applied with `git stash`-free edits, run, reverted with `git checkout -- <file>`, and the working tree confirmed clean.
   - All written into this plan's "Gate record" section, which is the only file this step commits.
   - **Stop for the owner.**

**Stage D: the loop, documented (only after the gate)**

10. **CLAUDE.md and REVIEW.md (spec §7.1, §7.2).**
    - CLAUDE.md:
      - "Verifying your work" rows for `test:e2e` (with the measured time), `npx playwright install chromium` and `review:export`.
      - `--chats-dir` and the three replies in the `npm run app` row.
      - The PR checklist sentence with the path list.
      - `e2e/` in "tests/ and evals/ are different things" and in "Where things live".
      - `evals/results/screening/review/` in "Where things live".
      - The fresh-clone line.
    - REVIEW.md: Pass 2 and Pass 4 lines.
    - If the gate said no, this step is skipped and the PR says so.

11. **README and roadmap (spec §7.3, §7.4).**
    - README:
      - "Try it" lists `n/a`, `[slow]` and `[down]` and `--chats-dir`.
      - The "30 conversations … with no model running" sentence says they come from committed review files.
      - A new "Checking the page" section after "Try it": coverage, not covered, one-time install, measured time, mutation result.
      - "What exists so far" names slice 0010.
    - ROADMAP:
      - 0010 row "Done (PR #N)".
      - The "where the project stands" list.
      - The carried-forward table: 0009's two items resolved, plus the new parse-mode item going to 0011.
      - "Carried forward from 0010".

12. **Review passes (REVIEW.md), recorded here.**
    - All five passes, plus the fresh-clone run and `npm run test:e2e` once more.
    - "Files that change" checked against `git diff --stat main`.
    - Then stop. The PR is opened on the owner's word, with the e2e pass count in its description, and whether the gate was passed or skipped.

## Files that change

**New:**
- `scripts/review-export.ts`
- `evals/results/screening/review/02-2c46ada9a1d5.json` and `evals/results/screening/review/01-c5778afe9cbd.json`
- `playwright.config.ts`
- `e2e/start.spec.ts`, `e2e/conversation.spec.ts`, `e2e/review.spec.ts`, `e2e/lib/rows.ts`
- `tests/scripts/review-export.test.ts`, `tests/scripts/app-args.test.ts`
- `work/0010-browser-e2e-tests/intent.md`, `spec.md`, `plan.md`

**Modified:**
- `scripts/app/eval-run.ts`, `scripts/app/scripted-agent.ts`, `scripts/app.ts`
- `src/models/fake.ts`, `src/web/App.tsx` (banner only)
- `tests/scripts/app-eval-run.test.ts`, `tests/scripts/scripted-agent.test.ts`, `tests/models/fake.test.ts`, `tests/boundary.test.ts`
- `package.json`, `package-lock.json`, `.gitignore`, `biome.jsonc`, `tsconfig.json`
- `CLAUDE.md`, `REVIEW.md` (after the gate), `README.md`, `work/ROADMAP.md`

**Not touched, checked with `git diff main` at step 12:** `src/screening/`, `src/criteria/`, `src/plain/`, `src/transport/`, `src/server/`, `evals/` apart from the new `review/` files, `data/`, the committed run files, `tests/web/review.test.ts`.

## Reused, not rebuilt

- `conversationKey` (`evals/screening-runner.ts`) and today's `loadEvalRun` body become `exportReview`.
- `displayFor` and `loadPlainFile` (`src/plain/`) still build renderings at load.
- `EVAL_ONLY_KEYS` and `keysOf` (`tests/fixtures/eval-run.ts`) check the committed files.
- `isConnectionFailure` (`src/models/errors.ts`) already turns a "request failed" problem into the page's model-down state. No server change.
- `FakeModelAdapter`'s existing `error` kind carries `[down]`.
- `converse` in `tests/scripts/scripted-agent.test.ts` drives the new replies.
- The page's existing `id="row-<id>"` and `section.review-group` give the specs their handles. No test ids are added.

## Risks

- **Playwright resolving `.js` imports to `.ts` sources** (the repo's NodeNext style) when specs import from `src/`. Playwright's loader supports it. If it doesn't here, run it under tsx (`NODE_OPTIONS="--import tsx" playwright test`) and record the change in the script and this plan.
- **Case 5's tab B going fresh.** The page refetches on window `focus`. Playwright emulates focus per page without firing it on page switches, so B stays behind. If B does refresh, the 409 path is reached by sending from B in the same tick A sends. Recorded if it happens.
- **Run time.** A live conversation to the end is 23 replies. The page polls once a second while the agent works, so a reply can take up to about 1 s. Cases 3 and 6 may be 25 s each, and the suite about a minute. Measured at the gate. Past 90 s, the gate is told plainly.
- **Flakiness.** Only retrying assertions, no sleeps, one worker, no retries. A flake in the gate's three runs is reported with its trace.
- **Review files' size.** Measured at step 3, with a fallback format and a spec update if over 2.5 MB.
- **`npm test` time.** Recorded at step 3. Two ~1 MB parses replace sixty file reads, so it's expected equal or faster.
- **The browser download** is about 150 MB, into `~/Library/Caches/ms-playwright`, outside the repo.

## Verification

- `npm test`, `npm run typecheck` and lint by exit code, at every commit.
- Fresh clone: `git clone` of the branch into the scratchpad, `node_modules` symlinked, `npx vitest run` passes. At step 3, and again at step 12.
- `npm run app -- --fake` by hand after step 5: the eval-run list shows 30, `[down]` shows the notice, `[slow]` shows the waiting bubble for about 2 s, and `n/a` closes a row.
- `npm run test:e2e`: nine cases pass. Three timed runs at step 9, and one at step 12.
- The mutation pass: every break in spec §8's table fails at least one case.
- `git diff main -- src/screening src/criteria src/plain src/transport src/server data evals/graders evals/cases` is empty at step 12.
- No command in the slice was run with `--spend`, and `.env` is untouched.

## Records

- **Step 2.** Biome's config is `biome.jsonc`, not `biome.json`. The plan and spec were corrected.
- **Step 3.** Review files as two-space JSON: `02-2c46ada9a1d5.json` 1.77 MB, and `01-c5778afe9cbd.json` 1.51 MB. Both are under the 2.5 MB fallback, and 0.22 MB gzipped for the larger. Exporting again reports "unchanged".
  - A fresh clone of the branch, with no conversation cache: `npx vitest run` passes, 62 of 62 files, 893 passed and 7 expected fail (900).
  - `npm test` over three runs: 0.75–0.94 s, against the baseline's 0.73–1.13 s.
- **Step 5.** `[down]`, `[slow]` and `n/a` were tried against the running fake app's API on a spare port, with a scratch `--chats-dir`.
  - `[down] yes` gave status `unavailable` with `MODEL_UNAVAILABLE`.
  - A retry edited to `n/a` recorded L1 `chart-review` / `does-not-apply`.
  - `[slow] yes` then a second message gave 409 `working`, and the conversation was idle again after 2 s.
  - The file went to the scratch directory, not `chats/`.
- **Step 6.** `@playwright/test` 1.63.0. `npx playwright install chromium` fetched Chrome Headless Shell 153.0.8010.12 (94 MB).
  - Playwright resolved the specs' `.js` imports of `src/` and `scripts/` without tsx, so that risk didn't happen.
- **Step 7.**
  - The opening message carries the greeting and the first question in one bubble, so the question locator isn't anchored to the start of the text.
  - `e2e/lib/rows.ts` landed here rather than at step 8, because case 3 needs it. It reads row ids through locators, not `querySelectorAll`: the Node tsconfig has no DOM types.
  - The step was first committed with that type error, because the check command didn't stop on a failed typecheck. It was amended before anything else was committed. Every later commit went through a script that stops on any failed check.
  - Case 5's tab B stayed behind as expected: Playwright doesn't fire window `focus` on a page it isn't told to front.
- **Step 9.** `answer()`'s `toPass` had no timeout of its own, so a broken page would have waited out the 60 s test timeout. It got `{ timeout: 10_000 }` before the mutation pass, committed with the gate record.

- **After the PR opened** (the owner asked, 2026-09):
  - `npm run check` chains typecheck, lint and `npm test`, and stops at the first failure. It was proved to exit 0 on a clean tree, and non-zero, without running the tests, on a probe type error and a probe lint error.
  - CLAUDE.md makes it the gate for every commit, and records step 7's slip under "Things Claude gets wrong". It's the second exit-code miss, after 0006.
  - The roadmap gained an optional CI row.

## Gate record

Recorded 2026-09 at step 9. **Passed 2026-09: the owner said yes**, so stage D writes the rule into CLAUDE.md and REVIEW.md.

**1. Run time.** Six consecutive runs of `npm run test:e2e` all passed, 9 of 9, with no flake. Playwright reported 11.7, 12.3, 12.4, 12.6, 12.6 and 12.7 s, and the wall clock was 12.8–13.1 s including `vite build` and server start. That's well under the plan's estimate of about a minute: the scripted agent answers before the page's next poll, so a 23-reply conversation takes about 3 s. After the `toPass` bound, a seventh run passed in 12.6 s. `npm test` is unaffected, at 0.75–0.94 s.

**2. What a failure looks like.** M4 below, as the list reporter prints it:

```
  ✘  3 [chromium] › e2e/conversation.spec.ts:87:1 › case 4: the model being down is said, and an edited resend carries on
  1) [chromium] › e2e/conversation.spec.ts:87:1 › case 4: the model being down is said, and an edited resend carries on
    Error: expect(locator).toBeVisible() failed
    Locator: getByText('The model isn\'t responding. Check that oMLX is running (http://127.0.0.1:8000/health), then send again.')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found
      > 93 |   await expect(page.getByText(MODEL_UNAVAILABLE)).toBeVisible();
    Error Context: e2e/.out/results/conversation-case-4-the-mo-41ff1-an-edited-resend-carries-on-chromium/error-context.md
    attachment #2: trace (application/zip)
    e2e/.out/results/conversation-case-4-the-mo-41ff1-an-edited-resend-carries-on-chromium/trace.zip
    Usage:
        npx playwright show-trace e2e/.out/results/...trace.zip
```

The error context holds the page's accessibility snapshot at the moment of failure. That's how step 7's anchored-locator mistake was diagnosed in one read. The HTML report is in `e2e/.out/report/`.

**3. The mutation pass.** Each break was applied to one file, `npm run test:e2e` was run, and the file was restored with `git checkout -- <file>`. `git status --short src` was empty afterwards. Nothing was committed.

| Break | File | Change | Failed | Run |
| --- | --- | --- | --- | --- |
| M1 | `StartPage.tsx` | Eval-run list not rendered (`false && evalRun.length > 0`) | case 1, cases 8 and 9 (they open the review from that list) | 2.3 min |
| M2 | `TesterPanel.tsx` | "asked, awaiting reply" tag removed | cases 2, 6, 7 | 26 s |
| M3 | `ConversationView.tsx` | "Open the coordinator review" link not rendered | cases 3, 6 | 2.1 min |
| M4 | `ParticipantPane.tsx` | `composer.detail` not shown in the notice | case 4 | 17 s |
| M5a | `ParticipantPane.tsx` | Send button `disabled={false}` | case 5 | 15 s |
| M5b | `ParticipantPane.tsx` | Refusal notice not rendered | case 5 | 15 s |
| M6 | `ReviewPage.tsx` | "Why:" line removed from `Row` | cases 6, 9 | 24 s |
| M7 | `ReviewPage.tsx` | Each group's rows rendered reversed | cases 3, 8 | 14 s |
| M8 | `App.tsx` | Initial route ignores the hash | case 7, and case 5 (tab B opens the same URL) | 21 s |

Every break failed the case aimed at it, and none went uncaught. The two slow runs (M1, M3) are a missing link or button. The click waits out the 60 s test timeout rather than an assertion's 5 s. A failure takes a minute to report, but it's never silent.

**What this doesn't show.** The mutations are nine that I chose, aimed at what each case claims. They show each case bites on its own behaviour, not that the suite catches any page bug. Layout, styling, the parse-mode notes and local-model mode aren't covered, as spec §9 says.

**The decision for the owner.** Should stage D make `npm run test:e2e` a rule before any PR that touches the page's paths (spec §7.1, §7.2)? It costs about 13 seconds per run, plus a one-time 94 MB browser download per machine. If no, stages A–C land, and the rule waits.

## Review passes

Run 2026-09 at step 12, against `git diff main`, by Claude (the author). They aren't independent.

**Pass 1, plan compliance.**
- Every changed file is in "Files that change".
- **Nit:** the list left out `intent.md` and `spec.md`, and hedged `app-args.test.ts` as "possibly". Both fixed.
- The "not touched" directories are empty in `git diff main`: `src/screening`, `src/criteria`, `src/plain`, `src/transport`, `src/server`, `data`, `evals/graders`, `evals/cases` and `tests/web/review.test.ts`. The only change under `evals/` is the two new review files.
- Every divergence is in "Records": `biome.jsonc`, `rows.ts` landing at step 7, and the `toPass` bound. The one new dependency is `@playwright/test`, approved at D1. No unplanned refactors.

**Pass 2, correctness.**
- No Important findings.
- Second runs are covered: `review:export` reports "unchanged", and `test:e2e` empties its conversation directory every run and refuses a taken port.
- A scripted `[down]` leaves the session unchanged and the next reply proceeds, by test.
- **Nit, accepted:** `npm run app` now prints the absolute conversation directory where it printed `chats/`.
- **Nit, accepted, in the roadmap:** a missing link or button fails at the 60 s test timeout, not the 5 s assertion timeout.
- **Nit, accepted:** the scripted agent's `[slow]` test checks the response carries `delayMs: SLOW_MS`. That the delay is honoured is tested once, in `tests/models/fake.test.ts`.

**Pass 3, scope and data discipline.**
- No findings.
- The committed review files are the simulated conversations of two committed runs, from hand-authored vignettes, with nothing from the vignette, the simulated participant or the grades. A test checks `EVAL_ONLY_KEYS` against both files.
- The only URLs added are loopback (127.0.0.1:5005, :5015, :8000/health).
- No secrets. Every lockfile entry resolves from registry.npmjs.org.
- The browser test can't reach a model: `tests/boundary.test.ts` requires `--fake`, and no model or source flag, in its server command.
- No deployment surface. No determination code path changed.

**Pass 4, eval integrity.**
- No grader, threshold, vignette or committed run changed. `tests/web/review.test.ts` is untouched.
- The loader's three existing tests pass unchanged, now reading committed files.
- Its refusal tests moved to `exportReview`, where the refusals now live, with the same messages.
- **Nit, fixed:** the old loader test that proved a run is found by the versions it recorded had become implicit in the export tests. It's explicit again.

**Pass 5, documentation.**
- No findings.
- README: "Try it" lists `--chats-dir` and the scripted agent's replies, and a new "Checking the page" section has the measured 13 s, nine cases, the mutation result, and what isn't covered. The fresh-clone parse-mode limitation is in "Known limitations".
- CLAUDE.md and REVIEW.md carry the rule the gate approved.
- The roadmap marks 0010 done, moves the resolved items off the carried-forward table, and adds "Carried forward from 0010".

**Final proofs.**
- A fresh clone of the branch, with no conversation or parse cache: `npx vitest run` passes 63 of 63 files, 904 passed and 7 expected fail (911), and `npx playwright test` passes 9 of 9 in 12.7 s.
- In the working tree, `npm test`, typecheck and lint pass by exit code.
- No command was run with `--spend`, and `.env` is untouched.
