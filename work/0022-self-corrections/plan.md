# plan: 0022 self-corrections

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-10. No code yet
**Date:** 2026-10
**Spec:** [spec.md](spec.md)

## Context

When the person corrects an earlier answer while answering a different question, the read call reports nothing for the answered criterion. The first answer stands, and the correction sits in the transcript, attached to no row. Spec 0022 asks the read call for `corrections` before `readings`. Each correction goes through `applyReadings`'s unchanged rules, so it unsettles to `contradicted` and never settles. The next question acknowledges it.

A replay of the read call at the 11 recorded correction turns measures whether that's enough before the 80-minute dev run. A separate correction call (spec §3.3) is built only if gate 1 asks for it.

Written in plan mode from a reading of `src/screening/session.ts`, `calls.ts`, `prompts.ts`, `apply.ts`, `requests.ts`, the committed dev conversations, `EVAL_RUN`'s review file and 0021's plan.

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What's decided |
| --- | --- | --- | --- |
| **1. The replay tool** | 1–2 | none | Deterministic. Pinned by a test that rebuilding every committed conversation reproduces its final statuses. Lands before the agent change, so the "before" replay runs on `main`'s prompt |
| **2. The field, measured** | 3–5 | **Gate 1** | Is (a) enough, or is (b) built? Against spec §5's bar |
| **3. The separate call** | 6–7 | **Gate 1 again** | Only if gate 1 asked for it. Same bar. If neither meets it: ship the better one with its numbers, or stop the slice |
| **4. Dev re-run** | 8 | **Gate 2**, then **Gate 3** | Did answering get worse, are there false corrections (spec §6)? Then: does the acknowledgement read as being heard, and does the review show the row (spec §7)? |
| **5. Write-up** | 9–10 | none | Docs and review passes. No decision attached |

**Gate 1** guards the 80-minute dev run and whether every reply in every conversation pays for an extra model call, for good. A wrong yes ships a field that catches nothing as a fix. A wrong no adds cost to every hosted screening for nothing.

- Claude counts the replay and reads every false correction in its transcript. That part is delegable.
- **Choosing (b) is the owner's**, because it adds spend to every hosted screening.

**Gate 2** decides whether the README's numbers still describe this agent, or whether the scored run is needed. Delegable. Claude records a recommendation here, and the owner can overrule it.

**Gate 3** is the owner's alone. It's a short session in the app, held in the same sitting as gate 2. Its value is a reader who didn't write the prompts. No PR until it's answered.

**Model runs.** `OMLX_API_KEY` isn't in Claude's shell, and CLAUDE.md forbids creating `.env`. So each replay (about 8 minutes) and the dev run (about 80 minutes, plus 15 to 25 under (b)) are run by the owner in their own terminal unless the key is there, as in 0021. Each is one line below with the claim it supports. No hosted model, no `--spend`.

### Steps

1. **The rebuild and the cases.**
   - **`evals/corrections/replay.ts`:**
     - Loads a conversation from a committed dev conversation file (`state`) or from `EVAL_RUN`'s review file (`criteria` and `result`).
     - `progressAt(criteria, transcript, evidenceByCriterion, turn)` rebuilds progress before a turn. It applies each criterion's evidence from earlier turns, in turn order, through `applyReadings` (`src/screening/apply.ts`), starting from `initialProgress` (`agenda.ts`).
     - `readContextAt(...)` builds what `#readable` in `session.ts` would have produced: `open`, `answered` most recent first, `saidSoFar`, and `askedAbout` from the last question's `criterionId`.
     - `#readable` and `recordOf` are private to the session class. Lift them into an exported function in `session.ts`, or a small sibling module such as `src/screening/readable.ts`, so the replay and the session share one implementation rather than a copy.
     - `classify(...)` marks a turn **caught**, **missed** or **false correction**, per spec §5, by applying the replayed readings and corrections to the rebuilt progress and comparing statuses.
   - **`evals/cases/corrections.json`:** the 11 correction turns (file, conversation id, turn, corrected criterion, `laterSays`), found by reading each transcript once:
     - from labels in `EVAL_RUN`: NCT00077350-v2 L3 and L15, NCT03433469-v1 L55 and L63, NCT04385368-v3 L59 and L70;
     - from dev 12: NCT00077350-dev L4 and L14, NCT03433469-dev L20, NCT04385368-dev L64 (turn 88).
     - The ordinary-turn sample is computed, not listed: every fifth participant reply from the tenth on, in those six conversations, skipping correction turns.
   - **Tests** (`tests/evals/corrections-replay.test.ts`, spec §4 item 10):
     - every case names a participant reply whose criterion was settled before that turn;
     - rebuilding each of the six conversations at its last turn, then `finalize`, reproduces its committed findings' statuses;
     - the lifted `readable` function gives the session the same read prompt as before (the existing session tests pass unchanged).
