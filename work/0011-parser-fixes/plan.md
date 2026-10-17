# plan: 0011 parser fixes

**Intent:** `work/0011-parser-fixes/intent.md` · **Spec:** `work/0011-parser-fixes/spec.md`
**Branch:** `0011-parser-fixes` (from `main` at `3ddf9b7`; intent `9568515`, corrected `53043e0`; spec `7929fd4`)

---

## Context

The parser collapses toward `clinical`: 22 `patient` and 7 `protocol` labels are typed `clinical`. It drops site-facing sentences: 16 misses, all in NCT04385368. And `normalize()` leaves `\^` and `\&` in what the model reads. Only 84 of 183 patient facts reach the screening agent intact from a parse. The quote-location net has never been shown to fire.

The owner accepted the intent's recommendations in 2026-09, with decision 1's tie-break corrected to exposure versus condition. This plan implements the spec in six stages with four gates.

**Four things the plan relies on:**

- **Nothing in stage A calls a model**, except R1 at its end: a 30-minute local parse of the seven unlabelled studies.
- **Every model call is local oMLX**: `Qwen3.6-35B-A3B-MLX-8bit`, temperature 0, seed 20260921. If a call fails, check `http://127.0.0.1:8000/health` first.
- **No `--spend` and no `.env`.**
- **No new dependency.**

**Baseline, measured before any change:** `npm run check` exits 0, and `npm test` gives 911 tests (904 passed, 7 expected fail) in about 0.77 s.

**Two design points found while planning, both within the spec:**

- **The parse cache key takes the parser's settings explicitly.** Today `readParse` in `evals/screening-runner.ts` builds it from the *agent's* descriptor, which records reasoning off. Once reasoning mode is part of a parse's identity (spec §3.1), that would look for a reasoning-off parse. So:
  - `cacheKey(nctId, parser)` takes `{ model, seed, thinking? }`.
  - Screening and the app pass the agent's model and seed with no `thinking`, which is the parser's default.
- **The grading moves into one exported function.** `runStudy`'s grading and `summarize` become `gradeStudy(nctId, parsed, labels)` in `evals/runner.ts`. The committed-results test re-grades through exactly the code the eval uses.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. Measurement** | 1–9 | no gate | 0003's result re-graded identically from committed parses. The silent-reuse test. Reach 84/66/33/0 reproduced with no run. The adversarial cases. R1's seven "before" parses committed |
| **B. Escapes and noise** | 10–11 | **Gate 1** | No escape survives in the twelve. R2's result, and `eval:compare --noise` on NCT04316364 and NCT04385368 |
| **C. Dev iterations** | 12–15 | **Gate 2** | The rule in ANNOTATION.md. Up to four committed prompt versions, each with its dev result. The overlap list |
| **D. Frozen measurement** | 16–18 | **Gate 3** | R4 on the five and the seven, and R5 with reasoning off. `eval:compare`'s verdicts. Reach, and R6's re-estimated hours |
| **E. Screening from parses** | 19–21 | **Gate 4** | R6's run, `screening:compare --parser`'s verdict and the ungraded rows. `EVAL_RUN` moved, and `test:e2e` passing |
| **F. Documentation and review** | 22–24 | PR | CLAUDE.md, README, roadmap, review passes |

Stage A has no gate. It ends in tests that prove no score moved, and R1 reads the parser exactly as 0003 did. A wrong step there fails a test, not a judgment.

**Gate 1, after R2: does the bar still mean something? (spec §9.2)** NCT04316364 and NCT04385368 got input byte-identical to 0003's.

- **Identical parses:** the gate passes without the owner, and the record says so.
- **Different parses:** each bar line in spec §9.3 is widened by the largest change those two studies show. **The widened bar is the owner's** before stage C starts.

*What it guards:* stage C's iterations are judged against the bar. A bar narrower than the model's own noise would have tuning chase differences the model makes by itself.

**Gate 1a, only if needed: a fifth prompt version (spec §8.2).** The owner's. It's the cap.

**Gate 2, the freeze, before R4: does any line of the prompt read like a case? (spec §12)** the owner reads, in this plan's gate record:

- the diff of `SYSTEM_PROMPT` since `73c3b301c4a9`;
- the `eval:compare --overlap` list;
- the dev results across iterations, one line each.

About ten minutes. *What it guards:* R4 parses the three held-back studies at the new prompt once. Tuning after seeing them means they're no longer held back. **The owner's.** The prompt's author is the worst judge of whether its wording leaked from the corpus.

**Gate 3, before R6: is the parse worth six to seven hours? (spec §12)** The record shows R4's verdict per bar line, reach, and R6's hours re-estimated from the raisable criteria in the frozen parses. **Delegated** when the pooled parser bar is met and the estimate is under ten hours: Claude records the reasoning and starts R6. **The owner's** otherwise, including whether to screen from a parse that missed its bar. *What it guards:* the slice's one long run.

**Gate 4, after R6: are the new findings from parses right, and whose are they? (spec §12)** The record covers, in transcript:

- every confidently wrong finding from parses that isn't in 0009's run;
- every ungraded row (a `clinical` label parsed `patient` and settled).

Each is attributed to parser, agent, simulator, grader or convention. *What it guards:* the README's parse-side claim, written in stage F. **Best read by the owner.** If they delegate it, a Claude subagent that didn't write the prompt reads it, its model and settings are recorded, and the README says the reading isn't independent.

### Steps

Each step is one commit, through `npm run check && git commit ...`. Where a step says "run", the command's output and time go into "Records". No test uses `vi.mock`, `vi.stubGlobal`, `vi.spyOn` or `vi.useFakeTimers`. No commit carries a Co-Authored-By trailer.

**Stage A: measurement**

1. **Commit this plan** as `work/0011-parser-fixes/plan.md`, with the baseline above.

