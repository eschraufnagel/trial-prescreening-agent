# spec: 0011 parser fixes

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0011-parser-fixes/intent.md`

---

## 1. Summary

First, the measurement is made able to see a parser change, with no model call:

- A parse's identity covers everything the model is shown: the prompt, a normalization version and reasoning mode.
- The parse cache is keyed by that identity, and so is every screening conversation made from a parse.
- Each parse keeps which quotes matched loosely, and the eval counts rejected and loose quotes.
- Parses are committed, and a test re-grades every committed parser result from them.

Then the three faults are fixed, in order:

1. `normalize()` unescapes `^` and `&`.
2. The type definitions state the rule the labels follow: what was done to or by the person is `patient`, and a condition or diagnosis is `clinical`.
3. A splitting rule keeps sentences that qualify a criterion or instruct the site.

Adversarial cases, replayed through `parseCriteria`, prove the quote-location net fires, and a known-gap test names what it can't catch.

The prompt is tuned on NCT04385368 and NCT00077350, at most four versions. It is then frozen and measured once on all five labelled studies and the seven unlabelled ones. Screening from parses runs once, 15 conversations, beside 0009's 15 from labels, which are resumed rather than re-run. `EVAL_RUN` names that run. The agent, simulator, vignettes, labels, matcher and grader don't change. Local model only.

## 2. Decisions taken before this spec

The owner accepted the intent's recommendations in 2026-09. Decision 1's tie-break was corrected the same day, before this spec. The intent had said the labels let the person win whenever both a person and a chart could answer. Reading all 252 showed they don't, and the owner chose the exposure-versus-condition rule (§5).

| # | Decision | Consequence here |
| --- | --- | --- |
| D1 | Measurement first, then escapes, collapse, drops. Merge rate a guardrail | §3, §4, §5, §6 |
| D2 | Adversarial cases replayed through the parse path, plus a known-gap test | §7 |
| D3 | Noise run, dev iterations, frozen run, reach, one screening run. Bar fixed now | §9 |
| D4 | Dev NCT04385368 and NCT00077350; three held back; at most four versions; wording rules | §8 |
| D5 | Reasoning mode unchanged and recorded; one side run with it off | §3.4, §9.5 |
| D6 | Parses committed, and re-graded by a test | §3.5 |
| D7 | `EVAL_RUN` names the new run | §10 |

The intent's eight open questions are answered here:

| Intent question | Answer | Section |
| --- | --- | --- |
| 1. The tie-break sentence and contradicting labels | Exposure versus condition. 7 of 198 labels contradict it, plus one borderline, listed | §5.1, §5.2 |
| 2. The splitting rule | One rule in the prompt's Splitting section, no example unless dev needs one | §6 |
| 3. How parse conversations are keyed | A `parse-<version>` part, added only when the run records a parse version. 0009's keys are unchanged | §3.3 |
| 4. What the cache key hashes | `PROMPT_VERSION` as now, plus a hand-bumped `NORMALIZE_VERSION` pinned by a corpus test, plus reasoning mode when set | §3.1 |
| 5. The adversarial fixtures | Built in the test from each trap study's own normalized text: the faithful quote must locate, the altered one must not | §7 |
| 6. The bar | §9.3, fixed now. The noise run can widen it only at a gate | §9.2, §9.3 |
| 7. The label-free check | `npm run eval:compare -- --unlabelled`: criteria, types, unclaimed characters, rejected and loose quotes per study | §9.4 |
| 8. The README | §11.2 | §11.2 |

## 3. Measurement first

No step here changes a score. Every one is proved by re-grading 0003's parses and getting 0003's result.

### 3.1 A parse's identity

- **`NORMALIZE_VERSION`**, a string constant in `src/criteria/normalize.ts`. It is `"1"` for today's behaviour and becomes `"2"` with §4. It is bumped by hand.
- A test stops a forgotten bump. It hashes the normalized text of all twelve fixtures and compares the pair (version, hash) with a pair written in the test. If the normalized output changes and the version doesn't, the test fails, and its message says to bump the version.
- **`parseIdentity(descriptor)`**, in `src/criteria/prompt.ts`, returns the string that names what the model was shown:
  - `PROMPT_VERSION`;
  - then `-n<NORMALIZE_VERSION>` unless the version is `"1"`;
  - then `-thinking-off` when the descriptor records reasoning off.

  0003's parses have identity `73c3b301c4a9`, exactly as their file names already say.
- **`ParsedCriteria.run` gains `normalizeVersion`**. It's optional in the type, and absent means `"1"`, so 0003's committed parses stay valid.

### 3.2 The parse cache key

`cacheKey` in `evals/runner.ts` becomes `[nctId, model, parseIdentity(descriptor), seed]`. For 0003's parses it produces today's file names byte for byte, and a test pins that with one real name. `readParse` in `evals/screening-runner.ts` and the parse loader in `scripts/app.ts` use the same function, so the three can't drift.

### 3.3 Screening conversations made from a parse

- **`ScreeningRun` gains `parseIdentity?: string`**, written whenever the run includes parse conversations. It's the identity of the parses read. A run whose parses have mixed identities is refused before any conversation starts.
- **`conversationKey` gains an optional `parse` field in its `versions` argument.** A conversation from a parse whose identity is given adds a part `parse-<identity>` after the seed and reasoning parts. Labels conversations never get one.
- **The runner always passes it** for a parse conversation, so every new parse conversation's key names its parse.
- **The loader in `scripts/app/eval-run.ts`** passes the run's recorded `parseIdentity` when there is one. A run recorded before 0011 has none, so 0009's and 0004's files are found under the names they already have. That's 0009's §7.1 principle again: a run is found by what it recorded.
- **Tests:**
  - A labels key is unchanged.
  - A parse key with no recorded identity is unchanged.
  - A parse key with an identity differs from both.
  - The runner, given a cache holding a finished conversation under the pre-0011 key, starts a new one when the parse has a different identity. That's the silent reuse the intent found, as a test.

### 3.4 What a parse and an eval result record

- **`Criterion` gains `loose?: true`**, set when `locateQuote` matched only after allowing whitespace to differ. It's absent otherwise, so 0003's parses are unchanged.
- **`StudyOutcome` gains `quotes: { rejected: number; loose: number }`**, and `EvalRun` gains the pooled sum. These are counts of what the parse already holds. They aren't metrics, so `StudyMetrics` and `PooledMetrics` don't change.
- **`EvalRun` gains `normalizeVersion`** and **`thinking: "default" | "off"`**. Written out, so "default" is on the record rather than implied by a missing field. `describeSettings` already prints `thinking default`. The README says what default means for the pinned model: the chat template's reasoning on (see `src/models/omlx.ts`).

### 3.5 Committed parses, re-graded by a test

- **`.gitignore` loses `evals/results/parses/`.** The five 0003 parses are committed in the step that makes this change, and every parse this slice makes is committed with the result that used it.
- **`tests/evals/committed-results.test.ts`.** For every parser eval result committed under `evals/results/` and `evals/results/dev/`, it re-grades each graded study from its committed parse with today's matcher, and requires every number the result states to be reproduced:
  - the metrics;
  - the diagnostics' counts of missed, extra, merged, type errors and narrative;
  - the quote counts, when the result has them.

  Numbers a result doesn't state are skipped, so 0003's result passes as it is. If the matcher changes, the test fails, which is the point: the ruler moved.
- **The rule, written in CLAUDE.md:** a parse that a committed result depends on is committed in the same change. The test enforces it, since a missing parse fails it.

### 3.6 Reach without a conversation

- **`parseCategories(parsed, labels, vignette)`** is extracted from `gradeParseRun` in `evals/graders/screening.ts`. It returns the per-label categories: `scored`, `mis-typed`, `bundled` and `missed-upstream`.
- `gradeParseRun` calls it, so its output is identical and `SCREENING_GRADER_VERSION` stays `"4"`.
- A test reproduces 0009's pooled parse categories, 84, 66, 33 and 0, from the committed 0003 parses, labels and vignettes, with no run file read.
- That lets reach be computed for a new parse before any screening run (§9.4).

## 4. The escapes

- `ESCAPABLE` gains `^` and `&`. `NORMALIZE_VERSION` becomes `"2"`.
- **Corpus test.** For each of the twelve fixtures, normalized text contains no backslash followed by punctuation. The next escape the registry emits fails a test instead of reaching the model.
- **Label-side test.** For the four label criteria whose text changes (NCT00077350 L11 and L13, NCT06728852 L11 and L12), `raisability` is `lab-value` with both the old and the new text. So no model call from labels changes.
- **What stays.** `src/plain/extract.ts`'s `prepare()` keeps its own unescaping. The comment on `fromLabels` in `evals/screening-input.ts` loses its "known gap".
- **Plain renderings.** *Corrected at step 10.* This spec first said 0006's renderings don't change. They are keyed by a hash of the criterion's text as `fromLabels` gives it, which is normalized, so the four label criteria above went stale, and `tests/plain/files.test.ts` failed. `npm run plain:render` re-renders stale criteria only. Run for NCT00077350 and NCT06728852 (4 criteria, 28 s, the renderer's pinned settings), it produced the same four plain sentences word for word. Only their hashes changed.
- **Parser input changes** for five of the twelve studies. Among the labelled five, that's NCT00077350, NCT03433469 (the `\&`) and NCT06728852.

## 5. The tie-break

### 5.1 The rule, in ANNOTATION.md

Rule 3's first bullet is replaced with:

> - A **fact about the person** is `patient` or `clinical` by what kind of fact it is, not by who happens to know it.
>   - **`patient`:** who they are (age, sex), what has been done to them or by them, and what they will agree to. Treatments, medications, radiation, surgery, transfusions, vaccines, participation in other studies, allergic reactions to drugs, pregnancy and breastfeeding, habits such as smoking, and consent or willingness. These are `patient` even when a chart would also record them.
>   - **`clinical`:** a condition, diagnosis, symptom, test result, measurement or clinician's assessment. These are `clinical` even when the person knows them, because a coordinator confirms them against the chart.
>   - When one criterion joins the two, a condition and the treatment of it, the condition decides, and it is `clinical`.

Below it, a short paragraph says the rule was written in 0011 to describe labels made in 0003, and lists the labels in §5.2 as known exceptions, left as labelled.

### 5.2 The labels it contradicts

Checked against all 61 `patient` and 137 `clinical` labels. 191 follow the rule. These 7 don't, and they aren't changed.

| Label | Labelled | By the rule | Text |
| --- | --- | --- | --- |
| NCT00077350 L35 | patient | clinical | clinical history of G6PD deficiency |
| NCT03433469 L20 | patient | clinical | ability to swallow oral medications |
| NCT04316364 L22 | patient | clinical | substance abuse disorders |
| NCT06728852 L25 | patient | clinical | NSCLC with hemoptysis (>5 ml/day) |
| NCT03433469 L4 | clinical | patient | received no more than 28 days of treatment |
| NCT04385368 L15 | clinical | patient | patients undergoing wedge resection |
| NCT04385368 L50 | clinical | patient | non-leukocyte-depleted whole blood transfusion within 120 days |

Borderline, counted as following the rule: NCT06728852 L38, "history of substance abuse that cannot be quit". It's read as a habit, like smoking.

Two of 0003's 22 `patient`→`clinical` errors are in this table (L35 and NCT04316364 L22). A parser that follows the rule exactly still makes them. So the floor for that count is 2, plus whatever else in the table the new parse types by the rule. §9.3 counts the table apart.

### 5.3 The prompt

The `patient` and `clinical` bullets of `SYSTEM_PROMPT` are rewritten to state the same rule in the prompt's own words. One boundary case is added: a condition and its treatment together are `clinical`. The draft, for the plan to settle:

> - "patient" — who the participant is and what they have done, had done to them, or will agree to: age, treatments and medications received, surgery, radiation, transfusions, vaccines, taking part in other studies, allergic reactions to drugs, pregnancy, breastfeeding, smoking, willingness to consent or to use contraception. These are "patient" even when a medical record would also show them.
>
> - "clinical" — a condition, diagnosis, symptom, test result, measurement or clinician's assessment: ECOG performance status, creatinine clearance, PD-L1 expression, histological confirmation, measurable disease by RECIST, a history of stroke, active infection. These are "clinical" even when the participant may know them.

The prompt's comment is corrected: it has boundary cases, and has had no few-shot examples until §5.4 adds one, if it does.

### 5.4 The fallback: one example block

This is added only if dev iteration 1 (rule alone) misses the dev bar in §9.3. It's a short eligibility block of about eight criteria with its expected JSON, and it contains:

- a prior-treatment exclusion, a concurrent-study exclusion and a drug allergy, each typed `patient`;
- a diagnosis typed `clinical`;
- a lab value typed `clinical`;
- one site obligation typed `protocol`.

It's written for this slice in a house style unlike the twelve. §8.3's wording rules apply to every line.

## 6. The splitting rule

*Dropped at Gate 1 (owner, 2026-09).* R2 showed that NCT04385368's parse changes from run to run on identical input: 16 misses in 0003, 2 in R2, with nothing changed. With one run per prompt version, this rule's effect can't be told from noise, so it isn't added. The dropped requirements are reported as mostly noise. What follows is the rule as first specified, kept for the record.

One bullet is added to the prompt's Splitting section, after the headings bullet:

> - A sentence that adds a requirement of its own is its own criterion, even when it only qualifies the criterion before it ("If so, …", "When that happens, …") or tells the site what it must do or document. A sentence that only explains why a requirement exists, or describes how the study will run, is not a criterion.

The quoted openers are invented for the prompt. The corpus's own ("In these cases", "However") are not used, under §8.3.

It goes in at dev iteration 2 at the earliest, after the collapse has its own measured version, so each change's effect is measured apart. If it raises narrative false positives above the guardrail on dev, its second sentence is tightened once. If that fails too, it's removed, and the drops are reported unfixed.

## 7. The adversarial cases

These go in `tests/criteria/adversarial.test.ts`. Each case takes a real sentence from a real fixture's normalized text. It first asserts that the faithful quote, run through `parseCriteria` with a scripted adapter, is kept. Then it applies one alteration of a kind this corpus invites, and asserts that the altered quote is rejected with "quote does not appear in the source text" and counted in `rejected`.

| Case | Study | Alteration |
| --- | --- | --- |
| Mojibake tidied | NCT03433469 | `patient?s` → `patient's` |
| Full-width punctuation | NCT03753685 | `，` → `,` |
| Comparison symbol | NCT06728852 | `≥` → `>=` |
| Abbreviation expanded | NCT00077350 | `ECOG` → `Eastern Cooperative Oncology Group` |
| Ellipsis | NCT00077350 | the middle of a long criterion replaced by `…` |
| Two sentences stitched | NCT04385368 | two sentences with the text between them dropped |
| Another study's words | NCT04316364 | a quote taken from NCT00743379 |
| Escape copied back | NCT06728852 | `10^9` → `10\^9`, after §4 |

