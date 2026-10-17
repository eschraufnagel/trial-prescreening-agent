# plan: 0013 trials by link

**Intent:** `work/0013-trials-by-link/intent.md` · **Spec:** `work/0013-trials-by-link/spec.md`
**Branch:** `0013-trials-by-link`, from `roadmap-pr-16` (PR #17, which places 0013 on the roadmap) at `e28bc2c`; intent and spec `06cd72a`. Rebased onto `main` once #17 merges.

---

## Context

The app serves only the five labelled lung cancer trials. The owner's aim is a screener for any oncology trial. This slice adds a Trials screen. A person pastes a ClinicalTrials.gov link or NCT ID, the server fetches and trims the study, the local model parses it, and the start page offers it, marked as not checked against labels.

The owner made three decisions in 2026-10. Any oncology trial is added from a screen in the app. One narrow runtime network exception is allowed, to `clinicaltrials.gov`. The slice is short, with one gate.

**Nothing here spends money.** Parsing is local (oMLX). Fake mode and every test stay offline. The only network calls are the app's own, to ClinicalTrials.gov, made at the gate by Claude and the owner. Nothing is passed `--spend`, `.env` isn't touched, and no dependency is added.

**Baseline**, from `npm run check` on `06cd72a`: 67 test files, 1002 passed and 8 expected fail (1010), in 0.73 s.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. Working end to end** | 1–6 | **Gate** | `npm run app -- --fake`: add the invented study on the Trials screen, watch it parse, screen against it, remove it. On the local model, real trials can be added |
| **B. Checked and written up** | 7–9 | PR | The browser test with a trials case, screenshots, README and docs, roadmap, review passes |

**Gate: are parses of trials the parser has never seen usable enough to offer behind a button? (intent, Gates)**

- **Before the gate**, with oMLX running, Claude adds two or three real oncology trials not in the corpus through the running app. For each it records the time taken, the counts of criteria, rejected and unclaimed, and any failure, in this plan's "Gate record". The owner may name the trials. Otherwise Claude picks recruiting oncology trials of different lengths, at least one of them a long block.
- **The owner** then adds one of their own choosing, or reuses one, and screens against it as a made-up participant. No clinical judgment is needed: the question is whether the agent's questions make sense.
- **It decides what stage B writes.** Either "add any oncology trial by link" with its stated limitation, or the feature documented as working only for short protocols, or the slice stopped short of the PR with the failures recorded.
- **What it costs to be wrong:** a README claim the app doesn't earn, or a limitation left unstated.
- **The answer can be no.** Real parses failing, through truncation or most criteria rejected, is a plausible outcome on long protocols.

Stage A needs no earlier gate. Everything in it is proved by deterministic tests and fake mode, and nothing in it spends.

### Steps

Each step is one commit, made through `npm run check && git commit`. No test mocks a module or stubs a global; fetch and the model are injected. No commit carries a Co-Authored-By trailer.

**Stage A: working end to end**

1. **Commit this plan** as `work/0013-trials-by-link/plan.md`.

2. **The registry call, its exception, and the rules that name it (spec §2, §3, §10).**
   - **`src/trials/reference.ts`**: `readTrialReference(input)`, as spec §2.
   - **`src/trials/registry.ts`**: `fetchStudy(nctId, fetchImpl = fetch)` and `REGISTRY_HOST = "clinicaltrials.gov"`.
     - It refuses a malformed ID before building a URL.
     - The URL is a template literal with the host written out, so the boundary test can see it.
     - It times out at 30 s, then calls `trimStudy`, and gives the three error messages in spec §3.
     - Not exported from `src/trials/index.ts`. Its comment points at the boundary test.
   - **`scripts/fetch-trials.ts`**: `getStudy` and its own `fetch` are removed in favour of `fetchStudy`. On a 404 it still adds its advice about `corpus.ts`. Header comment updated: the script is no longer the only file that does HTTP.
   - **`tests/boundary.test.ts`:**
     - `REGISTRY_FILE = ${sep}trials${sep}registry.ts`. `findNetworkUsage` allows `fetch()` there.
     - A new test: every file under `src/trials/` other than `registry.ts` uses no network, and `registry.ts`'s only host is `clinicaltrials.gov`.
     - "Would catch" cases: `fetch(` in `src/trials/load.ts`, and `https://example.com` in `registry.ts`, each flagged.
     - The "known offender" test reads `registry.ts`, through the same detector applied as though it were an unexempt path.
     - The header comment gains a section for the exception, beside 0005's and 0008's.
   - **Tests:**
     - `tests/trials/reference.test.ts`: the link forms in spec §2, lower case, none, two different IDs, and the same ID twice.
     - `tests/trials/registry.test.ts`, with an injected `fetchImpl` that records the URL and returns a `Response`:
       - the exact URL and headers;
       - the trimmed trial, from `tests/trials/fixtures/study-NCT00106626.json`;
       - a 404, a 500, a thrown network error, and an unreadable body;
       - a malformed ID that is never fetched.
     - `tests/trials/fetch-script.test.ts` still passes.
   - **CLAUDE.md:**
     - The runtime-network constraint gets one clause.
     - "four exceptions" becomes five, the fifth being `fetch()` to `clinicaltrials.gov` in `src/trials/registry.ts`, on Add or Refresh.
     - The `fetch:trials` description gets a sentence.
     - The browser-test trigger list gains `src/trials/registry.ts`.
   - **REVIEW.md**, Pass 3: the runtime-network bullet.
   - **`work/0000-product/intent.md`**: an "Amended in 0013 (2026-10, owner)" note under Constraints. The old "single condition" and "frozen trial corpus" lines are struck through, not deleted.
   - **`docs/running.md`**, line 75: the sentence saying the application never fetches is corrected here, so no commit leaves a false claim.

3. **Storage and the library (spec §4, §5, §6).**
   - **`src/screening/from-parse.ts`**: `fromParse` and `ParseInput` move here unchanged. `evals/screening-input.ts` re-exports them, so its callers and `tests/evals/screening-input.test.ts` are untouched.
   - **`src/server/trial-store.ts`**: `AddedTrialRecord` and `TrialStore`, with `list()`, `save(record)` and `remove(nctId)`.
     - It's modelled on `ConversationStore` (`src/server/store.ts`): the temporary file is renamed into place, an unreadable file is skipped, and the ID is checked by `^NCT\d{8}$` before any path is built.
     - `list()` turns a `fetching` or `parsing` record into `failed` with spec §4's restart message.
   - **`src/server/trials.ts`**: `TrialLibrary` and `TrialsOptions`, as spec §5.
     - Jobs run on one promise chain, so one runs at a time. `busy(nctId)` is true while a job is queued or running.
     - Each job is fetch, then `parsing`, then `parseCriteria`, then `ready` and serve. It saves the record at every transition, and a failure keeps the earlier parse served.
     - `rows()` gives `TrialRow[]`. `whenIdle()` returns the chain, for tests.
     - Parse errors are reported by message only. A `CriteriaParseError` already lists its problems.
   - **`src/server/conversations.ts`:**
     - `serve(study)` and `unserve(nctId)`.
     - `start()` uses `served.source ?? options.source`.
   - **`src/server/types.ts`**: `ServedStudy` gains `source?`, `origin?` and `conditions?`. A new `TrialRow` type.
   - **Tests:**
     - `tests/server/trial-store.test.ts`: the round trip, the restart conversion, a skipped corrupt file, and a refused ID.
     - `tests/server/trials.test.ts`, with an injected `fetchStudy` (a map of `Trial`s, or a thrower) and a `FakeModelAdapter` parser returning a canned envelope whose quotes appear in the trial text:
       - add through to ready and served, with `source: "parse"` and `origin: "added"`;
       - a duplicate, or a pinned trial, refused;
       - a fetch failure and a parse failure;
       - refresh with identical text, which makes no model call (the fake's request count shows it);
       - refresh with changed text, which reparses;
       - a failed refresh, which keeps the old parse served;
       - remove, and remove refused while busy;
       - a new library over the same directory, which serves what was ready;
       - jobs serialized, shown by the order the fake's calls arrive in.
     - `tests/server/conversations.test.ts`: a conversation started from a served study with `source: "parse"` records `parse`. A conversation continues after `unserve`.

4. **Routes (spec §6, §7).**
   - **`src/server/app.ts`**: `AppOptions.trials?`. It constructs the `TrialLibrary` when given and registers the four routes in spec §7. Each `:nctId` is checked against `^NCT\d{8}$`, with 404 otherwise. `/api/studies` items gain `source` and `origin`.
   - **`src/server/index.ts`**: exports the new types.
   - **`tests/server/app.test.ts`** (the one file that imports Fastify):
     - every status in spec §7's table, through `inject`;
     - a foreign `Origin` on POST and DELETE gets 403;
     - with no `trials` option, POST gives 404 and GET lists only pinned rows;
     - `/api/studies` carries `source` and `origin`.

5. **Fake mode and the launcher (spec §9).**
   - **`scripts/app/registry/NCT00000000.json`**: the invented study, in registry shape, with only the fields `trimStudy` reads.
   - **`scripts/app/fake-registry.ts`**: `fakeFetchStudy(nctId)` reads that directory and trims, and refuses any other ID with spec §9's message.
   - **`scripts/app/scripted-parser.ts`**: the responder in spec §9, with `delayMs: 1500`.
   - **`scripts/app.ts`:**
     - `--trials-dir <dir>`, parsed like `--chats-dir`, with `ADDED_TRIALS_DIR` (`added-trials/`) as the default.
     - It builds `trials` from the fake registry and a `FakeModelAdapter` running the scripted parser under `--fake`. Otherwise it uses `fetchStudy` and `createLocalAdapter(parseModelSpec("omlx"))` at the parser's default reasoning mode, as `npm run eval` parses.
     - It fills `conditions` for pinned studies from `getTrial`. The header comment and the startup lines name the Trials screen and the directory.
   - **`.gitignore`**: `added-trials/`. **`biome.jsonc`**: `"!added-trials"`.
   - **Tests:**
     - `tests/scripts/scripted-parser.test.ts`: `parseCriteria` over the fixture's trimmed trial with the scripted parser gives three inclusion and two exclusion criteria, all located, none rejected.
     - `tests/scripts/fake-registry.test.ts`: the known ID trims, and another is refused.
     - `tests/scripts/app-args.test.ts`: `--trials-dir` resolves, a missing value is refused, and the default is used.
   - **CLAUDE.md:** the `npm run app` row (`--trials-dir`, the Trials screen, fake mode's one study), and "Where things live" (`added-trials/`, gitignored).

6. **The page (spec §1, §8).**
   - `src/web/logic.ts`: the `trials` route.
   - `src/web/api.ts`: `TrialRow`, `listTrials`, `addTrial`, `refreshTrial` and `removeTrial`. Each fetches a relative path; a refusal's `error` text is surfaced as the thrown message.
   - `src/web/TrialsPage.tsx`: spec §1.2. It polls with `setInterval` while any row is fetching or parsing, cleared on unmount, and shows errors inline.
   - `src/web/StartPage.tsx`: the mark on an added study. `src/web/App.tsx`: the header link and the route. `src/web/styles.css`: only what the rows need, reusing `.list`, `.id`, `.dim` and `.button`.
   - `tests/web/logic.test.ts`: `#/trials`.
   - **By hand:**
     - `npm run app -- --fake --trials-dir <scratch>`: add `https://clinicaltrials.gov/study/NCT00000000`, see it parse and become ready, start it, refresh it, remove it, and confirm its conversation still opens.
     - Add `NCT99999999` and see the refusal, then add a pinned trial and see the refusal.
     - Restart the app mid-parse and see the row marked failed.
   - Each result is recorded in "Records".
   - **Then the gate.** Claude runs the real trials on oMLX (oMLX has to be running; the owner starts it if it isn't), writes the "Gate record", and **stops for the owner**.

**Stage B: checked and written up (after the gate)**

6b. **The gate's two changes (spec §1, §7).**
   - `TrialRow` gains `dropped: { rejected, unclaimed } | null`. The library fills it from the parse, and pinned rows have `null`.
   - `droppedWords` in `src/web/logic.ts` turns the counts into the row's line. The Trials screen shows it, styled as a warning. `tests/web/logic.test.ts` covers singular, plural and nothing left out.
   - The parsing words become "parsing on the local model (a minute or two, longer for a long protocol)".

7. **The browser test and screenshots.**
   - **`playwright.config.ts`**: the command empties `e2e/.out/trials` as well, and passes `--trials-dir e2e/.out/trials`. The boundary test's `runsScriptedAgentOnly` already allows it; a case in it shows that.
   - **`e2e/trials.spec.ts`**, case 10: spec §11's flow. Words come from `src/web/TrialsPage.tsx` constants and `scripts/app/fake-registry.ts`'s message, not copied text.
   - **Run** `npm run test:e2e`: all ten pass. Record the time against 0010's 13 s.
   - **Run** `npm run screenshots`. The header changed, so the images change. Look at all three and commit them.

8. **README, docs, roadmap**, worded by the gate's answer.
   - **README:** "What it does" gains a sentence on adding trials by link. "How to run" mentions the Trials screen. It stays short and reports no findings.
   - **`docs/running.md`:** a section on adding trials: forms accepted, where they're kept, timings, fake mode's one study, and the network exception.
   - **`docs/limitations.md`:** added trials are unmeasured, plus whatever the gate found.
   - **`work/ROADMAP.md`:**
     - the 0013 row marked done with its PR;
     - the section marked done;
     - "Where the project stands";
     - the "Decision 4" divergence from the roadmap's `src/server/` suggestion;
     - "Carried forward from 0013".

9. **Review passes (REVIEW.md), recorded here.**
   - All five passes, against `git diff main`.
   - `npm run check` and `npm run test:e2e` once more.
   - "Files that change" checked against `git diff --stat main`.
   - Then stop. The PR is opened on the owner's word, saying the e2e count and whether the gate was passed.

## Files that change

**New:**
- `src/trials/reference.ts`, `src/trials/registry.ts`
- `src/screening/from-parse.ts`
- `src/server/trial-store.ts`, `src/server/trials.ts`
- `src/web/TrialsPage.tsx`
- `scripts/app/fake-registry.ts`, `scripts/app/scripted-parser.ts`, `scripts/app/registry/NCT00000000.json`
- `tests/trials/reference.test.ts`, `tests/trials/registry.test.ts`
- `tests/server/trial-store.test.ts`, `tests/server/trials.test.ts`
- `tests/scripts/scripted-parser.test.ts`, `tests/scripts/fake-registry.test.ts`
- `e2e/trials.spec.ts`
- `tests/fixtures/added-trial.ts` (added at step 3)
- `work/0013-trials-by-link/plan.md` (intent and spec already committed), and `work/0013-trials-by-link/gate/` (added at step 9)

**Modified:**
- `scripts/fetch-trials.ts`, `scripts/app.ts`, `evals/screening-input.ts`
- `src/server/app.ts`, `conversations.ts`, `types.ts`, `index.ts`
- `src/web/api.ts`, `logic.ts`, `App.tsx`, `StartPage.tsx`, `styles.css`
- `tests/boundary.test.ts`, `tests/server/app.test.ts`, `tests/server/conversations.test.ts`, `tests/scripts/app-args.test.ts`, `tests/web/logic.test.ts`
- `playwright.config.ts`, `.gitignore`, `biome.jsonc`
- `docs/images/*.png`
- `CLAUDE.md`, `REVIEW.md`, `README.md`, `docs/running.md`, `docs/limitations.md`, `work/0000-product/intent.md`, `work/ROADMAP.md`

**Not touched, checked with `git diff main` at step 9:**
- the agent and parser behaviour: `src/screening/` apart from the moved `fromParse`, `src/criteria/` and `src/plain/`;
- `src/transport/` and `src/models/`;
- `src/web/review.ts` and `ReviewPage.tsx`;
- `data/`, `evals/cases`, `evals/graders` and `evals/results`.

## Reused, not rebuilt

- **Trimming:** `trimStudy` (`src/trials/trim.ts`). Fetching moves out of `scripts/fetch-trials.ts` into `registry.ts`, and the script keeps using it.
- **Parsing:** `parseCriteria` (`src/criteria/parse.ts`), with its truncation and empty-parse failures, which surface as a row's reason.
- **Serving a parse:** `fromParse`, moved, not rewritten.
- **The review's note:** `PARSE_NOTE` (`src/web/review.ts`) already marks a parse-sourced review. The tester panel's parse note does the same.
- **Atomic storage:** `ConversationStore`'s write-then-rename and ID-checked paths.
- **Server checks:** the Host and Origin guards in `registerGuards`, which cover the new routes unchanged.
- **The local model:** `createLocalAdapter` and `parseModelSpec`.
- **Fake mode:** `FakeModelAdapter`'s `delayMs`, and the scripted agent pattern in `scripts/app/scripted-agent.ts`.
- **Continuing after removal:** conversations restore from their own saved state (`ScreeningSession.fromState`), so removing a trial needs no conversation change.

## Risks

- **Long protocols on the local model.** Parsing slows on long blocks and can truncate (NCT00743379 needed 16,384 output tokens). A failure is a row's reason, never a partial parse. The gate measures it, and the docs say what it found.
- **A parse while a conversation runs.** Both use oMLX, so each slows. Documented, and not engineered around.
- **The registry's shape changing.** `trimStudy` already fails with every missing field named, which becomes the row's reason.
- **Polling cost.** At two seconds, while something is pending, against a loopback server, it's negligible.
- **A refresh racing a conversation start.** Serving replaces the study in one `Map.set`. A conversation started before keeps the criteria it was created with.
- **The fixture's ID.** `NCT00000000` looks real to a reader. Its title says it's invented, and fake mode's refusal names it.

## Verification

- `npm run check` at every commit: typecheck, lint and `npm test`, stopping at the first failure. `npm test` stays near a second.
- By hand in fake mode at step 6, as listed there.
- The gate, on the local model, recorded below.
- `npm run test:e2e`: ten cases pass at step 7 and again at step 9.
- `git diff main` on the "not touched" paths is empty at step 9, apart from the `fromParse` move.
- `grep -rn "fetch(" src` shows only `src/models/`, `src/trials/registry.ts` and the page's two relative clients.

## Records

- **Step 2.** The registry call takes `fetch` as a parameter named `fetch`, not `fetchImpl`. The boundary test's detector looks for `fetch(`, so a renamed call would have slipped past it. The first draft did exactly that, and the new test caught it. `registry.ts` isn't reachable from an `src/` entry point (the launcher passes `fetchStudy` in), so the new test reads every file under `src/trials/` rather than the module graph.
- **Step 4.** `pinnedRows` is exported from `src/server/trials.ts`, so `GET /api/trials` lists the served studies even when `trials` isn't configured. The route tests' fake parser waits 20 ms, so a request made straight after an add finds the trial busy.
- **Step 5.** The test fixture `tests/fixtures/added-trial.ts` (a made-up `NCT00000001` and a canned parse) isn't in "Files that change"; it serves steps 3 and 4.
- **Step 6.** The `.button.secondary` rule gained `button.secondary`, so the screen's Refresh and Remove are outlined like the start page's Continue. Tried by hand against `npm run app -- --fake --port 5025` with scratch `--chats-dir` and `--trials-dir`, through the API and two headless screenshots:
  - Adding `https://clinicaltrials.gov/study/NCT00000000` read `parsing`, then `ready` with 5 criteria about 1.5 s later. `/api/studies` listed it with `source: "parse"`, `origin: "added"`, and the start page showed "· parsed, not checked against labels".
  - A conversation started from it recorded source `parse` and asked about `P1`.
  - `NCT99999999` became a failed row with fake mode's reason. `NCT04316364` was refused as already listed. Two IDs in one box were refused inline.
  - Refresh came back 202 and returned to `ready`. Remove came back 204, the study left `/api/studies`, and its conversation still opened.
  - The app was killed 0.2 s into a parse (`parsing` on disk) and restarted: the row read "The app restarted before this finished. Refresh to try again." A refresh brought it back to `ready`.
- **Step 7.**
  - The screen's fixed words (`ADDED_NOTE`, `STATE_WORDS`, `PINNED_WORDS`) and the start page's `ADDED_MARK` moved into `src/web/logic.ts`, not left in the components, so the spec imports plain TypeScript, as the other specs do.
  - `npm run test:e2e`: 10 passed and 2 skipped (the screenshot specs), in 15.0–16.0 s over two runs, against 0010's 13 s.
  - One mutation, removing the start page's mark, failed case 10 at the mark's assertion.
  - **A slip, caught before commit:** the mutation was undone with `git checkout -- src/web/StartPage.tsx`. That also undid the file's uncommitted move of `ADDED_MARK`. It was redone, and `npm run check` and the browser test were rerun clean. A mutation should be applied to a committed file, or undone by reversing the edit.
  - `npm run screenshots` changed `tester.png` and `review.png` (the header's new Trials link) and left `transcript.png` alone. Both were looked at.
  - CLAUDE.md's `test:e2e` row now says ten cases and about 15 s.
- **After step 9, from the owner's first real add** (NCT06557512, ready with 16 criteria and nothing left out). The owner asked for an indicator that a trial is being processed, because grey "parsing…" text didn't read as activity.
  - A fetching or parsing row now shows a spinner and its running time in the accent colour ("parsing on the local model (…) · 42 s"), from a new `since` on `TrialRow` (the record's `updatedAt`) and `pendingWords` in `src/web/logic.ts`.
  - Refresh and Remove are hidden while a row is busy, not shown disabled.
  - **The owner's screenshot also showed fake mode's banner over a real server.** The tab had been opened against the fake one, and the page asked for its mode only once. `App.tsx` now asks again on every view change.
  - `npm run check`: 1057 passed and 8 expected fail. `npm run test:e2e`: 10 passed, unchanged. A headless screenshot of a parsing row was looked at.
  - **The polling Nit from Pass 2, fixed.** The owner's second screenshot showed a row stuck on "parsing" after the server had it ready. The cause was the owner's server still running the build from before the change, but it showed how fragile the old poll was, since it was chained off each successful answer. The screen now polls on an interval for as long as anything is busy, so one failed poll no longer freezes it. Check and browser test were rerun clean: 1057 passed, and 10 of 10 in the browser.
- **The built-in trials hidden unless asked (owner, 2026-10).** The owner asked why five trials couldn't be removed, then put it this way: someone cloning the repository wants to add their own trials, not the project's test trials. Of three options (separate them, hide them unless asked, or keep them and reword), the owner chose **hidden unless asked**.
  - `npm run app` now serves only added trials, and both pages say how to add one when there are none.
  - `--examples` brings back the five labelled trials and the 30 eval-run conversations, the second being Claude's call, since they're test material made from the same trials. `--fake` implies `--examples`. `--source` now requires `--examples`, since it only chooses how the examples are read.
  - `/api/info` gained `examples`. The header says "examples from labels" only when they're served. Pinned rows read "built-in example · used by the project's tests" in place of "measured set".
  - The browser test runs `--fake`, so it's unchanged: 10 passed. The screenshots were retaken for the header's wording. `npm run check`: 1058 passed and 8 expected fail.
  - README, `docs/running.md`, `docs/coordinator-review.md`, `docs/screening-agent.md` and CLAUDE.md now name the flag.

## Gate record

Recorded 2026-10, before the owner's part.

**Setup:**
- `npm run app -- --port 5026`, on the local model, with scratch `--trials-dir` and `--chats-dir`.
- The parser is `Qwen3.6-35B-A3B-MLX-8bit` on oMLX: 8bit, temperature 0, seed 20260921, at the runtime's default reasoning mode. This is the same identity `npm run eval` parses with.
- Each trial was added by its `https://clinicaltrials.gov/study/<ID>` link through `POST /api/trials`, which is what the Add button sends. A watcher polled `GET /api/trials` every 5 s.

**Results.** "Bullets" is a rough count of list items in the source. Each trial's record, exactly as the app saved it with its parse, is committed in `work/0013-trials-by-link/gate/` (added at step 9, so the counts `docs/limitations.md` quotes can be traced).

| Trial | What it is | Text | Bullets | Parse time | Criteria | Rejected | Unclaimed passages |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NCT05854498 | Metastatic colorectal, phase 2 | 1,058 chars | ~10 | about 30 s | 12 (6 patient, 6 clinical) | 0 | 0 |
| NCT06927180 | HER2+ breast, neoadjuvant, phase 2 | 2,858 chars | ~16 | about 40 s | 16 (6 patient, 10 clinical) | 0 | 0 |
| NCT06090266 | Melanoma and solid tumours, phase 1/2, cohorts | 10,848 chars | ~48 | about 2 min 10 s | 34 (10 patient, 23 clinical, 1 protocol) | 11 | 6 |

**What it shows:**

- **Short and mid-length protocols parse cleanly.** Every passage was claimed and nothing was rejected. NCT06927180's sixteen criteria read as one per source item, with sensible inclusion and exclusion and patient and clinical labels.
- **The long, nested protocol loses about a quarter of its criteria.**
  - The parser joined a heading to its sub-item, for example "Recent or ongoing serious infection including the following: Known active hepatitis C…". A quote like that isn't in the source verbatim, so the location check rejected each one. That's 11 criteria, including the HIV, hepatitis B and C and tuberculosis exclusions, and five cohort-specific exclusions.
  - Six passages went unclaimed, among them a cohort's prior-therapy requirement and the brain-metastases conditions.
  - The agent won't ask about any of these. The row says "34 criteria", and nothing on the screen or in the review says 11 were dropped. The review's parser note says only that criteria "may be missing".
- **Parsing took a fraction of the four minutes the screen says.** The parser was idle, and the corpus's slower times came from twelve studies in one batch.

**The decision for the owner,** after screening against one of these as a made-up participant:

1. **Is it good enough to offer behind the Add button?** Claude's recommendation is yes for short and mid-length protocols, with the long-protocol loss stated in `docs/limitations.md`.
2. **Should the loss be shown where it happens?** Claude recommends a line on the Trials row, for example "11 criteria couldn't be matched to the protocol text and were left out; 6 passages weren't read". It's display only, it uses counts the parse already has, and it adds about one step to stage B. Without it, a long protocol looks complete when it isn't.
3. **The screen's wording on timing** changes from "about four minutes" to "a minute or two, longer for a long protocol".

Neither 2 nor 3 changes the parser. Fixing the heading-joined quotes is parser work, for another slice.

**Passed 2026-10.** The owner answered yes to all three ("1 yes, 2 yes, 3 yes, go"). Whether the owner screened against an added trial before answering isn't recorded. Step 6b makes changes 2 and 3 before stage B.

## Review passes

Run 2026-10 at step 9, against `git diff roadmap-pr-16` (the slice's base, PR #17), by Claude (the author). They aren't independent.

**Pass 1, plan compliance.**
- Every changed file is in "Files that change". Two weren't at first: the test fixture `tests/fixtures/added-trial.ts` (step 3) and the gate records (below). Both are now listed.
- The "not touched" paths are empty in the diff, except the planned `fromParse` move into `src/screening/from-parse.ts`. That covers `src/criteria`, `src/plain`, `src/transport`, `src/models`, `src/web/review.ts`, `ReviewPage.tsx`, `data`, `evals/cases`, `evals/graders` and `evals/results`.
- Divergences are recorded:
  - the `fetch` parameter name (step 2);
  - `pinnedRows` (step 4);
  - the constants moved to `logic.ts` (step 7);
  - step 6b, from the gate.
- No dependency was added.

**Pass 2, correctness.**
- No Important findings. Second runs and restarts are covered by tests: a restart mid-job reads as failed, a new library serves what was ready, and a refresh with unchanged text makes no model call.
- **Nit, fixed after the review:** if `GET /api/trials` failed while something was pending, the screen stopped polling. It now polls on an interval (see Records).
- **Nit, accepted:** a stored record whose ID is now pinned is ignored at startup, and its file stays in `added-trials/`. Only reachable by adding a trial and then pinning it in `corpus.ts`.
- `npm run test:e2e` ran: 10 passed and 2 skipped (the screenshot specs), in 15.1 s.

**Pass 3, scope and data discipline.**
- **The one new network call** is `src/trials/registry.ts`, to `clinicaltrials.gov` only, on Add or Refresh. The boundary test pins it, and CLAUDE.md, REVIEW.md and the product intent say so. Fake mode and the browser test can't reach it: fake mode's registry is a file, and the browser test's server command is held to `--fake`.
- **No PHI.**
  - The fake study is invented.
  - Test trials are made up (`NCT00000001`).
  - The three gate records are trimmed registry data and local parses, with no site contacts (checked for phone numbers, emails and `@`).
  - `added-trials/` is gitignored.
- No secrets, no deployment surface, and no determination path. An added trial's review carries the existing parser note.
- **Finding, fixed:** `docs/limitations.md` quoted the gate's counts, but the parses behind them were only in a scratch directory, against CLAUDE.md's rule that numbers in `docs/` trace to something committed. The three records are now in `work/0013-trials-by-link/gate/`, excluded from Biome because they're verbatim, and linked from the doc and the gate record.

**Pass 4, eval integrity.**
- No grader, threshold, vignette, label or committed result changed.
- One existing expectation changed: "list the served studies" in `tests/server/app.test.ts` gained `source` and `origin`, which the route now returns. It's an addition to the API, not a loosening.
- A mutation (the start page's mark removed) failed case 10 (step 7).
- The gate run's model, quantization, temperature and seed are in the gate record.

**Pass 5, documentation.**
- The README stays short. It says what adding a trial does and that the app goes online only to fetch one, and it reports no findings.
- `docs/running.md` has "Adding a trial" and the ten browser cases. `docs/limitations.md` has the unmeasured and long-protocol limits, with the gate's numbers and where they come from.
- The roadmap marks 0013 done (PR #18), and adds "Carried forward from 0013". That includes the boundary detector's `fetch(` gap that step 2 hit.

**Final proofs:** `npm run check` exits 0 with 1056 passed and 8 expected fail (1064). `npm run test:e2e` gives 10 passed, 2 skipped. No command used `--spend`, and `.env` is untouched.

