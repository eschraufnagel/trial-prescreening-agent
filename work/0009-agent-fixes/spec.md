# spec: 0009 agent fixes

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0009-agent-fixes/intent.md`

---

## 1. Summary

The read call changes shape. For every reading it now writes the criterion's statement in affirmative form, the quote, whether those words settle the statement outright, and only then the reading. Code turns a determination the model says isn't outright into `unclear`. A seventh reading value, `does-not-apply`, closes a criterion as unresolved with a reason of its own. The read call is shown what was recorded for each answered criterion, and from which words, and is told a reply can address several criteria. The ask call, the agenda and the templates don't change.

The agent is iterated on four new dev vignettes, one per study that lacks one, plus 0004's. Then the fifteen scored vignettes run once, from labels and from parses. A new `screening:compare` command reports the twelve and the three least-seen v2 conversations apart. The grader's verdict pattern is narrowed as grader v4. It feeds only the verdict count, so no scored number can move, and 0004's "before" count comes from the hit texts its committed run already stores. The eval-run loader finds a run's files by the versions the run records. So the review keeps serving 0004's run until the new one exists, and 0007's reading stays pinned to the run it read. Local model only.

## 2. Decisions taken before this spec

The owner accepted the intent's recommendations in 2026-09 ("Go"). That includes D4, the one grader change, which the intent left to them.

| # | Decision | Consequence here |
| --- | --- | --- |
| D1 | New dev vignettes; iterate on dev only; the fifteen run once | §5, §8 |
| D2 | No plain-language renderings in the ask call | The ask prompt is unchanged (§3.6) |
| D3 | No reordering for caching | The read prompt's new material goes where it reads best, not where it caches (§3.2) |
| D4 | Narrow the verdict pattern as grader v4, a strict narrowing that feeds only the verdict count | §6 |
| D5 | The loader finds a run by its recorded versions | §7.1 |
| D6 | The review's gitignored cache goes to 0010 | Nothing here. Recorded in the roadmap |
| D7 | Reasoning mode stays off | `thinking: false` for every role, as in 0004 |
| D8 | The success bar is written before the run | §8.2 |

The intent's eleven open questions are answered here:

| Intent question | Answer | Section |
| --- | --- | --- |
| 1. The lever for each class | Corrections: recorded answers shown. Polarity: `statement` written before the reading. Hedged or interpretive answers: `outright`, enforced by code. Does-not-apply: a reading value | §3 |
| 2. Volunteered facts | In scope through one instruction (report every criterion a reply addresses), with no lever of its own. The simulator can't produce the L15 shape on purpose (`volunteerable` skips facts with `laterSays`), so it is measured only as it occurs | §3.2, §5.1 |
| 3. Does-not-apply | A reading `does-not-apply`, a reason `does-not-apply`, and a reported value `does-not-apply` for clinical criteria | §3.1, §3.3, §3.4 |
| 4. Cost per turn | Longer read prompts and about 20 more output tokens per reading. Estimated 13–14 hours for the scored run, measured on dev before Gate 2 | §3.7 |
| 5. The dev vignettes | Four new, one each for NCT00077350, NCT03433469, NCT04385368 and NCT06728852, plus 0004's NCT04316364-dev as a control | §5 |
| 6. Noise | Not measured in 0009. The seed is a constant in `src/models/omlx.ts`, and a second-seed run needs a change there. The README says what one run can't show | §8.4 |
| 7. The success bar | On the twelve from labels: confidently wrong at or below 0.07, abstention at or below 0.10. From parses: not above 0.13 | §8.2 |
| 8. The verdict pattern | A verdict word counts unless it is followed by "for" and something other than the study. v4, a strict narrowing. 0004's "before" count comes from its stored hit texts, with no re-grade | §6 |
| 9. The loader | Keys built from the run's `promptVersion` and `simulatorVersion`. The refusal becomes a check that each file's result matches its run | §7.1 |
| 10. The three's before and after | `npm run screening:compare`, which prints them only with `--least-seen`, run after the scored run | §8.3 |
| 11. The README | §10.2. The worked example is NCT00077350-v2 from labels, the same vignette as 0004's missed correction, whatever it shows | §10.2 |

## 3. The agent

### 3.1 The read call's output

Each reading gains two required fields, and the prompt's JSON template lists the fields in this order, so the model writes its reasons before its verdict:

```
{ "readings": [ {
  "criterionId": "<id>",
  "statement": "<the criterion as one plain statement about the person, true or false>",
  "quote": "<exact words, at most about 12>",
  "outright": true | false,
  "reading": "<reading>",
  "missing": "<only for partial>"
} ] }
```

- **`statement`** is the criterion restated as an affirmative claim about this person, whatever its wording. For an exclusion it's the condition that would exclude them. "Patients who are never-smokers" becomes "The person has never smoked". "Patients must not have received prior gemcitabine" becomes "The person has received gemcitabine". A permission with a condition ("X is allowed, but the last dose must be more than 3 weeks before enrollment") becomes the condition ("The person's last dose of X was more than 3 weeks before enrollment"). The reading is then about that sentence. This is the polarity lever. It turns statement-truth from an instruction the model has to hold in mind into a sentence it has to write.
- **`outright`** answers one narrow question: do the quoted words, read literally, say the statement is true or false, or that the person is outside who the criterion is about, with no hedge and no judgment about what a term covers? A tentative agreement, a conditional, a guess, or a fact the reader would have to map onto the criterion's term is `false`. This is the lever for hedged and interpretive answers. It asks a yes-or-no question apart from the six-way classification, and code enforces its consequence (§3.3).
- **`reading`** gains a seventh value, **`does-not-apply`**: the criterion names a group of people (by sex, or as a partner of someone), and the person's words place them outside it. The prompt draws the line in words. A denial of the condition itself ("I don't take any medicines") is `does-not-hold`, not `does-not-apply`. A criterion that names both groups ("women of childbearing potential and men must…") applies to everyone it names. Whether someone counts as "of childbearing potential" is a judgment, so it's `unclear` unless they say it in those terms.
- `readRead` in `src/screening/calls.ts` refuses a reading without a non-empty `statement` or a boolean `outright`, like a missing `quote`. The existing retry covers it.

### 3.2 What the read call is shown

`buildReadPrompt` changes in two ways. `PROMPT_LAYOUT` goes from 3 to 4.

- **Recorded answers.** Each line under "ALREADY ANSWERED" carries what was recorded and from which words, taken from that criterion's last evidence with a determinate reading:

  ```
  - L3 [INCLUSION]: must have failed one and only one prior cytotoxic chemotherapy regimen …
      recorded: holds, from "Yes, just the one chemotherapy regimen"
  ```

  For a `chart-review` finding the line says `reported: holds, from "…"`. The heading becomes: "ALREADY ANSWERED, with what was recorded. Report one of these only if this reply changes or contradicts what was recorded."
- **Every criterion a reply addresses.** The system prompt replaces "Usually that is the one just asked about; sometimes the person volunteers more" with a rule: a reply often answers the question and also says something about another criterion, earlier or later in the list. Give a reading for each. The "THE QUESTION WAS ABOUT" line stays.

Added at dev iteration 2 (`PROMPT_LAYOUT` 5), after iteration 1 showed both faults:

- **Answered criteria, most recent first.** Sorted by the turn of their last evidence, newest first. A correction that didn't name what it corrected ("it was more recent than I said") was missed with its criterion 39 lines down the list.
- **What was already said about an open criterion.** Each open criterion with evidence shows `said so far: <reading>, from "<quote>"`. The system prompt says to judge an open criterion on everything said about it. A follow-up is often narrower than its criterion ("oral or injectable steroids" for "immunosuppressive medication"), and iteration 1 settled two criteria from the answer to the narrow question alone.

`READ_CONTEXT_TURNS` stays at 4, and the order of the prompt's sections is unchanged (D3).

### 3.3 Applying readings

In `applyReadings`, after the quote is located and before the rules below: a `holds`, `does-not-hold` or `does-not-apply` reading with `outright: false` is applied as `unclear`. Its evidence records `reading: "unclear"` and `withheld: <the model's reading>`, so a reader can see what was held back and why.

