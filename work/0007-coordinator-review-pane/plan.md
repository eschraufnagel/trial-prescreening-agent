# plan: 0007 coordinator review pane

**Intent:** `work/0007-coordinator-review-pane/intent.md` · **Spec:** `work/0007-coordinator-review-pane/spec.md`
**Branch:** `0007-coordinator-review-pane` (from `main` at `a36b30d`; intent `266f4ee`, spec `c32c099`)

---

## Context

The product intent names the coordinator as the decision-maker, and six slices in there's nothing for them to read. A finished conversation's `ScreeningResult` is held by the service (`result(id)`) and saved in `chats/`, but no route returns it. The tester panel is deliberately not the pane. This slice adds a route and a review view that lay a finished screening out for a coordinator: grouped by what they do next, polarity said per criterion in words, the words behind each finding shown in place, and never combined into a verdict. It also answers product open question 1 (augmentation or replacement) as far as a blinded reading can support.

**What's scarce is blind reading material, not model time.** Nothing in this slice calls a model. The 30 committed conversations of 0004's eval run (`evals/results/screening/01-c5778afe9cbd.json`) are the pane's real data from the first stage onward. Once a reader has seen one, it can't be read blind again. So the slice puts the pane in front of the owner first, on conversations that are already spent (a fake one, and the two v2 examples they saw at 0004's Gate 2). Tests get built around the shape they accept. The blind reading happens only then.

`src/screening/`, `src/plain/`, `src/criteria/`, `src/models/`, `data/`, the labels, the vignettes and every committed result are not touched. `PROMPT_VERSION` stays `c5778afe9cbd`.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. The pane, on spent conversations** | 1–4 | **Gate 1** | `npm run app -- --fake`: finished conversations and the 30 eval-run conversations listed. Each opens at `#/review/<id>` |
| **B. Where the pane stops, as tests** | 5–8 | (no gate) | The flip, wording, no-decision, blindness and boundary tests pass. `review:sheet` and `review:score` exist |
| **C. The blind reading** | 9 | **Gate 2** | `reading.md` committed blank, filled by the reader, scored |
| **D. Findings, documentation, PR** | 10–12 | PR | README "The coordinator review" section, with the answer to open question 1 |

**Gate 1: the pane's shape and wording (spec §11.1).**
The owner runs `npm run app -- --fake` and opens the review for three conversations and **no others**: one finished fake-mode conversation, `eval NCT00077350-v2-labels` and `eval NCT04316364-v2-labels`. Opening any other eval-run conversation spends blind material. They decide:
1. From a row alone, can you tell whether the participant's words support its finding, without scrolling to the transcript?
2. Does "Does not apply, by the participant's account" read as being about the criterion, or about the person?
3. Are the four groups right, in the right order, with the right one-line *what to do*?
4. Is the reading question (spec §9.3) answerable on this layout, and about how long did one conversation take?
5. Does anything in the layout rank, colour or promote rows by how they went?

None of these are clinical. **The owner can delegate this gate.** It's about layout and wording, and Claude reading it costs no blind material. If they do, the PR says so.

**Passed 2026-09, on Claude's recommendation: the owner delegated the gate ("Ok, go").** The PR says so. Claude looked at the fake conversation `NCT04316364-20260923T222104` and at `eval NCT04316364-v2-labels`, and at no other eval-run conversation. Decided: (1) rows can be judged on their own, and L8's settling reply, given to a question about another criterion, appears in its row with that question; (2) "Pregnant" as *Exclusion* with *Does not apply, by the participant's account* reads as being about the criterion, which settles 0006's "are excluded" finding without a verdict line; (3) the four groups and their order stay, and *Needs chart review* is the largest in both (15 of 24); (4) the reading question is answerable on this layout, and time per conversation is first measured at Gate 2; (5) nothing is coloured or ordered by outcome. One fix came from looking, the app banner (change table). Left as is: the transcript's "Shown with" line under most turns is noisy, but it changes no test.

*Why it guards Stages B and C:* Stage B's flip and model tests are written against `ReviewModel`'s shape. Stage C's reading can't be redone with the same reader and conversations. A layout change after the reading means a second reading on the three unseen v2 conversations, the only reserve (spec §9.5). The gate can come back no. If question 1's answer is "mostly not", the exchange design (spec §6.4) changes and Gate 1 is repeated on the same three conversations before anything else is built.

**Gate 2: the blind reading (spec §9, §11.2).**
The reader fills `work/0007-coordinator-review-pane/reading.md`: ten conversations (v1 and v3 of each labelled study, in a fixed shuffled order), one yes / no / can't-tell per settled or reported row, clock times per conversation. `npm run review:score` then prints caught, false alarms, can't tell, ungraded no's, reported disagreements and minutes per conversation. The decision is spec §9.5's: report as it stands, or, only if the notes show the pane failed to show something it could have, change the pane and read the three unseen v2 conversations.

**Do not delegate this gate.** Claude wrote the vignettes and knows every expected outcome, so a reading by Claude measures nothing. A reader new to the project is best. If the owner reads, the README says they knew 0004's four kinds of error. Either way the reader doesn't open `evals/`, the vignettes or 0004's results until done, and the README says whether that held.

**Reader chosen 2026-09:** someone new to the project, arranged by the owner. The sheet `reading.md` was committed blank at `8d7e805`. The slice waits here until it comes back.

**Read 2026-09, delegated and not independent.** The owner was the only human reader available and chose not to spend the time ("Rather delegate this to an unbiased agent"). The reader was a fresh Claude subagent. It was given only `reading.md` and the ten review links, opened in Chrome against `npm run app -- --fake`. It never saw the session that wrote the vignettes and was told not to open any other repo file, the API or other conversations. It reports it kept to that. Its end-of-sheet note says it ran only `date`. Its report also mentions a scratchpad script that wrote the answers into the sheet and a grep of the sheet. Neither is a blinding breach. The sheet is committed as it left it (`081d320`). This is not the reading the gate asked for. It is the same kind of model that ran the screening and wrote the vignettes, so its misses may be correlated with theirs. It is not a coordinator, and its minutes say nothing about a person's time. The README and PR say so. `review:score`:

```
10 conversations read.
Known wrong findings (caught = no): 15 rows. no 10 (2 of them found in the transcript), yes 5, can't tell 0
Graded correct findings (false alarm = no): 91 rows. no 1 (0 of them found in the transcript), yes 90, can't tell 0
Ungraded rows answered no: 0
Minutes per conversation: median 0, range 0–1
```

**Step 10 decided 2026-09 by the owner, on Claude's recommendation: report as it stands, with no second reading.** The five misses were checked against the committed results after the reading. In every one, the words that show the error are in the row itself, so the page showed what it could. Under spec §9.5 that means no pane change and no second reading. The misses are two half-hearted agreements the vignettes expected to stay open (NCT03433469-v3 L22, "I suppose so, if they need me to"; NCT06728852-v1 L16, "I guess I would go along with…, probably"), and two the vignettes left to the coordinator's judgment (NCT06728852-v1 L38, "I could quit if I had to"; NCT00077350-v3 L35, a brother with G6PD deficiency and "never been tested myself"). The reader read all four literally and never answered "can't tell". The fifth, NCT03433469-v1 L63, is a miss only against the grade: the transcript has one antibiotics exchange (turns 59–60), where the participant says they took antibiotics last week, and the denial the vignette scripted before it was never said. Against the reading question, the catch rate is 10 of 14. The one false alarm, NCT04385368-v3 L60, is the reader's error: "not … right now" read as if past chemotherapy were current. The three unseen v2 conversations stay unread, as blind material for a human reader later.

*Why it guards Stage D:* the README's answer to open question 1 rests on this number. The gate can come back "the pane doesn't support augmentation either", and the README then says so.

### Steps

Each step is one commit. `npm test`, `npm run typecheck` and `npm run lint` pass at every commit, and lint is read by its exit code (`npx biome check . >/dev/null; echo $?`), not its last line.

**Stage A: the pane, on spent conversations**

1. **Commit this plan, reconcile the spec with the repository, and record the baseline.**
   - Baseline: 670 tests. Record Vitest's duration over three runs.
   - Spec §5.1: the launcher finds each file with `conversationKey(vignetteId, source, descriptor)` from `evals/screening-runner.ts:453`. The descriptor is built from the run file's `model`, `seed` and `thinking`, and `PROMPT_VERSION` and `SIMULATOR_VERSION` are the current constants. If either changes, the files are not found and the launcher says so, which is the visible change the spec wants. Not a glob over the directory, because that would pick up the `dev` files (two of them hold results).
   - Spec §7: the existing `readsCriterionText` rule scans only `.tsx` files (`tests/boundary.test.ts:597`). §8.2's widening to `src/web/*.ts` is done in step 7.
   - Spec §6.4: `locateEvidence` is imported from `src/screening/evidence.ts` directly (it has no imports and isn't exported from `src/screening/index.ts`). The page's tsconfig already reaches `src/screening/`.

2. **The route, the service, and the eval run's conversations.**
   - `src/server/types.ts`: `ConversationReview` and `FinishedConversation` (spec §4, §5.2).
   - `src/server/conversations.ts`:
     - `ConversationServiceOptions.finished?`, held in a `#finished` map: never on the transport, never saved;
     - `review(id)` returns `{ kind: "ok", review } | { kind: "unknown" } | { kind: "not-finished" } | { kind: "no-result" }`, with `plain` chosen as `inspect` chooses it (factor the existing expression into a private `#plainFor(live)`);
     - `list()` appends finished ones after live ones. `ConversationSummary` gains `origin: "conversation" | "eval-run"`;
     - `inspect`, `state` and `result` stay live-only.
   - `src/server/app.ts`: `GET /api/conversations/:id/review` mapping to 404 / 409 `not-finished` / 409 `no-result` / 200. `AppOptions` and `startServer` pass `finished` through.
   - `scripts/app.ts`: `EVAL_RUN = "01-c5778afe9cbd.json"` and `loadEvalRun()`, which reads the run file's `conversations` and returns `FinishedConversation[]`: id `eval <vignetteId>-<source>`, `state.criteria`, `result`, and `displayFor(criteria, loadPlainFile(nctId))` for labels (`{}` for parses). Nothing else from the file is passed on. It loads in every mode and source. The startup line reports "30 eval-run conversations to review". A missing file stops the launcher with the path and the reason, and doesn't skip silently.
   - Tests, not shape-dependent, so written now:
     - `tests/server/store.test.ts` (where service-with-store tests already live, per 0006's change table): `review` for each outcome; a finished conversation is served by `review`, absent from `inspect`/`state`, listed with `origin: "eval-run"`, and not written to `chats/`; a `chats/` file that is `done` without `result` gives `no-result`;
     - `tests/server/app.test.ts`: the route's status codes, and `/review` added to the existing all-routes verdict test (line 333);
     - `tests/scripts/app-eval-run.test.ts`: `loadEvalRun()` finds exactly 30 files, 15 per source, and its output's keys hold none of spec §8.3's eval-only fields.

3. **`reviewModel` and the `CriterionText` audience.**
   - `src/web/review.ts`, pure and without React:
     - `groupOf(status)`;
     - `findingWords(criterion, finding)` (spec §6.3 table);
     - `reasonWords(reason)`;
     - `exchangesFor(criterionId, result)` (spec §6.4 rules 1 and 2, marks via `locateEvidence`);
     - `readingLines(criterionId, result)`;
     - `segments(text, marks)`;
     - `reviewModel(review): ReviewModel`, with the frame built inside it.
   - `src/web/logic.ts`: `plainView(plain, audience = "tester")`, with coordinator lines per spec §7. `routeFrom` gains `{ page: "review"; id }` for `#/review/<encoded id>` and accepts `%20`.
   - `src/web/CriterionText.tsx`: `audience` prop, passed to `plainView`.
   - Tests, only what the existing suite needs: `tests/web/logic.test.ts` for `plainView`'s coordinator states and `routeFrom` with a review id. The tester's states are unchanged, and their existing assertions must pass untouched.

4. **The page.**
   - `src/web/api.ts`: `getReview(id)`, a relative-path `fetch`, returning the review or the 404/409 error kind.
   - `src/web/ReviewPage.tsx`: lays out `reviewModel`. Header notes, then four groups with heading, *what to do* and count (empty groups shown with 0), rows (id, *Inclusion*/*Exclusion*, `<CriterionText audience="coordinator">`, `finding`, `reason`, exchanges with marks as `<mark>`, reading lines, turn links), then the transcript with anchors, then the footer. `className`s come from group keys and fixed strings only. A 409 shows spec §4's message and a link to `#/c/<id>`.
   - `src/web/App.tsx`: the review route. `StartPage.tsx`: a *Review* link on finished conversations, and a separate *From the eval run (simulated participants, read-only)* list. `ConversationView.tsx`: *Open the coordinator review* when `done`. `TesterPanel.tsx` is unchanged.
   - `src/web/styles.css`: the review layout, a single column with the transcript below. Nothing keyed to finding or polarity.
   - *See:* `npm run app -- --fake`. Finish a fake conversation (answer "yes", "no" and "not sure" across its questions), then open its review and the two spent v2 conversations.

→ **Gate 1.** If it changes wording, groups or exchanges, that's its own commit, recorded in the change table, and Gate 1's three conversations are looked at again.

**Stage B: where the pane stops, as tests**

5. **The model's behaviour (spec §8.4).** `tests/web/review.test.ts`, with a hand-built `ConversationReview` covering every status, reason, polarity and reported value:
   - group membership and protocol order within groups, including empty groups present with count 0;
   - the §6.3 wording table, cell by cell;
   - exchanges: a question without a reply, a cited reply outside any question about this criterion, no duplicates;
   - marks located with `locateEvidence`;
   - rejected and ignored reading lines;
   - each §6.6 note present exactly when its condition holds.

   Over the 30 committed conversations: every exchange turn exists in the transcript, and every evidence quote has a mark. The committed files are read through the same `loadEvalRun` as the launcher, once per file.

6. **Where the pane stops (spec §8.1).** In `tests/web/review.test.ts`:
   - **The flip test.** Over the hand-built review and all 30 committed ones: flip `holds` ↔ `does-not-hold` in findings, in `reported`, and in evidence readings. `frame` and `transcript` must be deep-equal. Each row must be deep-equal after deleting `finding` and the `reading` of each mark. A proof that it fires: a local variant of `reviewModel` that sorts settled rows with exclusions that apply first fails it.
   - **The wording test.** A walk of `frame`, `finding`, `reason` and `readings`, skipping `criterion`, `plain`, `exchanges` and `transcript`: nothing matches `/eligib|verdict|disposition|qualif|score|total/i`. A proof that it fires: a frame note "Likely eligible".
   - **No decision field.** `ConversationReview`'s and `ReviewModel`'s keys, walked over a real review, contain none of `/eligib|verdict|disposition|qualif|decision|determin/i`. `tests/server/app.test.ts`: `POST`, `PUT` and `PATCH` on `/review` are 404.

7. **Boundaries (spec §8.2).** `tests/boundary.test.ts`:
   - `readsCriterionText` runs over every `src/web/*.ts{,x}` except `CriterionText.tsx` and `logic.ts`, and the list of readers stays `["CriterionText.tsx"]`. `review.ts` must pass. Its rows carry `criterion` and never read `.text`.
   - `ReviewPage.tsx`: no `className` expression mentions `finding`, `status`, `polarity` or `reported`. A synthetic line proves the rule fires.
   - Blindness: the eval-only key list from `tests/scripts/app-eval-run.test.ts` is also asserted against every `/review` response for the committed run, in `tests/server/app.test.ts`.
   - Measure `npm test`. The expected cost is reading 30 conversation files once, in well under 0.1 s. If it's more, cache the loaded run in a module-level constant, which is safe under `isolate: false`.

8. **The sheet and the score (spec §9.4).**
   - `scripts/review-sheet.ts` (`npm run review:sheet`) writes `work/0007-coordinator-review-pane/reading.md`. It covers the rule, the question, the reader's instructions (open only the listed reviews, don't open `evals/`), and per conversation, in the order `shuffle(ids, 20260921)`: its review link, start and end time blanks, and one line per settled row (`- L7 · answer: · where:`). It shows no finding, expectation or grade. The row list and order are pure exports.
   - `scripts/review-score.ts` (`npm run review:score`) parses the filled sheet, joins it with the run file's `labels.notCorrect` and graded determinations per conversation, and prints spec §9.4's numbers. Parsing and counting are pure exports.
   - `tests/scripts/review-sheet.test.ts`: the ten ids are v1 and v3 of each labelled study, and the sheet's text holds no status, finding word or grade. `tests/scripts/review-score.test.ts`: a filled fixture sheet in `tests/fixtures/`, with known counts, and a malformed answer names its line.
   - `package.json`: the two scripts. CLAUDE.md command table: both.

**Stage C: the blind reading**

9. **Commit the blank sheet.** Run `npm run review:sheet`, commit `reading.md` blank, and tell the owner it's ready, with the instructions for handing it to a reader. → **Gate 2.** The reader fills it in, and the filled sheet is committed as the reader left it. `npm run review:score` output goes in the change table.

**Stage D: findings, documentation, PR**

10. **Act on the reading (spec §9.5).** Read the notes for misses the pane could have prevented. If there are none, record that and go on. If there are some, change the pane in its own commit, with a test for what it now shows, run `review:sheet` for the three v2 conversations into `reading-v2.md`, and hold for a second Gate 2 with a new reader. That happens at most once.

11. **Documentation (spec §10).**
    - README: "The coordinator review", covering the §3 rule, the flip test, and open question 1 with the 0.15 / 0.01 figures and their model settings. It includes 61 of 252 `patient` and per-group row counts over the 15 labels conversations (computed by a pure function in `scripts/review-score.ts --groups`, so the numbers are traceable), the reading's numbers, the reader's relationship to the project and whether blinding held, and the "can't claim" list.
    - CLAUDE.md: the `app` row mentions the review and the eval run's conversations. The boundary paragraph gains the pane's rule and names `tests/web/review.test.ts`.
    - ROADMAP: 0007 done, open question 1's row updated, and "Carried forward from 0007" (spec §10.3).

12. **Reconcile `plan.md`, review, PR.** Fill in the change table and "Files that change" as built. Confirm `git diff main -- src/screening src/plain src/criteria src/models data evals` is empty. Run the `REVIEW.md` passes. The PR says how each gate went, whether Gate 1 was delegated and who read at Gate 2, and carries no tool attribution.

---

## What changed during implementation

Every divergence from this plan is recorded here, in the commit that makes it.

| Change | Why |
| --- | --- |
| **Baseline (step 1):** 670 tests; Vitest's duration 0.56–0.57 s over three runs | So later measurements compare like with like |
| `loadEvalRun` lives in `scripts/app/eval-run.ts`, beside the scripted agent, not in `scripts/app.ts`. It refuses a run whose prompt or simulator version differs from the code's, with a message naming `EVAL_RUN` (step 2) | Tests import it without loading the launcher. The version check makes the "fails loudly" risk below an explicit error instead of a missing-file one |
| `tests/fixtures/eval-run.ts` holds the eval-only key list, a key walker and the run loaded once, shared by the tests that read the committed run (step 2) | Step 7's blindness test and step 5's tests need the same list and the same loaded run. Loading once keeps the suite's cost to one read |
| **After step 2:** 681 tests, 0.60–0.69 s | Loading the run costs about 0.2 s of test time, spread across workers: mostly `displayFor` re-checking the renderings of 15 conversations |
| `reviewModel(review)` takes no `mode`. The scripted-agent note comes from the result's own `run.adapter === "fake"` (step 3) | A conversation made in fake mode and reviewed with the real model running is still scripted, and an eval-run conversation reviewed in fake mode is not. The result records which agent made it, and the app's mode doesn't |
| `logic.ts` also exports `reviewHash(id)`, the one place the review link is built (step 3) | The start page, the conversation view and the reading sheet all link to a review, and an eval-run id needs encoding |
| In-page links (group counts, turn numbers, "Shown with") scroll with `preventDefault` instead of changing the hash (step 4) | The URL hash is the page's router, so an ordinary `#turn-3` would have left the review for the start page |
| The app-wide *Scripted agent* banner is hidden on review pages (step 4) | Seen on the page: in `--fake` mode it sat above an eval-run review, which the real model made. The review's own note, from the result's metadata, says which agent made it |
| The *Open the coordinator review* link sits above the two-column grid, not inside the tester column (step 4) | `TesterPanel` stays unchanged and the grid keeps two items |
| The hand-built review lives in `tests/fixtures/review.ts`, not inline in `tests/web/review.test.ts` (step 5) | Twelve criteria, a transcript and every reading kind take about 200 lines, and step 6's flip test reuses it |
| **After step 5:** 702 tests, 0.64 s | Well under a second, with the committed run read once |
| The wording test also skips the study's title, and replaces quoted participant words inside reading lines with `""` before matching. `DELETE` joins the non-GET methods refused on `/review` (step 6) | The title is the registry's name for the study, fixed by identity (spec §3, 1). A discarded reading's line quotes the reply, which is the participant's words, like the turns the spec already skips |
| The class-name rule also names `reading`, and a test asserts the widened seam rule actually covers `review.ts`. The blindness test also walks `GET /api/conversations`, since the list carries the eval run's ids (step 7) | A rule that silently scanned nothing would pass. The list is the other route an eval-run conversation reaches |
| **The sheet lists settled rows only, not chart-review rows with a reported value (step 8).** Spec §9.3 and §9.4 are amended to match, and `review:score` has no reported-value tallies | Counted before writing the sheet: 107 settled rows and 211 reported chart-review rows in the reading set, 21 of those graded and 0 known to disagree. The chart rows would have been two-thirds of the reading with nothing to catch. All 15 known wrong findings are settled rows, so the measurement is unchanged. Flagged to the owner at Gate 2, before any reading, so it can be reversed. **Accepted by the owner, 2026-09** ("as a PoC, I think this is all fine") |
| The scorer reads the committed `notCorrect` list and each vignette's facts, not `gradeConversation` (step 8) | Regrading needs the fidelity flags, which live in the conversation files. The committed run already says which findings were wrong; the vignette says which labels had an expectation |
| `review:score` refuses a sheet with a malformed line, naming the line; `review:sheet` refuses to overwrite an existing sheet without `--force` (step 8) | A filled sheet is the reading, and it can't be made again |
| **Outside the slice's scope, made here because the Gate 2 reader runs `npm install` on this branch:** `package.json` gains `"allowScripts": { "esbuild": false, "fsevents": false }` (`npm install-scripts deny`). npm 11.19 already blocks both and warned on every install. Nothing needs them: `fsevents` ships its compiled binary and its implied `node-gyp rebuild` would only recompile it, and esbuild's postinstall checks for `@esbuild/darwin-arm64`, which is installed, with a registry download as its fallback. Typecheck, tests, `vite build` and lint pass with both denied. **Not changed:** the three `npm audit` advisories. `npm audit fix` would downgrade esbuild 0.27.7 to 0.27.2 to avoid an advisory for esbuild's own dev server on Windows, which this project doesn't use. The Vitest one needs Vitest 5, a major upgrade that 0005 carried forward, and applies to module mocks, which `tests/boundary.test.ts` forbids | The owner asked for the warning to be fixed. A reader new to the project should not meet install warnings before a blind reading |
| **Also outside scope, at the owner's request after the row above ("Still vulnerabilities"):** Vitest 3.2.7 → 5.0.1 and tsx 4.21.1 → 4.23.15, both exact. `npm audit` now finds 0 vulnerabilities: Vitest 5 carries a fixed `@vitest/mocker`, and tsx 4.23 takes esbuild `~0.28.0`, which Vite 7.3.6 accepts too, so both share esbuild 0.28.2, past the affected range. Vite (7.3.6) and `@vitejs/plugin-react` are unchanged, since Vitest 5 still supports Vite 7. `vitest.config.ts` needed no change. Same 724 tests, now reported as 717 passed and 7 expected fail: the 7 are the `it.fails` known-gap tests from 0006, which Vitest 3 counted as passes. 0.66 s over three runs. Typecheck, lint, `vite build` and `npm run app -- --fake` all work. The roadmap's 0005 note that Vite is pinned at 7 because Vitest 3.2.7 doesn't support 8 goes stale, and step 11 updates it | Upgrading a dependency is a plan-level decision (CLAUDE.md), and this one was the owner's. The row above said the audit advisories would stay; this reverses that |
| `scripts/app.ts` turns `EADDRINUSE` into a short message: what's likely holding the port, how to see it, how to stop a server suspended with Ctrl-Z, and `--port` as the alternative | The owner hit a raw stack trace: port 5005 was held by an `npm run app` from that morning, suspended with Ctrl-Z (state `T`) and so still bound. A Gate 2 reader could hit the same thing |
| **Review pass 2 (Important), fixed:** `npm run app` would not start if `loadEvalRun()` threw, and the loader throws on any run made with a different prompt version. So the agent-fixes slice would have lost the page from the moment it changed `PROMPT_VERSION` until the 12-hour eval was re-run. The launcher now serves no eval-run conversations and says why on startup. Proved by starting the app with the run file hidden, then restoring it (no diff under `evals/`) | The loader's strictness is right for the review and wrong as a reason not to start |
| **Review pass 5 (Important), fixed:** the README said 10 of 15 caught without saying that 4 of the 10 are one easy pattern: other-sex conditional criteria recorded as *Not met*, all graded wrong, all caught. Two were caught in the transcript, not the row. The README and roadmap now say so. The reader's end notes, not the reviewing agent's summary, are what showed it | A catch rate that leans on one easy pattern overstates what the review lets a reader see |
| **Review pass 4 (Important), not fixable here:** the Gate 2 reader's model and settings were not recorded. CLAUDE.md says a result without them is not a result. The README and roadmap say it plainly, and the result is presented as indicative, not as a measurement | The reading was run in another session. Guessing the model would be worse than saying it is unknown |
| **After step 7:** 713 tests, 0.67–0.70 s over three runs, against 0.56 s at the baseline. The committed run is loaded once per worker (`tests/fixtures/eval-run.ts`), and three test files read it. No cache beyond that was added | Under the one-second budget. The rest of the rise is `displayFor` re-checking renderings for 15 conversations per worker that loads them |

---

## Files that change

As built. Where this differs from the plan as approved, the change table above says why.

**New:**
- `src/web/review.ts`, `src/web/ReviewPage.tsx`
- `scripts/app/eval-run.ts`, `scripts/review-sheet.ts`, `scripts/review-score.ts`
- `tests/web/review.test.ts`, `tests/scripts/{app-eval-run,review-sheet,review-score}.test.ts`
- `tests/fixtures/{eval-run,review}.ts`, `tests/fixtures/reading-filled.md`
- `work/0007-coordinator-review-pane/{intent,spec,plan,reading}.md`

**Modified:**
- `src/server/{types,conversations,app,index}.ts` (the route, `finished`, `origin`). `start.ts` is unchanged: `StartOptions` is `AppOptions`, so `finished` passes through
- `src/web/{App,StartPage,ConversationView,CriterionText}.tsx`, `src/web/{logic,api}.ts`, `src/web/styles.css`
- `scripts/app.ts` (serves the eval run; a clear message when the port is taken)
- `tests/boundary.test.ts`, `tests/server/{app,store}.test.ts`, `tests/web/logic.test.ts`
- `package.json` (two scripts, `allowScripts`, Vitest 5 and tsx 4.23), `package-lock.json`
- `README.md`, `CLAUDE.md`, `work/ROADMAP.md`

**Not touched, and checked with `git diff main`:** `src/screening/`, `src/plain/`, `src/criteria/`, `src/models/`, `src/transport/`, `data/`, `evals/`. `PROMPT_VERSION` is still `c5778afe9cbd`. `TesterPanel.tsx` is unchanged.

---

## Risks

- **Spending blind material by accident.** Opening an eval-run conversation during development spends it for the owner, though not for a new reader. Mitigation: development and tests use the hand-built review and the two spent v2 conversations. Claude reads committed files only through tests, never "to check how it looks", and the reader's instructions name what not to open.
- **The flip test passing vacuously.** If `reviewModel` accidentally dropped polarity entirely, the flip test would pass. Step 5's wording-table test pins every `finding` cell, so the two together cover it.
- **A catch rate that says little.** 15 known errors, one reader. The README reports counts, not rates dressed up as precision, and names the sample.
- **`conversationKey` drift.** An agent-fixes slice that changes `PROMPT_VERSION` makes the launcher unable to find these files. That's intended: the launcher fails loudly, and the fix is a new `EVAL_RUN`, not a looser match.

## Verification

- `npm test` (670 plus new, under a second), `npm run typecheck`, and lint by exit code, at every commit.
- `npm run app -- --fake`: finish a fake conversation, open its review, open the two spent v2 reviews. Check the route directly with `curl -s 127.0.0.1:5005/api/conversations/<id>/review` for 200, and for 409 on an unfinished one.
- `npm run review:sheet`, then `npm run review:score` against the fixture sheet.
- `git diff main -- src/screening src/plain src/criteria src/models data evals` is empty, and `PROMPT_VERSION` is `c5778afe9cbd`.
