# plan: 0006 plain language

**Intent:** `work/0006-plain-language/intent.md` · **Spec:** `work/0006-plain-language/spec.md`
**Branch:** `0006-plain-language` (from `main` at `c735638`; intent `3aacc20`, spec `b9fec24`)

---

## Context

The criteria are shown in protocol wording that the owner, and most people, cannot follow. This slice adds a plain-language rendering of each labelled criterion, made ahead of time by the local model and committed under `data/plain/`. It is shown under the protocol words in the tester panel, through `CriterionText` alone. A deterministic check (`src/plain/check.ts`) decides whether each rendering may be shown and says why when it may not. The agent never sees a rendering (spec D2), so `PROMPT_VERSION` stays `c5778afe9cbd` and 0004's numbers stand.

**What is scarce is the owner's reading at the right moment, not model time.** Rendering all 252 criteria costs under half an hour of oMLX. So the slice is ordered to put something readable in front of them first (D3), then to make the check trustworthy on a small set, and only then to spend the full run and the reading. None of the three gates asks a clinical question.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. Something to read** | 1–5 | **Gate 1** | `npm run app -- --fake`, start NCT04316364: 24 renderings under the protocol words, marked *not yet checked* |
| **B. The check** | 6–9 | **Gate 2** | The same 24, now each shown, refused with the check's reasons, or shown with a *retry* tag. `npm run plain:check -- NCT04316364` prints the same in the terminal |
| **C. The full run and the reading** | 10–11 | **Gate 3** | All five labelled studies rendered and checked in the panel. `reading.md` lists what to read |
| **D. Findings, documentation, PR** | 12–14 | PR | README "Plain language" section, followed cold |

**Gate 1: the shape of a rendering.**
The owner runs `npm run app -- --fake`, starts NCT04316364, and reads the 24 renderings under their protocol words. They decide:
1. Is it easier to follow than the protocol wording alone?
2. Below the protocol wording, or beside it?
3. Is one to three sentences right, or should there be a length limit?
4. When a hard term is replaced, is "(histologically)" in parentheses after the plain words the right way to keep it? Or should the protocol word lead, with the explanation after it?
5. Does the statement form ("Is pregnant", "Must not have had gemcitabine before") read acceptably?

**Passed 2026-09, on Claude's recommendations: the owner delegated the gate ("I'll lean on your recommendations").** The PR says so. Decided: (1) easier to follow, go on; (2) below the protocol words, as built; (3) one to three sentences, no hard limit, lengths reported by `plain:check` (none of the 24 needed more than one); (4) either order of term and explanation is accepted, since the protocol word stays on screen either way and the check needs only its presence; (5) the statement form stays. **One prompt change:** L14 "Has an arteriovenous thrombotic events" had become "Has had…", which changes when something is true. A rule was added ("Do not change when something is true…"), and the study was re-rendered with `--force` (prompt `d3f575fabfbd` → `477594860846`, 71 s). L14 now reads "Has an…", and L2 keeps "previously untreated" rather than adding a "not". Noted for the README's unverified-explanations statement, not changed: L12 glosses cerebrovascular as "(blood vessel)", and L16 glosses "active" as "current infection".

*Why it guards Stage B:* the check's named-term and scope-word rules assume a format, and the mutation tests are built on these 24 renderings. Changing the format after Stage B means rebuilding both. If the answer changes the prompt, step 5 is re-run with `--force` (a few minutes) before Stage B starts, and the change table says so.

**Gate 2: is the check right about the 24?**
`npm run plain:check -- NCT04316364` prints each rendering with the check's verdict. The panel shows the same. For every rendering the check refuses, the owner answers one question: is the thing it names really missing or changed on the page? (For example, "missing: within": is "within" gone?) They also read `src/plain/vocabulary.ts` as a list of words: should anything be added or removed? If the check refused none of the 24, that is not a pass. The gate then looks at the mutation test count, to confirm the check can refuse anything at all.

**Passed 2026-09, on Claude's recommendation: the owner delegated the gate ("Take your recommendation and start the full run").** The PR says so. The check refused none of the 24, so the evidence it can refuse is the mutation tests: every one of 57 mutations across seven categories refused for its own category. Whether it is too strict is not yet known and is first measured in step 10. Being wrong costs a vocabulary edit and a `--force` re-run of about 15 minutes, so the gate passes with one condition: after step 10 and before the reading, every refusal is checked against the page ("is the named thing really missing?"), and any the check got wrong is reported to the owner before Gate 3. No vocabulary change.