Patient criteria (`applyPatient`):

| Status now | Reading | Becomes |
| --- | --- | --- |
| open | `does-not-apply` | `unresolved`, reason `does-not-apply`. Final, like `unknown` and `declined` |
| `holds` or `does-not-hold` | `does-not-apply` | `unresolved`, reason `contradicted` |
| anything else | as today | as today |

Clinical criteria (`applyClinical`):

| Status now | Reading | Becomes |
| --- | --- | --- |
| open | `does-not-apply` | `chart-review`, reason `does-not-apply`, `reported: "does-not-apply"` |
| `chart-review` with `reported` holds or does-not-hold | `does-not-apply` | reason `contradicted`, `reported` removed, as for a determinate contradiction |
| anything else | as today | as today |

**Changed at dev iteration 2: any reading but agreement unsettles a settled patient criterion.** Until 0009, a vaguer reading of a settled criterion (`unclear`, `partial`, `unknown`, `declined`) was ignored. That rule dates from when the read call couldn't see what was recorded. Now it is shown the answer, and told to report an answered criterion only when the reply changes, qualifies or contradicts it. So any reading there is a claimed change, and the finding becomes `unresolved` / `contradicted` with both quotes. Iteration 1 lost a qualified correction ("big tablets are a struggle… smaller ones are fine" after "I can swallow tablets") to the old rule. Clinical criteria keep the old behaviour: they never settle anyway, and chart review sees every quote.