2. **Parse identity and the cache key (spec §3.1, §3.2).**
   - `src/criteria/normalize.ts`: `export const NORMALIZE_VERSION = "1"`, with a comment saying why it's bumped by hand, and which test catches a forgotten bump.
   - `src/criteria/prompt.ts`: `parseIdentity(parser: { thinking?: "off" }): string` returns:
     - `PROMPT_VERSION`;
     - `-n${NORMALIZE_VERSION}` when it isn't `"1"`;
     - `-thinking-off` when set.
   - `src/criteria/types.ts`: `ParsedCriteria.run` gains `normalizeVersion?: string`. `parse.ts` writes it.
   - `src/criteria/index.ts` exports both.
   - `evals/runner.ts`:
     - `parseFileName(nctId, model, identity, seed)` is today's name-building and sanitizing.
     - `cacheKey(nctId, parser: Pick<ModelDescriptor, "model" | "seed" | "thinking">)` = `parseFileName(nctId, parser.model, parseIdentity(parser), parser.seed)`.
     - `runStudy` passes `adapter.descriptor`.
   - `evals/screening-runner.ts`: `readParse` passes `{ model, seed }` from the agent's descriptor, without `thinking`.
   - `scripts/app.ts`: `loadStudies` passes `{ model, seed }` the same way. Fake mode keeps the pinned defaults.
   - Tests:
     - `tests/evals/runner.test.ts`: existing key tests move to descriptors. New: `cacheKey("NCT04385368", pinned)` equals the committed 0003 file name byte for byte. Reasoning off gives a different key.
     - `tests/evals/screening-runner.test.ts:251` writes its parse with the new signature.
     - New `tests/criteria/identity.test.ts`:
       - `parseIdentity({})` is `PROMPT_VERSION` while the version is `"1"`.
       - The **normalization pin**: the sha256 of all twelve fixtures' normalized text, joined in `CORPUS_IDS` order, together with `NORMALIZE_VERSION`, equals a pair written in the test. The failure message says to bump the version.

3. **Screening conversations keyed by their parse (spec §3.3).**
   - `evals/screening-runner.ts`:
     - `conversationKey`'s `versions` gains `parse?: string`. When the source is `parse` and it's given, `parse-${identity}` is added after the reasoning part.
     - `runConversation` passes `{ prompt, simulator, parse: parseIdentity({}) }` for parse conversations.
     - `ScreeningRun` gains `parseIdentity?: string`, set in `buildRun` when `sources` includes `parse`.
   - `scripts/app/eval-run.ts`: `exportReview` passes `parse: run.parseIdentity` for parse conversations. It's undefined for 0004's and 0009's runs, so their names are unchanged.
   - Tests, in `tests/evals/screening-runner.test.ts`:
     - A labels key is unchanged.
     - A parse key with no identity is unchanged.
     - A parse key with an identity differs from both.
     - **Silent reuse:** a cache holds a *complete* conversation under the pre-0011 key (no parse part), and the runner, reading a parse, starts a fresh conversation instead of grading the old one. The test asserts the scripted agent was called.
   - `tests/scripts/review-export.test.ts`: a run recording `parseIdentity` is exported from the keyed files.

4. **Loose quotes, quote counts and reasoning mode recorded (spec §3.4).**
   - `src/criteria/types.ts`: `Criterion` gains `loose?: true`. `src/criteria/parse.ts` sets it from `found.loose`.
   - `evals/runner.ts`:
     - `StudyOutcome.quotes: { rejected; loose }`.
     - `EvalRun` gains `quotes` (pooled), `normalizeVersion`, `parseIdentity`, `thinking: "default" | "off"` and `dev?: true`.
     - `gradeStudy(nctId, parsed, labels)` returns `{ metrics, diagnostics }`, and `runStudy` calls it.
   - `scripts/run-eval.ts` prints the quote counts and the parse identity.
   - Tests:
     - `tests/criteria/parse.test.ts`: a reflowed quote is kept with `loose: true`, and an exact one has no `loose` key.
     - `tests/evals/runner.test.ts`: a run records `quotes`, `thinking: "default"` and `parseIdentity`.

5. **Parses committed, and the committed-results test (spec §3.5).**
   - `.gitignore` loses the `evals/results/parses/` block. The five 0003 parses are added, 122 KB. Biome already checks them, since it has no VCS setting, and they pass.
   - New `tests/evals/committed-results.test.ts`. For every `*.json` under `evals/results/` and `evals/results/dev/` that has `matcher` and `studies`:
     - Locate each graded study's parse by `parseFileName(study, run.model, run.parseIdentity ?? run.promptVersion, run.seed)`.
     - Re-grade it with `gradeStudy` and today's labels.
     - Require every number the committed study states to be reproduced: its `metrics`; the lengths of `missed`, `extra`, `merged`, `typeErrors` and `narrative`; and `quotes` when present. Also the committed `pooled`.
     - A missing parse fails and names the file.
   - The test's time goes into Records.

6. **Reach without a conversation (spec §3.6).**
   - `evals/graders/screening.ts`: extract `parseCategories(parsed, labels, vignette)`, returning the categorised entries without findings. `gradeParseRun` calls it and adds `parsedId`, `status` and the scoring. Its output is unchanged, and `SCREENING_GRADER_VERSION` stays `"4"`.
   - `tests/evals/screening-grader.test.ts`: from the five committed 0003 parses, the labels and the fifteen scored vignettes, the pooled categories are 84 / 66 / 33 / 0, equal to `pooled.parse.categories` in `02-2c46ada9a1d5.json`. That the grader's existing tests pass unchanged is the proof that nothing else moved.

