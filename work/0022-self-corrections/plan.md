# plan: 0022 self-corrections

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-10. Gate 1 met; gate 2 waiting on the owner
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
| **2. The field, measured** | 3–5 (3 skipped) | **Gate 1** | Is (a) enough, or is (b) built? Against spec §5's bar |
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
     - `unsettled(before, after)` in `src/screening/apply.ts` names the criteria a reply moved from settled (or a reported determination) to `contradicted`. It's shared now with the replay's `classify` and, in step 4, with the session's acknowledgement, so both measure a correction by its effect.
   - **`evals/cases/corrections.json`:** the correction turns (file, conversation id, turn, corrected criterion, `laterSays`, and a `shape`), found by reading each transcript once:
     - from labels in `EVAL_RUN`: NCT00077350-v2 L3 and L15, NCT03433469-v1 L55 and L63, NCT04385368-v3 L59 and L70;
     - from dev 12: NCT00077350-dev L4 and L14, NCT03433469-dev L20, NCT04385368-dev L64 (turn 88).
     - **Divergence, found in this step:** there are 10 scripted corrections, not 11 (the dev vignettes have 4, not 5). Only 6 correct an answer that was settled when the correction came. These are the shape this slice fixes (`settled`): v2 L3, v1 L63, and the four dev ones.
       - Two never had a first answer on their criterion (`unrecorded`). In v2 L15, "four weeks ago" was said while answering about scans. In v1 L55, the scripted first answer was never said.
       - Two had the first answer held back as hedged, and the correction came on the criterion's own follow-up (`held-back`, v3 L59 and L70).
       - The four that aren't `settled` are replayed and reported, but they can't be caught by a correction of an answered criterion, so they don't count toward the bar. A test pins each case's shape against the rebuilt progress. Spec §5's bar of 9 of 11 can't apply as written; gate 1's bar is restated in "Gate record" before the first replay.
     - The ordinary-turn sample is computed, not listed: every fifth participant reply from the tenth on, in those six conversations, skipping correction turns.
   - **Tests** (`tests/evals/corrections-replay.test.ts`, spec §4 item 10):
     - every case names a participant reply, and its criterion was settled before that turn exactly when its shape is `settled`;
     - rebuilding each of the six conversations at its last turn, then `finalize`, reproduces its committed findings' statuses, reasons and reports;
     - the lifted `readable` function gives the session the same read prompt as before (the existing session tests pass unchanged).
2. **The replay script.**
   - `scripts/replay-corrections.ts`, and `"corrections:replay"` in `package.json` with `--env-file-if-exists=.env`, like `screening:chat`.
   - It builds the adapter with `createLocalAdapter(parseModelSpec("omlx"), { thinking: false })` and calls `read()` from `src/screening/calls.ts` at each turn. Under (b) it also calls `checkCorrections`.
   - It writes `evals/results/corrections/NN-<PROMPT_VERSION>.json`: the model, quantization, temperature, seed and thinking mode, the prompt version, and per turn the outcome, the raw corrections and readings, and the prompt's length. It prints a table.
   - Deterministic test of the result shaping with a `FakeModelAdapter`.
   - The CLAUDE.md commands table gains the line in this commit.
   - **Fixed after step 5:** step 1 pointed the three dev conversations at the screening conversation cache, which is gitignored. So the replay test would have failed on a fresh clone, against CLAUDE.md's rule. Byte-identical copies are now committed under `evals/results/corrections/conversations/` (excluded from Biome, like the cache, so they stay identical), and a test holds every conversation the cases file names to a path git doesn't ignore. The replay's result doesn't change: same inputs.
   - As built: the runner is `replay()` in `evals/corrections/replay.ts`, so it's tested with a `FakeModelAdapter`, and the script only writes and prints. A turn whose read fails after its retries is recorded as `failed`, not dropped. The sample is 44 ordinary turns, so a replay is 54 calls, about 7 minutes.
3. **Replay, before. Skipped by the owner (2026-11)**, to keep the measuring proportionate. Only 6 of the 10 cases are the shape this slice fixes, and the dev re-run measures live catches anyway. The cost: no same-prompt baseline for the replay. The after replay is compared with what the recorded conversations did instead, on older prompts for the three from `EVAL_RUN` and on `834179395652` for the four from dev 12, and the write-up says so.
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
   - As built (prompt version `f761514b3da8`): the merge is `withCorrections` in `session.ts`, and the replay uses it, recording the raw corrections beside the readings. The acknowledgement's text is `CORRECTED_LINE`, hashed into `PROMPT_VERSION` with the system prompts. `corrected` comes from step 1's `unsettled(before, after)`. Two existing prompt tests changed: one found the JSON shape by its opening `{ "readings"`, which now opens with `corrections`, and one pinned `PROMPT_LAYOUT` 6 and the "To clarify" rule. Spec §4 item 8 (restore) needs no new test: no state type changed, and the existing restore test runs unchanged.
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
- **The replay:** new `evals/corrections/replay.ts`, `evals/cases/corrections.json`, `scripts/replay-corrections.ts`, and the three dev conversations it reads, under `evals/results/corrections/conversations/`. `package.json` (one script, no dependency). `biome.jsonc` excludes those conversations.
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