2. **The replay script.**
   - `scripts/replay-corrections.ts`, and `"corrections:replay"` in `package.json` with `--env-file-if-exists=.env`, like `screening:chat`.
   - It builds the adapter with `createLocalAdapter(parseModelSpec("omlx"), { thinking: false })` and calls `read()` from `src/screening/calls.ts` at each turn. Under (b) it also calls `checkCorrections`.
   - It writes `evals/results/corrections/NN-<PROMPT_VERSION>.json`: the model, quantization, temperature, seed and thinking mode, the prompt version, and per turn the outcome, the raw corrections and readings, and the prompt's length. It prints a table.
   - Deterministic test of the result shaping with a `FakeModelAdapter`.
   - The CLAUDE.md commands table gains the line in this commit.
3. **Replay, before.** On `main`'s prompt (`834179395652`), about 8 minutes. *Claim: what today's read call catches on these exact turns. The original runs used older prompts, so their outcome isn't the baseline.* The result is committed.
4. **The field and the acknowledgement** (one commit, because the read call's return shape and its only caller change together, as 0021 found).
   - **`calls.ts`:** `ReadResult` gains `corrections`. `readRead` parses it leniently (spec §3.1): an absent or non-array value is empty, and a bad entry is dropped without losing the readings. Reuse the per-entry reading parse by extracting it from the `readings.forEach` into a helper used for both lists.
   - **`prompts.ts`:**
     - `READ_SYSTEM_PROMPT`: the ALREADY ANSWERED paragraph is replaced by spec §3.1's "First, corrections…" text, and the JSON shape puts `corrections` first.
     - `buildReadPrompt`'s closing line names both lists.
     - `ASK_SYSTEM_PROMPT`: the "To clarify" rule names `CORRECTED`.
     - `AskContext.corrected`, and `buildAskPrompt`'s `CORRECTED:` line after `FOLLOW-UP` and before `REQUEST`.
     - `PROMPT_LAYOUT` 7.
   - **`session.ts`:**
     - `receive` merges readings then corrections, dropping a correction whose criterion already has a reading in this reply. The merge goes in a small exported function, so it's tested alone.
     - It snapshots progress before `applyReadings` and sets `corrected` if any criterion moved from settled (or reported) to reason `contradicted`.
     - It passes `corrected` to `#next`, then to `#advance` and `#respond`. Not to `#repeatAfterStop`.
   - **Tests:** spec §4 items 1 to 9, in `tests/screening/calls.test.ts`, `session.test.ts` and `prompts.test.ts`. Existing assertions change only for the new return shape (`value.readings`), as 0021's did.
5. **Replay, after (a).** About 8 minutes. *Claim: whether asking for corrections first catches them, against spec §5's bar.* The result is committed. Claude counts the result, reads each false correction and records it under "Gate record". **Gate 1.**
6. **Only if gate 1 asks: the separate call** (spec §3.3).
   - `CORRECTION_SYSTEM_PROMPT` and `buildCorrectionPrompt` in `prompts.ts`, reusing the ALREADY ANSWERED rendering from `buildReadPrompt`, and added to `PROMPT_VERSION`'s hash.
   - `checkCorrections` in `calls.ts`, with `withRetry` and `READ_MAX_OUTPUT_TOKENS`.
   - `receive` calls it when `answered` is non-empty and merges its corrections after the read call's.
   - `evals/screening-estimate.ts` counts one more read-sized call per reply.
   - Tests: spec §4 item 11, and the estimate's test.
7. **Only if step 6 ran: replay, after (b).** About 8 minutes more. *Claim: whether a dedicated call catches what the field didn't.* Committed. **Gate 1 again.**
8. **Dev re-run.** `npm run eval:screening -- --dev`, about 80 minutes (95 to 105 under (b)), committed as `evals/results/screening/dev/13-<prompt version>.json`. *Claim: answering didn't get worse, and corrections are caught in a live run, not only in replay.* `npm run screening:compare` against `12-834179395652.json`. Count the dev `laterSays` facts that end `unresolved`. Read every `contradicted` finding on a fact without `laterSays`. Record it under "Gate record". **Gate 2.** Then **Gate 3**, the owner in `npm run app -- --examples`.
9. **Docs** (spec §8):
   - `docs/screening-agent.md`: how corrections are noticed, the replay and dev results, and the limits. The scored table and worked example stay, labelled with their prompt version.
   - `docs/limitations.md`: the missed-corrections line.
   - The README clause, only if gate 1 passed.
   - `work/ROADMAP.md`: the row, plus the carried-forward table's 0007 and 0009 entries on missed corrections.
10. **Review passes** from `REVIEW.md` on the whole diff. Fixes are committed, and the record goes below.

Every step is one commit through `npm run check && git commit`. No `Co-Authored-By` trailer.

**Browser test.** No path `npm run test:e2e` guards changes (`src/screening/`, `evals/`, `scripts/replay-corrections.ts`, `package.json`). CI runs it on the PR anyway. If step 4 turns out to need anything in `src/web/` or `scripts/app/`, it runs locally too, and the PR says so.

## Files that change (against `main`)

- **The agent:** `src/screening/calls.ts`, `prompts.ts`, `session.ts`, and possibly a new `src/screening/readable.ts` (step 1's lift). `index.ts` if it re-exports.
- **The replay:** new `evals/corrections/replay.ts`, `evals/cases/corrections.json` and `scripts/replay-corrections.ts`. `package.json` (one script, no dependency).
- **Under (b) only:** `evals/screening-estimate.ts`.
- **Tests:** `tests/screening/calls.test.ts`, `session.test.ts`, `prompts.test.ts`, and new `tests/evals/corrections-replay.test.ts`.
- **Results:** `evals/results/corrections/` (two or three replays) and `evals/results/screening/dev/13-*.json`, with its conversations under `evals/results/screening/conversations/` as 0021 committed them.
- **Docs and process:** `docs/screening-agent.md`, `docs/limitations.md`, `README.md` (one clause), `work/ROADMAP.md`, `CLAUDE.md` (one command line), and this plan.

No new dependency. `tests/boundary.test.ts` is unchanged: the replay script gets its adapter from `createLocalAdapter`, and `src/screening/` imports nothing new.

## Risks

- **The rebuild doesn't reproduce a conversation.** For example, a reading applied in a way evidence doesn't record. Step 1's test catches it before any replay. If one conversation can't be rebuilt, its cases are dropped and reported, not patched.
- **The replay overstates.** A rebuilt turn is the read call's exact input, but the live run also has the conversation's own path. That's why the dev re-run is still a gate, and why its catches are reported beside the replay's.
- **False corrections.** Asking the model to compare every reply with every answer may make it see changes that aren't there, and each one turns a right answer into an abstention. Measured by both bars, and each one is read in its transcript.
- **Moving the paragraph changes other readings.** Rewording a prompt can flip unrelated outcomes, as 0011 found. The dev run's confidently wrong and abstention bar is what watches for it.
- **Prompt length.** Every answered criterion is listed, so late turns carry long prompts. The replay records the length at each turn. If misses cluster at long prompts, gate 1 can ask for a cut.
- **The acknowledgement fires on agreement.** It's set only on a move to `contradicted`, and test 2 pins that.

## Verification

- `npm run check` on every commit.
- Step 1's rebuild test over all six committed conversations.
- The replays' counts against spec §5's bar (gate 1).
- The dev run's compare, correction count and false-correction reading (gate 2).
- The owner's correction in the app (gate 3).
- `npm run test:e2e` is left to CI unless step 4 touches a path it guards.

## Gate record

## Review passes