Cases that must pass:

- **Reflowed.** A quote with a line break replaced by a space is kept, with `loose: true` (§3.4).
- **Repeated.** A quote that occurs twice resolves to the occurrence after the previous criterion.

The eval-level proof runs a parse containing the mojibake case through `runEval`, with a scripted adapter and a temporary results directory. It requires `quotes.rejected` to be 1 in the result.

The known gap is written as `it.fails`, the pattern 0006 used for known gaps. A faithful quote of an exclusion, with a `text` that states it backwards, is expected to be rejected. It isn't, because the net checks the quote and not the text, and the agent reads the text. The test's comment says no check in the project catches this.

These cases were written after reading the corpus, and each one tests a known shape. Together they show the net fires on the unfaithful copies this corpus invites. They don't show it catches every kind of unfaithful copy.

## 8. Limiting the tuning

### 8.1 Dev and held back

- **Dev: NCT04385368 and NCT00077350.** `PARSER_DEV_STUDIES` in `evals/runner.ts`.
- **`npm run eval -- --dev`** parses and grades exactly those two, and writes its result to `evals/results/dev/`. A dev run naming any other study is refused.
- **Held back: NCT03433469, NCT04316364 and NCT06728852.** Parsed at the new prompt only in the frozen run (§9.1), and reported apart everywhere a number is split.