*Why it guards Stage C:* the full run's retries are driven by the check's report. A check that wrongly refuses sends good renderings back to the model with false instructions. A loose check lets bad renderings through with nothing to retry. Either one is in every number Stage C produces, and a vocabulary change after the full run means re-running it to get honest retry counts.

**Gate 3: the reading (spec §8).**
The owner reads, in the panel, every pair `reading.md` lists: all 37 of NCT00077350, plus every rendering in any study that passed only on retry. For each they answer two questions: is anything on the left missing on the right, and does the right add a condition? They write each *yes* into `reading.md`. That decides whether these renderings are what 0007 builds on, or whether the prompt or check changes and Stage C is redone first. **Done by the owner, 2026-09** (not delegated: Claude wrote the renderings, the check and the vocabulary, so a reading by Claude would have been the author grading its own work). 49 pairs read, 8 answers of "yes" on 7 criteria. Three are now caught by the check (L17, L18, L15: a verdict with a condition must be kept, and a verdict's negation goes with the verdict); three are by design (L20, L24, L37: the verdict wording left to the polarity tag); one is a named known gap (NCT04385368 L67, a wrong explanation of "IP"). The new rule also refused NCT04385368 L56, outside the reading, for the same fault as L17. The rate found is low and every finding is either learned or named, so the renderings go forward to 0007 without a new prompt or run. Details in `reading.md`.

*Why it guards Stage D and 0007:* the README's claims and the coordinator pane rest on this reading. The gate can come back no. A high rate of findings, or a finding the check cannot learn that recurs, means changing the prompt before going on.

### Steps

Each step is one commit. `npm test`, `npm run typecheck` and `npm run lint` pass at every commit.

**Stage A: something to read**

1. **Reconcile the spec with the repository, and record the baseline.**
   - Baseline: 552 tests. Record the wall time of three `npm test` runs.
   - Spec §7.1: `inspect()` includes `plain` only for a conversation whose own `source` is `labels`. Conversations restored from `chats/` keep the source they were made with (`src/server/conversations.ts:240`), and a parse conversation must not pick up label renderings by id.
   - Spec §4.3: `data/plain` joins `biome.jsonc`'s excluded paths, as `data/trials` is. The script writes `JSON.stringify(…, null, 2)` plus a newline, and Biome reformatting it would churn every regenerated file.
   - Spec §4.2: Stage A's script makes first attempts only. The retry needs the check, so it arrives in step 8.

2. **`src/plain/`: types, prompt, render call.**
   - `types.ts`: `PlainFile`, `Rendering`, `Attempt`, `PlainDisplay` (spec §4.3, §7.1), and `PlainError` in the `ModelError` shape (context plus problems). It imports no Node module, because the page imports its types.
   - `prompt.ts`:
     - `SYSTEM_PROMPT`: the rules of spec §3, written as instructions. It carries the check's rules too, even though the check comes later, because the prompt should not change between Gate 1 and the full run unless Gate 1 asks for it.
     - Four worked examples, hand-written and not drawn from any of the twelve corpus studies: a lab threshold with a unit, a washout window, a double negative, and a term explained in parentheses.
     - `RETRY_TEMPLATE`, used from step 8 but hashed from now on.
     - `PLAIN_PROMPT_VERSION = hashPrompt(SYSTEM_PROMPT + RETRY_TEMPLATE)`, reusing `hashPrompt` from `src/criteria/prompt.ts`.
     - `buildUserPrompt(text)` and `buildRetryPrompt(text, first, problems)`.
   - `render.ts`:
     - `renderPlain(adapter, text)` returns an `Attempt`. An empty reply, a non-string `plain`, or `finishReason: "length"` becomes an attempt with `plain: null` and a problem line. A `ModelError` from the adapter is rethrown, so the script can tell "the model is down" from "the model answered badly".
     - `maxOutputTokens: 512`.
   - `index.ts`.
   - Tests, `tests/plain/render.test.ts`, using `FakeModelAdapter`:
     - a valid reply;
     - an empty reply;
     - a `length` cut-off;
     - an adapter error is rethrown;
     - the user prompt carries the text alone, with no polarity, type or study;
     - no example in `SYSTEM_PROMPT` appears in any corpus study's `criteriaText` (normalized, case-insensitive), checked through `loadTrials()`.

3. **Loading and display, before any check.**
   - `src/plain/load.ts`:
     - `textSha(text)` (sha-256);
     - `loadPlainFile(nctId, dir = data/plain)` validates the shape and throws `PlainError` naming the file, as `src/trials/load.ts` does;
     - `displayFor(criteria, file | undefined)` returns `Record<id, PlainDisplay>`. In this step there is no check, so a present, non-stale rendering whose first attempt has text is `unchecked`. The other states are `stale` and `missing`.
   - Tests, `tests/plain/load.test.ts`: each state, a malformed file, and a file for the wrong study.

4. **To the page.**
   - `src/server/types.ts`: `ServedStudy` gains `plain?: Record<string, PlainDisplay>`, and `ConversationInspection` gains `plain: Record<string, PlainDisplay>`.
   - `ConversationService.inspect()` fills it from the served study when the conversation's source is `labels`. Otherwise it is `{}`. It is not written to `chats/`.
   - `scripts/app.ts` calls `loadPlainFile` and `displayFor` per labelled study, and passes nothing extra for parses. The startup line says how many criteria have a plain version.
   - `src/web/logic.ts` gains `plainLines(plain: PlainDisplay | undefined)`, which returns the label and lines to show (spec §7.2), as a pure function. `Row` gains `plain`.
   - `CriterionText` takes `plain` and lays out `plainLines`. `TesterPanel` passes `row.plain`, and adds the one-line note for `source === "parse"`. Plain CSS for the two labels and the *retry* and *not yet checked* tags.
   - Tests:
     - `tests/web/logic.test.ts`: `plainLines` for each state and for absent;
     - `tests/server/app.test.ts`: `plain` present for labels, `{}` for parses, absent from the saved chats file;
     - `tests/server/conversations.test.ts`: the transparency test runs unmodified.
   - `tests/boundary.test.ts`, each rule with a proof that it fires:
     - nothing under `src/screening/` imports from `src/plain/` (the same `importsFrom` helper as the transport rule);
     - `ScreeningCriterion` has exactly `id`, `polarity`, `type`, `text`. This is a source check of the interface body in `src/screening/types.ts`;
     - `readsCriterionText` is widened: no component other than `CriterionText` reads `plain.text` or `.problems`.

5. **The script, and a first real run.**
   - `scripts/render-plain.ts`, with `npm run plain:render`:
     - takes an NCT ID or `--all`, and `--force`;
     - loads labels through `loadLabelSets()` and `fromLabels()`;
     - uses `new OmlxAdapter({ thinking: false })`;
     - skips criteria already rendered, not stale, and under the current prompt version;
     - refuses to add to a file made with a different prompt version, unless given `--force`;
     - writes the file after every criterion;
     - stops after two consecutive connection failures (`isConnectionFailure`), printing `check http://127.0.0.1:8000/health`, the same rule as `evals/screening-runner.ts:203`;
     - records `run` (`ModelRunMetadata` with `PLAIN_PROMPT_VERSION`);
     - prints seconds per criterion.
   - The planning part (`workFor(criteria, file, promptVersion, force)`: which criteria to render, and whether to refuse) is a pure export, tested in `tests/scripts/render-plain.test.ts` with no model.
   - Then run `npm run plain:render -- NCT04316364` on oMLX, with `/health` checked first. Commit `data/plain/NCT04316364.json`. Record the seconds per criterion in the change table.
   - CLAUDE.md command table: `plain:render`.
   - *See:* `npm run app -- --fake`, then start NCT04316364.

→ **Gate 1**

**Stage B: the check**

6. **Vocabulary and extraction (spec §5.1, §5.3).**
   - `src/plain/vocabulary.ts` holds everything as commented data:
     - comparison cues by family (≥ > ≤ <), with symbols, words before a number, and trailing phrases;
     - window words ("within", "in the last", "in the past" → ≤);
     - anchor families;
     - negation cues;
     - time-unit synonyms;
     - drug-name stems: -mab, -tinib, -nib, -ciclib, -parib, -lisib, -sertib, -platin, -taxel, -abine, -trexed, -rubicin, -mustine, -tecan, -poside, -limus, -cept;
     - scope-word groups and the verdict-word list.
   - `src/plain/extract.ts`: `prepare(text)` (`\^` to `^`, `×`/`x` between numbers, whitespace), then `quantities`, `directions`, `anchors`, `negations`, `namedTerms` and `scopeGroups`. Each returns plain data with the matched words, so a problem line can quote them.
   - Tests, `tests/plain/extract.test.ts`, drawn from real criteria (spec §10):
     - `WBC \>= 3000/mm\^3`;
     - `1.5×10\^9/L`;
     - `Platelet count \>= 100,000/mm\^3` equal to `100000/mm^3`;
     - "within 4 weeks prior to registration" (≤, before);
     - "\>= 3 weeks prior" (≥, before);
     - "18 to 75";
     - "18 years of age or older";
     - NCT00077350 L18's two negations;
     - `T790M`, `PD-L1`, `IIIa`, `gemcitabine`, `osimertinib`;
     - "active second malignancy";
     - a number with no cue has no direction.

7. **The check (spec §5.2, §5.4).**
   - `src/plain/check.ts`: `checkPlain(criterionText, plain) → { pass, problems: Array<{ category, line }> }`, with categories `quantity`, `direction`, `anchor`, `negation`, `named-term`, `scope`, `verdict`, `empty`. It applies rules 1–7, each producing the problem wording the spec gives.
   - Tests, `tests/plain/check.test.ts`:
     - a pass and a fail per rule, asserting the exact line;
     - L18's rendering may say "not eligible to enroll", because the protocol does;
     - `plain: null` fails with `empty`.
   - The five known gaps from spec §5.4, as `it.fails`, each named for the gap.

8. **Wire the check in, add the retry, prove the check on real renderings.**
   - `displayFor` runs `checkPlain` on each attempt in order. The first passing attempt is `shown` (with `attempt: 1 | 2`). If none passes, the state is `failed`, with the last attempt's problem lines. The `unchecked` state is no longer produced, and a test asserts it for every committed file.
   - `scripts/render-plain.ts` gains the retry. For a criterion with one attempt that fails the check and no second attempt, it calls `renderPlain` with `buildRetryPrompt`. It stores `reportAtGeneration` on both attempts. Resuming never retries a criterion twice.
   - `scripts/plain-check.ts`, with `npm run plain:check -- [NCT ID] [--reading]`, uses no model:
     - prints each criterion as protocol, plain, verdict and problems;
     - prints the spec §6 summary per study and in total;
     - with `--reading`, prints the gate-3 list instead (spec §8).

     The counting is a pure export, tested in `tests/scripts/plain-check.test.ts`.
   - Tests:
     - `tests/plain/mutations.test.ts`: for every committed rendering that passes, each applicable mutation must fail with its category. The mutations are: drop a quantity, change a direction family, swap an anchor, delete a negation, swap a named term for another from the same file, delete a scope word, and insert "you". A mutation that passes fails the test, never skips. The test also asserts at least one mutation was applied per rule category, so an empty corpus cannot pass silently.
     - `tests/plain/files.test.ts`, over committed files: they parse, have one prompt version, a complete `run`, no stale rendering, and every criterion of the study present.
   - Measure `npm test` wall time. If it crosses a second, the first lever is building the mutation list once per file and asserting once per rendering. That goes in the change table.

9. **Retry the 24, for the gate.**
   - `npm run plain:render -- NCT04316364` on oMLX. It makes only the retries, and the first attempts stand. Commit the file.
   - Record the `npm run plain:check -- NCT04316364` summary (first try, after retry, not shown, categories) beside Gate 2, in the change table.
   - CLAUDE.md: `plain:check`.
   - *See:* the panel now shows verdicts, and `plain:check` prints them.

→ **Gate 2.** If it changes the vocabulary, the change is its own commit, with a mutation test or a check test for each addition, and it is recorded in the change table. The 24 need no regeneration, because `displayFor` re-checks. If it changes the prompt, NCT04316364 is regenerated with `--force` and Gate 2 is re-read.

**Stage C: the full run and the reading**

10. **Render everything.** `npm run plain:render -- --all` on oMLX, resuming after interruptions and checking `/health` when calls fail. Commit the five files in `data/plain/`. Record the `plain:check` totals and the wall time in the change table. The mutation tests now run over every rendering. Fix any mutation that passes by adding to the vocabulary, not by removing the case.

11. **Prepare the reading.** `npm run plain:check -- --reading` gives the list. Write `work/0006-plain-language/reading.md` with:
    - the rule;
    - the two questions;
    - one line per criterion to read (study, id, and whether it is there because of the study or the retry), with an empty answer column;
    - a short "how to read in the panel" note: `npm run app -- --fake`, then start the study. Every criterion is listed from the first turn.

→ **Gate 3.** The owner fills in `reading.md`.

**Stage D: findings, documentation, PR**

12. **Act on the reading.** Each *yes* in `reading.md` gets one of two outcomes, recorded beside it:
    - **Learnable:** a vocabulary or rule change, with a test built from the finding, in its own commit. The rendering stops being shown with no regeneration needed.
    - **Not learnable:** a named `it.fails` known-gap test, plus a decision: accepted, with the reason, or the criterion regenerated with `--force`.

    If the prompt changes, Stage C is redone and the reading repeated on the renderings that changed. The change table says so.

13. **Documentation** (spec §13).
    - README: the "Plain language" section with the `plain:check` numbers, the commit they come from, the model settings from the files' `run`, the reading's "read N, found M, K now caught", one excerpt of a shown rendering and one refused, and the plain statement that nobody on the project has verified the explanations of terms.
    - CLAUDE.md: the layout gains `src/plain/` and `data/plain/`. The boundary paragraph names the new rule.
    - ROADMAP:
      - 0006 marked done, and 0007 marked next;
      - "Carried forward from 0006": ask-only use of renderings in the agent-fixes slice, with a re-run; a frontier-model check of explanations in 0008; parses are a run, not code; what the reading found that the check cannot learn.

14. **Reconcile `plan.md`, review, PR.**
    - Fill in the change table and "Files that change" as built.
    - Confirm `git diff main -- src/screening` is empty and `PROMPT_VERSION` is `c5778afe9cbd`.
    - Run the `REVIEW.md` passes.
    - Open the PR. It says how each gate went and whether any was skipped, and carries no tool attribution.

---

## What changed during implementation

Every divergence from this plan is recorded here, in the commit that makes it.

| Change | Why |
| --- | --- |
| **Baseline (step 1):** 552 tests; Vitest's own duration 0.80–0.83 s over three runs (1.17–1.32 s wall time including `npm` startup). The budget is read from Vitest's duration, as 0005's 0.8 s was | So later measurements compare like with like |
| The server tests for `plain` are in `tests/server/store.test.ts`, not `app.test.ts`: shown with a labels conversation, not saved in `chats/`, `{}` for a parse conversation including one restored beside label renderings. `app.test.ts` only checks the route carries `plain` (step 4) | Those behaviours belong to the service, and `store.test.ts` already builds a service with a store and no Fastify. Keeping Fastify to one file is 0005's rule |
| `tests/web/logic.test.ts`'s hand-built `ConversationInspection` gains `plain: {}` (step 4) | The type gained a required field. No assertion changed |
| The page lays the rendering out with `plainView()` in `logic.ts` (named for what it returns), not `plainLines()`. The criterion seam's boundary rule treats a call to `plainView(` as reading a rendering (step 4) | `CriterionText` never reads `plain.text` itself; it reads what `plainView` returns. Without the extra pattern, a second component could lay out renderings through `plainView` and the rule would not notice |
| **Measured for Gate 2 (step 9, 2026-09):** `plain:render -- NCT04316364` found 0 to render and 0 to retry. `plain:check`: 24 shown on the first try, 0 after a retry, 0 not shown; plain median 78 characters (longest 237) against protocol median 60 (longest 166). The check refused none of the 24, so the gate's evidence that it can refuse is the mutation count above. The vocabulary was written after reading these 24 renderings, so their passing is not independent evidence that the check is loose enough | Step 9 has no retries to make, so it commits no data. The false-refusal rate on real renderings is first measured in step 10 |
| **The first full run (step 10, 2026-09), with Gate 2's check:** 228 criteria rendered in about 16 minutes, prompt `477594860846`. 217 shown on the first try, 17 after a retry, 18 not shown. Under the check as fixed below, the same files give 218, 16 and 18 | Kept in history as the record of what the Gate 2 check did. The fixes below came from it |
| **Gate 2's condition, every refusal checked against the page (step 10).** Real catches: NCT03433469 L59 reworded an exclusion with an added "not"; L54 dropped "(but not necessarily)" and "known"; NCT04385368 L52's retry inserted "would not" three times; L23 dropped "WoCBP". **One dangerous miss:** NCT04385368 L50 "Non-leukocyte-depleted…". The first attempt ("was not leukocyte-depleted") was right and was refused, because a prefix negation was invisible to the check. The retry reversed it ("was leukocyte-depleted"), the check passed it, and it was shown. **Wrong refusals:** about nine for a "not" or "no" inside an explanation in parentheses; two for "enrolled" where the protocol says "enrol" or "enrollment"; three for "except" where the protocol says "with the exception of"; one for the protocol's own typo "asT3N2" | Reported to the owner before Gate 3, as Gate 2 required |
| **Fixed from the full run, each with tests, the prefix bug test-first (`b1d4f40` failing, then `a91fafd`):** "un-" and "non-" words count as negations, with "non-small" and words like "under", "unit", "until" excluded; numbers written as words are quantities ("within five half-lives"); verdict words are compared by family; "with the exception of" counts like "except". The mutation harness now aims at the quantity itself and at a duration's own anchor. A new known gap: before and after swapped where no duration is attached | Two of the three mutations that got through were the harness aiming at the wrong word ("2" inside "ICF2"; an "after" that orders two events). The third, "within five half-lives", was a real gap. Per the plan, the check was extended rather than any case removed |
| `tests/plain/check.test.ts`'s "double negative made single" example now passes and moved to a passing case; the refusal case uses a rendering that really drops a negation | Its rendering said "not yet received therapy" as "untreated". Once prefixes count, that keeps both negations, and passing it is correct |
| `tests/plain/extract.test.ts`: "at least one of: 2 prior lines" now also reads "one" as ≥ 1 | Numbers written as words. The test's point, that no cue crosses the colon to "2", is unchanged |
| **Prompt: an explanation may not use not, no, never, without or cannot, and a word starting un- or non- is not explained (`bc8f3d9`).** Then the second full run: `plain:render -- --all --force`, prompt `e5a58e26c2ac`, about 17 minutes | About nine of the first run's refusals were a negation inside an explanation. The spec promises an explanation brings in no negation, so the fix went to the prompt, not the check. The re-run was needed anyway: the first run's retries had been driven by the check before its fixes |
| **The second full run, which the reading reads (step 10):** 252 criteria; 214 shown on the first try, 18 after a retry, 20 not shown (232 shown, 92%). First attempts refused for negation 24, scope 7, quantity 4, named term 4, direction 1, verdict 1; not shown for negation 17, quantity 1, named term 1, verdict 1. Shown renderings: median 120 characters against the protocol's 90. Mutations applied over the 232 shown: quantity 96, direction 72, anchor 24, negation 47, named term 101, scope 129, verdict 232, every one refused for its own category. `npm test` 0.50–0.52 s | The prompt rule helped only partly. About 14 of the 20 not shown are still refused for a negation in an explanation ("(no sperm in the semen)", "(has no mutations in these genes)") or an un- word in one ("unusual"). Accepted for this slice rather than loosened: every refusal shows its reason, and letting explanations carry negations would change a promise the spec makes. Carried forward |
| **Every refusal in the second run checked against the page.** No refusal names something that is not really there. Real catches again include L59's reframing ("Has not received…", refused on both attempts), L43's explanation adding "two" and "three", and L42 dropping its heading "Unacceptable Contraception Methods". **NCT04385368 L50 is refused on both attempts and no longer shown.** Its first attempt was right but explained itself with a second "not"; the retry, told "1 in the protocol, 2 in the plain", removed both and reversed the meaning again. The check caught it this time. A retry told to change a negation count can push the model into a reversal | For the README, and for whoever next changes the retry: the instruction is a count, and the model can satisfy it the wrong way |
| `tests/plain/load.test.ts`'s `displayFor` tests were rewritten in step 8 for the checked states (shown, failed with reasons, a retry that passed); the `unchecked` assertion in `tests/web/logic.test.ts` was removed with the state | The behaviour changed on purpose when the check was wired in. No assertion about a surviving behaviour was loosened |
| Spec §5.2 gains an "amended during implementation" list pointing here (step 14) | Review pass 1: the rules as built differ from the spec's list, and the spec should not be left describing a check that no longer exists |
| `reading.md` carries each pair's protocol and plain text, with an empty Missing and Added line under each, not only the list of ids (step 11). 50 pairs: 37 of NCT00077350 (one, L30, not shown, so 36 to answer) and 13 retried renderings from the other studies | Reading and answering in one file is less work than moving between the page and a list, and the record then shows exactly what was read. The page still shows the same pairs |
| Steps 6 and 7 were first committed with a Biome error (a helper named `escape` shadowed a global), missed because only the last line of `npm run lint` was read. Both commits were redone before anything was pushed, each verified alone (step 6 in a temporary worktree: 605 tests, lint and typecheck clean) | The plan requires every commit to pass. Lint is now read by its exit code |
| Named terms are taken per hyphenated part ("HIV-positive" names HIV), and a code whose digits belong to it ("COVID-19", "glucose-6-phosphate") is masked from number-finding as a whole (step 6) | Found by running extraction over all 252 labelled criteria before writing tests. Taken whole, "HIV-positive" rendered as "HIV positive" would be refused as one term missing and another added |
| The `unchecked` display state is removed rather than left unproduced once the check runs in `displayFor`. Problems are shown through `describeProblem` ("number missing: …", "scope word missing: …"), which is also what a retry is told (step 8) | A state nothing produces is dead code in the page's types. "missing: active" alone does not say whether a number, a term or a scope word is missing |
| **Test budget:** `vitest.config.ts` sets `isolate: false`, so files in a worker share one module cache. `tests/boundary.test.ts` gains "tests can share modules": no test mocks a module or stubs a global, with a proof that the rule fires (step 8). The plan's named lever was wrong: the mutation tests run in 20 ms | Measured: the eight new test files took the suite from 0.80 s to 0.98–1.02 s, all of it per-file startup; the new tests themselves take milliseconds. With `isolate: false` the whole suite is 0.40–0.43 s. It passed shuffled under five seeds before being turned on, and nothing in `tests/` replaces a module, which is what would make sharing unsafe |
| **Mutations applied, NCT04316364 (step 8):** quantity 4, direction 2, anchor 2, negation 2, named term 9, scope 14, verdict 24, over 24 renderings. Every one refused for its own category | Direction, anchor and negation rest on two renderings each until the full run. The per-category minimum in the test is 1 |
| Step 5 is two commits: the script, then the renderings it made | The run is not code, and the data commit is the one Gate 1 reads |
| **Measured for Gate 1 (step 5, 2026-09):** NCT04316364, 24 criteria, `Qwen3.6-35B-A3B-MLX-8bit` via oMLX, reasoning off, temperature 0, seed 20260921, prompt `d3f575fabfbd`. 86 s in all, 2.3–10.1 s each, about 3.5 s typical (the first call is the slowest). Every call returned a rendering | The full run's cost, measured: about 15 minutes for 252, not the half hour estimated |

---

## Files that change

As built. Where this differs from the plan as approved, the change table above says why.

**New:**
- `src/plain/{types,prompt,render,load,vocabulary,extract,check,index}.ts`
- `scripts/render-plain.ts`, `scripts/plain-check.ts`
- `data/plain/{NCT00077350,NCT03433469,NCT04316364,NCT04385368,NCT06728852}.json`
- `tests/plain/{render,load,extract,check,mutations,files}.test.ts`, `tests/scripts/{render-plain,plain-check}.test.ts`
- `work/0006-plain-language/{intent,spec,plan,reading}.md`

**Modified:**
- `src/server/{types,conversations}.ts` (the `plain` field, passed through)
- `src/web/{CriterionText,TesterPanel}.tsx`, `src/web/{logic.ts,styles.css}`
- `scripts/app.ts` (loads renderings for labels)
- `package.json` (two scripts), `biome.jsonc` (`!data/plain`), `vitest.config.ts` (`isolate: false`)
- `tests/boundary.test.ts`, `tests/web/logic.test.ts`, `tests/server/app.test.ts`, `tests/server/store.test.ts`
- `README.md`, `CLAUDE.md`, `work/ROADMAP.md`

**Untouched:** `src/screening/` (`git diff main -- src/screening` is empty; `PROMPT_VERSION` is `c5778afe9cbd`), `src/criteria/` (only `hashPrompt` is imported), `src/models/`, `src/transport/`, `src/trials/`, `data/trials/`, `evals/` (only existing functions are imported by scripts and tests), and every committed result.

---

## Reused rather than rebuilt

- `fromLabels` and `loadLabelSets` (`evals/screening-input.ts`, `evals/cases/load.ts`), so a rendering is made from exactly the text the agent and panel use. Only the scripts import them.
- `hashPrompt` (`src/criteria/prompt.ts`) for `PLAIN_PROMPT_VERSION`.
- `OmlxAdapter({ thinking: false })`, `FakeModelAdapter`, `ModelError`, `isConnectionFailure` and `ModelRunMetadata` from `src/models/`.
- The two-consecutive-connection-failures stop from `evals/screening-runner.ts`.
- `loadTrials()` for the examples-not-from-the-corpus test.
- The loader's error style from `src/trials/load.ts`. The `importsFrom`, `stripComments` and `readsCriterionText` helpers, and the "would catch" proof style, from `tests/boundary.test.ts`.
- `rows()` and `Row` in `src/web/logic.ts`, extended rather than paralleled.

---

## Toolchain constraints

- `exactOptionalPropertyTypes` (use a conditional spread, never `field: undefined`), `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `.js` specifiers.
- `src/plain/types.ts` is imported by the page, so it imports nothing from Node. Hashing lives in `load.ts`.
- No new dependency. The check is regular expressions and string work.
- `tests/` has no model and stays under a second. Mutation tests read committed files only.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| The check is too strict, and most good renderings are refused, especially on negation counts | Gate 2 is exactly this question, asked on 24 renderings before the full run. Vocabulary changes are cheap because `displayFor` re-checks without regenerating |
| The check is too loose, and mutations pass | A passing mutation fails the suite. There is a per-category minimum count, so an empty or tiny corpus cannot pass silently |
| The model writes rules ("You must…") despite the prompt | Rule 7 refuses them. The retry is told why. The first-try rate for `verdict` is visible in `plain:check` |
| Number extraction mis-reads lab notation (`10^9/L`, commas, ranges) | Step 6's tests use the corpus's real forms. Anything missed shows as a `quantity` refusal at Gate 2 and is fixed there |
| The prompt is tuned on NCT04316364 at Gate 1, and the reading then measures the tuning | The reading study is NCT00077350, never shown at Gate 1 |
| Examples in the prompt leak corpus text | Step 2's test fails if any example appears in a corpus `criteriaText` |
| oMLX goes down during a run | The script resumes, stops after two connection failures, and prints the `/health` URL. Check `/health` before suspecting the code |
| Renderings reach the agent by accident | Boundary test: `src/screening/` cannot import `src/plain/`. `ScreeningCriterion`'s keys are pinned. The transparency test is unchanged, and `git diff main -- src/screening` is empty at step 14 |
| `npm test` crosses a second | The lever named in step 8, recorded if used. The budget is not quietly raised |

---

## Proof

- `npm test`, `npm run typecheck` and `npm run lint` are clean at every commit, and `npm test` stays under a second, with the measured number in the PR.
- The agent is unchanged: `git diff main -- src/screening` is empty, `PROMPT_VERSION` is `c5778afe9cbd`, and 0005's transparency test passes unmodified.
- The check can fail. Every committed passing rendering is refused under every applicable mutation, with a minimum count per category. The known gaps are named `it.fails` tests.
- Every shown rendering passes the current check, and every refused one shows its reasons in the panel.
- Every README number comes from `npm run plain:check` at a named commit over committed files, with model, quantization, temperature, seed and prompt version from the files' `run` blocks.
- Gates 1–3 are done by the owner in the panel, with outcomes recorded here and in `reading.md`.
- Boundaries, each with a proof that it fires: the agent cannot import `src/plain/`; only `CriterionText` reads a criterion's words or a rendering; plus every 0005 boundary, unchanged.