Everything else in `apply.ts` stays: the quote rule, "unresolved is final", and `finalize`.

### 3.4 Types and words

In `src/screening/types.ts`:

- `ReadingValue` gains `"does-not-apply"`.
- `FindingReason` gains `"does-not-apply"`.
- `ReportedValue` gains `"does-not-apply"`.
- `Evidence` gains optional `statement?: string` and `withheld?: "holds" | "does-not-hold" | "does-not-apply"`. Optional, so every saved state and committed result still reads. `ScreeningState.version` stays 1.
- `FindingStatus` and `Handoff` don't change. `ScreeningCriterion` keeps its four fields.

Words, in the typed records that already force one entry per value:

| Where | Key | Words |
| --- | --- | --- |
| `REASONS` (`src/web/review.ts`) | `does-not-apply` | "said it doesn't apply to them" |
| `READINGS` (`src/web/review.ts`) | `does-not-apply` | "doesn't apply" |
| `REPORTED` (`src/web/review.ts`) | `does-not-apply` | "Participant said it doesn't apply to them. Needs the record" |

Any other exhaustive mapping typecheck turns up (the tester panel, `screening:show`) gets the same words. `screening:show` prints each evidence's `statement`, and marks a withheld reading as "(read as holds, not outright)". The coordinator review doesn't show `statement` or `withheld` in this slice (§11).

### 3.5 Guarding against fitting

- **No prompt quotes a scored vignette.** A new test in `tests/screening/` fails if any run of five or more words (lower-cased, punctuation stripped) from a scored fact's `says` or `laterSays` appears in `ASK_SYSTEM_PROMPT` or `READ_SYSTEM_PROMPT`. Examples in the read prompt are written fresh. 0004's read prompt already fails it: its example of a general denial, "I'm not allergic to any medicines", shares "not allergic to any medicines" with a scored fact. The example is replaced when the read prompt is rewritten, and the test lands in the same commit (found at plan step 1).
- **No code keys on wording.** Nothing in `src/screening/` matches correction markers, hedge words or sex words in a reply. The only thing code does with a reply's words is locate the quote, as now.
- **Deterministic tests use fresh wording.** Tests of §3.3 use made-up replies, never one from a vignette.

### 3.6 What doesn't change

- `ASK_SYSTEM_PROMPT`, `buildAskPrompt`, `ASK_CONTEXT_TURNS`. Every change in the numbers then comes from how replies are read. Questions still differ between runs, because a reading changes what is asked next.
- The opening and closing templates, `RETRY_AFTER_TRUNCATION`, `MAX_ASKS`, `LAB_VALUE_PATTERN`, `raisability`, `nextCriterion`, `describeFollowUp`.
- `ScreeningSession`'s shape, atomic turns, `state()` and `fromState()`.

`PROMPT_VERSION` changes, because `READ_SYSTEM_PROMPT` and `PROMPT_LAYOUT` do.

### 3.7 Cost

0004's run: 11.5 hours for 30 conversations. The agent took 6.3 hours of that, and the simulator and fidelity check 6.0. The changes add prompt length (recorded answers grow over a conversation, up to about 30 short lines) and about 20 output tokens per reading. Hedged answers that become `unclear` get their one follow-up, which adds questions. Estimate: 13–14 hours. The plan measures seconds per read call on the dev baseline and on the last dev iteration, and Gate 2 sees the scored run's estimate from those. Above 16 hours, Gate 2 decides whether to go on.

