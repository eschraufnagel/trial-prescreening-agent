# plan: 0023 who a criterion is for

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-11. Gate 1 met, gate 2 skipped by the owner
**Date:** 2026-11
**Spec:** [spec.md](spec.md)

## Context

The read call turns "I'm a man, so not pregnant" or "I'm a woman" into `does-not-apply` on pregnancy, breastfeeding and contraception criteria, and `applyPatient` closes an open criterion on `does-not-apply` at once. In dev run 13 (`evals/results/screening/dev/13-f761514b3da8.json`), that made six of seven abstentions (0.17 against 0022's bar of 0.10). Five were never asked. Spec 0023 makes `does-not-apply` count only for the criterion the last question asked. On another open criterion it's held back as `unclear`, and on a settled one it's ignored. The read prompt's wording also gains L20's case. One dev re-run measures it.

Written in plan mode from a reading of `src/screening/apply.ts`, `session.ts`, `readable.ts`, `prompts.ts`, `evals/corrections/replay.ts`, `tests/evals/corrections-replay.test.ts`, `src/web/review.ts` (`readingLines`), run 13's conversations in the local cache and `EVAL_RUN`'s review file.

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What's decided |
| --- | --- | --- | --- |
| **1. The rule and the prompt** | 1–2 | none | Deterministic, pinned by tests. No decision before the run: it's local, free and about an hour |
| **2. Dev re-run** | 3 | **Gate 1**, then optional **Gate 2** | Is abstention within 0.10 with confidently wrong no more than 3 (spec §5)? Then, if held: does the app read right to the owner (spec §6)? |
| **3. Write-up** | 4–5 | none | Docs and review passes. No decision attached |

**Gate 1** decides whether the docs and ROADMAP can say 0009's abstention entry is closed, and whether this change ships as a fix. A wrong yes ships a change that moved abstentions into wrong answers. A wrong no throws away a change that works.
- Claude counts the run and reads every `does-not-apply` finding and every new wrong row in its transcript. That part is delegable, and Claude records a recommendation.
- **A miss is the owner's to decide:** ship with the numbers, revise once (a second run, about an hour), or stop with the branch unmerged.

**Gate 2** is optional and the owner's alone. Its value is a reader who didn't write the prompts. The owner says at gate 1 whether to hold it. If held, no PR until it's answered.

**Model runs.** One run: the dev re-run, about 55 to 60 minutes on the local model. *Claim: abstention is back within 0.10 on live conversations without moving abstentions into wrong answers.* `OMLX_API_KEY` isn't in Claude's shell, but `eval:screening` loads `.env` itself (`--env-file-if-exists`), so Claude runs it in the background through the npm script, never reading or editing `.env`. If it can't reach oMLX (check `/health`), the owner runs it in their own terminal, as in 0022. No hosted model, no `--spend`. No replay (spec §5).

### Steps

1. **The rule** (spec §3.1, §3.3).
   - **`src/screening/apply.ts`:**
     - `ApplyInput` gains `askedAbout?: string | null`, documented: the criterion the last question named; `null` when no question named one (the reply to the opening); **absent only when re-applying recorded evidence**, which already holds each reading as it was applied, so the rule is off.
     - In `applyReadings`, after rule 1 (the quote check) and before building `evidence`, when `input.askedAbout !== undefined`, `r.reading === "does-not-apply"` and `r.criterionId !== input.askedAbout`:
       - if `p.status === "open"`: apply it as `unclear`, with `withheld: "does-not-apply"` on its evidence (the field `asApplied` already sets for an un-outright determination). `applyPatient` and `applyClinical` both handle `unclear` on an open criterion by setting reason `unclear` and leaving it open;
       - otherwise: push `{ ...base, why: "already-settled" }` to `ignored` and `continue`. No new `why`, so `readingLines` in `src/web/review.ts` words it as today ("read this as does not apply after it was settled. It was ignored.").
     - A `does-not-apply` already held back by `asApplied` (outright false) is `unclear` by then, so it's untouched.
     - The module's doc comment gains one bullet for the rule.
   - **`src/screening/session.ts`:** `receive` passes `askedAbout: draft.pending` to `applyReadings`, the value it already passes the read call. Read it before `#next` changes `pending`.
   - **`evals/corrections/replay.ts`:** `progressAt` passes no `askedAbout` (it re-applies recorded evidence). `classify` passes `askedAbout` from the last question before the turn, the same lookup `readContextAt` does (lift it into a small local helper so both use it), because it models a fresh read by the current agent. So 0022's rebuild test passes unchanged (spec §3.5): recorded `does-not-apply` evidence from before this slice is re-applied as it was, and held-back readings from after it are recorded as `unclear` and re-apply as `unclear`.
   - **Tests:** spec §4 items 1 to 8 and 10.
     - `tests/screening/apply.test.ts`: items 1 to 6 and 8, each passing `askedAbout`. Existing tests don't pass it and keep their meaning.
     - `tests/screening/session.test.ts`: item 7, with a `FakeModelAdapter` whose read returns `does-not-apply` for the pending criterion and two others; the next ask names one of the others.
     - `tests/evals/corrections-replay.test.ts` is unchanged and passes (item 10).
2. **The prompt and the version** (spec §3.2, §3.4).
   - **`src/screening/prompts.ts`:**
     - `READ_SYSTEM_PROMPT`'s `does-not-apply` bullet replaced by spec §3.2's text.
     - The EXCLUSION examples gain `"Pregnant women are excluded" becomes "The person is pregnant."`
     - `PROMPT_LAYOUT` 8.
   - **Tests:** spec §4 item 9 in `tests/screening/prompts.test.ts`. The `PROMPT_LAYOUT` assertion goes from 7 to 8; nothing else existing changes.
   - As built (prompt version `48e8483f12e2`): one more existing assertion changed. The test that describes `does-not-apply` matched the old bullet's opening words, which this step rewrites; it now matches the new bullet's "the criterion's own words are about one group of people". The bullet also names "Breastfeeding" as a condition beside pregnancy.
3. **Dev re-run.** `npm run eval:screening -- --dev`, about 55 to 60 minutes, committed as `evals/results/screening/dev/14-<prompt version>.json`. Then `npm run screening:compare -- evals/results/screening/dev/13-f761514b3da8.json evals/results/screening/dev/14-<version>.json`. From the run file and the local cache, Claude records under "Gate record":
   - abstention and confidently wrong against spec §5's bar, with run 12's 0.05 beside it for context;
   - every `does-not-apply` finding: asked or not, and whether the criterion's words name only the other sex;
   - every new wrong row and its cause, and NCT06728852 L15 either way;
   - questions added per conversation, and any criterion that hit `MAX_ASKS` because of the rule;
   - any held-back `does-not-apply` whose criterion was then asked and read `does-not-apply` again (spec §3.1's named risk).

   **Gate 1.** Then **Gate 2** if the owner holds it: `npm run app -- --examples` on the local model.
4. **Docs** (spec §7):
   - `docs/screening-agent.md`: the abstention paragraph under "Corrections, since 0022" says what changed and run 14's numbers, and a short "Who a criterion is for, since 0023" section: the rule, the prompt example, and the limits (spec §10). The scored table and worked example stay, labelled with their prompt version.
   - `docs/limitations.md`: the 0022 abstention line replaced by what's true after run 14.
   - `work/ROADMAP.md`: the slice's row; the carried-forward 0009 abstention entry closed if gate 1 passed, or updated with what's left.
   - README: no change.
5. **Review passes** from `REVIEW.md` on the whole diff. Fixes are committed, and the record goes below.

Every step is one commit through `npm run check && git commit`. No `Co-Authored-By` trailer.

**Browser test.** No path `npm run test:e2e` guards changes (`src/screening/`, `evals/corrections/`, results, docs). CI runs it on the PR anyway.

## Files that change (against `main`)

- **The agent:** `src/screening/apply.ts`, `session.ts`, `prompts.ts`.
- **The replay:** `evals/corrections/replay.ts` (passing `askedAbout` in `classify` only).
- **Tests:** `tests/screening/apply.test.ts`, `session.test.ts`, `prompts.test.ts`.
- **Results:** `evals/results/screening/dev/14-*.json`. Its conversations stay in the gitignored cache, as 0021's and 0022's did.
- **Docs and process:** `docs/screening-agent.md`, `docs/limitations.md`, `work/ROADMAP.md`, and this plan.

Not touched: `src/web/`, `src/server/`, `src/transport/`, `scripts/app/`, `src/screening/types.ts`, `src/screening/readable.ts`, the simulator, vignettes, labels, grader. No new dependency. `tests/boundary.test.ts` and `tests/web/review.test.ts` unchanged.

## Reused, not rebuilt

- The hold-back: `asApplied`'s `unclear` with `withheld` (`src/screening/apply.ts`), and the `Withheld` type that already allows `does-not-apply`.
- `why: "already-settled"` and its sentence in `readingLines` (`src/web/review.ts`).
- `askedAbout`, already computed in `session.ts` for the read call and in `readContextAt` for the replay.
- `screening:compare` and the dev runner, unchanged.

## Risks

- **The held-back words invite the same misreading.** The next read sees "said so far: unclear, from 'I'm a man…'" beside the now-asked criterion. Step 3 counts it. If it's common, gate 1 can switch to ignoring the reading (a new `why`, a sentence in `readingLines`, and `test:e2e` locally), as spec §3.1 allows.
- **The prompt edit moves other readings.** The confidently-wrong bar watches it.
- **A strict bar fails on one new wrong row.** Gate 1 reads its cause before the owner decides.
- **`askedAbout` left out of a future caller of `applyReadings`** turns the rule off silently. Only the session and the replay call it; test 7 pins the session.
- **The run can't reach oMLX.** Check `/health`; the owner runs it.

## Verification

- `npm run check` on every commit, including the new apply, session and prompt tests and 0022's unchanged rebuild test.
- The dev run's numbers against spec §5's bar, and the transcript reading (gate 1).
- The owner in the app, if held (gate 2).
- `npm run test:e2e` left to CI.

## Gate record

**Step 3, the dev re-run** (`evals/results/screening/dev/14-48e8483f12e2.json`, Qwen3.6-35B-A3B-MLX-8bit, 8bit, temperature 0, seed 20260921, thinking off, 2026-11; about 52 minutes, run by Claude through the npm script). Compared with `13-f761514b3da8.json` by `screening:compare`. Counted and read by Claude:

- **Abstention: 0 of 43 (0.00), against 7 of 42 (0.17).** Within the bar (at most 0.10). Run 12's 0.05, for context. Correct abstention 16 of 18 (0.89), against 15 of 18: the agent still abstains where the vignettes expect it to.
- **Confidently wrong: 2 of 45, against 3 of 38.** Within the bar (at most 3). Neither is this slice's:
  - NCT06728852 L15, the menopause case, wrong in runs 12, 13 and 14, as the spec expected. Out of scope.
  - NCT04385368 L57, "I wouldn't know, I've never had them" read as `does-not-hold` where the vignette expects `defer`. Run 12 had the same row wrong on the same words; run 13 didn't reach it the same way. Not about `does-not-apply`.
  - NCT03433469 L20 and NCT04385368 L65, run 13's other two wrong rows, are right in run 14.
- **Every `does-not-apply` reading**, from the conversations in the local cache:
  - **Held back, then asked, then answered: 4 rows.** NCT00077350 L21 ("not breastfeeding", `does-not-hold`), L22 (the pregnancy test, clinical, `chart-review` on an answer), L23 (contraception, `holds`) and NCT04385368 L73 (contraception, `does-not-hold`). Each was asked once. None hit `MAX_ASKS`.
  - **Accepted on the asked criterion: 2 rows**, each a criterion whose words name only men, answered by a woman: NCT03433469 L49 and NCT06728852 L16. Both right (the vignettes expect `defer`).
  - **The named risk didn't happen.** No held-back criterion was then asked and read `does-not-apply` again. At L23, "I'm a man, so that wouldn't apply to me" in reply to L22 was held back a second time, and L23 was then asked and answered.
  - **Ignored on a settled criterion: none.**
  - **L20 itself**, the asked pregnancy question, was read `does-not-hold`, the prompt's new example.
- **Questions added:** 29 against 25, 39 against 36, 22 against 20, 53 against 50, 42 against 42. About 12 in all, and 6.6 minutes of agent time a conversation against 6.2.
- **Corrections, 0022's measure:** 4 of 4 dev facts with `laterSays` end `contradicted` (L4, L14, NCT03433469 L20, L64), against 3 of 4. No false correction: NCT03433469 L55 stays `does-not-hold`.

**Gate 1: met.** Claude's recommendation: pass. Abstention is back under the bar, with no rise in confidently wrong. The four held-back rows show the mechanism working as designed: kept open, asked, answered. Limits, for the docs: one run on the five dev vignettes, which were tuned on in 0009; the scored fifteen weren't re-run. The owner can overrule.

**Gate 2: skipped.** The owner accepted Claude's recommendation to skip it before the run ("go", 2026-11). Nobody but the prompts' author has read it in the app. The PR says so.

## Review passes

Run on the whole diff against `main` (2026-11), after step 4.

**Pass 1, plan compliance.** Every changed file is in "Files that change". Divergences, each recorded: one existing prompt assertion changed in step 2, because it matched the old bullet's wording; gate 2 skipped by the owner. Docs step: the ROADMAP's 0009 entry is split, since it named two patterns and this slice fixes one; the hedging-persona half stays a known limitation. No findings.

**Pass 2, correctness.** The rule runs after rule 1, so a quote not in the reply is still rejected before anything else (test). `base` is taken before the rule, so an ignored reading records `does-not-apply`, which `readingLines` words as "read this as does not apply after it was settled". A held-back reading is recorded as `unclear` with `withheld`, so 0022's rebuild, which passes no `askedAbout`, re-applies it unchanged; that test passes untouched. `askedAbout` is `draft.pending`, read before `#next` moves it. A conversation saved before this slice continues under the new rule from its next reply; no state type changed. The scripted agent reads only the asked criterion, so the browser cases are unaffected: `npm run test:e2e` ran anyway, 13 passed, 4 skipped (the capture specs). **Nit, left:** `askedAbout` is optional on `ApplyInput`, so a future caller that leaves it out silently turns the rule off; its doc comment says so, and the session test pins the one live caller.

**Pass 3, scope and data discipline.** No PHI: the test words are made up, and the conversations quoted are the committed vignettes'. No network beyond the local model in the dev run. No secrets: the run read `.env` through the npm script, and nothing opened or edited it. No deployment. No eligibility decision: the rule only keeps rows open or leaves them as they were; it never settles one. No findings.

**Pass 4, eval integrity.** No grader, vignette, simulator or threshold changed. The bar was fixed in the spec before the run, and met. Run 14 records model, quantization, temperature, seed and thinking mode. Two test assertions changed, both for wording this slice rewrites (the `does-not-apply` bullet, `PROMPT_LAYOUT`). The run file was formatted by Biome before commit, as earlier run files are; `tests/evals/committed-results.test.ts` passes. No findings.

**Pass 5, documentation.** `docs/screening-agent.md` and `docs/limitations.md` report run 14 with its file and prompt version, and say the scored set wasn't re-run. The README doesn't name this misreading, so it's unchanged. **Nit, left:** "Where the agent fails" still counts 0009's four "I'm a man" findings on the scored set, labelled with its prompt version, as 0021 and 0022 left it.
