# intent: 0009 agent fixes

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. Make the screening agent less overconfident, in the four ways 0004 found, and give it a way to say that a criterion does not apply to this person. Iterate on new dev vignettes only. Then re-run the fifteen scored vignettes once, from labels and from parses, and report the three least-seen v2 conversations apart from the other twelve. Local model only. The simulator and the vignettes are unchanged. The grader changes in one place, and only if decision 4 stands.

---

## Problem

0004 measured the agent as overconfident. From labels it was confidently wrong on 24 of 163 determinations (0.15), and abstained on 1 of 145 answerable facts (0.01). From parses it was 12 of 72 (0.17). It commits to nearly everything it hears. 0004's Gate 3 attributed the 24:

| Class | Findings | Whose |
| --- | --- | --- |
| Missed self-corrections | 6 | agent |
| Exclusions read backwards | 4 | agent |
| Settled where interpretation was needed | 4 | agent |
| Vague yeses accepted | 2 | agent |
| A criterion about the other sex recorded as does-not-hold | 6 | convention (`defer`), fixable by the agent |
| Simulator distortions | 2 | simulator, left alone |

0007's reading adds that half-hearted agreements ("I suppose so") and judgment answers ("I could quit if I had to") are one class with the third and fourth rows. I treat them as one class below: **hedged or interpretive answers settled**.

The roadmap's brief lists these and says what the intent has to settle. Reading the code and the twelve conversations I'm allowed to look at, several things are different from how the brief puts them.

**What I read to write this.** The 17 confidently wrong findings from labels in the twelve conversations that aren't held back: each criterion, the vignette's fact and the agent's evidence. Also the committed worked example (`evals/results/screening/examples/NCT00077350-v2-labels.txt`). I didn't open the conversations, findings or scores of `NCT03433469-v2`, `NCT04385368-v2` or `NCT06728852-v2`. Anyone writing the fixes has seen what I've seen. That's why the twelve are contaminated and the three are the cleaner view.

**Self-corrections are at least two faults, and one of them isn't about corrections.**

- The simulator gives each correction in the very next reply, before it answers the next question (`instructionFor` in `evals/participant/simulate.ts`). So the earlier answer is always inside the read call's four-turn window, and the corrected criterion is in the prompt's "ALREADY ANSWERED" list. But that list shows each criterion's text only. It doesn't say what was recorded or from which words. The prompt says "report one only if the reply corrects or changes that answer", and the model isn't given the answer. It also has one reply answering two criteria, with a line telling it which one the question was about. In the committed example, it read only that one.
- `applyReadings` already does the right thing when a correction is read: a determinate reading against a settled one becomes `unresolved` / `contradicted`. Across all 32 committed results, only 2 readings were ignored as already settled. So corrections are lost in the read, not in code.
- NCT00077350-v2 L15 (the committed example) is a different shape. The first statement ("I finished my chemotherapy four weeks ago") was volunteered in a reply about scans, and never recorded. The correction then arrived looking like a clean first answer. The fix for this is reading volunteered facts, not reading corrections.

**Prompt wording has already been tried for all four classes.** The read prompt already defines statement-truth for exclusions with a worked example. It already says "unclear" is for replies "too vague to tell, or [where] deciding would need interpretation (for example whether something counts as 'significant' or 'active')". It already asks for a reading on an answered criterion when "the reply corrects or changes that answer". 0004 noted the first isn't enough on its own, and the results show the other two aren't either. More words in the same prompt is the fix already measured. The levers left are what the read call is shown, what it has to write before its verdict, and what code does with the answer. Code and prompt layout can be pinned by deterministic tests. Wording can't.

**"Read backwards" isn't only exclusions.** In the twelve, an inclusion worded as a permission ("The use of bevacizumab is allowed, but the last administration must be more than 3 weeks before enrollment") was recorded as does-not-hold for "I had bevacizumab two months ago". The class is a criterion whose wording's polarity differs from its statement's: prohibitions, never-X, allowances with a condition.