A dev iteration runs five dev vignettes with the simulator and fidelity check, at 15–25 minutes a conversation: about 1.5–2 hours each, so up to about 10 hours over five iterations, plus the baseline.

`READ_MAX_OUTPUT_TOKENS` stays 1024. The dev runs show whether it truncates.

## 4. Tests of the agent

All deterministic, all under `tests/screening/`, through the existing fake adapters.

- **`readRead`:** accepts the new shape; refuses a missing or empty `statement`, a non-boolean `outright`, and an unknown reading; accepts `does-not-apply`.
- **`applyReadings`:** every row of both §3.3 tables; `outright: false` turning each determination into `unclear` with `withheld`; `outright: false` on `unclear`, `partial`, `unknown` and `declined` changing nothing; `statement` stored on evidence.
- **`buildReadPrompt`:** an answered patient criterion shows its recorded reading and quote; a chart-review one shows `reported`; the recorded quote is the last determinate evidence's; open criteria are unchanged.
- **The session:** a scripted conversation in which a correction arrives with the answer to the next question ends with the first criterion `contradicted` and both quotes as evidence. A scripted "does not apply" ends `unresolved` / `does-not-apply`.
- **The fitting test** in §3.5.
- **Existing tests** whose fake read responses lack the new fields gain them. That includes `scripts/app/scripted-agent.ts`, which `npm run app -- --fake` and 0005's transparency test use. No assertion changes. The transparency test still requires identical state through `MemoryTransport` and HTTP.

## 5. Dev vignettes

### 5.1 Which, and what each tests

The loader allows one dev vignette per study (`<nctId>-dev`). Four new ones, plus 0004's:

| Vignette | Primary behavior | Carries |
| --- | --- | --- |
| `NCT00077350-dev` (new) | `contradicts` | Self-corrections, a criterion naming both sexes answered by a man, and pregnancy and breastfeeding denied by a man (controls) |
| `NCT03433469-dev` (new) | `cooperative` | Polarity: prohibitions and never-X in both directions. Does-not-apply on the criterion for men, answered by a woman |
| `NCT04385368-dev` (new) | `vague` | Hedged and interpretive answers, a self-correction, polarity, and pregnancy and breastfeeding denied by a man (controls) |
| `NCT06728852-dev` (new) | `declines` | Polarity on the allowance with a condition, an interpretive answer, and does-not-apply on both criteria for one sex, answered by a woman past menopause |
| `NCT04316364-dev` (0004's, unchanged) | `volunteers` | Control. 0004 ended it with nothing confidently wrong. It is where volunteered facts are read |

Across the four new ones, the counts the vignettes must reach:

| Class | Facts that test it | Controls |
| --- | --- | --- |
| Self-corrections | At least 3 `laterSays` facts, in at least 2 vignettes. One is on a criterion followed in protocol order by a `clinical` one, so its correction arrives in a reply to a clinical question | Every vignette's clean facts |
| Polarity | At least 4 facts on criteria worded as prohibitions, never-X or allowances with a condition, at least one expected `holds` and one `does-not-hold` | — |
| Hedged or interpretive | At least 3 facts expected `defer` or `unresolved` for a hedged agreement or a judgment answer | At least 2 firm answers to agree-to criteria ("Yes, I will"), expected `holds` |
| Does-not-apply | At least 3 `defer` facts on criteria naming the other group | At least 1 criterion naming both groups, answered by someone in it and expected settled; at least 1 plain denial of a condition, expected `does-not-hold` |

**Aim at criteria that didn't fail in the twelve, where the class allows it.** The twelve's failures are on NCT00077350 L3, L15, L35; NCT03433469 L22, L49, L55, L59, L63; NCT04316364 L22; NCT04385368 L59, L70; NCT06728852 L15, L16, L20, L38. Polarity, hedged and self-correction facts avoid these labels. Does-not-apply can't avoid NCT03433469 L49 or NCT06728852 L15, and polarity can't avoid NCT06728852 L20, the corpus's only patient criterion worded as an allowance.

**Pregnancy denied by a man is a control, not a does-not-apply test** (corrected at plan step 6). The scored vignettes record "I am a man, so I am not pregnant" as `does-not-hold`: "pregnant" and "breastfeeding" name a condition, not a group, so the statement is plainly false of him. Only criteria that name one group are `defer`: NCT03433469 L49 (men with a female partner) and NCT06728852 L15 and L16 (female patients, male patients). One dev vignette per study allows two such tests from those studies, so the third is NCT06728852 L15 answered by a woman past menopause, which is `defer` because whether she is "of childbearing potential" is interpretation. The pregnancy controls matter for the scored run: several scored men say it, and a does-not-apply reading there is an abstention on an answerable fact. Nobody writing dev vignettes looks up which criteria failed in the three.

**The L15 shape.** A statement volunteered and never recorded, then corrected. `volunteerable` in `evals/participant/simulate.ts` excludes facts with `laterSays`, so no vignette can produce it on purpose. It is measured only where it happens. The simulator stays as it is.

### 5.2 Rules for writing them

- Every rule in `evals/cases/VIGNETTES.md`. The loader enforces its structural ones.
- **Fresh wording.** No fact's `says` or `laterSays` shares a run of five or more words with any scored fact. `npm run vignettes:check` gains a warning for exactly that, for dev vignettes against scored ones. Corrections are worded variously, and at least one has no marker word at all ("It was two regimens, not one").
- **Provenance.** `drafter`, the guide, `sawAgentPrompt: true`, and a `note` that says the drafter read the 17 confidently wrong findings in the twelve before writing, and lists which fact tests which class. The class list is how Gate 1 checks §5.1's counts.
- **`NCT04316364-dev` isn't edited.** Its 0004 results stay comparable.

### 5.3 Baseline, iteration, report

- **Baseline first.** Once Gate 1 passes, and before any prompt change, the four new dev vignettes run against 0004's agent (`c5778afe9cbd`). NCT04316364-dev runs fresh too: its cached conversation was made with simulator `e3414083139e`, and today's key needs `5fd4476340c9` (found at plan step 1). That is the dev "before".
- **Then iterate.** Each iteration commits its dev run under `evals/results/screening/dev/`, as 0004 did. During iteration the plan may change the prompts' wording, examples and rule text without a spec change. Changing a lever (adding or dropping a field or reading value, a new code rule, a new call) is a spec change, made in the open in the same commit.
- **A stopping rule.** After five iterations, the slice stops and brings the dev results to the owner rather than try a sixth. Many small wins on five vignettes are fitting of their own.
- **The dev report** comes from `screening:compare` (§8.3) over two dev runs: per vignette, every fact that isn't correct, with its evidence, statement and any withheld reading. Plus the pooled pair, the controls' outcomes and seconds per call. Dev isn't scored, so it can be read in full.

## 6. The grader's one change

`VERDICT_PATTERN` in `evals/graders/screening.ts` narrows. `SCREENING_GRADER_VERSION` goes to `"4"`. Nothing else in the grader changes.

- **The rule.** A verdict word (`eligib…`, `ineligib…`, `qualify`/`qualifies`/`qualified`, `disqualif…`, "[not] a [good|suitable] candidate", exactly v3's words) counts as verdict language unless it is followed directly by "for" and then words that don't name the study within the next four ("candidate for surgery", "eligible for an R0 resection"). "Eligible for this study", "qualify for the trial" and "you'd be a good candidate" still count.
- **Tests** (`tests/evals/screening-grader.test.ts`): the phrasings the criteria themselves use, taken from the labels, don't match. A set of verdicts written fresh does ("You may not be eligible.", "That would make you ineligible.", "You qualify for this study.", "You'd be a good candidate."). The existing negative case still doesn't match. The template test that uses the pattern still passes.
- **A strict narrowing.** v4 matches nothing v3 didn't. A test checks that every fresh verdict and every criterion phrasing matching v4 also matches v3.
- **No scored number can move.** `VERDICT_PATTERN` is used only in the discipline count (`verdictLanguage`). Confidently wrong, abstention, correct abstention and reported agreement never read it. It has one use in the grader, where the discipline count is built. Testing that by swapping the pattern would mean mocking a module, which `tests/boundary.test.ts` forbids. So it rests on that one use, which the review passes check.
- **The "before" count without a re-grade.** 0004's committed run stores all 14 verdict hits with their text. Because v4 is a narrowing, applying it to those 14 texts gives exactly the count a re-grade would. `screening:compare` does that when its "before" run is v3. 0004's run is not re-graded, and nothing prints the three's scores.

## 7. The eval run and the review

### 7.1 Finding a run by what it recorded

- `conversationKey` in `evals/screening-runner.ts` takes an optional `versions: { prompt: string; simulator: string }`, defaulting to the current `PROMPT_VERSION` and `SIMULATOR_VERSION`. The runner passes nothing, so its keys are unchanged.
- `loadEvalRun(dir, runFile)` passes the run file's own `promptVersion` and `simulatorVersion`. It throws if a file is missing, has no finished result, or holds a result whose `run.promptVersion` isn't the run's.
- The test "refuses a run made with a different prompt" becomes two tests: a run made with another prompt version loads from files keyed by that version, and a file whose result disagrees with its run is refused.

### 7.2 Two runs, two names

In `scripts/app/eval-run.ts`:

- **`EVAL_RUN`** is the run the page's review serves and the README's screening numbers come from. It stays 0004's until the scored run is committed, then names the new run.
- **`READING_RUN`** is new, and is always `01-c5778afe9cbd.json`: the run 0007's reading was made against. `review:sheet`, `review:score` and their tests use it, so `review:score`'s "24 known wrong, 15 in the reading set" stays true after `EVAL_RUN` moves. `tests/fixtures/eval-run.ts` gains `readingRun()` beside `evalRun()`, each loaded once.

Once the two differ, `npm test` loads two runs. That's about 0.2 s more, and the plan measures it.

### 7.3 The note

`EVAL_RUN_NOTE` says "From 0004's eval run." When `EVAL_RUN` moves it becomes "From 0009's eval run." with the rest of the sentence unchanged. The review test that pins it changes with it. `tests/web/review.test.ts`'s flip test isn't touched.

## 8. The scored run and the report

### 8.1 The run

`npm run eval:screening` after Gate 2. That's all fifteen vignettes from labels and from parses, 30 conversations, on the pinned model with reasoning off, seed 20260921, simulator `5fd4476340c9`, grader v4. It resumes after an outage. If oMLX fails, check `http://127.0.0.1:8000/health` first. The run file is committed as the runner writes it. The first complete run after the freeze is the reported one (D1).

### 8.2 The bar, fixed now

Measured on the twelve (fifteen minus the three least-seen), against 0004's run as committed:

| Source | Before | Better | Worse |
| --- | --- | --- | --- |
| Labels | 17 of 122 wrong (0.14), 1 of 108 abstained (0.01) | wrong ≤ 0.07 **and** abstention ≤ 0.10 | wrong > 0.14, **or** abstention > 0.10 |
| Parses | 7 of 54 wrong (0.13), 1 of 49 abstained (0.02) | wrong ≤ 0.13 and abstention ≤ 0.10 | wrong > 0.13, or abstention > 0.10 |

Anything in between is **mixed**. The README may call the change an improvement only if labels is better and parses isn't worse. The numbers are reported whatever they are. The does-not-apply reading alone would take the twelve from 17 to about 13 wrong (about 0.11), so the labels bar can't be met without the four agent classes improving too.

### 8.3 `npm run screening:compare`

New, `scripts/screening-compare.ts`. Deterministic. Reads two committed run files and nothing else.

```
npm run screening:compare -- <before.json> <after.json>                 the twelve, labels and parses
npm run screening:compare -- <before.json> <after.json> --least-seen    also the three, apart
```

- **Per source, for the twelve:** the pooled pair (confidently wrong and abstention), correct abstention, and reported agreement, before and after.
- **The same pair with the other-sex facts excluded,** from a fixed list in the script. For the twelve: NCT03433469-v1 L49, NCT03433469-v3 L49, NCT06728852-v1 L15, NCT06728852-v3 L15, and any other `defer` fact in the twelve whose words say the criterion is for the other sex. The list is built from the vignette files before the scored run. The three's entries are added after it, from their vignette files, when `--least-seen` is first run. It shows how much of any drop is the does-not-apply reading.
- **Discipline:** questions, follow-ups, multi-question and over-length turns, and verdict hits with their text. For a v3 run, the hits are the stored v3 texts filtered by v4's pattern (§6), and the output says so.
- **With `--least-seen`:** the same for `NCT03433469-v2`, `NCT04385368-v2` and `NCT06728852-v2`, as a separate block, with their confidently wrong findings listed. Without the flag, their numbers are never printed. `LEAST_SEEN` is one constant, shared with `review-sheet.ts`'s `reserveSet`.
- **For dev runs:** per vignette, everything in §5.3's report.

The three's before and after are printed only after the scored run is complete, which is after the freeze.

### 8.4 What one run can't show

One run per vignette at temperature 0 and a fixed seed is reproducible, but not a sample of variance. A changed read changes what is asked next, so every conversation takes a new path. A difference of two or three findings could come from the path alone. No second seed is run (§2, question 6). The README says so beside the numbers, and the held comparison's variance question covers the local model too.

## 9. Gate 3's reading

Every confidently wrong finding of the new run, from labels and parses, all fifteen, read in transcript with `npm run screening:show`. Each is attributed to agent (by class), simulator, grader or convention, as at 0004's Gate 3. So is every finding where a determination was `withheld` on a `holds` or `does-not-hold` fact, so the reader sees what `outright` cost. The reader also checks the conversations with the most `does-not-apply` readings for overuse. The result goes in the plan and the README.

## 10. Documentation

### 10.1 CLAUDE.md

- The verifying table gains `screening:compare`.
- `npm run app`'s line says it lists the conversations of the run `EVAL_RUN` names, 0009's.
- `review:sheet` and `review:score` say they use 0007's reading run (`READING_RUN`), 0004's.

### 10.2 README

The screening section, rewritten around before and after:

- the table in §8.2, filled in, and whether the bar was met, in those words;
- the three apart, with 7 wrong before, and the caveat that they were read at 0004's Gate 3, so they're least-seen, not unseen, and small;
- the split with the other-sex facts excluded;
- the parse run;
- the limits:
  - one run (§8.4);
  - dev vignettes written by the fixer, who had read the twelve's failures;
  - the twelve contaminated;
  - who attributed the new failures, and whether that reader was independent;
- the worked example: `NCT00077350-v2` from labels, committed under `evals/results/screening/examples/` as 0004's was, whatever it shows.

The coordinator review section keeps 0007's reading numbers, now said to be of 0004's run, and says the review serves 0009's.

### 10.3 ROADMAP

The 0009 row marked done, with the PR. A "Carried forward from 0009" list, including at least:

- whether the review should show `statement` and `withheld`;
- the L15 shape, if it is still missed;
- that the verdict pattern is v4;
- the attribution's independence;
- noise not measured.

## 11. What the plan must gate

1. **Before the dev baseline: are the dev vignettes fair and on target?**
   - **When:** the four new dev vignettes and the overlap warning exist. `npm run vignettes:check` shows no errors.
   - **What's decided:** each expected outcome follows from two sentences side by side, §5.1's counts are met (from the provenance notes), and nothing is worded like a scored fact.
   - **What rides on it:** every dev iteration after it, and whether the fixes generalise past the material they were tuned on.
   - **Not always yes:** a fact whose outcome needs interpretation to be settled, or a class with too few facts, changes the vignette before the baseline runs. After the baseline, a change means running it again.
   - **Its value comes partly from an independent reader.** The author of the dev vignettes also writes the fixes. **The owner reads it; not delegated to Claude.**
2. **Before the scored run: freeze.**
   - **When:** the dev results meet the bar the owner accepts, or five iterations are spent.
   - **What's decided:** that the prompts are frozen, and that the run is worth its estimated hours.
   - **What's shown:** the dev before and after per iteration (§5.3), the scored run's estimate (§3.7) and the bar (§8.2).
   - **What rides on it:** about 13–14 hours. A fault found afterwards means a second run, reported beside the first.
   - **Not always yes:** a dev control abstaining, or an estimate over 16 hours, stops it.
   - The reading of dev results can be delegated. The go-ahead is the owner's.
3. **After the scored run: are the grades right about what happened?**
   - **What's decided:** §9, and whether the numbers go in the README as they stand.
   - **What rides on it:** the README's headline.
   - **Its value comes partly from independence from whoever wrote the fixes. The owner reads it.** If it's delegated, the reader didn't write the fixes, its model and settings are recorded, and the README says it isn't independent.


## 12. Out of scope

- Any change to the simulator, the scored vignettes, labels, or the grader beyond §6.
- The ask prompt, the agenda, the templates, reasoning mode, the seed.
- Plain-language renderings in the agent, and reordering for caching.
- Showing `statement` or `withheld` in the coordinator review.
- Committing the conversation cache (0010).
- A second seed or repeated runs.
- A human blind reading of the three.
- Any paid API call, `--spend`, or `.env`.
- Parser changes (0011).