Code can't stop a person from running the full eval early. That's discipline, and the history shows it: every parser result is committed, so a held-back parse made before the freeze would show up.

### 8.2 The cap

At most four prompt versions are measured on dev. Each has its own commit carrying the prompt change and its dev result. A fifth is a gate (§12).

### 8.3 Wording rules

Every line added to `SYSTEM_PROMPT`, and every line of §5.4's example, follows these:

- No sentence, clause or distinctive phrase from any of the twelve protocols. This is wider than the intent's five, because the unlabelled seven are the label-free check.
- No drug, device or procedure named in the five labelled studies, except as a general category word: treatments, vaccines, radiation, surgery, transfusions.
- Rules, not cases. A boundary case describes a kind of criterion, never one criterion.

`npm run eval:compare -- --overlap` gives the freeze gate its list. It prints every run of five or more words that appears both in `SYSTEM_PROMPT` and in any fixture's normalized text. It's a list to read, not a check, because some general wording coincides. The freeze gate (§12) reads it.

## 9. Runs, times and the bar

### 9.1 Sequence

| # | Run | Command | Model time |
| --- | --- | --- | --- |
| R1 | The seven unlabelled, before: today's prompt and normalization | `npm run parse:criteria -- <id> --cache`, once per study | about 30 min |
| R2 | Noise: the five labelled, escapes fixed, prompt unchanged | `npm run eval` | about 25 min |
| R3 | Dev iterations, at most four | `npm run eval -- --dev` | about 12 min each |
| R4 | Frozen: the five labelled, and the seven unlabelled after | `npm run eval`, then `parse:criteria -- <id> --cache` | about 25 + 30 min |
| R5 | Reasoning off, the five, frozen prompt | `npm run eval -- --thinking off` | about 15–25 min |
| R6 | Screening, 30 conversations, of which 15 from labels are resumed | `npm run eval:screening` | about 6–7 h |

