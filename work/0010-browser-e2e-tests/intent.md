# intent: 0010 browser end-to-end tests

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. A browser test of the page and the coordinator review, `npm run test:e2e`, against `npm run app -- --fake`, never in `npm test`. The review's data committed, so the page and `npm test` work from a fresh clone. CLAUDE.md and REVIEW.md changed so a page change is checked in a browser before its PR. No model, local or frontier. No change to the agent, the grader or the review's rules.

---

## Problem

**Nothing has ever driven the page in a browser.** `tests/web/` tests the page's decisions as plain functions in Node (`src/web/logic.ts`, `src/web/review.ts`), and `tests/server/` tests the routes with `app.inject`. Nothing checks that the components lay those decisions out, that the page's two API clients talk to the server they are served by, or that a click does what a function test says it would. 0001's plan deferred "Playwright or similar" to the first slice with a UI. 0005 and 0007 both built UI and neither took it up. 0007's blind reading drove Chrome by hand through an agent, which is a reading, not a test. 0009 changed the page's words and checked them in Node only.

**`npm test` fails from a fresh clone.** I checked rather than take the roadmap's word: a `git clone` of main with no conversation cache fails 5 of 61 test files. `tests/web/review.test.ts`, `tests/scripts/review-sheet.test.ts` and `tests/scripts/review-score.test.ts` fail at collection. Four tests fail in `tests/scripts/app-eval-run.test.ts` and `tests/server/app.test.ts`. All of them reach `loadEvalRun`, which opens 30 conversation files per run from `evals/results/screening/conversations/`, and `.gitignore` excludes that directory. Two runs are read: `EVAL_RUN` (0009's, served by the page) and `READING_RUN` (0004's, which 0007's reading is scored against). The page starts without them, but with nothing to review.

**Three states the roadmap wants covered can't be reached in fake mode today.**

- **Model down.** The scripted agent always answers. The server reports "unavailable" only for a `ModelError` whose problem starts "request failed" (`isConnectionFailure`).
- **The agent working.** The scripted agent answers in milliseconds. The page disables sending while the agent works, and the server refuses a second message with a 409 that the page turns into "The agent is still working on your last message. Your draft is kept." A browser test can't catch either while the state lasts a frame.
- **Does not apply.** The scripted agent reads the first word as holds, does-not-hold, unknown or unclear. It never produces 0009's `does-not-apply` reading. 0009's committed run does, in 17 rows, one of them a clinical row reported that way.

**Fake mode shares `chats/` with the owner.** `npm run app` saves every conversation to `chats/` and the start page lists them. A test run would add conversations to their list, and start from whatever is already there.

## Proposed outcome

- **`npm run test:e2e`**, which builds the page, starts it with the scripted agent on its own port and an empty conversation directory, and drives it in Chromium through the cases in decision 3. Deterministic, no model, about half a minute.
- **The review's data in the repository.** One committed file per run the repository serves or scores, holding what the review reads and nothing else. `loadEvalRun` reads it. `npm test` passes from a fresh clone.
- **Fake mode able to reach every state the page has:** model down, agent working, and a row closed as doesn't-apply.
- **The loop written down.** CLAUDE.md's table and PR checklist name `test:e2e` and when it runs. REVIEW.md asks whether it ran.

## Absent on purpose

- **No model.** `test:e2e` runs the scripted agent only. Local-model mode is still tried by a person with `npm run app`.
- **No change to what the agent does.** `src/screening/` is untouched, and so are the prompt version, the grader, the vignettes and every committed run's numbers.
- **No change to the review's rules.** 0007's boundary stays in `tests/web/review.test.ts`. The browser test adds that the rendered rows keep protocol order, and nothing about combining or colouring, which the flip test already owns.
- **No visual regression.** No screenshot comparison, no pixel diffs. They break on a font update and tell nobody what went wrong.
- **One browser.** Chromium. No Firefox or WebKit: one person, one machine, one browser.
- **No parse mode.** `npm run app -- --source parse` from a fresh clone serves nothing, because the parse cache (`evals/results/parses/`, 5 files, 128 KB) is gitignored too. 0011 makes new parses, so it decides whether they are committed. Recorded in the roadmap, not fixed here.
- **Not in CI.** There is none, and the product intent rules out a hosting surface. Nothing changes that.
- **No `statement` or `withheld` in the review.** That's a later review slice (0009's carried-forward list). Showing it would change what this slice's tests assert.

## Affected users and systems

**The owner, and any agent working on the page.** A page change gets a check that runs the page. The PR says whether it ran.

**The coordinator review and the participant pane.** Unchanged in behaviour. At most, an accessible name where a locator can't find an element by its role and text (decision 3).