**Gate 1's bar, restated before any replay (step 1's divergence), confirmed by the owner (2026-10).** Spec §5 asked for 9 of 11. Of the 10 scripted corrections, 6 are `settled`. Proposed: (a) is enough if it catches **at least 5 of the 6 settled turns**, including at least one of the two the recorded runs missed (v2 L3, dev L64), and more than the before replay does (since step 3 was skipped: more than the recorded conversations caught), with **at most 1 false correction** in the ordinary sample after reading. Otherwise (b) is built and held to the same bar. The four other turns are reported.

**Step 5, the after replay** (`evals/results/corrections/01-f761514b3da8.json`, Qwen3.6-35B-A3B-MLX-8bit, 8bit, temperature 0, seed 20260921, thinking off, 54 calls, none failed, 2026-11). Counted by Claude:

- **Settled corrections caught: 5 of 6.** v2 L3, v1 L63, dev L4, dev L14 and dev L20. The recorded conversations caught 4 (all but v2 L3 and dev L64). So the replay catches one more, v2 L3, which is one of the two the bar names.
- **The miss, dev L64**, isn't a miss in noticing. The read call put L64 in `corrections`, quoting "It was more recent than I said: three weeks ago", but read the statement "had a major surgical procedure within 28 days" as `does-not-hold`. That agreed with what was recorded, so nothing unsettled. It's a misreading of direction, of the kind 0009's statements were meant to stop.
- **False corrections: 0 in 44 ordinary turns.**
- **One misplaced correction on a correction turn**, not in the ordinary sample, so not counted: at v2 turn 10, "my last chemotherapy was only last week" (L15's correction) was also given as a correction of L3, the number of regimens. In the rebuild L3 was still settled, because the recorded run missed its correction at turn 6. In a live run that caught turn 6, L3 would already be unresolved, and that's final, so the reading would change nothing.
- **The four other shapes: all missed, as expected.** The two `unrecorded` ones have no recorded answer to correct. In the two `held-back` ones, L70's correction settles it `does-not-hold` as an open criterion, the rules issue already noted. L59 got no reading.
- **The caveat from skipping step 3:** the one extra catch, v2 L3, is compared with a conversation recorded on an older prompt (`2c46ada9a1d5`). Main's prompt might have caught it too. The three dev catches were already catches on main's prompt.

**Gate 1: met.** At least 5 of 6, including v2 L3, more than the recorded conversations caught, with no false corrections. So (b), the separate call, isn't built (steps 6–7 are skipped), and no spend is added to hosted screenings. The dev re-run (step 8) is the live check.

**Step 8, the dev re-run** (`evals/results/screening/dev/13-f761514b3da8.json`, Qwen3.6-35B-A3B-MLX-8bit, 8bit, temperature 0, seed 20260921, thinking off, 2026-11; about 52 minutes). Compared with `12-834179395652.json` by `screening:compare`. Counted and read by Claude:

- **Confidently wrong: 3 of 38, against 3 of 44.** Within the bar (at most 3 + 2). The two misses from run 12 that this slice touches are gone (L64, the surgery date, now ends unresolved). New wrong rows: NCT03433469 L20, below, and NCT04385368 L65, an inhaled steroid read as "no steroids", unrelated to corrections.
- **Abstention: 7 of 42 (0.17), against 2 of 43 (0.05). Over the bar (at most 0.10).** Five of the seven are one misreading: "I'm a man, so not pregnant" or "I'm a woman" read as `does-not-apply` on the pregnancy, breastfeeding and contraception criteria (NCT00077350 L20, L21, L23; NCT03433469 L67, L68). That's 0009's known pattern. Run 12 had two such (NCT00077350 L20, NCT04316364 L7). None of them is a correction. The conversation's path changed with the prompt, and the misreading came up more often. A sixth is L55, below. The seventh is NCT04385368 L73, the same sex pattern.
- **Corrections caught live: 3 of 4** (L4, L14, L64), against 3 of 4 in run 12 (L4, L14, L20). The miss changed. **NCT03433469 L20** ("Big tablets are a struggle for me") *was* noticed. The read call gave the correction, but its quote, "Big tablets are a struggle... I often can't get them down.", isn't in the reply word for word, so rule 1 rejected it, and the first answer stood. So noticing was 4 of 4, and applying 3 of 4.
- **False corrections: 1.** NCT03433469 L55, "no regular medicines", settled `does-not-hold` at turn 42, and was unsettled at turn 50 by "I also don't know if I'm taking any medications that prolong the QT interval". The grader expected `does-not-hold`. It turns a right answer into an abstention, and it's the kind of qualification 0009's rule already unsettles on. The run can't show which list it came from.

**Gate 2: the abstention bar is not met.** Claude's recommendation: accept the slice with the cost recorded, and don't retune here. Reasons:
1. The rise is in the safe direction: the coordinator gets the row, not a wrong answer.
2. Five of the six new abstentions come from 0009's sex-based `does-not-apply` misreading, not from corrections.
3. Retuning that wording is its own change with its own measurement, and is better as its own slice than a second dev run here.

The owner decides. If the owner holds the bar instead, the slice stops here, and the replay and the fix stay on the branch, unmerged.

## Review passes