**"Does not apply" needs a value, not better semantics.** "I am a woman, so that one about men is not for me" was recorded does-not-hold. Under statement-truth that is arguably literally true: she isn't a man who has had a vasectomy. The review then shows an inclusion that doesn't hold as *Not met*, which is wrong. The read call has six reading values, and none of them means "this person is outside who the criterion is about". No wording of the existing six fixes that.

**Three things in the code the brief doesn't mention:**

1. **The verdict-language pattern is part of the grader.** `VERDICT_PATTERN` lives in `evals/graders/screening.ts`, beside `SCREENING_GRADER_VERSION = "3"`. Narrowing it (brief: yes) and not changing the ruler (brief and you: the grader stays) collide. Decision 4 resolves it.
2. **The first prompt change breaks `npm test` until the new run exists.** `loadEvalRun` in `scripts/app/eval-run.ts` refuses a run whose prompt version isn't the code's current one, and `conversationKey` builds file names from the current `PROMPT_VERSION`. A test pins the refusal. Every test that reads the eval run (`tests/web/review.test.ts`, `tests/scripts/app-eval-run.test.ts`, the review sheet and score tests) would fail from the first commit that touches a prompt until a 12-hour run finishes and `EVAL_RUN` moves. That's most of the slice. Decision 5 resolves it.
3. **The review's tests read a gitignored cache.** The 30 conversation files `loadEvalRun` opens are in `evals/results/screening/conversations/`, which `.gitignore` excludes. `npm test` passes on this machine because the cache is here. From a fresh clone, every test that reads the eval run would throw. Repointing `EVAL_RUN` moves the dependency to a new cache that exists only here too. It predates this slice. Decision 6 says where it goes.

## Proposed outcome

**An agent that holds back where 0004's didn't.** For each class, a change the spec chooses, preferring levers a test can pin:

- **Self-corrections:** the read call sees what was recorded for each answered criterion, and the words it came from, so "does this change that answer" is a comparison it can make.
- **Volunteered facts:** the spec decides whether the L15 shape is in scope. It's one finding in the twelve, and the fix is different.
- **Polarity:** the spec picks a structural lever over more wording. One example: the read call writes the statement it is judging, in affirmative form, before its reading, and the statement is kept with the evidence where a reader can see it.
- **Hedged or interpretive answers:** "I suppose so", "probably", "I could quit if I had to" end as `unclear`, which already gets one follow-up and then closes as `unresolved`.

**A way to say "does not apply".** A new reading value for a reply that puts the person outside the group a criterion is about. For a `patient` criterion it becomes `unresolved` with a new reason, and it is final, like `unknown` and `declined`. No new status. So the review's groups, `tests/web/review.test.ts` and the grader all hold as they are. For a `defer` fact, any abstention is already graded correct. The review gets words for the new reason and reading, which typecheck will demand, because `REASONS` and `READINGS` in `src/web/review.ts` are typed records. What it does to a `clinical` criterion is for the spec.

Overuse shows up in the numbers. A denial read as "does not apply" on an answerable fact is an abstention, and the abstention rate is reported beside every confidently-wrong number.

**New dev vignettes, and iteration on those alone.** See decision 1. Every dev run is committed under `evals/results/screening/dev/`, as 0004's were, so how many tries it took is in the history.

**One scored re-run.** All fifteen vignettes from labels and from parses, 30 conversations, about 12 hours, after a gate. It's the run the README reports. If a fault turns up afterwards and a second run follows, the first is still reported, with the second beside it, never instead of it.

**A report that separates what moved.**

- Confidently wrong, abstention and correct abstention, before and after, from labels and from parses.
- The twelve and the three apart. The three were read at 0004's Gate 3. Their failures are known by kind, so they are least-seen, not unseen. Between them they hold 7 wrong findings, which is a small number, and the README says so.
- How much of the drop is the does-not-apply reading, which is close to mechanical, and how much is the four agent classes.
- The discipline counts: questions per turn, length, follow-ups, verdict language.
- A committed worked example of a caught self-correction, beside 0004's missed one.