**`scripts/app.ts`.** A flag for the conversation directory.

**`scripts/app/scripted-agent.ts`.** Three replies it reads specially (decision 2).

**`src/models/fake.ts`.** Possibly a delay on a scripted response (decision 2).

**`scripts/app/eval-run.ts`.** Reads the committed review file instead of the cache.

**`evals/results/screening/review/`.** New: the committed review files.

**`e2e/`.** New: the browser specs and Playwright's config.

**`package.json`, `package-lock.json`, `.gitignore`, `tsconfig.json`.** The dependency, the script, Playwright's output directories, and type-checking for `e2e/`.

**CLAUDE.md, REVIEW.md, README, roadmap.**

**Not touched:** `src/screening/`, `src/criteria/`, `src/plain/`, `src/transport/`, `evals/graders/`, the vignettes, labels, `data/`.

## Constraints

- **`npm test` stays deterministic and near a second.** The browser never runs inside it. Loading the review from a committed file must not make it slower than loading from the cache does now (about 0.8 s for 892 tests).
- **No model call from `test:e2e`**, asserted by a test rather than trusted (decision 2).
- **No network at runtime.** The browser talks to 127.0.0.1 only. Downloading the browser is an install step, run once by a person, like `npm install`.
- **The boundaries hold.** `tests/boundary.test.ts` passes. If the fake adapter changes, the change stays inside `src/models/`.
- **The review stays blind.** A committed review file carries nothing from a vignette, a simulated participant or a grade. `EVAL_ONLY_KEYS` is checked against the file itself.
- **Fix the code, not the test.** It applies to browser specs as much as to `tests/`.

## Decisions

1. **The tool: `@playwright/test`, not `@vitest/browser-playwright`.** Vitest's browser mode runs test files inside a page that Vite serves, to render components. What needs testing here is the whole thing: the built page, served by Fastify, talking to the scripted agent, across navigation, a reload and a second tab. Playwright's runner does that directly. It starts and stops the app (`webServer`), waits for the URL, opens a second tab on the same conversation, and keeps a trace of a failure to open afterwards.
   - **Cost:** one exact-pinned devDependency, `@playwright/test` (1.63.0 today), which brings `playwright` and `playwright-core`. The vitest route needs `playwright` too, plus `@vitest/browser` and `@vitest/mocker`. It would also put browser tests beside `npm test`'s config, where `isolate: false` forbids module mocks.
   - **The browser:** `npx playwright install chromium`, run once by a person, into Playwright's cache outside the repository. It's not a postinstall script, and `allowScripts` stays as it is. Using the installed Google Chrome (`channel: "chrome"`) would skip the download, but Chrome updates itself and would change under the tests. The pinned download doesn't.

2. **Where it runs: `npm run test:e2e`, against `npm run app -- --fake`, never in `npm test`.** With four things the roadmap's line needs to work:
   - **Its own port and its own conversation directory.** `scripts/app.ts` gains `--chats-dir <dir>`. Playwright's `webServer` runs `npm run app -- --fake --port 5015 --chats-dir <fresh temp dir>`, never reusing a running server. That way a test never sees the owner's `chats/` or collides with an app they have open on 5005.
   - **Specs outside `tests/`**, in a top-level `e2e/` as `*.spec.ts`. They fall outside Vitest's `tests/**/*.test.ts`, and "`tests/` is what `npm test` runs" stays true. One worker, no retries: a flaky browser test is a bug to fix, not to retry.
   - **No model, asserted.** A test in `tests/` reads Playwright's config and fails unless the server command carries `--fake`.
   - **Fake mode reaches every state**, through replies the scripted agent reads specially, as it already reads the first word. `[down]` answers as an unreachable model would (an error starting "request failed", which the server already reports as unavailable). `[slow]` holds the answer for about two seconds. `n/a` reads as does-not-apply. Brackets keep the first two from being typed by accident. The scripted agent's comment and the README's app section list them. `[slow]` needs a delay the fake adapter doesn't have: `ScriptedResponse` resolves at once and the responder is synchronous. I recommend an optional `delayMs` on a scripted response in `src/models/fake.ts`, tested in `tests/models/fake.test.ts`. A wrapping adapter in `scripts/app/` is the alternative, but it has to get past the boundary test's rule on adapters in `scripts/`.

