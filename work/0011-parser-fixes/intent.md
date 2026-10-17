# intent: 0011 parser fixes

**Author:** the repository owner
**Status:** Decisions answered (owner, 2026-09: the recommendations, with decision 1's tie-break corrected)
**Date:** 2026-09
**Scope:** One slice. Fix the parser's three known faults: the collapse toward `clinical`, the dropped site-facing requirements, and `normalize()` leaving `\^` in place. Prove that the quote-location safety net fires. Tune on two labelled studies and hold three back. Re-measure with the parser eval, then by screening from parses once. Local model only. The screening agent, the simulator, the vignettes, the labels, the matcher and the grader are unchanged.

---

## Problem

0003 measured the parser against hand labels on five studies. 0004 and 0009 measured what that costs the screening agent. The numbers this slice starts from:

| Measure | Now | Source |
| --- | --- | --- |
| Coverage recall / strict recall | 0.94 / 0.73 | `evals/results/01-73c3b301c4a9.json` |
| Merge rate / precision | 0.20 / 0.95 | same |
| Type accuracy (185 matched pairs) | 0.82 | same |
| `patient` typed `clinical` | 22 (13 in NCT04385368) | same |
| `protocol` typed `clinical` | 7 (6 in NCT04385368) | same |
| `clinical` typed `patient` | 2 | same |
| Labels nothing covered | 16, all in NCT04385368: 10 `protocol`, 4 `definitional`, 2 `clinical` | same |
| Narrative false positives | 6, all in NCT04385368 | same |
| Patient facts reaching the agent intact from parses | 84 of 183 (66 mis-typed, 33 bundled, 0 missed) | 0009's run, `02-2c46ada9a1d5.json` |
| Confidently wrong / abstention, from parses | 8 of 67 (0.12) / 3 of 64 (0.05) | same |

The roadmap lists the three faults and says what this intent has to settle. Reading the code and the results, several things are different from how the brief puts them.

**What I read to write this.** The parser (`src/criteria/`), its prompt, the eval runner and cache, the screening runner's parse path, and the annotation guide. From 0003's committed result, every type error, miss and extra in all five labelled studies, with its quote. From 0009's run, the parse-side categories by study. So whoever tunes the prompt has already seen the errors in every labelled study, including the three decision 4 holds back. That limits what holding them back can prove.

**The collapse is an unstated tie-break, and the prompt and the guide share it.** The prompt says `clinical` is anything where "answering requires a chart, a lab value, an assay, or a clinician's assessment". `evals/cases/ANNOTATION.md` says `clinical` "when it needs a chart, a lab or an assay, and `patient` when they could answer it themselves". Neither says which wins when both are true. For most of the 22 both are true: a live vaccine within 30 days, prior adjuvant therapy, another clinical study, a known allergy to the study drug. A person could say, and a chart would record it. The labels follow a rule that neither document states. What was done to or by the person is `patient`: treatments, medications, procedures, vaccines, drug allergies, trial participation, pregnancy, agreements. A condition or diagnosis is `clinical` even when the person knows it: "known history of HIV", "history of myocardial infarction within 6 months", "diagnosed with psychiatric disorders". The model types exposures as conditions. That is one rule, written down nowhere, and not a model that can't read.

*Corrected after the decisions were answered.* The first draft said the labels settle every both-true case toward the person. Checking all 252 labels while writing the spec showed they don't. Several dozen `clinical` labels are conditions a person would know. Writing "the person wins" into the prompt would have moved those too, as new errors in the dangerous direction. The owner chose the exposure-versus-condition rule instead (2026-09).

**Typing toward `clinical` is the safe direction, and a fix trades some of that safety for reach.** A `clinical` criterion never becomes a determination: `apply.ts` rule 3 sends it to chart review, whatever the person says. A `patient` criterion can be settled from the person's words. A fix that moves criteria toward `patient` gives the agent more to settle, and every wrong move is a new chance for a confidently wrong finding. Two already go that way: "recovered from adverse effects … to ≤ Grade 1" (NCT00077350 L16) and "uncontrolled medical … conditions that interfere with the patient's safety" (NCT03433469 L73). Decision 3's bar counts the two directions separately.

**The dropped requirements are mostly continuation sentences.** Of the 16 misses, most follow a criterion and qualify it, or tell the site what to do about it: "In these cases, a whole blood sample … must be collected", "However, the surgeon must clearly document …", "Normal appearing lymph nodes, if present, must be biopsied", "Note: Lobe-specific lymph node stations are classified …". The model seems to read them as part of the previous criterion's explanation. Nothing asks the patient about a `protocol` criterion, so fixing this changes nothing the agent does. The coordinator review would list more rows as not raised because they are the site's. It is measured by the parser eval alone.

**Reach needs no screening run.** Every scored vignette covers every `patient` criterion in its study (VIGNETTES.md rule 4), and there are three per study. So 0009's 66 mis-typed facts are 0003's 22 type errors, each counted three times, and its 33 bundled facts are 11 merged labels, each counted three times. Reach follows from a parse, the labels and the vignettes, with no conversation. What the screening run adds is how the agent does with what reaches it.

**`\^` isn't the only escape left, and the fix changes more than the parser.** In the twelve fixtures, 11 `\^` survive normalization, in five studies, plus one `\&` (NCT03433469, in text no label quotes). Both are one-character additions to `ESCAPABLE`. `normalize()` also feeds the screening agent from labels (`fromLabels` in `evals/screening-input.ts`). Four label criteria contain `\^`, NCT00077350 L11 and L13 and NCT06728852 L11 and L12. All four are lab values, and `LAB_VALUE_PATTERN` already skips them in both spellings. As far as I can read, no model call from labels changes. The spec pins that with a test rather than trusting my reading.

**Four things in the code the brief doesn't mention:**

1. **A screening run from parses would silently reuse the old conversations.** `conversationKey` in `evals/screening-runner.ts` is built from the vignette, source, agent model, agent and simulator prompt versions, seed and reasoning mode. It doesn't include the parser's version. After a parser change, `eval:screening -- --source parse` finds 0009's finished conversations under the same keys, doesn't re-run them, and grades them against the new parse, whose `P1…Pn` ids point at different criteria. Nothing errors, and the numbers are wrong. The run file doesn't record which parse it screened from either. This has to be fixed before any parse is re-made.
2. **The parse cache doesn't know about `normalize()`.** `cacheKey` in `evals/runner.ts` is study, model, `PROMPT_VERSION` and seed. `PROMPT_VERSION` hashes the system prompt only. The `\^` fix changes what the model is shown without changing the key, so the eval would grade 0003's cached parses and report no change. The key also leaves out reasoning mode, so a parse with reasoning off would overwrite one with it on (decision 5).
3. **The safety net's own signal is thrown away.** `locateQuote` reports whether a quote matched only after whitespace was allowed to differ (`loose`), and its comment says that's worth surfacing. `parseCriteria` drops it. The eval result doesn't count rejected quotes either. So even if the net had fired, 0003's result wouldn't show it.
4. **The prompt's comment describes examples the prompt doesn't have.** `src/criteria/prompt.ts` explains why its few-shot examples come from outside the corpus. `SYSTEM_PROMPT` contains no examples, only boundary cases. The rule is still right for any example this slice adds.

## Proposed outcome

**Measurement that can see a parser change.** Before any parse is re-made:

- Parse conversations are keyed by the parse they came from, and a screening run records the parser's version.
- The parse cache key covers everything the model is shown.
- Every parse records its reasoning mode, and whether each quote matched loosely.
- The eval result counts rejected and loose quotes per study.

None of this changes a score. Re-grading 0003's cached parses gives identical numbers, and the spec makes that a test.

**The three faults fixed, in this order.**

1. The escapes: a test fails if any escape survives normalization in the twelve fixtures.
2. The collapse: the tie-break written down.
3. The dropped requirements: a splitting rule.

Decision 1 has the lever for each.

**A safety net proven to fire**, by adversarial cases replayed through the real parse path, with its known limit named in a test (decision 2).

**One parser measurement after the prompt is frozen**, on all five labelled studies, with the two tuned on and the three held back reported apart. Plus the seven unlabelled studies, parsed before and after, compared on what needs no labels.

**One screening run from parses**, 15 conversations, after a gate. The labels half isn't re-run. The agent is 0009's, so before and after differ only in the parse.

**Committed parses**, so `--source parse` and every parser number work from a fresh clone (decision 6). **The review repointed** to the new run (decision 7).

**README and roadmap** updated with the before and after, the held-back studies apart, and the limits.

## Absent on purpose

- **No label changes.** The 252 labels are the ruler. If the written tie-break turns out to contradict a label, the contradiction is listed, not fixed.
- **No matcher or grader change.** Matcher v2, screening grader v4.
- **No agent change.** Screening `PROMPT_VERSION` stays `2c46ada9a1d5`, and `SIMULATOR_VERSION` stays `5fd4476340c9`. `LAB_VALUE_PATTERN` is untouched.
- **No merge-rate target.** 0003 put the 0.20 merge rate with this slice. It's content captured but packaged differently from the guide. The agent asks a bundled criterion as one question, and the grader doesn't score it. A splitting change aimed at it would touch the same prompt section as the dropped requirements, with no way to tell which moved what. It's a guardrail here (decision 3), not a target.
- **No deterministic re-typing.** A keyword rule mapping "prior", "history of" or "participation" to `patient` would fix numbers without fixing the parser, and open question 2 settled that `type` is the model's judgment.
- **No second classification call.** Classifying each criterion in its own call might type better, but it's twenty to sixty calls a study for a fix a sentence might make. It's the spec's fallback if the prompt fails at the gate, not the plan.
- **No wording taken from the five labelled studies** in the prompt or its examples (decision 4).
- **No paid API.** Nothing runs with `--spend`, and `.env` isn't created or edited.

## Affected users and systems

**The coordinator.** From parses, more rows are the participant's to settle and fewer wait on the chart. Site obligations that were missing show as not raised, as protocol. From labels, nothing changes.

**The participant.** From parses, some questions that were framed as "you may not know" become plain questions. The agent's prompts don't change.

**`src/criteria/`.** `normalize.ts` (`ESCAPABLE`), `prompt.ts` (type definitions, a splitting rule, perhaps an out-of-corpus example, the comment), `parse.ts` (keeping `loose`), `types.ts` (a `loose` field and reasoning mode on the parse).

**`evals/`.** `runner.ts` (cache key, rejected and loose counts, reasoning mode), `screening-runner.ts` (the parse in the conversation key and run record), `screening-input.ts` (the comment on `\^`), `cases/ANNOTATION.md` (the tie-break, documented).

**`evals/results/`.** Committed parses, the parser eval results (dev iterations and the frozen run), the new screening run and its review file.

**`scripts/app/eval-run.ts`.** `EVAL_RUN` names the new run.

**Tests.** Normalization across the corpus, the adversarial cases, cache and conversation keys, re-grading committed parses.

**Not touched:** `src/screening/`, `src/plain/`, `src/models/` beyond what recording reasoning mode needs, `src/server/`, `src/web/`, `src/transport/`, the simulator, vignettes, labels, `data/`.

## Constraints

- **Local model only.** Every call goes to oMLX, pinned as before: `Qwen3.6-35B-A3B-MLX-8bit`, temperature 0, seed 20260921. If a call fails, check `http://127.0.0.1:8000/health` first.
- **The ruler doesn't move.** Labels, matcher, grader, vignettes and simulator are unchanged. Anything that changes the parse's input (normalization, prompt, reasoning mode) changes its cache key.
- **Tune on the dev studies only.** The held-back three are parsed once, after the freeze (decision 4).
- **The boundaries hold.** `tests/boundary.test.ts` passes unchanged. The parser is still called only through `src/models/`.
- **Every result records** model, quantization, temperature, seed, reasoning mode, parser prompt version and matcher version. A screening result from parses also records the parse it screened from.
- **Run times are estimated before anything runs**, and a run estimated well past decision 3's figures is a decision at its gate, not a surprise during it.
- **No gate needs clinical judgment.** Whether a criterion is the participant's to answer is a convention the labels already apply, not medicine.
- **`npm test` stays near a second, deterministic, and passing from a fresh clone.**

## Decisions

1. **Which faults, in what order, and the lever for each.** Recommend measurement first, then the three faults cheapest first, with merge rate as a guardrail.

   - **Step 0, measurement (no model).** The four code problems above. It goes first because a parse re-made before it is either reused by mistake or graded without its key.
   - **The escapes.** Add `^` and `&` to `ESCAPABLE`. A test walks all twelve fixtures and fails if any backslash-escaped punctuation survives, so the next one fails a test instead of hiding. Another test pins that the four label criteria it touches are skipped as lab values in both spellings. Among the labelled five, it changes the parser's input for NCT00077350, NCT06728852 and NCT03433469 (the `\&`).
   - **The collapse.** Write the tie-break down: what was done to or by the person, or what they agree to, is `patient`, even when a chart records it. A condition or diagnosis is `clinical`, even when the person knows it. That covers treatments, medications, procedures, vaccines, drug allergies, trial participation, pregnancy and agreements. It goes in ANNOTATION.md first, as a description of what the labels already do, checked against all 252, with any label that contradicts it listed. Then it goes in the prompt's type definitions. If that alone doesn't meet the bar on dev, add one short hand-written example block, outside the corpus, with a prior-treatment exclusion, a concurrent-study exclusion and an allergy typed `patient`, and one lab value typed `clinical`. **This is a product rule, so it's yours.** The owner chose it in 2026-09, over the "person wins" rule this draft first proposed. The case for it: it documents what 191 of the 198 `patient` and `clinical` labels already do; 7 contradict it, listed in the spec. It fixes 20 of the 22 errors. It keeps diagnoses in chart review, where a coordinator confirms them. The case against: a diagnosis the person knows is still not asked as settled. That was the labels' choice already.
   - **The dropped requirements.** A splitting rule: a sentence that carries its own requirement is its own criterion, even when it qualifies the one before it ("In these cases…", "However…") or is addressed to the site. The guardrail is narrative false positives. The guide rules out explanation, and NCT04385368 already has 6. The rule goes in after the collapse is fixed on dev, so each change is measured on its own.
   - **Merge rate** must not get worse (decision 3). Not a target.

2. **The adversarial cases: replayed through the real parse path, not asked of the model.** You can't make a model fabricate on demand, so a real run proves nothing about the net unless the model happens to slip. Recommend:

   - **Fixtures built from a recorded real response**, each with one unfaithful quote of a kind this corpus invites, run through `parseCriteria` with a scripted adapter. Each has to be rejected, named in `rejected`, and counted in the eval result. The kinds:
     - NCT03433469's `patient?s` tidied to `patient's`;
     - NCT03753685's full-width `，` made ASCII;
     - `≥` written `>=`;
     - an abbreviation expanded;
     - a quote shortened with an ellipsis;
     - two sentences stitched;
     - a quote from another study;
     - a registry escape copied back in after normalization has removed it.
   - **Cases that must pass**, so the net isn't too tight: a quote reflowed across a line break (accepted, and recorded as `loose`), and a repeated quote resolving to the right occurrence.
   - **The net's limit, as a known-gap test.** A faithful quote with an unfaithful `text` passes, and `text` is what the agent reads. A model could quote an exclusion exactly and write its statement backwards. The net can't catch that, and no check in the project does. The test records the gap. It doesn't close it.
   - **Not recommended:** a real-model probe on synthetic trap blocks as a pass/fail check. It could only ever say "didn't slip this time".

3. **How it's re-measured, what it costs, and what counts as better.** Recommend these runs, in this order. Times are from 0002, 0003 and 0009, and the spec re-estimates each from the one before.

   | Run | Model time | What it answers |
   | --- | --- | --- |
   | Parser eval on the five, escapes fixed, prompt unchanged | about 25 min | Two of the five (NCT04316364, NCT04385368) get byte-identical input, so whether oMLX at temperature 0 and a fixed seed reproduces 0003's parse exactly. That's the noise floor, measured before any tuning, and it bounds what a difference of one or two type errors means |
   | Dev iterations, two studies each | about 12 min each, at most four | The collapse, then the drops |
   | Frozen prompt: the five, plus the seven unlabelled before and after | about 25 + 60 min | The parser result, and a label-free check on the unlabelled seven |
   | Reach from the frozen parses | none | Deterministic, before the screening run is spent |
   | Screening from parses, 15 conversations | about 6–7 h (0009's parse half took 5.6 h) | How the agent does with what now reaches it |

   About 8–9 hours in all, almost all of it the screening run. The labels half isn't re-run: same agent, same input to every model call.

   **What counts as better, fixed in the spec before the frozen run.** My starting numbers:

   - **Parser, pooled over the five:**
     - `patient` typed `clinical` at 11 or fewer (from 22);
     - `protocol` typed `clinical` at 3 or fewer (from 7);
     - misses in NCT04385368 at 8 or fewer (from 16).
   - **Guardrails:**
     - `clinical` typed `patient` not above 2;
     - precision at least 0.93;
     - narrative false positives not above 6;
     - merge rate not above 0.22;
     - polarity accuracy at least 0.99;
     - coverage and strict recall not lower;
     - no parse failures.
   - **Reach:** at least 117 of 183 patient facts scored (from 84). That's what the type bar implies with bundling unchanged.
   - **Screening from parses:**
     - confidently wrong rate not above 0.12;
     - abstention not above 0.10.

   The grader scores only criteria the labels call `patient`. So a parsed criterion typed `patient` that the labels call `clinical` is never graded, however the agent settled it. The run lists each one with what the agent recorded, as the dangerous direction's screening-side check.

   If the noise run shows identical input giving different parses, the spec widens each bar by what moved, before tuning starts. Whatever the runs show is reported. The bar decides only what the README may call an improvement.

4. **How tuning is limited, given the labels and the prompt share an author.** Recommend a split by study, a cap and wording rules.

   - **Dev: NCT04385368 and NCT00077350.** Between them, 15 of the 22 `patient`→`clinical`, 7 of the 7 `protocol`→`clinical`, all 16 misses, and one of the two errors in the dangerous direction.
   - **Held back: NCT03433469, NCT04316364 and NCT06728852.** 7 `patient`→`clinical` and the other dangerous one. NCT06728852 is a control: no type errors and the highest merge rate, so a fix that breaks what works shows there.
   - **Parsed once, after the freeze, and reported apart.** Their 9 screening conversations from parses are also reported apart from the dev studies' 6.
   - **What the split can't do.** It isn't unseen. I've read their errors, above. It limits how many measurements are taken against them to one. The drops have no held-back labels at all, since every miss is in NCT04385368. Their only out-of-sample check is unclaimed source on the seven unlabelled studies, which needs no labels. The README says so.
   - **At most four prompt versions measured on dev**, each committed with its eval result, so the number of tries is in the history. A fifth needs a gate.
   - **Wording rules for the prompt.** It states rules, never cases. No sentence, drug, procedure or phrasing is taken from the five labelled studies. Any example block is written outside the corpus, as the prompt's comment already requires.
   - **The tie-break goes into the guide before the prompt**, so the prompt follows a written rule rather than whatever the labels happen to contain.
   - **The stronger alternative, not recommended:** label a sixth study as a clean test set. That's the optional "more labels" row, and it would share an author too. The second annotator in the held slice is the real check, and nothing here replaces it.

5. **Reasoning mode: unchanged, recorded, and one side run.** The parser runs at the runtime default. For the pinned Qwen that's reasoning on: nothing is sent, and the model reasons before answering. Recommend:

   - **Keep it.** Changing it with the prompt would leave the numbers unattributable.
   - **Record it.** It goes on every parse and eval result, and in the cache key when set, the way `conversationKey` already does it.
   - **Add one parser-eval run with reasoning off on the frozen prompt**, about 15–25 min, reported beside the main result and never screened from. It tells the held comparison whether the local parser can be compared with reasoning off on both sides, which is 0008's open row, and it's cheap. If you'd rather keep the slice tighter, drop it and the row stays with the held comparison.

6. **Commit the parses: yes, all of them.** A parse is 9–40 KB. The five 0003 parses are 122 KB, all twelve at the frozen prompt about 300 KB, and every dev iteration a few tens of KB. Recommend un-ignoring `evals/results/parses/`, committing the 0003 parses 0009 screened from and every parse this slice makes, and adding a test that re-grades each committed parser eval result from its committed parses and requires identical numbers. Then `--source parse` works from a fresh clone, and every parser number in the README can be checked by `npm test`. The cost is under 1 MB and a rule to keep: a parse a committed result depends on is committed in the same change, the same rule the review files follow.

7. **The review serves the new run: yes.** The new run resumes 0009's 15 labels conversations unchanged and adds 15 new ones from parses. `EVAL_RUN` names it, `review:export` commits its review file (about 1.8 MB), and `npm run test:e2e` runs, since `EVAL_RUN` is on its list. Otherwise the review would show conversations from parses the page's `--source parse` no longer uses. The alternative keeps 0009's run and saves 1.8 MB. That's reasonable if you'd rather the repository not grow by a review file per slice.

## Gates, proposed for the plan to argue with

None needs clinical judgment.

- **After the noise run, before tuning: does the bar still mean something?** If identical input reproduces 0003's parses, this passes without you. If it doesn't, the bar has to widen after the data is seen, and **that change is yours**. Moving a bar after seeing numbers is the thing a bar is for preventing. Cost of being wrong: tuning against differences the model makes on its own.
- **At the freeze, before the held-back studies are parsed: is the prompt frozen, and does any of it read like a case?** **Needs you, about ten minutes:** the prompt's diff is a few sentences. The question is whether any sentence reads like one of the five studies' criteria rather than a rule. The author of the wording is the worst person to judge that. Cost of being wrong: the held-back result is spent once, and tuning after seeing it means it's no longer held back.
- **Before the screening run: is the parse worth six to seven hours?** Reach and the parser result are known by then, with no model call. **Delegable**, if the parser met its bar and the estimate is under ten hours. It's local and costs nothing but time. **Yours** otherwise, including whether to screen from a parse that missed its bar.
- **After the screening run: are the new confidently wrong findings from parses right, and whose are they?** Each one in transcript, attributed to parser, agent, simulator, grader or convention. Also the ungraded rows decision 3 lists, where a criterion the labels call `clinical` was parsed as `patient` and settled. Cost of being wrong: the README's parse-side claim. **Best read by you.** If it's delegated, the reader didn't write the prompt, its model and settings are recorded, and the README says it isn't independent.

The tie-break in decision 1 was also yours. You answered it with this intent (exposure versus condition), not at a gate.

## Open questions for the spec

1. **The exact tie-break sentence**, in ANNOTATION.md and in the prompt, and the list of labels, if any, that contradict it.
2. **The splitting rule's wording**, and whether it needs an example.
3. **How parse conversations are keyed**, so that 0009's cached conversations can still be found from its run's recorded versions, as decision 5 of 0009 did for prompt versions.
4. **What the parse cache key hashes:** the system prompt plus a normalization version, or the whole user-prompt template.
5. **The adversarial fixtures:** which recorded response they're built from, and one per kind.
6. **The bar's exact numbers**, and how the noise run widens them.
7. **The label-free check on the unlabelled seven:** unclaimed source and type counts before and after, and what a change there would mean.
8. **What the README says**, and whether any worked example shows a criterion that reached the agent only after the fix.