R1 goes before §4 lands, because after it, today's input can't be reproduced. That makes it the one model run in the measurement stage. `parse:criteria` gains `--cache`: it writes the parse into `evals/results/parses/` under `cacheKey`, and skips a study already there.

R6's estimate is 0009's parse half (5.59 h for 15 conversations and their fidelity checks), adjusted by the change in raisable criteria. The raisable count is known from the frozen parses before R6, and the gate before R6 is shown the re-estimate. The 15 labels conversations resume from this machine's cache at no model cost. Their keys don't change (§3.3), and nothing from labels reaches a model differently (§4).

In all, about 8–9 hours of model time, of which R6 is about 6–7.

### 9.2 The noise run

In R2, NCT04316364 and NCT04385368 get input byte-identical to 0003's. Their cache keys differ (identity `…-n2`), so they are parsed again.

`npm run eval:compare -- <0003 result> <R2 result> --noise` compares their parses criterion by criterion: ids, types, polarity, text. It prints "identical" or every difference.

- **Identical:** the bar in §9.3 stands, and the gate passes without the owner.
- **Not identical:** for each bar quantity, the spec's bar is widened by the largest change those two studies show. The widened bar goes to the owner at the gate before any dev iteration.

### 9.3 The bar, fixed now

> **As decided at Gate 1 (owner, 2026-09).** This replaces the tables and dev bar below, which stay as first written.
>
> - **The before is R2** (`evals/results/02-73c3b301c4a9.json`): escapes fixed, prompt unchanged. It is 0003's prompt as it reads today's input.
> - **Judged:**
>   - `patient` typed `clinical`: pooled 12 or fewer (R2: 25), dev 8 or fewer (R2: 18), held back 5 or fewer (R2: 7);
>   - reach 110 or more of 183 (R2: 72);
>   - `clinical` typed `patient`, less the §5.2 three, 2 or fewer (R2: 1).
>
>   `patient`→`clinical` moved by 1 on identical input, so the first spec's bars are widened by 1. Reach follows from it.
> - **Guardrails**, over each scope less NCT04385368, relative to R2:
>   - precision down 0.02 at most;
>   - narrative false positives not up;
>   - merge rate up 0.02 at most;
>   - polarity down 0.005 at most;
>   - coverage and strict recall not lower;
>   - no parse failures.
> - **Reported, not judged:** NCT04385368's `protocol`→`clinical`, misses, precision and narrative false positives. On identical input they moved by 7, 14, 0.106 and 8.
> - **Samples (Gate 1a, the owner, 2026-09).** From dev v3 on, and in R4, NCT04385368 is parsed three times per prompt version. Its `patient`→`clinical` and its share of reach count by the median, and each sample is reported. v1 and v2 had typed its 13-label exclusion block `patient` and `clinical` respectively, and differed only in one example.
> - **A caution on small differences.** From 0003 to R2, NCT00077350's `patient`→`clinical` rose from 2 to 6, and its only input change was the four-character `\^` fix. A study can move by about 4 when its input changes at all. The held-back line (7 to 5 or fewer) is smaller than that, so the README reports it with this caution.