**Attribution of the new run's wrong findings**, as at 0004's Gate 3: agent, simulator, grader or convention, by class. Its value comes partly from independence from whoever wrote the fixes. See the gates.

**The review repointed.** `EVAL_RUN` names the new run, and the review serves its 30 conversations. The README's screening section, the coordinator review section and the roadmap are updated with the new numbers.

## Absent on purpose

- **No simulator or vignette change.** `SIMULATOR_VERSION` stays `5fd4476340c9`, the fifteen scored vignettes are unchanged, and their set hash says so. New dev vignettes don't change the scored set.
- **No grader change except the verdict pattern** (decision 4). Confidently wrong, abstention, correct abstention and reported agreement are computed exactly as in v3.
- **No plain-language renderings in the ask call** (decision 2). `src/screening/` still doesn't import `src/plain/`, and `ScreeningCriterion` keeps its four fields.
- **No reordering for caching** (decision 3).
- **No change to reasoning mode** (decision 7). The agent, simulator and fidelity check keep `thinking: false`.
- **No change to the agenda.** The same order, `MAX_ASKS` of 2, no early stop. Criteria about the other sex are still asked. Only the reading of the answer changes. Skipping them would need the agent to know the person's sex, which nothing records.
- **No fix that keys on the vignettes' or simulator's wording.** Nothing matches "Actually", "Hang on", "I am a man" or any other phrase taken from a scored vignette or the simulator's correction instruction. Deterministic tests for the new behavior use wording written fresh.
- **No change to the parser.** That's 0011. Screening from parses measures the agent on the parser 0003 measured.
- **No paid API.** Nothing is run with `--spend`, and `.env` isn't created or edited.
- **No human blind reading of the three v2 conversations.** Once the agent changes, a reading of the old ones would measure a review of an agent that no longer exists.
- **No new review group, no status, no ordering by outcome.** `tests/web/review.test.ts` passes unchanged.

## Affected users and systems

**The coordinator.** Fewer rows claiming the participant's words settle something they don't. More rows in "Not settled", and a new reason among them that says the criterion doesn't apply to this person. A caught correction shows as *contradicted*, with both quotes, where today it is only in the transcript.

**The participant.** The questions may change a little, since the ask call's prompt is part of `PROMPT_VERSION`. Nothing about who is asked what, or in what order.

**`src/screening/`.** The read prompt and its builder, the reading values, `applyReadings`, `FindingReason`, and `PROMPT_VERSION`. Possibly the ask prompt. `ScreeningSession`'s shape, atomic turns and restore-from-state stay as they are.

**`src/web/review.ts`** and anything else that maps reasons or readings to words.

**`evals/cases/vignettes/dev/`.** New dev vignettes.

**`evals/graders/screening.ts`.** The verdict pattern and the grader version, if decision 4 stands.

**`scripts/app/eval-run.ts` and `evals/screening-runner.ts`.** How a run's conversation files are found (decision 5), and `EVAL_RUN` at the end.

**`evals/results/screening/`.** Dev runs, the new scored run, a new worked example.

**README, roadmap.** New numbers, the before and after, the three reported apart, the limits.

**Not touched:** `src/criteria/`, `src/plain/`, `src/models/`, `src/transport/`, `src/server/` beyond what the new reason's words need, the simulator, the scored vignettes, labels, `data/`.

## Constraints

- **Local model only.** Every model call goes to oMLX. oMLX goes down. If a call fails, check `http://127.0.0.1:8000/health` before assuming the code is wrong.
- **Iterate on dev vignettes only.** The fifteen run once, after a gate.
- **Don't open the three.** Nobody designing fixes opens the old conversations or graded findings of `NCT03433469-v2`, `NCT04385368-v2` or `NCT06728852-v2`. Tests load them, and that's fine: a test reading a file isn't a person reading it. Their before and after are printed only after the fixes are frozen.
- **Transparency holds.** 0005's test drives one scripted conversation directly, through `MemoryTransport` and through HTTP, and requires identical state. It keeps passing.
- **The review's rule holds.** `tests/web/review.test.ts` passes unchanged. Nothing sorts, colours or summarises by outcome.
- **The boundaries hold.** Nothing outside `src/models/` calls a model. `src/screening/` doesn't import `src/plain/`. `tests/boundary.test.ts` passes unchanged.
- **The run's time is bounded.** 0004's run took about 11.5 hours for 30 conversations. A fix that adds a model call per turn adds hours. The spec says what each fix costs per turn, and a run estimated above about 16 hours is a decision at the gate before it, not a surprise during it.
- **Every result records** model, quantization, temperature, seed, reasoning mode, prompt version, simulator version and grader version.
- **No gate needs clinical judgment.** The vignettes' expected outcomes settle what's right. Everything a gate asks is a reading of two sentences side by side, or of a transcript.
- **`npm test` stays near a second, and deterministic.**