3. **What it covers.** The roadmap's list, and three cases it doesn't mention:
   - **The start page:** the five labelled studies, the 30 eval-run conversations, and the scripted-agent banner.
   - **A fake conversation:** start one, answer, and see the tester panel update: the row answered, and "asked, awaiting reply" moving on.
   - **Finish it and open its review:** header note, scripted note, and rows in protocol order.
   - **An eval-run conversation in the review:** the eval-run note, and rows in protocol order.
   - **Model down:** `[down]` shows the unavailable notice, the message is marked not processed and comes back into the box, and an edited resend carries on.
   - **A second message while the agent works:** `[slow]` shows the waiting bubble with the button disabled, and a draft typed meanwhile is kept. The server's refusal is reached from a second tab on the same conversation, whose view is behind. That tab shows "still working", and its draft is kept.
   - **0009's words:** `n/a` in a live conversation closes the row as "said it doesn't apply to them". The eval run's clinical row reported that way reads "Participant said it doesn't apply to them. Needs the record".
   - **Added: a reload mid-conversation** comes back where it was. Resumable conversations are a product-intent requirement, and restoring them has only been tested in Node.

   Locators by role and visible text, as a person finds things. No test ids added to the page unless the spec finds an element with no other handle.

4. **The gitignored cache: commit a derived review file per run, not the conversations and not a smaller fixture.** `evals/results/screening/review/<run file>` holds, for each conversation, what `loadEvalRun` passes on today: id, source, criteria and result. Renderings are still rebuilt from `data/plain/`. That's about 1.2 MB for 0009's run and 1.0 MB for 0004's, as compact JSON. Git compresses it well.
   - **Written by a deterministic command from the cache**, which does today's checks at export time: every file present, finished, and made with the prompt its run records.
   - **Read by `loadEvalRun`**, which no longer opens `conversations/`.
   - **Kept up by a test.** A run that becomes `EVAL_RUN` or `READING_RUN` commits its review file in the same commit, and a test fails if either names a run without one.
   - **The alternatives:**
     - Committing the 60 conversation files is 5.8 MB, and carries the simulator's memory and the vignette the review is blind to.
     - A small hand-picked fixture would weaken the flip test, whose force comes from covering every settled finding of a real run. It would also change what the page offers to review.
     - Regenerating needs about 12 hours of model time.
     - Skipping tests when the cache is missing hides exactly this failure.
   - **Proof:** `npm test` from a fresh `git clone` passes. Today it fails 5 files.

5. **The loop, written down.**
   - **CLAUDE.md:**
     - `npm run test:e2e` and the one-time `npx playwright install chromium` go in "Verifying your work".
     - The PR checklist becomes: `npm test`, typecheck and lint always. Also `npm run test:e2e` when a change touches `src/web/`, `src/server/`, `src/transport/`, `scripts/app.ts`, `scripts/app/`, `vite.config.ts`, `tsconfig.web.json`, `EVAL_RUN`, `READING_RUN` or `evals/results/screening/review/`. The PR says it ran and how many passed. That's the roadmap's list widened to everything on the page's path. The transport's web client is part of the page's build, and the scripted agent and the review data are what the page shows.
     - "`tests/` and `evals/` are different things" gains `e2e/`: deterministic, but slow, needs a browser, and runs on demand.
     - "Where things live" gains `e2e/` and the review files.
     - One line: nothing under `tests/` reads a gitignored file.
   - **REVIEW.md:**
     - Pass 2 asks whether a change to those paths ran `test:e2e`, and whether it passed. A page change with no browser run, or a failing one, is Important.
     - Pass 4 holds browser specs to the rule for tests: a spec edited in the change it was meant to catch is Important.

## Gates, proposed for the plan to argue with

- **Before the loop is written into CLAUDE.md and REVIEW.md: is this check worth what every later UI change pays for it?** You see the run time, what a failure looks like (its report and trace), and a mutation pass. For each case in decision 3, I break the page on purpose and show the spec failing: the doesn't-apply words dropped, the button left enabled while the agent works, review rows reversed, and a reload that starts over. What it costs to be wrong: a rule every later slice obeys for a check that catches nothing, or one too slow or flaky for anyone to run. I can do the mutation pass. Whether the cost is worth inheriting is your call. This gate can say no, and then the specs stay but the rule waits.

No other gate. The cache decision is made at this intent, and its proof is a test.

## Open questions for the spec

1. The review file's exact shape and name, the export command's name, and whether the screening runner writes it at the end of a run so it can't be forgotten.
2. Whether `READING_RUN`'s file is trimmed to what `review:sheet` and `review:score` read, or kept whole.
3. The fake delay: `delayMs` in `src/models/fake.ts`, or a wrapper that passes the boundary test.
4. Which labelled study the live conversation uses (the one with the fewest patient criteria keeps the run short), and which eval-run conversation carries the clinical doesn't-apply row.
5. How a spec waits: on visible text, never on a fixed sleep.
6. Where Playwright's output goes (`test-results/`, `playwright-report/`, both gitignored), and whether a failure's trace is ever committed. I'd say never.
7. What the README says about the check, and the run time it reports.