It is computed by `npm run eval:compare -- <0003 result> <R4 result>`. That reads the results' diagnostics and the committed parses, and prints each line with its verdict. "The table" means §5.2.

| Measure | Now | Better means |
| --- | --- | --- |
| `patient` typed `clinical`, pooled | 22 | 11 or fewer |
| `protocol` typed `clinical`, pooled | 7 | 3 or fewer |
| Labels missed in NCT04385368 | 16 | 8 or fewer |
| Reach: patient facts scored, from parses | 84 of 183 | 117 or more |

Guardrails, all required:

| Measure | Now | Must stay |
| --- | --- | --- |
| `clinical` typed `patient`, pooled, **not counting the table's three `clinical` labels** | 2 | 2 or fewer |
| Precision | 0.95 | 0.93 or more |
| Narrative false positives | 6 | 6 or fewer |
| Merge rate | 0.20 | 0.22 or less |
| Polarity accuracy | 0.99 | 0.99 or more |
| Coverage recall / strict recall | 0.94 / 0.73 | not lower |
| Parse failures | 0 | 0 |

- **The table's labels** are printed apart with how each was typed. They are part of every pooled count above, apart from the one exclusion stated.
- **Dev bar, for §5.4 and §6.** Dev iterations are judged by the same lines, restricted to the two dev studies:
  - `patient`→`clinical` from 15 to 7 or fewer;
  - `protocol`→`clinical` from 7 to 3 or fewer;
  - misses from 16 to 8 or fewer;
  - dev guardrails as set out below for subsets.