## Decisions

1. **How tuning on the scored vignettes is limited.** Recommend the brief's answer, with two things it leaves out.

   - **New dev vignettes, one or more per class**, written under `evals/cases/VIGNETTES.md`'s rules, in `evals/cases/vignettes/dev/`, never scored. The classes: self-corrections, polarity (prohibitions, never-X, allowances), hedged or interpretive answers, and does-not-apply. Plus one control on each vignette that should still settle cleanly, so a fix that simply abstains more is visible on dev before it's visible on the scored run.
   - **They share criteria with the scored set, and that can't be avoided cheaply.** Rule 9 has vignettes written against labels, and only five studies are labelled, all of them already used by the fifteen. Rule 4 makes each vignette cover every `patient` criterion in its study, so a dev vignette is a whole conversation, about ten minutes. So: spread the dev vignettes over at least three studies. For each class, aim the fact at a criterion that didn't fail in the twelve where the class allows it. Word every fact fresh, never adapted from a scored fact. Does-not-apply has the least room: its criteria are the sex- and pregnancy-specific ones, a few per study, and some of them failed. Its fix is also the least open to tuning.
   - **Provenance says what the drafter had seen.** `sawAgentPrompt: true`, and a note that the drafter read the 17 wrong findings in the twelve.
   - **The stronger alternative, not recommended:** label a sixth study and write the dev vignettes against it, so dev and scored share no criteria. It's a labelling job with its own reading. That's the optional "more labels" row, not this slice.
   - **Iterate on dev only. Every dev run is committed. The fifteen run once.** The first scored run after the freeze is the one reported.

2. **Plain-language renderings in the ask call: no.** No metric measures a question's wording, so the change would be unmeasured. It would cross 0006's boundary that keeps `src/screening/` from importing `src/plain/`. It would also make each question depend on a rendering the read call never sees. "On a scale of 0 to 1" stays a known gap in the roadmap.

3. **Reordering prompts for caching: no.** This slice already changes the read prompt's layout, to show recorded answers. Reordering for a frontier cache is a different change for a benefit that exists only with a paid API, and mixing it in makes it harder to say which change moved the numbers. The held comparison can do it, and re-run.

4. **Narrowing the verdict-language pattern: yes, as the one grader change, proved not to move the scored numbers.** It over-matches the criteria's own words ("candidate for surgery", "eligible for an R0 resection"). All 14 hits in 0004 were that, and the re-run's transcripts will be read against it. Because it lives in the grader:
   - bump `SCREENING_GRADER_VERSION` to `"4"`, with the pattern the only change;
   - re-grade 0004's cached conversations under v4, with no model call, before any prompt changes, and commit that;
   - require confidently wrong, abstention, correct abstention and reported agreement to be identical under v3 and v4. That's the proof the ruler for the scored numbers didn't move. Before and after verdict counts are both v4.

   The alternative is to leave the pattern alone and read every hit by hand again, as 0004 did. That keeps the grader untouched to the letter, and costs a reading of noise at the gate after the run. I prefer narrowing. It's your call, since you said the grader stays.