7. **`parse:criteria -- --cache`, `eval -- --dev`, `eval -- --thinking off` (spec §8.1, §9.1, §9.5).**
   - `scripts/parse-criteria.ts`: `--cache` writes each parse to `evals/results/parses/<cacheKey>` and skips a study whose file exists, saying so. It refuses with `--model` other than oMLX, since the cache is the local parser's.
   - `evals/runner.ts`:
     - `PARSER_DEV_STUDIES = ["NCT04385368", "NCT00077350"]`.
     - `EvalOptions.dev` writes the run to `resultsDir/dev/`, with parses still in `resultsDir/parses/`.
   - `scripts/run-eval.ts`:
     - `--dev` selects exactly `PARSER_DEV_STUDIES`. It's refused if NCT IDs are also named, or with `--model` other than oMLX.
     - `--thinking off` passes `thinking: false` to `createAdapter`.
     - Both are in the header comment.
   - `tests/evals/runner.test.ts`: a dev run writes under `dev/` and its parses under `parses/`. `planEval` (or a new pure `readEvalArgs`) refuses `--dev` with NCT IDs.

8. **The adversarial cases (spec §7), except "escape copied back", which needs step 10.**
   - New `tests/criteria/adversarial.test.ts`, using `adapterReturning`/`criterion` helpers like `tests/criteria/parse.test.ts`'s, applied to real trials from `getTrial`.
   - Each case finds its sentence in the study's normalized text and asserts the faithful quote is kept. It then applies its alteration and asserts rejection with `/does not appear in the source/`.
   - The cases: mojibake, full-width comma, `≥`, `ECOG` expanded (NCT00077350), ellipsis, stitched sentences, and another study's words.
   - Must pass: reflowed quotes (loose) and repeated quotes.
   - Eval level: `runEval` with a scripted adapter and a temporary results directory, on NCT03433469, with the mojibake quote. `quotes.rejected` is 1.
   - Known gap: an `it.fails` case where a faithful exclusion quote with backwards `text` is expected to be rejected. Its comment says why nothing catches it.

9. **R1: the seven unlabelled "before" parses (spec §9.1).**
   - Check `/health`, then run `npm run parse:criteria -- <id> --cache` for NCT00106626, NCT00743379, NCT00966472, NCT03377023, NCT03753685, NCT04841811 and NCT07229729, one at a time. 0002 found long batches slow down.
   - A study that times out is retried once alone and recorded.
   - Commit the seven parses (identity `73c3b301c4a9`), with times and criteria counts in Records.

**Stage B: escapes and noise**

10. **The escapes (spec §4).**
    - `src/criteria/normalize.ts`: `ESCAPABLE` gains `^` and `&`, and `NORMALIZE_VERSION` becomes `"2"`. The pin in `tests/criteria/identity.test.ts` is updated with the new hash. That's the pin working as designed, and the commit message says so.
    - `tests/criteria/normalize.test.ts`:
      - `10\^9/L` becomes `10^9/L` and `\&` becomes `&`.
      - **Corpus test:** no fixture's normalized text contains `\` followed by punctuation.
    - `tests/screening/agenda.test.ts`: the four label criteria (NCT00077350 L11 and L13, NCT06728852 L11 and L12) are `lab-value` with both the old and the new text.
    - `tests/criteria/adversarial.test.ts` gains "escape copied back" (NCT06728852).
    - Comments lose the known gap: `evals/screening-input.ts` `fromLabels`, and `tests/evals/runner.test.ts`'s `REAL_QUOTES` note.

11. **R2, the noise run, and `eval:compare` (spec §9.2, §9.4).**
    - New `scripts/eval-compare.ts`, run as `npm run eval:compare` in `package.json`. It reads committed results, parses, labels and vignettes. Its modes: `<before> <after>`, `--noise`, `--overlap` and `--unlabelled <identity-before> <identity-after>`. The bar logic lives in pure exported functions, as `scripts/screening-compare.ts` does:
      - the type-error tallies by direction, pooled, dev and held back, from `diagnostics.typeErrors`;
      - spec §5.2's seven labels, printed apart. The three `clinical`→`patient` ones are excluded from the guardrail line;
      - reach, through `parseCategories`;
      - each line's verdict against spec §9.3.
    - `tests/scripts/eval-compare.test.ts`:
      - Verdicts on constructed results: each line's threshold passes at the bar and fails one past it.
      - The §5.2 exclusion.
      - `--noise` reports identical parses as identical, and one changed type as a difference.
      - `--overlap` finds a planted five-word run.
    - **Run R2:** `npm run eval`, all five, at identity `73c3b301c4a9-n2`. Commit its result and parses. Then run `eval:compare -- --noise <0003> <R2>` and put its output in the gate record.
    - **→ Gate 1.**

**Stage C: dev iterations**

12. **The rule in ANNOTATION.md (spec §5.1, §5.2).** Rule 3's first bullet is replaced with spec §5.1's text, followed by the paragraph and the seven-row table of known exceptions. No label file changes; `git diff -- evals/cases/labels` is empty.

13. **Dev v1: the rule in the prompt (spec §5.3).**
    - `src/criteria/prompt.ts`: the `patient` and `clinical` bullets are rewritten from spec §5.3's draft, with one boundary case (a condition and its treatment together are `clinical`). The comment is corrected.
    - Run `npm run eval -- --dev`. Commit the prompt, the dev result and the dev parses together.
    - Run `eval:compare` against the 0003 result restricted to dev, and check it against spec §9.3's dev bar.

14. **Dev v2 onward: the example block, if needed (spec §5.4).** *Changed at Gate 1: the splitting rule (spec §6) is dropped, so step 14 is the example block alone, and only if v1 misses the dev bar.* What follows is the step as first planned.
    - If v1 misses the dev bar for `patient`→`clinical` or `protocol`→`clinical`, v2 adds spec §5.4's example block.
    - The next version adds spec §6's splitting bullet.
    - If narrative false positives exceed 6 on dev, one further version tightens its second sentence. If that fails too, the bullet is removed in the next version, and the drops are reported unfixed.
    - Each version is one commit: prompt, dev result, dev parses, and a line in Records.
    - Four versions in total at most. A fifth is Gate 1a.