- **Guardrails for a subset** (dev, or held back). *Corrected at step 11, before any run of a new prompt.* Applied to a subset, the pooled thresholds fail at baseline: dev precision is 0.917 against 0.93, held-back merge rate is 0.312 against 0.22, and held-back polarity is 0.990 against 0.99 (0.9896 unrounded). A line that fails before anything changes decides nothing. So a subset's guardrails are relative to its own before, with the slack the pooled thresholds give the pooled baseline:
  - `clinical`→`patient`, less the §5.2 three: 2 or fewer, as pooled;
  - precision down by 0.02 at most;
  - narrative false positives not above the subset's before;
  - merge rate up by 0.02 at most;
  - polarity down by 0.005 at most;
  - coverage and strict recall not lower;
  - no parse failures.
- **Held back, for what the README may call general.** `patient`→`clinical` in the three held back falls from 7 to 4 or fewer, and none of their guardrails fails. If the pooled bar is met and this isn't, the README says the fix was met where it was tuned and not shown elsewhere.
- **Screening from parses (R6 against 0009's parse half).** Confidently wrong rate 0.12 or less, and abstention rate 0.10 or less. It's reported by `npm run screening:compare -- <0009 run> <R6 run> --parser`, with dev studies and held-back studies apart.
- **Ungraded rows.** The same command lists every parsed criterion typed `patient` whose matched label is `clinical`, with what the agent recorded for it. These come from the new run's committed review file, the committed parses and the labels. The grader never scores these rows, and they are the dangerous direction's screening-side check. There's no numeric bar on them. The attribution gate reads each one.

Whatever the runs show is reported. The bar decides only what the README may call an improvement.

### 9.4 `npm run eval:compare`

A new script, `scripts/eval-compare.ts`. It reads committed results, committed parses, labels and vignettes, and calls no model.

- **`<before> <after>`:** §9.3's parser lines and reach, pooled, dev and held back.
- **`--noise`:** §9.2.
- **`--overlap`:** §8.3's list.
- **`--unlabelled <identity-before> <identity-after>`:** for each of the seven unlabelled studies, from their committed parses:
  - criteria;
  - counts by type;
  - unclaimed non-whitespace characters;
  - rejected and loose quotes.

  There's no bar. What would mean something: unclaimed source falling where it's large, as evidence the splitting rule generalizes; a shift from `clinical` to `patient` of about the size dev showed; and any study where unclaimed source rises by more than a fifth, which the gate after R4 reads.

### 9.5 Reasoning off

- `run-eval.ts` gains `--thinking off`, passed to `createAdapter` as `thinking: false`. The parse identity gains `-thinking-off` (§3.1), so its parses sit beside R4's and never replace them.
- R5 is reported beside R4 in the README, and never screened from.
- Its wall time is recorded, since reasoning is most of a parse's time.

## 10. The review

- `EVAL_RUN` in `scripts/app/eval-run.ts` names R6's run. `npm run review:export` writes its review file into `evals/results/screening/review/`, and it's committed in the same change, as the existing test requires. `READING_RUN` doesn't change.
- 0009's review file stays. It's a record, and pointing `EVAL_RUN` back at it needs no cache.
- `npm run app -- --source parse` screens from the frozen parses. They're committed, so it works from a fresh clone.
- `npm run test:e2e` runs before the PR, because `EVAL_RUN` is on its list. The PR says how many cases passed.

## 11. Documentation

### 11.1 CLAUDE.md

- **The commands table:**
  - `eval -- --dev` and `--thinking off`;
  - `parse:criteria -- --cache`;
  - `eval:compare`;
  - `screening:compare -- --parser`.
- **Parses are committed.** A parse a committed result depends on is committed in the same change.
- **A screening conversation from a parse is keyed by the parse's identity.**

### 11.2 README

The parser section:

- before and after on the five, with dev and held back apart;
- the §5.2 table, and the tie-break written down;
- the noise result;
- reach before and after;
- the adversarial cases, and the known gap in plain words;
- R5 beside R4;
- the unlabelled seven's comparison.

The screening section:

- the parse-side before and after, with dev and held back apart;
- the ungraded rows;
- one criterion that reached the agent only after the fix, named with its finding.

Every number records model, quantization, temperature, seed, reasoning mode, parser identity and matcher version.

### 11.3 ROADMAP

- 0011 is marked done, with the PR number.
- The "Where every open carried-forward item went" rows that go to 0011 are closed or re-placed: 0002's net, 0003's three, 0004's reach and reasoning mode, 0008's reasoning-mode row, and 0010's parse cache.
- A "Carried forward from 0011" list is added, including the known gap from §7 and the §5.2 table as material for the second annotator.

## 12. What the plan must gate

These are the intent's four gates, made concrete, plus the cap.

- **After R2, before any dev iteration: noise.** It passes without the owner if the parses are identical. Otherwise the widened bar is the owner's (§9.2).
- **A fifth prompt version.** The owner's. It's the cap in §8.2.
- **The freeze, before R4.** **The owner reads the prompt's diff since 0003, and the §8.3 overlap list.** Does any line read like a case from the corpus rather than a rule? About ten minutes. The held-back result is spent once.
- **Before R6.** R4's verdict, reach and the re-estimated hours. Delegated if the pooled parser bar is met and the estimate is under ten hours. The owner's otherwise, including whether to screen from a parse that missed its bar.
- **After R6: attribution.** Every new confidently wrong finding from parses, and every ungraded row, attributed to parser, agent, simulator, grader or convention. Best read by the owner. If it's delegated, the reader didn't write the prompt, its model and settings are recorded, and the README says it isn't independent.

## 13. Out of scope

- **Any label change**, including the seven in §5.2.
- **Matcher or grader changes.** §3.6 is an extraction proved to change no output.
- **Agent, simulator or vignette changes.** Screening `PROMPT_VERSION` stays `2c46ada9a1d5` and `SIMULATOR_VERSION` stays `5fd4476340c9`.
- **A second classification call**, or deterministic re-typing.
- **Merge rate as a target.**
- **Checking `text` against its quote.** §7 names the gap without closing it.
- **Plain-language renderings of parses.** That's the optional row.
- **Labelling the unlabelled seven.** That's the optional row.
- **Paid APIs, `--spend` and `.env`.**