5. **The review keeps serving 0004's run until the new one exists.** Recommend that the eval-run loader find a run's conversation files by the prompt and simulator versions the run file records, not the code's current ones. The refusal test changes in the open, to "refuses a run whose files are missing or don't match its recorded versions". What it costs: the review can show conversations today's code wouldn't make. That is what a record of a run is. The review renders results, not code. The alternatives are red tests across most of the slice, or holding prompt changes uncommitted until the re-run. The second loses the committed dev runs that make iteration visible.

6. **The review's tests depending on a gitignored cache: not fixed in 0009, placed in 0010.** Committing what the review reads for one run (results and criteria) is about 0.9 MB of JSON for 30 conversations, and a policy for every later run, not a detail. 0010's browser tests have to run the page from a clean state anyway, so it's the slice that has to answer it. 0009 records it in the roadmap.

7. **Reasoning mode stays off.** Switching the read call's thinking on might fix more than any prompt. It would also change the model's configuration rather than the agent, multiply the run's hours by an amount nobody has measured, and leave the held comparison unable to hold reasoning fixed across models. It's a lever for another slice, recorded.

8. **Success is written down before the run.** Recommend that the spec fixes what counts as better and what counts as worse, with numbers, and that Gate 2 confirms them before anything is spent. The baseline on the twelve from labels is 17 of 122 confidently wrong (0.14) and 1 of 108 answerable abstained (0.01). My starting point for the spec: better means confidently wrong at or below about half that on the twelve, with abstention at or below 0.10, and the parse run not worse. Whatever the run shows is reported. The bar decides only what the README is allowed to call an improvement.

## Gates, proposed for the plan to argue with

None needs clinical judgment.

- **Before iterating: are the dev vignettes fair and on target?** You read them with `npm run vignettes:check`, which prints dev vignettes too, the way 0004's Gate 1 read the scored ones. Does each expected outcome follow from two sentences side by side, does each class have a fact that tests it, and is anything worded like a scored fact? What it costs to be wrong: fixes tuned on soft or copied material, which then flatter the scored run. **Its value comes partly from an independent reader.** The same author writes the dev vignettes and the fixes, and can write a vignette the fix will handle without meaning to. Don't delegate it to me.
- **Before the scored run: are the fixes frozen, and is the run worth its hours?** You see the dev results across iterations, the estimated hours, and the success bar from decision 8. What it costs to be wrong: about 12 hours of model time, spent twice, and a second run that has to be reported beside the first. You can delegate the reading of dev results. The go-ahead to spend the time is yours.
- **After the scored run: are the grades right about what happened?** Every confidently wrong finding, in transcript, attributed to agent, simulator, grader or convention, and whether the numbers go in the README as they stand. What it costs to be wrong: the README's headline, which is the project's claim about its open question. **Its value comes partly from independence from whoever wrote the fixes.** A fixer attributing the fixed agent's failures has every reason to find them someone else's. Best read by you. If it's delegated, the reader shouldn't have written the fixes, its model and settings are recorded, and the README says it isn't independent.

## Open questions for the spec

1. **The lever for each class**, and what a deterministic test pins for each. In particular: what the read call is shown for an answered criterion, and whether the read output gains a field (such as the statement being judged) that is kept with the evidence.
2. **Volunteered facts.** Whether the L15 shape, a first statement volunteered and never recorded, is in scope, and if so how the read call is shown the open criteria it might address.
3. **The does-not-apply reading and reason:** their names, the rule the read prompt gives for them, what they do to a `clinical` criterion, and the review's words.
4. **Cost per turn.** What each fix adds in calls and tokens, and the estimated hours of the scored run.
5. **The dev vignettes:** how many, which studies, which class each carries, and their controls.
6. **Noise.** One run per vignette, and every conversation takes a different path once a question changes. Whether to run the dev set under a second seed to see how far a number moves with no fix at all, before reading a scored difference of two or three findings as real.
7. **The success bar's exact numbers** (decision 8).
8. **The narrowed verdict pattern** and the re-grade of 0004's run (decision 4).
9. **The loader change** (decision 5), and what the refusal test becomes.
10. **How the three's before and after are produced:** a command that prints the twelve and the three apart, run only after the freeze.
11. **What the README says**, and which conversation becomes the worked example of a caught correction.
