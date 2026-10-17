# plan: 0009 agent fixes

**Intent:** `work/0009-agent-fixes/intent.md` · **Spec:** `work/0009-agent-fixes/spec.md`
**Branch:** `0009-agent-fixes` (from `main` at `64b60e6`; intent `13c6d93`, spec `416cce1` and `f1a22db`, roadmap `3af59b0`)

---

## Context

0004 measured the screening agent as overconfident: confidently wrong on 24 of 163 determinations from labels (0.15), abstaining on 1 of 145 answerable facts. 0009 changes how replies are read so the agent holds back where its words don't settle a criterion. It also gives it a way to say a criterion doesn't apply to this person. Then it re-measures once.

The design is settled in the spec:
- The read call writes a `statement` and an `outright` judgement before its reading.
- Code holds back a determination that isn't outright.
- A `does-not-apply` reading closes a criterion as unresolved with its own reason.
- The read call is shown what was recorded for answered criteria.
- The ask call, the agenda and the templates don't change.

**What is scarce is local model hours and the independence of the readings, not money.** Nothing calls a paid API. Claude never passes `--spend` and never touches `.env`. A dev iteration is about 1.5–2 hours (five dev vignettes at 15–25 minutes each, simulator and fidelity check included), and the scored run is 13–14 hours. Gates 1 and 3 get their value partly from a reader other than the person writing the fixes, so the owner reads them.

**Nobody designing fixes opens the old conversations, graded findings or scores of `NCT03433469-v2`, `NCT04385368-v2` or `NCT06728852-v2`.** Tests load them, and that's fine. Their numbers are first printed at step 13, after the scored run.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. Groundwork, agent unchanged** | 1–5 | no gate | `PROMPT_VERSION` still `c5778afe9cbd`. The review loads runs by their recorded versions. Grader v4. `screening:compare` prints the twelve for 0004's run. `vignettes:check` warns on borrowed wording |
| **B. Dev vignettes** | 6 | **Gate 1** | Four new dev vignettes, with provenance notes listing which fact tests which class |
| **C. Dev baseline** | 7 | no gate | 0004's agent on the five dev vignettes, committed, with its dev report |
| **D. The agent** | 8–10 | **Gate 2** | The new read call. Dev runs per iteration, committed, each with a report against the baseline |
| **E. The scored run** | 11–13 | **Gate 3** | 30 conversations graded. The twelve and the three reported apart. Every wrong finding attributed |
| **F. Repoint, document, PR** | 14–17 | PR | The review serves 0009's run. README, CLAUDE.md, roadmap. Review passes |

**Gate 1: are the dev vignettes fair and on target? (spec §11.1)**
The owner reads the four new dev vignettes with `npm run vignettes:check`, which prints each fact beside its criterion's text, and reads each vignette's provenance note. They decide:
1. Does each expected outcome follow from the two sentences side by side, under `VIGNETTES.md`?
2. Does the set reach spec §5.1's counts, per class and per control?
3. Does anything read like a scored fact? The check's overlap warning finds exact runs of five words. It can't find a paraphrase.

*Why it guards Stage C:* every dev iteration is judged on these vignettes. A soft or borrowed fact tunes the fixes to what they already handle, and the scored run then flatters them. After the baseline runs, changing a vignette means running the baseline again, about 2 hours. It can come back no: a fact needing interpretation, or a class short of facts, is rewritten before step 7.

**The owner reads this one. Not delegated to Claude.** Claude writes both the dev vignettes and the fixes, so its own reading of the vignettes is what the gate exists to check. No clinical judgment is needed. Every question is a reading of two sentences side by side.

**Passed 2026-09, delegated, not read by a person.** The owner chose not to read it by hand and asked for an independent agent instead. A first attempt in another Opus session declined to review, because the paste had also carried Claude's own list of likely disputes and counts. The reading was then done by a **Claude Sonnet 5** subagent (`claude-sonnet-5`) in a fresh context. It was given only the brief: `VIGNETTES.md`, the four dev vignettes, the check's output, and the scored vignettes for wording comparison. It was barred from `evals/results/`, `src/screening/`, this slice's documents and the roadmap. It reports reading nothing else. It is a different model from the author, but the same family, and not a person. The PR says so.

It returned **CHANGES NEEDED**, and every finding was applied (the owner: "go"):
- NCT04385368 L57 `unresolved` → `defer`. The grade is identical; the label is more accurate.
- NCT04385368 L62 contradicted L61 without a `laterSays`, so it became a vague `unresolved`.
- NCT03433469 L72's trial drug could be read as cancer treatment against L59, so it became a migraine drug trial.
- Four paraphrases of scored facts the five-word check missed were rewritten: NCT06728852 L20, NCT04385368 L63, NCT03433469 L72 and NCT00077350 L35.
- A third vignette gained a self-correction (NCT03433469 L20) for margin above the floor. Does-not-apply stays at 3, the most one dev vignette per study allows.
- NCT00077350's persona was softened to match its answers.

After the changes, the check shows no warnings on the four, and the tests pass.

**Gate 2: freeze, and is the scored run worth its hours? (spec §11.2)**
Reached when the dev results are good enough to freeze, or after five iterations, whichever comes first (spec §5.3). The owner sees:
- the dev report for every iteration against the baseline: wrong, abstained and correct per vignette, the controls' outcomes, and `withheld` readings;
- seconds per read call, baseline against the latest, and the scored run's estimate from them;
- spec §8.2's bar, which is fixed and restated.

They decide:
1. Are the prompts frozen?
2. Is the run worth its estimated hours?

It can come back no. A control that abstains on dev means the fix trades wrong answers for abstentions, and another iteration (or a stop) follows. An estimate over 16 hours stops it.

*Why it guards Stage E:* about 13–14 hours of model time. A fault found afterwards means a second run, which is reported beside the first, never instead of it.

**The owner can delegate the reading of dev results. The go-ahead to spend the hours is theirs.**

**Brought to the owner 2026-09, after three iterations.** Dev results, confidently wrong / determinations (abstained / answerable):