15. **The freeze record.** Run `eval:compare -- --overlap`, and write Gate 2's material into the gate record: the prompt diff since `73c3b301c4a9`, the overlap list, and one line per dev version.
    - **→ Gate 2.**

**Stage D: frozen measurement**

16. **R4: the five and the seven, at the frozen prompt (spec §9.1).**
    - Run `npm run eval`, all five. Then `parse:criteria -- <id> --cache` for the seven, one at a time.
    - Commit the result and all twelve parses.
    - Run `eval:compare -- <0003> <R4>` and `eval:compare -- --unlabelled 73c3b301c4a9 <frozen identity>`. Their output goes to Records.

17. **R5: reasoning off (spec §9.5).** Run `npm run eval -- --thinking off`. Commit the result and parses. Record the wall time beside R4's.

18. **Gate 3's material.**
    - R4's verdict lines and reach.
    - Raisable criteria per parse conversation, from the frozen parses through `initialProgress`.
    - R6's hours, re-estimated as 0009's parse half (5.59 h) × (new raisable ÷ 0009's raisable).
    - **→ Gate 3.**

**Stage E: screening from parses**

19. **R6.**
    - Check `/health`, then run `npm run eval:screening`, both sources.
    - Its output must show the 15 labels conversations as cached and the 15 parse conversations as starting. If any labels conversation shows as starting, stop: its key changed, which spec §4 says can't happen. Record it and investigate before going on.
    - It resumes after interruption.
    - Commit the run file.

20. **`screening:compare -- --parser` (spec §9.3).**
    - `scripts/screening-compare.ts` gains `--parser`, which prints:
      - the parse-side confidently wrong and abstention rates, before and after, pooled, dev and held back;
      - their verdicts;
      - the ungraded rows. These come from the after run's review file, its committed parses (by `parseIdentity`) and the labels, through `matchCriteria`. Parsed ids follow `fromParse`'s `P<n>` order.
    - `tests/scripts/screening-compare.test.ts`: the parser verdict at and past its thresholds, and one ungraded row found from a constructed review file.
    - Run it on 0009's run against R6. Its output goes to Records.

21. **The review repointed (spec §10).**
    - `EVAL_RUN` becomes R6's file. Run `npm run review:export -- <R6>` and commit the review file, with its size in Records.
    - Two places follow `EVAL_RUN`:
      - `REFERENCE_RUN` in `evals/screening-estimate.ts`. `tests/evals/screening-estimate.test.ts` already requires it to match, and the paid-run estimate's call counts then come from R6.
      - `EVAL_RUN_NOTE` in `src/web/review.ts` becomes "From 0011's eval run. …". No test or browser spec pins the old words.
    - The review's flip test and `tests/scripts/app-eval-run.test.ts` run over the new run unchanged.
    - Run `npm run test:e2e` and record the pass count.
    - Write Gate 4's material into the gate record.
    - **→ Gate 4.**

**Stage F: documentation and review**

22. **CLAUDE.md and README (spec §11.1, §11.2).**
    - CLAUDE.md: the commands table (`eval -- --dev` and `--thinking off`; `parse:criteria -- --cache`; `eval:compare`; `screening:compare -- --parser`), the committed-parses rule and the parse part of conversation keys.
    - README: every number with model, quantization, temperature, seed, reasoning mode, parse identity and matcher version.

23. **ROADMAP (spec §11.3).** 0011 is marked done. The seven carried-forward rows are closed or re-placed, and "Carried forward from 0011" is added.

24. **Review passes.** The five passes of `REVIEW.md` go into this plan under "Review passes", with a fresh-clone `npx vitest run` in the scratchpad and `git diff main` over the untouched paths. Then the PR, with `test:e2e`'s count and every gate's outcome. It says who read Gate 4, and states any skipped gate.

---

## Files that change

**New:**
- `scripts/eval-compare.ts`
- `tests/criteria/identity.test.ts`, `tests/criteria/adversarial.test.ts`, `tests/evals/committed-results.test.ts`, `tests/scripts/eval-compare.test.ts`
- `evals/results/parses/*.json`: 0003's five, R1's seven, R2's five, the dev versions', R4's twelve and R5's five
- `evals/results/<R2>.json`, `<R4>.json`, `<R5>.json`, `evals/results/dev/*.json`
- `evals/results/screening/<R6>.json`, `evals/results/screening/review/<R6>.json`
- `work/0011-parser-fixes/plan.md`

**Modified:**
- `src/criteria/normalize.ts`, `prompt.ts`, `parse.ts`, `types.ts`, `index.ts`
- `src/web/review.ts` (`EVAL_RUN_NOTE` only), `evals/screening-estimate.ts` (`REFERENCE_RUN` only)
- `evals/runner.ts`, `evals/screening-runner.ts`, `evals/screening-input.ts` (comment), `evals/graders/screening.ts` (extraction only), `evals/cases/ANNOTATION.md`
- `scripts/run-eval.ts`, `scripts/parse-criteria.ts`, `scripts/app.ts`, `scripts/app/eval-run.ts`, `scripts/screening-compare.ts`
- `tests/evals/runner.test.ts`, `tests/evals/screening-runner.test.ts`, `tests/evals/screening-grader.test.ts`, `tests/criteria/parse.test.ts`, `tests/criteria/normalize.test.ts`, `tests/screening/agenda.test.ts`, `tests/scripts/review-export.test.ts`, `tests/scripts/screening-compare.test.ts`
- `.gitignore`, `package.json`, `CLAUDE.md`, `README.md`, `work/ROADMAP.md`
- `data/plain/NCT00077350.json`, `data/plain/NCT06728852.json` (four `textSha` values, step 10)

**Not touched, checked with `git diff main` at step 24:** `src/screening/`, `src/plain/`, `src/models/`, `src/server/`, `src/transport/`, `src/web/` apart from `EVAL_RUN_NOTE`, `evals/participant/`, `evals/graders/match.ts`, `evals/graders/metrics.ts`, `evals/cases/labels/`, `evals/cases/vignettes/`, `data/trials/`, `tests/web/review.test.ts`.

## Reused, not rebuilt

- `locateQuote`'s existing `loose` (`src/criteria/locate.ts`), now kept.
- `matchCriteria`, `scoreStudy` and `poolMetrics` (`evals/graders/`) regrade committed parses, unchanged.
- The categorisation in `gradeParseRun`, extracted as `parseCategories`.
- `createAdapter`'s existing `thinking` option (`src/models/factory.ts`), for R5.
- `conversationKey`'s versions argument from 0009, widened by one optional field.
- `exportReview`, `reviewText` and `loadEvalRun` (`scripts/app/eval-run.ts`) for R6's review file.
- `screening:compare`'s verdict pattern (pure functions, a flag per block) for `--parser`, and as the model for `eval:compare`.
- `fromParse`'s `P<n>` ids and `initialProgress`/`raisability` for the raisable count.

## Risks

- **R2 isn't reproducible.** oMLX at temperature 0 with a seed may still differ between runs. Gate 1 exists for exactly this, and a widened bar is the owner's.
- **The prompt doesn't reach the bar in four versions.** The fallback order is fixed (§5.4, then §6). Past four, it's Gate 1a. If the bar is still missed at the freeze, Gate 3 is the owner's, and the README reports the miss.
- **Following the rule creates new `clinical`→`patient` errors on the three exposure labels in spec §5.2.** They're excluded from the guardrail before any run, and printed apart.
- **The splitting rule raises narrative false positives.** One tightening, then removal, per spec §6.
- **Long runs slow down.** 0002 saw a fourfold slowdown. Studies are parsed one at a time, and a timeout is retried alone and recorded. R6 resumes after interruption, and two connection failures stop it with a `/health` hint.
- **A labels conversation re-runs in R6.** That would mean its key changed. Step 19 stops and investigates rather than letting it run.
- **`npm test` time.** Re-grading about 20 committed results is matching only: 0003's grading took 11 ms. Recorded at steps 5 and 24, against 0.77 s.
- **Repository growth.** About 1 MB of parses and a review file of about 1.8 MB. Sizes are recorded.

## Verification

- `npm run check` at every commit, and commits only through `npm run check && git commit`.
- Step 5: 0003's result is reproduced from committed parses. Step 6: 0009's reach is reproduced. Both run in `npm test`, from then on.
- Step 3's silent-reuse test fails on `main`'s code, checked by stashing the runner change once. Recorded.
- Fresh clone at step 24: `npx vitest run` passes, and `npm run app -- --fake --source parse` lists all five studies.
- `npm run test:e2e` at step 21 and step 24.
- `git diff main` over the untouched paths is empty at step 24. `git diff -- evals/cases/labels` is empty throughout.
- No command run with `--spend`, and `.env` untouched.

## Records

(Filled in as steps land: run times, counts, sizes, and anything that diverged from this plan, with the plan and spec updated in the same commit.)

- **Step 2.**
  - The old-name test pins `parseFileName(nctId, model, "73c3b301c4a9", seed)` rather than `cacheKey` with today's settings. `cacheKey` stops producing that name the moment the prompt changes at step 13, and the committed parse still has to be found by it.
  - The normalization pin's hash is the first 16 hex characters of sha256 over the twelve fixtures normalized, in `CORPUS_IDS` order, each followed by a NUL: `9ced32a44c9dbb05` at version `"1"`.
- **Step 3.** The silent-reuse test was run once with the key's parse part removed from `conversationKey`. It failed ("does not take a finished conversation from an older parse"), as did the key test. It passes with the part in place.
- **Step 4.** `EvalOptions.dev`, which writes a run to `dev/`, landed here rather than at step 7, because `EvalRun.dev` is recorded by `buildRun`. Step 7 kept the command-line side.
- **Step 5.** The five 0003 parses total 128 KB on disk. `tests/evals/committed-results.test.ts` adds 6 tests; `npm test` 933 tests in 0.74 s, against 0.77 s at the baseline.
- **Step 6.** Reach from the committed parses: 84 / 66 / 33 / 0, equal to 0009's run file.
- **Step 7.** The `planEval` tests went into `tests/scripts/model-flags.test.ts`, where `planEval` was already tested, not `tests/evals/runner.test.ts`.
- **Step 9, R1.** The seven unlabelled studies at identity `73c3b301c4a9`, one process each, 1,038 s in all (17.3 min). No failures.

  | Study | Time | Criteria | clinical / patient / protocol | Rejected | Unclaimed spans | Source coverage |
  | --- | --- | --- | --- | --- | --- | --- |
  | NCT00106626 | 78 s | 18 | 7 / 11 / 0 | 0 | 0 | 94% |
  | NCT00743379 | 412 s | 114 | 73 / 41 / 0 | 0 | 1 | 89% |
  | NCT00966472 | 79 s | 30 | 17 / 13 / 0 | 0 | 0 | 97% |
  | NCT03377023 | 206 s | 56 | 49 / 5 / 2 | 0 | 0 | 98% |
  | NCT03753685 | 60 s | 24 | 19 / 5 / 0 | 0 | 0 | 93% |
  | NCT04841811 | 166 s | 30 | 14 / 15 / 1 | **1** | 3 | 92% |
  | NCT07229729 | 37 s | 13 | 10 / 3 / 0 | 0 | 0 | 93% |

  **The quote-location net fired on a real parse, for the first time in the project.** NCT04841811: the model quoted "…currently suffering from mental disorders, etc . ." where the source reads "etc. .". It inserted a space where there was none, which the loose match doesn't allow, so the quote was rejected and its criterion dropped. 0002's 481 criteria had no rejection; this parse of the same prompt does, on a study 0002 also parsed.
- **Step 10.**
  - `NORMALIZE_VERSION` is typed `string`: as a literal `"2"`, TypeScript rejected comparing it with `"1"`. The new pin: version `"2"`, corpus `6f0216de6bb183ed`.
  - **Not in the plan: four plain renderings re-hashed.** `data/plain/` keys each rendering by the hash of the criterion's normalized text, so NCT00077350 L11 and L13 and NCT06728852 L11 and L12 went stale, and `tests/plain/files.test.ts` failed four tests. `npm run plain:render -- NCT00077350` and `-- NCT06728852` re-rendered only those four, on the local model (7.1, 6.4, 5.6 and 8.8 s, first try each). The plain sentences came out identical to the committed ones, so the diff is four `textSha` lines. Spec §4 corrected in this commit. `data/plain/` joins the files that change.
- **Step 11, R2.** All five labelled studies at identity `73c3b301c4a9-n2`, 722 s. No failures, 0 quotes rejected, 3 matched loosely. The result is `evals/results/02-73c3b301c4a9.json`.
  - `eval:compare` checked against 0003's result compared with itself: the fault lines fail and every pooled guardrail passes. That's how spec §9.3's subset guardrails were found to fail at baseline (step 10).
  - `eval:compare -- --overlap` on 0003's own prompt finds two five-word runs, both from NCT03433469: the prompt's alternation example "exon 19 deletion, T790M, or L858R" is that study's wording. That contradicts the prompt's own comment, and NCT03433469 is held back. Flagged for Gate 2.

- **Step 13, dev v1** (prompt `88c050f35c4c`, identity `88c050f35c4c-n2`), 406 s. `evals/results/dev/01-88c050f35c4c.json`. Against R2, dev:
  - `patient`→`clinical` **18 → 4 (bar ≤ 8, met)**;
  - `clinical`→`patient` less the §5.2 three 0 → 2 (≤ 2, met). The two are NCT00077350 L16 and NCT04385368 L74;
  - reported for NCT04385368: `protocol`→`clinical` 13 → 4, misses 2 → 0, precision 0.783 → 0.872, narrative false positives 14 → 2;
  - **guardrails not met on NCT00077350:** merge rate 0.135 → 0.297, strict recall 0.865 → 0.703. NCT04385368 bundled far more as well, merge rate 0.09 → 0.45 (not judged).
  - The bundles are lists joined by "or": "pregnant or breastfeeding", "myocardial infarction, symptomatic congestive heart failure, unstable angina…".
  - **Cause, most likely mine.** v1 replaced the leaked alternation example "exon 19 deletion, T790M, or L858R", one test with several acceptable answers, with "a deletion in gene A, or a point mutation in gene B or C", two different findings joined by "or". The prompt calls an alternation one criterion, so the new example licensed bundling any "or" list.
  - The quote-location net fired again on a real parse: NCT00077350, a quote stitched from two criteria ("…for advanced disease; patients must not have received prior gemcitabine…").
- **Step 14, dev v2.** Fixes v1's regression rather than adding §5.4's example block: the alternation example becomes one test with several acceptable answers again, in invented wording. This is a divergence from step 14 as planned, where v2 was the example block if `patient`→`clinical` missed its bar. It didn't miss it.
  - **Dev v2 result** (prompt `e5c030d1a7aa`, 342 s, `evals/results/dev/02-e5c030d1a7aa.json`). Against R2, dev:
    - `patient`→`clinical` 18 → **15 (bar ≤ 8, not met)**;
    - every guardrail met: NCT00077350's merge rate back to 0.135, strict recall 0.865;
    - reported for NCT04385368: `protocol`→`clinical` 13 → 5, misses 2 → 7, precision 0.907, narrative false positives 2.
  - **The collapse on NCT04385368 flips as a block.** v1 typed its exclusion block L57–L69 (prior treatments, vaccines, trial participation) `patient`. v2, whose only change from v1 is the alternation example, typed the same block `clinical` again, 13 labels at once. So `patient`→`clinical` on that study isn't stable under a small prompt change, though it moved by only 1 on identical input at Gate 1. Brought to the owner before v3.
- **Step 14, dev v3** (prompt `e1e694b399d4`, spec §5.4's example block), 343 s. `evals/results/dev/03-e1e694b399d4.json`. Against R2, dev, on one sample of NCT04385368:
  - `patient`→`clinical` 18 → 3 (≤ 8, met);
  - `clinical`→`patient` 0 → 2 (≤ 2, met);
  - **NCT00077350's merge rate 0.135 → 0.270 and strict recall 0.865 → 0.730, not met**;
  - reported for NCT04385368: `protocol`→`clinical` 3, misses 23, precision 0.911, narrative false positives 2.
  - NCT00077350's merge rate across versions: 0.297 (v1), 0.135 (v2), 0.270 (v3). It flips with small prompt changes too.
- **A mistake: the three held-back studies were parsed at dev prompt v3.** The loop meant to run NCT04385368's samples 2 and 3 passed its flags as one unquoted zsh variable. zsh doesn't split one into words, so `npm run eval` got `--dev NCT04385368 --sample 2` as a single argument, matched no flag, and ran its default: all five labelled studies at sample 1.
  - NCT00077350 and NCT04385368 were cached from the dev run. NCT03433469, NCT04316364 and NCT06728852 were parsed at v3 (379 s), and their result is `evals/results/03-e1e694b399d4.json`. The loop's third call found everything cached and wrote a duplicate result, which was deleted. No sample 2 or 3 was made.
  - **What was seen:** the log printed each held-back study's coverage, strict recall and merge rate, and pooled type accuracy (0.91). Their type errors weren't opened before the freeze decision.
  - **Decision: the owner, 2026-09, "Freeze v3, disclose".** No further prompt versions, so the held-back numbers can't steer the prompt. NCT04385368's samples 2 and 3 are run properly. The merge guardrail is reported as failed and unstable across versions. R4 reuses the three held-back parses already made at v3, and the README says they were made, and their summaries seen, before the freeze.
  - A multi-word argument list now goes to the shell as an array or written out, never as one unquoted variable.
- **v3's samples 2 and 3 of NCT04385368** (191 s and 160 s; `evals/results/dev/2026-09144818-…` and `…145129-…`). All three parses are **byte-identical**, 45 criteria each: same-day repeats of identical input give the same parse. So the 0003 → R2 difference (Gate 1) may come from the runtime changing between 2026-09 and 2026-09, not from sampling. oMLX's `/health` reports no version, so this can't be checked.
  - By the median of three, dev `patient`→`clinical` is **18 → 3 (≤ 8, met)**. NCT04385368 gives 1 in each sample.
  - **NCT04385368 misses 23 labels at v3**, every time: 13 `protocol`, 6 `clinical`, 4 `definitional`. 0003 missed 16 and R2 missed 2. The six `clinical` include L14 (resectability by multidisciplinary evaluation), L18, L24 and L56. Gate 1 made misses reported, not judged.
  - `eval:compare --noise` crashed on a one-study sample result. It now compares only studies both results parsed, and the widening skips the rest, with a test.
- **R4 on the five labelled studies** is `evals/results/03-e1e694b399d4.json` with NCT04385368's samples (Gate 2). Against R2, `npm run eval:compare -- … --samples …`:
  - pooled `patient`→`clinical` 25 → 9 (≤ 12, met);
  - reach 72 → 120 (≥ 110, met);
  - `clinical`→`patient`, less the §5.2 three, 1 → 3 (≤ 2, not met): NCT00077350 L16 and NCT03433469 L73, both typed so in 0003 too, and NCT04385368 L74, new;
  - held-back narrative false positives 0 → 2 (not met), both in NCT03433469: a heading turned into a criterion, and an exception narrowing another;
  - held back `patient`→`clinical` 7 → 6 (≤ 5, not met);
  - merge rate less NCT04385368 0.275 → 0.180, strict recall 0.725 → 0.820.
- **Stopped here: the owner, 2026-09** ("this is a PoC and I feel we have lost our way"). R4's unlabelled half was stopped after one of seven studies. That partial parse was deleted, since no result depends on it. R5 (reasoning off), Gate 3, R6 (screening from parses, 6–7 h), steps 20–21 (`screening:compare --parser`, `EVAL_RUN` repointed) were not done. Gate 4 had nothing to read. `EVAL_RUN` still names 0009's run. Steps 22–24 (documentation, review passes) were done.
## Gate record

(Gates 1–4, and 1a if reached: the material shown, who decided, and the decision.)

### Gate 1: noise (after R2), 2026-09

`npm run eval:compare -- 01-73c3b301c4a9.json 02-73c3b301c4a9.json --noise`:

- **NCT04316364: identical**, criterion by criterion.
- **NCT04385368: 42 differences**, from byte-identical input, the same prompt, model, temperature 0, seed 20260921 and default reasoning. 0003's parse had 63 criteria. R2's splits and keeps much more of the site-facing prose.

Largest change per bar quantity across the two studies, which is spec §9.2's widening:

| Quantity | Change |
| --- | --- |
| `patient`→`clinical` | 1 |
| `protocol`→`clinical` | 7 |
| `clinical`→`patient` | 0 |
| misses in NCT04385368 | 14 (16 → 2) |
| precision | 0.106 |
| narrative false positives | 8 (6 → 14) |
| merge rate | 0.068 |

R2 against 0003, pooled:

- `patient`→`clinical` 22 → 25, `protocol`→`clinical` 7 → 14, misses 16 → 2;
- reach 84 → 72;
- precision 0.949 → 0.902, narrative false positives 6 → 14.

R2 also showed that a trivial input change moves one study: NCT00077350's `patient`→`clinical` went from 2 (L3, L35) to 6 (adding L4, L14, L33, L34) when its only change was `mm\^3` becoming `mm^3`.

**Decision: the owner, 2026-09: "Target the stable fault".**
- `patient`→`clinical` is judged, widened by 1: pooled ≤ 12, dev ≤ 8, held back ≤ 5. Reach ≥ 110.
- R2 is the before.
- NCT04385368's misses, `protocol`→`clinical`, precision and narrative false positives are reported, not judged, and the guardrails leave that study out.
- The splitting rule (spec §6) is dropped.

Spec §6 and §9.3 are amended, and `eval:compare` implements the new bar.

### Gate 1a: how later dev versions are judged (after dev v2), 2026-09

NCT04385368's exclusion block, 13 labels, flipped between `patient` and `clinical` as a unit from v1 to v2, whose only difference is the alternation example. Dev `patient`→`clinical` went 4 in v1, 15 in v2.

**Decision: the owner, "Example block, 3 runs".**
- v3 adds spec §5.4's example block.
- From v3 on, each version is judged on NCT04385368 parsed three times, plus NCT00077350 once. NCT04385368's `patient`→`clinical` and reach count by the median.
- R4 parses NCT04385368 three times too, and the README reports the spread.
- New: `npm run eval -- --dev NCT04385368 --sample N` caches a repeat beside the first. `eval:compare -- <before> <after> --samples <s2> <s3>` judges by the median.
- A version now costs about 20 minutes instead of 7.


### Gate 2: the freeze (after dev v3), 2026-09

**The prompt** (`e1e694b399d4`) against 0003's (`73c3b301c4a9`), in `SYSTEM_PROMPT`:

1. The `patient` bullet: "who the participant is, what they have done or had done to them, and what they will agree to: age, treatments and medications received or taken now, surgery, radiation, transfusions, vaccines, taking part in other studies, allergic reactions to drugs, pregnancy, breastfeeding, smoking, ability to travel, willingness to consent. These are "patient" even when a medical record would also show them."
2. The `clinical` bullet: "a condition, diagnosis, symptom, test result, measurement or clinician's assessment: [the 0002 examples], a past stroke, asthma. These are "clinical" even when the participant may know them."
3. A boundary case: a condition joined with its treatment is `clinical`; the condition decides.
4. The alternation example: "exon 19 deletion, T790M, or L858R" (NCT03433469's own words) became "blood group A, B, or AB".
5. A worked example: six invented exclusions and their JSON. Three are exposures typed `patient` (an experimental medicine in the past two months, being in another interventional trial, an allergic reaction to a penicillin antibiotic), two `clinical` (chronic kidney disease, hemoglobin under 10 g/dL), and one site obligation typed `protocol`.

**`eval:compare -- --overlap`:** 0 runs of five words shared with any of the twelve protocols. 0003's prompt had 2, both from NCT03433469. None of the example's terms (penicillin, kidney disease, serum aliquot, interventional trial, experimental medicine) appears in the five labelled studies.

**Dev, against R2 (18 `patient`→`clinical` on dev):**

| Version | Change | `patient`→`clinical` (≤ 8) | NCT00077350 merge rate (≤ 0.155) | NCT04385368 misses (reported) |
| --- | --- | --- | --- | --- |
| v1 `88c050f35c4c` | the rule | 4 | 0.297, not met | 0 |
| v2 `e5c030d1a7aa` | alternation example fixed | 15, not met | 0.135 | 7 |
| v3 `e1e694b399d4` | worked example | 3, median of 3 samples | 0.270, not met | 23 |

**What the owner is asked:** does any line read like a case from the corpus rather than a rule? Freezing v3 was decided at Gate 1a's follow-up ("Freeze v3, disclose"). This gate is the wording check, and it notes the two regressions v3 carries: NCT00077350's bundling and NCT04385368's 23 misses.

**Decision: the owner, 2026-09: "Wording fine, go to R4".**
- v3 (`e1e694b399d4`) is frozen.
- R4's labelled half is `evals/results/03-e1e694b399d4.json`, the result the mistaken run made at v3, with NCT04385368's samples 2 and 3 beside it. Running `npm run eval` again would read the same cached parses and write a duplicate.
- The bundling and the misses are reported as regressions of the frozen prompt.
## Review passes

Run at step 24, 2026-09, on `0011-parser-fixes`.

**Checks run.**
- `npm run check` exits 0: 1,010 tests (1,002 passed, 8 expected fail), about 0.8 s.
- A fresh `git clone` of the branch into the scratchpad, with `node_modules` symlinked, passes `npx vitest run`: 67 of 67 files, the same 1,010.
- `npm run test:e2e` passes, 9 of 9, in 12.7 s.
- `--source parse` finds a committed parse for all five labelled studies at the frozen prompt.
- `git diff main` is empty over `src/screening/`, `src/plain/`, `src/models/`, `src/server/`, `src/transport/`, `src/web/`, `evals/participant/`, the matcher, the metrics, the labels, the vignettes, `data/trials/`, `tests/web/review.test.ts` and `tests/boundary.test.ts`.

**Pass 1, plan compliance.**
- *Important, fixed:* the stop record first said `test:e2e` wasn't required because `EVAL_RUN` didn't move. `scripts/app.ts` and `scripts/app/eval-run.ts` changed at steps 2 and 3, and both are on CLAUDE.md's list, so it was required. It ran and passed; the record is corrected.
- *Important, recorded:* every divergence from the plan is in Records or the gate record:
  - four plain renderings re-hashed (step 10);
  - the runner's dev option moved to step 4;
  - dev v2 fixing v1's regression instead of adding the example block;
  - the sampling plumbing added at Gate 1a;
  - the splitting rule dropped at Gate 1;
  - the stop after R4's labelled half.
- *Nit:* "Files that change" still lists R5's and R6's outputs, which were never made. The stop record says so.

**Pass 2, correctness.**
- *Important, recorded:* the held-back studies were parsed at a dev prompt by a shell mistake, and their summaries were seen before the freeze. It's disclosed in the plan, the README and the roadmap, and nothing was tuned afterwards.
- *Checked:*
  - 0009's conversation keys and 0003's parse file names are unchanged; tests pin both.
  - A labels conversation's key can't take a parse part.
  - `--noise` and the widening now skip a study only one result parsed, with a test.
- *Nit:* `renderUnlabelled` assumes the pinned model and seed. That's fine for this repository, and it's stated in the script.

**Pass 3, scope and data discipline.** No findings. No patient data: the adversarial cases and the worked example are invented or taken from published protocols. No network beyond loopback oMLX. No secrets, and `.env` untouched. No `--spend`.

**Pass 4, eval integrity.**
- *Important, recorded:* the bar moved twice:
  - once before any new-prompt run, the subset guardrails that failed at baseline (spec §9.3);
  - once at Gate 1, by the owner, after R2 showed noise.

  Both are in the spec with their reasons.
- *Recorded:* tests that changed in the open, each with its reason:
  - the key tests moved to descriptors (a signature change);
  - the `--dev` refusal changed from "any study list" to "a held-back study" (Gate 1a's samples need a dev study named);
  - the normalization pin was updated with the version, as it's designed to be.

  No test was loosened to pass unchanged code.
- *Checked:* every reported number records model, quantization, temperature, seed, reasoning mode, parse identity and matcher version, and every committed parser result is re-graded by `npm test`.
- *Nit:* the held-back line (7 to 5) is smaller than the input-perturbation noise R2 showed. The README says so.

**Pass 5, documentation.**
- The README's 0011 table and claims match `eval:compare` on the committed results.
- The README says the parse-side screening numbers are from 0003's parser, and that nobody has screened from 0011's.
- The stale limitations (`\^`, the net never having fired, `--source parse` from a fresh clone) are removed or rewritten.
