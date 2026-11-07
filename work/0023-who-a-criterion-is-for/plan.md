# plan: 0023 who a criterion is for

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-11
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
   - Record the new `PROMPT_VERSION` in this plan as built.
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

## Review passes