| Run | Prompt | Wrong | Abstained |
| --- | --- | --- | --- |
| Baseline (0004's agent) | `c5778afe9cbd` | 7 / 50 (0.14) | 0 / 43 |
| Iteration 1 | `83f8a458c7ed` | 5 / 47 (0.11) | 1 / 43 |
| Iteration 2 | `ed2ce37c6d18` | 3 / 44 (0.07) | 1 / 43 |
| Iteration 3 | `2c46ada9a1d5` | 5 / 47 (0.11) | 1 / 43 |

By class, across the three iterations:
- **does-not-apply:** fixed every time (NCT03433469 L49, NCT06728852 L16).
- **self-corrections:** named corrections caught every time (NCT00077350 L4, L14), and the qualified one since iteration 2 (NCT03433469 L20). The unnamed one (NCT04385368 L64) was never caught.
- **hedged or interpretive:** the class that moves between runs. NCT00077350 L34 abstains; NCT04385368 L57, L63 and L65 and NCT06728852 L15 flip.
- **polarity:** unbroken except one inverted statement in iteration 2.
- **controls:** every firm agreement and plain denial settled. One man's pregnancy or breastfeeding answer abstains in each iteration, which is one abstention, never a wrong finding.

**Pace.** Measured back to back on the same turn, the new read costs about 13% more per call. The dev runs' own averages are unusable for an estimate, because the machine was under outside load (load average 4.5 to 6.8, and one conversation took 81 minutes). On an idle machine the scored run should be about 12.5–13.5 hours. Under the load seen tonight it could pass 16.

**Recommendation.** Freeze iteration 3's prompt (`2c46ada9a1d5`, the branch as it stands). Every change in it was made for a fault seen, not for its score, and choosing iteration 2 for its better number would be choosing on noise. Run the scored run when the machine is otherwise idle. Spec §8.2's bar is unchanged: on the twelve from labels, better is wrong ≤ 0.07 with abstention ≤ 0.10; worse is wrong > 0.14 or abstention > 0.10.

**Passed 2026-09, delegated.** The owner asked what the slice was for and what the run would add, then: "ok, I trust your judgement, continue". Claude's recommendation stands. The prompts are frozen at `2c46ada9a1d5` (`ce2cf51`), and the scored run goes ahead. Nothing in `src/screening/` changes from here until the run is reported.

**Gate 3: are the grades right about what happened? (spec §9, §11.3)**
The reader reads every confidently wrong finding of the new run, all fifteen vignettes and both sources, in transcript with `npm run screening:show`. Each is attributed to agent (by class), simulator, grader or convention. The reader also reads every `withheld` reading on a fact the vignette expects settled, and the conversations with the most `does-not-apply` readings, for overuse. They decide whether the numbers go in the README as measured.

*Why it guards Stage F:* the README's headline is the project's answer to its open question. A grade that disagrees with a transcript could be wrong about either, and only a reader can tell which.

**The owner reads this one.** Its value comes partly from independence from whoever wrote the fixes, and Claude wrote them. If they delegate it anyway:
- the reader must not have written the fixes;
- its model and settings are recorded here;
- the README and the PR say the reading isn't independent.

No clinical judgment is needed. The vignettes' expected outcomes settle what's right.

**Read 2026-09, delegated, not by a person.** The owner: "Delegate it". The reader was a **Claude Sonnet 5** subagent (`claude-sonnet-5`) in a fresh context. It was given the run file, its conversations through `screening:show`, the vignettes, the labels, `VIGNETTES.md` and the grader. It was barred from `work/`, the README, `src/screening/` and the git history, and reports reading nothing else. It returned PROBLEMS FOUND. Its attribution of the 17 confidently wrong findings: agent 11, convention 2, simulator 2, grader 2.

**Claude checked the four non-agent, non-simulator calls against the conversation files and disagrees with all four.** Each override moves a finding onto the agent, against the author's interest:
- NCT06728852-v2 L19 from parses, "grader": the parsed criterion P12 is an exclusion. The agent's statement is right ("The person has previously failed treatment with… anlotinib"), and so is the quote ("Yes, I was on anlotinib last year and the treatment failed"), but the reading is `does-not-hold`. **Agent, polarity read backwards**: the reading contradicts its own statement.
- NCT06728852-v3 L15 from parses, "grader": P9's text is "Female patients of childbearing potential must agree…". Only L15 is scored against it (L16 is bundled, not scored). The agent's statement dropped the group ("The person agrees to use contraception…") and recorded `holds` for a man. **Agent, other: a statement that drops the group**, so does-not-apply was missed.
- NCT04385368-v3 L70 from labels, "convention": the first answer "No, I have never smoked. I'm a never-smoker." was read `unclear` against the statement "The person is a never-smoker…". The correction was then the only determination. **Agent, missed self-correction.**
- NCT00077350-v2 L15 from labels, "convention": the first statement was volunteered and never recorded, then corrected. **Agent, missed self-correction** (the worked example's case).

**Attribution as it stands: agent 15, simulator 2, grader 0, convention 0.** Agent by class:
- missed self-correction: 4 (NCT00077350-v2 L3 and L15, NCT04385368-v3 L70 from labels and from parses);
- settled where interpretation was needed: 5 (NCT06728852-v1 L38, NCT06728852-v2 L15 from labels and from parses, NCT06728852-v2 L20, NCT00077350-v1 L34 from parses);
- hedged answer accepted: 1 (NCT03433469-v3 L20 from parses);
- polarity read backwards: 1 (NCT06728852-v2 L19 from parses);
- other: 4 (NCT00077350-v2 L33, a time comparison inverted; NCT06728852-v1 L16, which settled "is a male patient" instead of the agreement; NCT06728852-v1 L1 from parses, which read "I would sign" as not yet signed; NCT06728852-v3 L15 from parses, a statement that drops the group).

Simulator: NCT04385368-v2 L63 and NCT06728852-v1 L38 from parses, each an unscripted line that settled the ambiguity the fact tests.

**The reader's abstention findings stand, and they are the fixes' cost.** 8 of the 11 abstentions are over-caution:
- four are "I'm a man, so not pregnant/breastfeeding/lactating" read as does-not-apply ("five" when first written; the list and the run file both give four, corrected at step 15) on a condition criterion (NCT00077350-v2 L20, NCT04316364-v1 and -v3 L20, NCT03433469-v2 L68 from parses), the fault the dev controls showed once per iteration;
- four are plain denials in NCT04385368-v3 (L57, L65, L66, L69) held back, beside a persona that hedges in every reply.

Three are reasonable: NCT04316364-v2 L18, and the two NCT03433469 L22 from parses, where the parsed criterion adds "women of childbearing potential".

**Recommendation: the numbers go in the README as measured.** No grade is wrong on inspection, and the grader is unchanged (v4 differs from v3 only in the verdict count). The README reports the reader's attribution, Claude's four overrides and why, and that the reader was a model, not a person.

**Decided 2026-09 by the owner ("go"):** the numbers go in the README as measured, with the attribution as it stands after Claude's overrides. Both attributions are reported, and so is the fact that the author overrode the reader. No second reader was asked to check the four.

---

### Steps

Each step is one commit, except that a dev iteration (step 10) is one commit per iteration. `npm test`, `npm run typecheck` and `npm run lint` pass at every commit. Lint is read by its exit code (`npx biome check . >/dev/null; echo $?`). No test uses `vi.mock`, `vi.stubGlobal`, `vi.spyOn` or `vi.useFakeTimers` (`tests/boundary.test.ts`). If a model call fails, check `http://127.0.0.1:8000/health` before touching code.

**Stage A: groundwork, agent unchanged**

1. **Commit this plan, reconcile the spec, record the baseline.**
   - Baseline: 853 tests (846 passed, 7 expected fail), with Vitest's duration over three runs.
   - Spec §5.3 says NCT04316364-dev "re-grades from its cached conversation". It doesn't. That conversation was made with simulator `e3414083139e`, and today's key needs `5fd4476340c9`. It runs fresh in the baseline. Correct the spec.
   - Spec §3.5's fitting test fails on 0004's prompts. `READ_SYSTEM_PROMPT`'s example of a general denial, "I'm not allergic to any medicines", shares "not allergic to any medicines" with a scored fact. The read prompt is rewritten in step 9, so the example is replaced with fresh wording there, and the test lands in the same commit. Record in the spec.
   - Spec §3.7 gains the dev iteration's cost (1.5–2 hours) so Gate 2's arithmetic is visible.

2. **Find a run by what it recorded (spec §7.1, §7.2).**
   - `evals/screening-runner.ts`: `conversationKey` takes optional `versions: { prompt, simulator }`, defaulting to `PROMPT_VERSION` and `SIMULATOR_VERSION`. The runner's calls don't change.
   - `scripts/app/eval-run.ts`:
     - `loadEvalRun(dir, runFile)` keys files by `run.promptVersion` and `run.simulatorVersion`;
     - it throws on a missing file, an unfinished result, or a result whose `run.promptVersion` differs from the run's;
     - it adds `READING_RUN = "01-c5778afe9cbd.json"`. `EVAL_RUN` is unchanged.
   - `scripts/review-sheet.ts` and `scripts/review-score.ts`: `loadEvalRun(SCREENING_DIR, READING_RUN)`, and `loadGrades` reads `READING_RUN`.
   - `tests/fixtures/eval-run.ts` gains `readingRun()`, loaded once, returning the same object as `evalRun()` while the two names agree. `tests/scripts/review-sheet.test.ts` and `review-score.test.ts` switch to it.
   - `tests/scripts/app-eval-run.test.ts`: the refusal test becomes two tests. A run with another prompt version loads from files keyed by that version (a temp dir, as today), and a file whose result's `promptVersion` disagrees with its run is refused.

3. **Grader v4: the narrowed verdict pattern (spec §6).**
   - `evals/graders/screening.ts`: `VERDICT_PATTERN` uses v3's words, with a lookahead that skips a word directly followed by "for" and up to four words not naming study, trial or research. `SCREENING_GRADER_VERSION = "4"`. Keep v3's pattern exported as `VERDICT_PATTERN_V3`, which the subset test and `screening:compare` need.
   - `tests/evals/screening-grader.test.ts`:
     - criterion phrasings from the labels ("candidate for surgery", "eligible for an R0 resection") don't match;
     - fresh verdicts do ("You may not be eligible.", "That would make you ineligible.", "You qualify for this study.", "You'd be a good candidate.");
     - everything v4 matches in both lists, v3 matches too;
     - the existing negative case and the template test still pass.
   - `tests/evals/screening-runner.test.ts`'s `graderVersion` fixture follows.

4. **`npm run screening:compare` (spec §8.3).**
   - `scripts/screening-compare.ts`, with pure exports for tests:
     - `compareRuns(before, after, { leastSeen })` returns the numbers;
     - `renderComparison` produces the text;
     - `devReport(run)` gives the dev view.
   - It reads committed run files only.
   - `LEAST_SEEN`, the three vignette ids, moves to `scripts/lib/least-seen.ts`. `review-sheet.ts`'s `reserveSet` uses it, so its test still expects the same three.
   - `OTHER_SEX_FACTS`, for the twelve, is built by reading the twelve's vignette files: every `defer` fact whose words say the criterion is for the other sex. It includes NCT03433469-v1 L49, NCT03433469-v3 L49, NCT06728852-v1 L15 and NCT06728852-v3 L15. Claude doesn't open the three's vignette files here.
   - For a v3 "before" run, verdict hits are the stored texts filtered by `VERDICT_PATTERN`, and the output says so.
   - Without `--least-seen`, the three's numbers are never computed into the output.
   - `package.json`: `"screening:compare": "node --import tsx scripts/screening-compare.ts"`.
   - `tests/scripts/screening-compare.test.ts`, on small made-up run objects:
     - pooled twelve;
     - the other-sex exclusion;
     - the three absent without the flag, and present apart with it;
     - v3 hits filtered by v4;
     - the dev report listing every not-correct fact.
   - Run it once on 0004's run against itself, without `--least-seen`. The twelve read 17 of 122 and 7 of 54, matching spec §8.2.

5. **`vignettes:check` warns on borrowed wording (spec §5.2).**
   - `scripts/check-vignettes.ts`: `borrowedWording(dev, scored)` returns a warning for each dev fact's `says` or `laterSays` sharing a run of five or more normalised words with any scored fact. It's added to `setWarnings`' output for dev vignettes only.
   - Tests in `tests/evals/` (beside the existing check tests): it fires on a made-up borrowed fact, doesn't fire on fresh wording, and ignores scored-against-scored overlap.
   - Today's `NCT04316364-dev` is checked too. Any warning it raises is recorded in the change table, not fixed, because it isn't edited (spec §5.2).

**Stage B: dev vignettes**

6. **Four dev vignettes (spec §5.1, §5.2).**
   - `evals/cases/vignettes/dev/`:
     - `NCT00077350-dev.json` (`contradicts`);
     - `NCT03433469-dev.json` (`cooperative`);
     - `NCT04385368-dev.json` (`vague`);
     - `NCT06728852-dev.json` (`declines`).
   - Each follows `VIGNETTES.md`. Every `patient` label gets a fact, and `labelSetSha` pins its label file.
   - Provenance: `drafter: "claude-opus-5-5"`, the guide, `sawAgentPrompt: true`. The `note` says the drafter read the 17 wrong findings in the twelve, and lists which fact tests which class, and which facts are controls.
   - Written against the labels' `quote` only. Polarity, hedged and self-correction facts avoid the fifteen labels listed in spec §5.1. Corrections are worded variously, and at least one has no marker word.
   - `npm run vignettes:check` shows no errors and no borrowed-wording warnings. `npm test` passes: the loader test covers every committed vignette.
   - → **Gate 1.**

**Stage C: dev baseline**

7. **0004's agent on the dev set.**
   - `npm run eval:screening -- --dev` at `PROMPT_VERSION` `c5778afe9cbd`. All five from labels, about 1.5–2 hours. The run file is committed under `evals/results/screening/dev/`.
   - `npm run screening:compare -- <baseline> <baseline>`'s dev report is pasted into this plan's change table in summary: wrong, abstained and correct per vignette, and which targeted facts failed.
   - The baseline is where the dev "before" for every iteration comes from.

**Stage D: the agent**

8. **Types, rules and words, with no prompt change (spec §3.3, §3.4).**
   - `src/screening/types.ts`: `"does-not-apply"` in `ReadingValue`, `FindingReason` and `ReportedValue`. `Evidence.statement?` and `Evidence.withheld?`.
   - `src/screening/apply.ts`:
     - `Reading` gains optional `statement` and `outright`;
     - the `outright: false` downgrade;
     - the `does-not-apply` rows of both tables.
   - `src/screening/calls.ts`: `READINGS` accepts `does-not-apply`. The new fields aren't required yet, so this commit changes no prompt and `PROMPT_VERSION` stays `c5778afe9cbd`.
   - `src/web/review.ts`: `REASONS`, `READINGS` and `REPORTED` entries from spec §3.4. Anything else typecheck flags gets the same words.
   - `scripts/show-conversation.ts`: prints `statement` after each quote, and "(read as <reading>, not outright)" for `withheld`, in both text and HTML.
   - Tests:
     - `tests/screening/apply.test.ts`: every row of spec §3.3's tables, the downgrade for each determination, no change for non-determinations, `statement` stored. All with made-up replies.
     - `tests/web/review.test.ts` needs no edit. Its word tests cover the new keys through the typed records.
     - `tests/evals/show-conversation.test.ts`: a withheld reading and a statement render.

9. **The read call (spec §3.1, §3.2, §3.5).** This commit changes `PROMPT_VERSION`.
   - `src/screening/prompts.ts`:
     - `READ_SYSTEM_PROMPT` gains the `statement`, `outright` and `does-not-apply` rules and the rule to read every criterion a reply addresses;
     - the JSON template follows spec §3.1's field order;
     - examples are written fresh, and the "not allergic to any medicines" example is replaced;
     - `buildReadPrompt` shows `recorded:` and `reported:` lines and the new heading for answered criteria, which needs `ReadContext.answered` to carry each criterion's last determinate evidence and status;
     - `PROMPT_LAYOUT = 4`.
   - `src/screening/session.ts`: `#readable` supplies that evidence.
   - `src/screening/calls.ts`: `readRead` requires a non-empty `statement` and a boolean `outright`.
   - `scripts/app/scripted-agent.ts`: its read responses gain `statement` and `outright: true`.
   - Tests:
     - `tests/screening/calls.test.ts`: the new shape accepted, each missing field refused;
     - `tests/screening/prompts.test.ts`: the answered lines, and the fitting test from spec §3.5, which is the only test reading the scored vignettes' facts;
     - `tests/screening/session.test.ts`: the scripted correction arriving with the next answer ends `contradicted` with both quotes, and a scripted "does not apply" ends `unresolved` / `does-not-apply`.
   - Existing fake read responses in those files gain the two fields, with no assertion changed. `tests/server/app.test.ts`'s transparency test passes unedited.

10. **Iterate on dev (spec §5.3).** One commit per iteration, at most five before Gate 2.
    - Each iteration: `npm run eval:screening -- --dev`. Commit the run file. Add one change-table row with the prompt version, what changed and the dev report against the baseline (step 7).
    - Allowed without a spec change: prompt wording, rules and examples. The fitting test must keep passing.
    - A lever change (a field, a reading value, a code rule, a call) is also a spec edit, in the same commit.
    - Read truncations are counted. If `READ_MAX_OUTPUT_TOKENS` is raised, that's in the row.
    - The last iteration records seconds per read call against the baseline's, and the scored run's estimate.
    - → **Gate 2.**

**Stage E: the scored run**

11. **Run the fifteen, once (spec §8.1).** `npm run eval:screening` runs 30 conversations. It resumes after an outage. Its progress goes to a log in the scratchpad. Claude checks it at roughly hour-long intervals, reading the log with the three ids filtered out (`grep -vE 'NCT03433469-v2|NCT04385368-v2|NCT06728852-v2'`), and restarts the run after an outage once `/health` answers. Commit the run file under `evals/results/screening/` as written.

12. **The worked example.** `npm run screening:show -- <NCT00077350-v2 labels conversation> --html`, committed as `evals/results/screening/examples/NCT00077350-v2-labels-0009.{html,txt}` beside 0004's, whatever it shows.

13. **The report (spec §8.2, §8.3).**
    - `npm run screening:compare -- 01-c5778afe9cbd.json <new run>`: the twelve, labels and parses, and the bar's verdict (better, worse or mixed).
    - Then, the fixes being frozen, the three's entries are added to `OTHER_SEX_FACTS` from their vignette files, and the command is run again with `--least-seen`. That's the three apart, before and after.
    - Both outputs are recorded in this plan.
    - → **Gate 3.** Its attribution is written into this plan under the gate.

**Stage F: repoint, document, PR**

14. **Repoint the review (spec §7.2, §7.3).**
    - `EVAL_RUN` names the new run.
    - `EVAL_RUN_NOTE` becomes "From 0009's eval run. …", and the note's pin in `tests/web/review.test.ts` changes with it. The flip test is untouched.
    - `npm test` now loads two runs. Measure the time against step 1's baseline and record it.
    - `npm run app -- --fake` lists the new 30. `review:score` still reports 0007's reading unchanged: 24 known wrong, 15 in the reading set.

15. **Documentation (spec §10).**
    - README: the screening section per spec §10.2, and the coordinator review section saying its reading was of 0004's run.
    - CLAUDE.md:
      - the verifying table gains `screening:compare`;
      - the `app`, `review:sheet` and `review:score` lines are updated per spec §10.1.
    - `work/ROADMAP.md`: the 0009 row done, and "Carried forward from 0009".
    - This plan's change table and file list, as built.

16. **Review passes.** `REVIEW.md`'s passes. Each fix is its own commit, and a bug fix commits its failing test first.

17. **PR.** Says which gates were delegated and by whom, the bar's verdict, the three reported apart, and that Gate 1 and Gate 3's independence came from the owner reading (or didn't, if delegated). No attribution lines.

---

## What changed during implementation

| Step | Change | Why |
| --- | --- | --- |
| 1 | Baseline recorded: 853 tests (846 passed, 7 expected fail), 718–756 ms over three runs | So step 14 can say what loading two runs costs |
| 2 | Also added `loadReadingRun()` in `scripts/app/eval-run.ts`, which the two reading scripts call. `review:score --groups` uses the reading run too | One place names the reading run's loader. `--groups` counted 0007's measurement, so it stays with the run 0007 read |
| 3 | v4 drops 9 of the twelve's 11 stored v3 hits, all criterion wording ("a candidate for surgery", "eligible for an R0 resection"). The 2 it keeps are the agent's own framing, "To help us check eligibility, …". Kept deliberately | They decide nothing, but they are the agent raising eligibility unprompted, which is what the count is for. The spec's rule keeps them, and excluding them would widen the exception past the criteria's own words. The three's stored hits weren't looked at |
| 4 | The other-sex split is computed from labels only | From a parse, a fact is graded only if its criterion reached the agent intact. Taking one out would need the parse's matching entries, which the committed run keeps only for labels that weren't scored |
| 4 | The dev report gives time per agent call and per conversation, not per read call, and shows no `withheld` readings | The committed run records agent calls and time together (ask and read mixed), and keeps each finding's quotes but not its readings. Withheld readings are read with `screening:show` on the conversation, at Gate 2 |
| 4 | On 0004's run the twelve are 17 of 122 and 7 of 54, and 13 of 118 from labels without the four other-sex facts | Matches spec §8.2. The 13 is what the does-not-apply reading alone could reach |
| 5 | `NCT04316364-dev` borrows 7 five-word runs from scored facts, mostly ordinary phrasing ("no i am not pregnant", "i do not know what"). Recorded, not fixed | It was written in 0004 beside the scored vignettes, and spec §5.2 keeps it unedited so its results stay comparable. The new dev vignettes must raise none |
| 5 | A borrowed-wording warning names the scored fact it matched, and one of the 7 names a fact in `NCT04385368-v2`'s vignette file | That's a vignette fact, written and read at 0004's Gate 1, not a conversation or a grade, so the rule about the three isn't broken. Recorded because it is the three's material all the same |
| 6 | Spec §5.1 corrected: a man denying pregnancy or breastfeeding is a `does-not-hold` control, not a does-not-apply test. The three does-not-apply tests are NCT03433469 L49 and NCT06728852 L16 and L15, with both of those vignettes' people women. NCT06728852 L20, the only patient criterion worded as an allowance, is reused, answered the other way from the twelve's failure | The scored vignettes' convention, found by reading the twelve's pregnancy facts. Criteria for one sex exist only in two studies, and one dev vignette is allowed per study |
| 6 | Drafting took three rounds of rewording against the checks: five borrowed runs, then eight facts sharing no word with their criterion, then three more borrowed runs. Six of the eleven borrowed runs matched facts in the least-seen three's vignette files ("i use a steroid inhaler", "yes i was on anlotinib", "no history of substance abuse" and others) | Natural phrasing and the criteria's own words pull two drafters to the same runs. The warning names the scored fact it matched, so the drafter saw those fragments of the three's vignettes, never their conversations or grades. Recorded for Gate 1 |
| 6 | Gate 1's report quoted two more facts from the least-seen three's vignette files, NCT04385368-v2 L63 and NCT03433469-v2 L72, as paraphrase matches | Vignette wording again, never their conversations or grades. Recorded beside the fragments above |
| 8 | Committed while step 7's baseline was running, so it lands before the baseline's commit | The baseline process loaded the code of `ae6c85f` when it started, and step 8 changes no prompt: `PROMPT_VERSION` is still `c5778afe9cbd`. Nothing it adds can fire without the new read prompt |
| 8 | The outright downgrade applies to clinical criteria too: a tentative answer isn't recorded as `reported` | Spec §3.3 places the downgrade before the patient and clinical rules. A test pins it for clinical |
| 8 | The helper that applies the downgrade is `asApplied` in `apply.ts`, and `Withheld` is exported from the screening index | So the review's `applied` (polarity) and this one don't read alike |
| 9 | `PROMPT_VERSION` is `83f8a458c7ed` (layout 4). The read prompt's examples are all fresh, and the fitting test passes | The old example "I'm not allergic to any medicines" became "I've never had an operation of any kind" |
| 9 | `ReadContext.answered` carries `AnsweredCriterion` (the criterion, `recorded` or `reported`, the value, the quote). A chart-review finding with nothing reported shows `reported: nothing` | The quote is the last evidence with a determinate reading, or the last evidence if none has one |
| 9 | The fake read responses in `tests/fixtures/conversation.ts` and `tests/screening/session.test.ts` fill in `statement` and `outright: true` by default. No assertion changed, and `tests/server/` and `tests/transport/` are untouched, the transparency test with them | They script the model, and the model's answer shape changed |
| 9 | The plan's `screening:chat` check after this step was not run: it's interactive, and oMLX was busy with the baseline | The dev iterations exercise the same path on the real model, and `screening:show` shows statements and withheld readings there |
| 7 | **Dev baseline** (`08-c5778afe9cbd.json`, 0004's agent, started from `ae6c85f`): wrong 7 of 50 (0.14), abstained 0 of 43, correct abstention 11 of 18. By class: all 3 scripted self-corrections missed that ended wrong (NCT00077350 L14, NCT03433469 L20, NCT04385368 L64); all 3 does-not-apply facts settled (NCT03433469 L49, NCT06728852 L15 and L16); 1 interpretive fact settled (NCT00077350 L34), after the simulated participant firmed up on a follow-up beyond what the vignette says. **No polarity fact failed.** Pace: 5.2 s per agent call, 15.4 minutes per conversation, 77 minutes for the five | The dev set reproduces the scored rate (0.14 against 0.14), so it's a fair place to iterate. It can't show a polarity fix working, only that one breaks nothing; that goes to Gate 2 |
| 7 | The baseline run file was committed without reading lint's exit code, and failed Biome's formatter. Fixed in its own commit, whitespace only | The runner's JSON layout isn't Biome's. Every run file from here is formatted before it's committed |
| 10 | **Iteration 1** (`09-83f8a458c7ed.json`, step 9's agent): wrong 5 of 47 (0.11, baseline 0.14), abstained 1 of 43, correct abstention 13 of 18. Now abstaining where the baseline was wrong: NCT00077350 L14 and L34, NCT03433469 L49, NCT06728852 L16. Still wrong: NCT03433469 L20, where a qualified correction was read as `partial` and ignored by code as "already settled"; NCT04385368 L64, a correction that doesn't name what it corrects, not read at all; NCT04385368 L63 and L65, where a follow-up narrower than its criterion ("oral or injectable steroids") got a "no" that settled it without the earlier words; NCT06728852 L15, where the statement kept one part of a bundled criterion ("is not breastfeeding"). The one control lost: NCT00077350 L21 read as `does-not-apply` from "I'm a man", defensible since its words are "if the mother is treated". It's an abstention, not a wrong finding | Three causes, each a lever (iteration 2). The abstention is left alone |
| 10 | Pace in iteration 1 looked 2.6 times slower (13.5 s per agent call against 5.2 s). A back-to-back measurement of one late read in NCT04385368, old prompt against new, gave about 9.7 s against 11 s (2,446 against 3,381 input tokens, 182 against 169 output). The rest was oMLX: the simulated participant slowed in the same stretches, and ran at 41 s a call in one baseline conversation | The new read costs about 13% more per call. Per-call averages from a dev run are too noisy to estimate the scored run from; Gate 2 gets the back-to-back figure |
| 10 | **Iteration 2** changes two levers, each a spec edit in this commit (§3.2, §3.3): answered criteria newest first and open criteria with what was said so far (`PROMPT_LAYOUT` 5), and any reading but agreement unsettling a settled patient criterion. The read prompt's wording also asks for the whole criterion in the statement, names breastfeeding with pregnancy as a condition, says a follow-up answer doesn't settle the whole criterion alone, and says a correction often doesn't repeat what it corrects. `PROMPT_VERSION` `ed2ce37c6d18`. The 0004 test "ignores a vaguer reading of a settled criterion" is replaced by its opposite, which is the rule change, not a test edited to pass | Iteration 1's three causes |
| 10 | **Iteration 2 results** (`10-ed2ce37c6d18.json`): wrong 3 of 44 (0.07), abstained 1 of 43, correct abstention 15 of 17. Now abstaining or right: NCT03433469 L20 (the qualified correction), NCT06728852 L15 (the bundle), NCT04385368 L63. Still wrong: NCT04385368 L64, a correction volunteered in the reply after its answer ("it was more recent than I said"), not read although its criterion was at the top of the answered list; NCT04385368 L65, where the model decided an inhaled steroid isn't immunosuppressive medication, with the earlier words shown. New: NCT04385368 L70, whose statement inverted the exclusion ("has smoked more than 100 cigarettes" for "never-smokers, defined as no more than 100 cigarettes"), so a smoker was recorded as holding it. The one abstention moved to pregnancy itself: NCT00077350 L20 stated as "is a pregnant woman", then does-not-apply for a man. The read also gave `unclear` to clinical criteria a reply never mentioned (follow-ups rose from 8 to 14). Pace was very uneven (9 to 81 minutes a conversation). A small fixed benchmark ran at 4.3 s and the machine's load average was 4.5 to 6.8, so something else was competing for it | The statement adds or drops words; the "every criterion" rule overshoots. Both wording (iteration 3). L64 and L65 are left as known residuals: L64 would need a different lever (a separate correction check, one more call per turn), and L65 is the model applying medical knowledge the prompt already forbids |
| 10 | **Iteration 3** is wording only: the statement uses the criterion's own terms, adds no group, condition or definition, and keeps a defined term the same way round (a fresh non-drinker example); pregnancy and breastfeeding named as conditions, not groups; no reading for a criterion the reply doesn't mention. `PROMPT_VERSION` `2c46ada9a1d5` | Iteration 2's statement faults and overshoot. No lever changes, so no spec edit |
| 10 | **Iteration 3 results** (`11-2c46ada9a1d5.json`): wrong 5 of 47 (0.11), abstained 1 of 43, correct abstention 11 of 16. Fixed: L70's inverted statement. Back: NCT04385368 L63 and NCT06728852 L15. New: NCT04385368 L57, "I wouldn't know, I've never had them" read as does-not-hold (in iteration 2, unclear, then unknown). L64 and L65 as before. The pregnancy fault moved from L20 to L21 | **Iterations 2 and 3 differ by noise, not by their changes.** The same facts flip with the same kind of reading. L15's statement was "The person is not breastfeeding." in both, and iteration 2 was right only through a second reading on the same turn. One run of one prompt moves about ±2 wrong findings on this set. Iterating further would fit the noise, so iteration stops at 3 of 5 and goes to Gate 2 |
| 11 | **Changed after the freeze, by the owner's decision ("go with option 2"): `READ_MAX_OUTPUT_TOKENS` 1,024 → 2,048.** NCT04385368-v1 from labels failed at turn 6. A reply touching many surgical criteria ("…stage II, which was resectable…") made the read's output pass 1,024 tokens on both attempts, each reading carrying a full statement. At temperature 0 a plain rerun fails identically. The cap is a limit, not part of `PROMPT_VERSION` (still `2c46ada9a1d5`), and changes only a call that would otherwise truncate. When it was raised, 19 scored conversations existed and one had a retried call under the old cap. The running process kept 1,024. After it finishes, a rerun re-grades the finished conversations with no model call and resumes only the failed one under 2,048. The alternatives were reporting 29 of 30 or rerunning all 30 | The dev runs never reached the cap, because no dev reply touched that many criteria at once. The plan's "read truncations are counted" check was only possible through failures, since the run file doesn't record a truncation that recovers on retry |
| 11 | The first pass ended with 28 of 30 graded (a run file not committed as a result). The resume under 2,048 tokens completed NCT04385368-v1, making 29 of 30 | As planned in the row above |
| 11 | **Changed after the freeze, by the owner's decision ("go with option 2"): a reading with no quote is kept with an empty quote, and rule 1 rejects it.** It used to refuse the whole response. NCT06728852-v2 from parses, one of the least-seen three, failed at turn 12 in both passes with "readings[1]: quote missing". The retry resends the identical request, and at temperature 0 the reply is identical, so a rerun can't finish it. For the same reason no finished conversation ever hit it, so the change touches only this one. `PROMPT_VERSION` is unchanged. To diagnose, Claude read that conversation's error message, with the model's output hidden, and nothing else from it | A malformed reading shouldn't sink the reply's valid ones, and 0004's design already rejects an evidence-free reading rather than failing on it. The alternatives were reporting 29 of 30 or rerunning all 30 |
| 11 | **The scored run, complete:** `02-2c46ada9a1d5.json`, 30 of 30 graded after two resumes. It records `promptVersion` `2c46ada9a1d5`, simulator `5fd4476340c9`, grader v4, Qwen3.6-35B-A3B-MLX-8bit, 8bit, temperature 0, seed 20260921, thinking off. Its conversations ran under three versions of `calls.ts`: 1,024 tokens with the old quote rule, then 2,048, then the quote change, each limited to calls that would otherwise have failed. The two partial run files from the passes before are not committed | Spec §8.1: the first complete run after the freeze is the reported one |
| 12 | **The worked example shows the correction still missed.** `examples/NCT00077350-v2-labels-0009.{txt,html}`: L3's correction ("Actually, I had two different chemotherapy regimens…") arrived with the answer about L4 and was read only for L4, although L3's recorded answer was at the top of the answered list. L15 is the volunteered-then-corrected shape again. The ask call, which 0009 left alone, still asks performance status "on a scale of 0 to 1" | Committed as the spec said, whatever it showed. It is 0004's missed correction, not fixed, on the same vignette |
| 13 | **The report, the twelve** (`screening:compare -- 01-c5778afe9cbd.json 02-2c46ada9a1d5.json`). From labels: wrong 17/122 (0.139) → 6/104 (0.058), abstained 1/108 → 8/107 (0.075), correct abstention 16/31 → 25/30. Without the four other-sex facts: 13/118 → 6/104. From parses: wrong 7/54 (0.130) → 6/51 (0.118), abstained 1/49 → 1/47. Reported agreement 24/24 → 21/24: two clinical answers held back as not outright ("not captured") and one partial. Follow-ups 97 → 157. Verdict hits 2 → 5: four are the agent's own "to help us check eligibility", and one quotes "Eligible to tolerate…", which v4's "for" exception doesn't cover; none is a verdict. **Spec §8.2's bar: labels better, parses better, may be called an improvement: yes** | Measured against the bar fixed before the run |
| 13 | **The three least-seen, apart** (`--least-seen`, first run now). From labels: wrong 7/41 (0.171) → 3/40 (0.075), abstained 0 → 0. From parses: wrong 5/18 (0.278) → 2/16 (0.125), abstained 0 → 2/17. Their one other-sex fact (NCT06728852-v2 L16) was added to `OTHER_SEX_FACTS` from the vignette file. The roadmap's "6 does-not-apply" at 0004's Gate 3 was a reader's judgement; the rule here finds 5 across the fifteen | Reported apart, as least-seen, not unseen, and small |
| 13 | **Two dev facts turned out to be the same test items as facts in the least-seen three.** Dev NCT04385368 L65 (an inhaled steroid, defer) matches NCT04385368-v2 L65 ("a steroid inhaler for my asthma"). Dev NCT06728852 L19 (anlotinib that stopped working, holds) matches NCT06728852-v2 L19. The borrowed-wording warning had matched both at step 6, and both were reworded, not replaced; Gate 1's reviewer caught a third (L63) but not these. So the three are not a clean test on those two items. After the run, v2's L65 is right and v2's L19 (from parses) is wrong | Written before the three's facts were seen, but the warning then showed them, and rewording kept the item. Disclosed in the README beside the three's numbers |
| 14 | `EVAL_RUN` names `02-2c46ada9a1d5.json` and the note says "From 0009's eval run." `tests/web/review.test.ts` pins the note by its constant, not its text, so it needed no edit, and the flip test is untouched. **Loading two runs costs nothing measurable:** 889 tests, 765–851 ms over four runs with two loaded, 750–934 ms with `EVAL_RUN` put back for comparison. Step 1's 718–756 ms was for 853 tests. `review:score` and `review:score --groups` print the same output as before, byte for byte. `app -- --fake` lists 30 eval-run conversations, made with prompt `2c46ada9a1d5`. `readingRun()` in `tests/fixtures/eval-run.ts` loses its shortcut for when both names pointed at one run: typecheck rejects comparing two different constants | The spec's 0.2 s estimate was for loading from cold. The test files share one module cache, so the second run costs about as much as the variance between runs |
| 15 | Found while writing the README: Gate 3's abstention list said "five" man-and-pregnancy readings but named four, and the run file has four (4 + 4 + 3 = 11). Corrected under the gate. The README's statement of noise says no run was repeated: the ±2 came from two different wording revisions, not a rerun | The record had to add up, and a noise figure shouldn't claim more than was measured |
| 16 | **Review pass 1 found the paid-run estimate still described 0004's agent** (Important). `evals/screening-estimate.ts` capped an agent call at 1,024 output tokens, took call counts from 0004's run although its comment said the run the review serves, and sized the largest read prompt without 0009's `said so far` and `recorded` lines (2,502 tokens against at least 4,022). Fixed after a failing test (`tests/evals/screening-estimate.test.ts`, committed first): `READ_MAX_OUTPUT_TOKENS` is exported from `calls.ts` and imported, the reference run is 0009's, and every criterion carries a turn-length quote. One Haiku 4.5 conversation now estimates 78 calls, about $0.29 (0008 recorded $0.16). `scripts/models-smoke.ts` hardcoded the same 1,024 ceiling and imports the constant now; no test pins it, because the smoke plan exposes its estimate only as printed text | Raising the cap at step 11 changed what a paid run can cost, and the estimate is what the owner reads before deciding to spend. Not in the plan's file list: `evals/screening-estimate.ts`, `scripts/models-smoke.ts`, the new test |
| 16 | **The other passes.** Pass 2 (correctness), Nit: the verdict pattern's comment said all 14 of v3's hits in 0004's run were criterion wording, but step 3 found 2 were the agent's own "to help us check eligibility". Corrected. The empty-quote path was checked: rule 1 rejects an empty quote, and a test says so. Pass 3 (scope and data): nothing found. The dev vignettes are invented, no code reaches the network, and no field can hold a decision. Pass 4 (eval integrity): four removed assertions, each a rule change recorded in this table (iteration 2's settled-criterion rule, layout 4's heading, spec §7.1's loader tests, the post-freeze quote rule), not a test edited to pass. Every run records model, quantization, temperature, seed and thinking. Pass 5 (documentation), Nit: the README said three conversations were held back for a human reading of the review, but they went to 0009. Corrected. Not done: step 9's `screening:chat` check, which was never run. The scored run shows does-not-apply and withheld readings on the real model instead | Each fix is its own commit |

## Files that change

**New:**
- `scripts/screening-compare.ts`
- `scripts/lib/least-seen.ts`
- `tests/scripts/screening-compare.test.ts`
- `evals/cases/vignettes/dev/NCT{00077350,03433469,04385368,06728852}-dev.json`
- `evals/results/screening/dev/*.json`: the baseline and each iteration
- `evals/results/screening/<stamp>-<new prompt version>.json`
- `evals/results/screening/examples/NCT00077350-v2-labels-0009.{html,txt}`
- `work/0009-agent-fixes/plan.md`

**Modified:**
- `src/screening/{types,apply,calls,prompts,session,index}.ts`
- `src/web/review.ts`
- `evals/graders/screening.ts`, `evals/screening-runner.ts`
- `scripts/app/{eval-run,scripted-agent}.ts`, `scripts/{review-sheet,review-score,check-vignettes,show-conversation}.ts`
- tests:
  - `tests/fixtures/{eval-run,conversation}.ts`
  - `tests/screening/{apply,calls,prompts,session}.test.ts`
  - `tests/evals/{screening-grader,screening-runner,show-conversation,vignettes}.test.ts`
  - `tests/scripts/{app-eval-run,review-sheet,review-score}.test.ts`
- `package.json`, `README.md`, `CLAUDE.md`, `work/ROADMAP.md`, `work/0009-agent-fixes/spec.md` (step 1, and at dev iteration 2)
- `evals/screening-estimate.ts`, `scripts/models-smoke.ts`, and new `tests/evals/screening-estimate.test.ts` (review pass, step 16)

As built: this list was checked against `git diff --stat main` at step 15. The scored run's conversation files are in the gitignored cache under `evals/results/screening/conversations/`, as 0004's are (carried to 0010).

**Not touched, checked with `git diff main`:**
- `tests/web/review.test.ts`: it pins the note by its constant (step 14)
- `evals/participant/`, the fifteen scored vignettes, `evals/cases/labels/`, `evals/cases/vignettes/dev/NCT04316364-dev.json`
- `src/models/`, `src/criteria/`, `src/plain/`, `src/transport/`, `src/server/`, `data/`
- 0004's committed run file

---

## Risks

- **Fitting the dev set.**
  - Five vignettes by the fixer, who has read the twelve's failures.
  - Mitigations: Gate 1 read by the owner; the borrowed-wording warning; the fitting test on prompts; at most five iterations; every dev run committed; the controls.
- **`outright` trades wrong for abstained.**
  - The model may mark firm answers not outright, pushing abstention past 0.10.
  - Mitigations: the dev controls show it before Gate 2, and the bar counts it as worse.
- **The model ignores the field order, or writes empty statements.**
  - `readRead` refuses an empty statement and the retry covers one failure. Repeated refusals fail the turn, and the dev run shows them as failed conversations, not silent ones.
- **Longer reads, more truncation, more hours.**
  - Truncations counted per iteration, and seconds per call measured.
  - Mitigation: Gate 2 stops a run estimated over 16 hours.
- **oMLX outages during a 13–14 hour run.** The runner resumes. Two consecutive connection failures stop it with a pointer to `/health`.
- **Leaking the three before the freeze.**
  - Mitigations: `screening:compare` omits them without `--least-seen`; the runner's progress lines aren't read; `OTHER_SEX_FACTS` for the three is filled only at step 13.
  - Tests still load them, which is a file read by code, not a person.
- **`npm test` time.** Two runs loaded after step 14. Measured and recorded. If it passes about 1.2 s, `readingRun()` can load results only for the labels conversations `review-score` needs.
- **The review's data is a local cache.** Unchanged by this slice. It's 0010's (roadmap).

## Verification

- `npm test`, `npm run typecheck` and lint by exit code, at every commit.
- After step 2: `npm run app -- --fake` still lists 0004's 30 conversations, and `npm run review:score` still prints 0007's figures.
- After step 4: `screening:compare` on 0004's run reproduces 17 of 122 and 7 of 54 for the twelve.
- After step 9: `npm run screening:chat -- NCT06728852`, answering "I'm a man" to the female-only criterion and "I suppose so" to an agreement, shows `does-not-apply` and a withheld reading in the saved chat. `npm run app -- --fake` runs a conversation end to end.
- After step 14: `git diff main -- evals/participant evals/cases/labels src/models src/criteria src/plain src/transport src/server data` is empty. The scored vignettes and `NCT04316364-dev.json` are unchanged. `SIMULATOR_VERSION` is `5fd4476340c9`, and the grader is `"4"`.
- No command in the slice was run with `--spend`, and `.env` is untouched.
