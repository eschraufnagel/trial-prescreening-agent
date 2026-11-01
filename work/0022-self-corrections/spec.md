# spec: 0022 self-corrections

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-10
**Date:** 2026-10
**Intent:** [intent.md](intent.md), all five decisions accepted by the owner (2026-10)

---

## 1. Summary

The read call's output gains a `corrections` list, written before `readings`. In it the model says, for every reply, which already-answered criteria the reply changes. A correction is a reading of an answered criterion, and it goes through `applyReadings`'s existing rules unchanged: it unsettles and never settles. If a criterion was unsettled by the reply, the next question opens with a short acknowledgement.

A separate correction call is specified alongside (§3.3), built only if gate 1 finds the field falls short. A new script replays the read call at the 11 recorded correction turns and a fixed sample of ordinary ones. It measures catches and false corrections in minutes. The five dev vignettes are then re-run once. The simulator, vignettes, grader and scored run are unchanged.

## 2. Decisions taken before this spec

From the intent, accepted as recommended:

1. A correction is noticed by a required field in the read output first (§3.1). A separate call (§3.3) is the lever if gate 1 finds the field falls short.
2. What a correction does is unchanged: it unsettles to `unresolved`/`contradicted`, keeps both quotes and never settles (§3.2).
3. The person is told in the next question that the correction was noted, with no extra call (§3.4).
4. Measured by a read replay, then one dev re-run. The scored run isn't repeated (§5, §6).
5. The simulator and vignettes are unchanged.

## 3. The agent

### 3.1 The read call reports corrections first

The read output becomes:

```json
{ "corrections": [ <reading>... ], "readings": [ <reading>... ], "request": null }
```

A correction has exactly the fields of a reading (`criterionId`, `statement`, `quote`, `outright`, `reading`, `missing` on `partial`) and is parsed by the same code. **It comes first** in the JSON, and the prompt asks for it first. The model writes left to right. Today it writes the asked question's reading first, and by then the earlier answer is behind it. Asking about the answered criteria before anything else is the one structural change (a) makes. The replay measures whether it's enough.

The read system prompt's paragraph on ALREADY ANSWERED is replaced, roughly:

> First, "corrections". Compare the reply with every criterion listed as ALREADY ANSWERED: what was recorded and the person's words. If the reply changes, qualifies or contradicts one of them, give a reading for it here, with the words that do. People often correct an earlier answer while answering a different question, and often without naming what they correct ("it was more recent than I said", "no, the other way round", "I got that wrong"). Match the correction to the recorded answer it changes. Use an empty list when the reply corrects nothing. Answering the current question is not a correction, and neither is repeating an earlier answer.
>
> Then "readings", for the criteria the reply may address, as below. Give no reading there for a criterion you put in "corrections".

The user prompt's ALREADY ANSWERED block keeps its shape: most recent first, what was recorded and the quote. **All answered criteria are listed**, as 0009 does (intent open question 2). The replay records prompt length at each turn, so it would show if length hurts. The cut is the gate's to make, not this spec's.

**Parsing** (`readRead`). `corrections` absent or not an array is treated as empty, not a failure. A turn never fails over the optional part, the same leniency 0021 gave `request`. An entry that fails a reading's checks is dropped and listed as a problem only if `readings` itself is valid, so a bad correction never loses the turn. The return type becomes `{ readings: Reading[]; corrections: Reading[]; request: ParticipantRequest | null }`.

**Merging** (`session.ts`, before `applyReadings`). Readings are applied first, in their order, then corrections. A correction for a criterion that already has a reading in this reply is dropped. The model was told not to do that, and the reading wins. A correction for a criterion that isn't answered goes through the same rules as a reading of an open criterion. The model's choice of list doesn't decide what a reading does; code does.

**Rule 1 applies.** A correction's quote must locate in the reply, or it's a rejected reading, as today.

**0021's set-aside applies.** A correction is never of the pending criterion, which is open by definition, so `asked-to-explain` doesn't touch corrections.

### 3.2 What a correction does: unchanged

`applyPatient` and `applyClinical` aren't changed. As today:

- **Patient, settled:** the same value adds evidence. Any other value makes it `unresolved`, reason `contradicted`, with both quotes as evidence.
- **Clinical, reported `holds` or `does-not-hold`:** an opposite determination, or `does-not-apply`, makes it reason `contradicted` and drops `reported`. A vaguer reading (`unclear`, `partial`, `unknown`) is ignored as `already-settled`. That's a known limit, kept (§10), because the intent keeps the rules unchanged.
- **Unresolved:** final. A later answer is ignored, as the intent leaves it.

### 3.3 The lever if gate 1 needs it: a separate correction call

Specified now so gate 1 can choose it without another spec. Built only on gate 1's word.

- `checkCorrections(adapter, context)` in `calls.ts`, beside `read`. It runs after the read call, only when at least one answered criterion exists.
- `CORRECTION_SYSTEM_PROMPT`, one job: "Here is one reply, the recent conversation, and the criteria this person has already answered, each with what was recorded and their words. Does the reply change, qualify or contradict any of them?" It uses §3.1's correction paragraph and the same reading fields. It returns `{ "corrections": [...] }`.
- Input: the last `READ_CONTEXT_TURNS` turns, the reply, and the ALREADY ANSWERED block exactly as `buildReadPrompt` renders it. No open criteria, no question.
- Output cap: `READ_MAX_OUTPUT_TOKENS`, with the same retry. A failure fails the turn atomically, like any call.
- **Under (b) the read call keeps its own `corrections` field.** Removing it would make two changes at once. The two lists are merged as in §3.1, with the read call's taking precedence, then the separate call's. `PROMPT_VERSION` hashes the new prompt.
- **Cost.** It adds one call per reply once anything is answered: about 190 calls on the dev five today (377 agent calls in `12-834179395652.json`). At that run's average of about 7 s an agent call, with shorter output, that's roughly 15 to 25 minutes on the dev re-run. On a hosted model, each reply gains one read-sized input. `evals/screening-estimate.ts` counts it, so the dry estimate and the app's cap see it.

### 3.4 The acknowledgement

`AskContext` gains `corrected?: true`. `buildAskPrompt` adds one line after `FOLLOW-UP` and before `REQUEST`:

> `CORRECTED: The person's last message corrected something they told you earlier. Begin by thanking them in a few words for letting you know, without repeating or interpreting what they said. Then ask.`

The ask system prompt's "To clarify" rule gains `CORRECTED` beside `FOLLOW-UP` and `REQUEST` as the cases where a lead-in is allowed.

**When it's set.** Code compares each criterion's progress before and after this reply's readings are applied. `corrected` is set if any criterion moved from `holds`, `does-not-hold` or `chart-review` with a `reported` value to reason `contradicted`. That's whatever list the reading came from, because the person corrected themselves either way. It's set on the next ask call, whether that is `#advance` or `#respond`. `#repeatAfterStop` and the stop path make no call and carry no acknowledgement.

**It doesn't restate the correction** (intent open question 6). Restating risks misstating it, and the coordinator sees both quotes on the row.

### 3.5 Types and state

- `ReadResult` gains `corrections: Reading[]`.
- `AskContext` gains `corrected?: true`.
- No change to `ScreeningState`, `Turn`, `Progress`, `Finding` or `Evidence`. A correction is evidence like any other, and the review already shows a contradicted row with both quotes. Saved conversations restore unchanged.
- `ScreeningCriterion` keeps its four fields.
- `READ_SYSTEM_PROMPT` and `ASK_SYSTEM_PROMPT` change, and `PROMPT_LAYOUT` goes to 7, so `PROMPT_VERSION` changes.

### 3.6 The page

No change in `src/web/` (intent open question 5). A caught correction appears as today's caught corrections do: a contradicted row with both quotes. The acknowledgement is an ordinary question. The fake agent's read returns no `corrections`, which parses as empty, so fake mode and the browser test are unchanged. No path the browser test guards changes. CI runs it on the PR anyway.

### 3.7 The grader

Unchanged. `SCREENING_GRADER_VERSION` stays. A fact with `laterSays` already expects `unresolved`, and a caught correction produces that.

## 4. Tests

Deterministic, under `tests/screening/` and `tests/scripts/`, with a `FakeModelAdapter`:

1. **The case that started it.** L64 settled `does-not-hold` on "about two months ago". L65 is pending. The read returns `corrections: [L64 holds "three weeks ago, not two months"]` and a reading for L65. L64 becomes `unresolved`/`contradicted` with both quotes, and L65's reading applies.
2. **The acknowledgement.** The next ask prompt contains `CORRECTED:`. A reply that corrects nothing doesn't produce it. A correction that agrees with what was recorded doesn't produce it either.
3. **A clinical correction.** A reported `does-not-hold` and a correction `holds` make it `contradicted` and set `corrected`. A correction `unclear` is ignored as `already-settled` and doesn't.
4. **Precedence.** A criterion in both `readings` and `corrections` is applied once, from `readings`.
5. **Rule 1.** A correction whose quote isn't in the reply is rejected and changes nothing, so no `CORRECTED:` appears.
6. **Parsing.** Absent `corrections`, a non-array, and an entry missing `statement` all leave the turn's readings intact. A valid one round-trips.
7. **A correction of an open criterion** applies as a reading.
8. **Restore.** A state saved before this slice continues.
9. **Prompts.** The read system prompt asks for `corrections` before `readings`. The ask system prompt names `CORRECTED`. `PROMPT_LAYOUT` is 7.
10. **The replay's inputs** (§5): every case in `evals/cases/corrections.json` names a participant reply, in a committed file, whose criterion was settled before that turn. Rebuilding progress at each conversation's last turn reproduces its committed final statuses for every raisable criterion. That second test is what lets the replay be trusted.
11. Under (b) only: `checkCorrections` isn't called when nothing is answered. Its corrections merge after the read call's. A failure leaves the turn unchanged.

## 5. The read replay

A new script, `scripts/replay-corrections.ts`, run as `npm run corrections:replay`. It rebuilds the read call's input at chosen past turns and calls the local model once per turn, through `createLocalAdapter`, like `screening:chat`.

**Inputs, all committed** (intent open question 4):

- **The 5 dev conversations' files** under `evals/results/screening/conversations/`, which hold full state. The correction cases come from the three with `laterSays` facts.
- **`EVAL_RUN`'s review file**, `evals/results/screening/review/02-2c46ada9a1d5.json`, which holds each conversation's criteria and result (transcript and findings with evidence). The correction cases come from NCT00077350-v2, NCT03433469-v1 and NCT04385368-v3, from labels.
- **`evals/cases/corrections.json`**, new and hand-written: for each of the 11 correction turns, the file, the conversation, the turn index, the corrected criterion and the vignette's `laterSays`. Found by reading each transcript once.

**Rebuilding the input at turn N.** Progress before N is rebuilt by applying each criterion's evidence from turns before N, in turn order, through `applyReadings`. Evidence is exactly what was applied. A reading that was ignored or rejected changed nothing. So the rebuild reproduces progress, and test 10 checks that at the last turn. The transcript is cut at N. `buildReadPrompt` gets what `#readable` would have produced. The replay doesn't rebuild `timesAsked` or `responses`, which the read call never sees.

**What it measures, per turn:**

- **Correction turns (11):** **caught** if, after merging, a located reading for the corrected criterion would unsettle it under §3.2. Otherwise **missed**.
- **Ordinary turns (fixed sample):** in each of the 6 conversations that hold a correction, every fifth participant reply from the tenth on, skipping correction turns. About 50 turns. A **false correction** is a located reading, from either list, that would unsettle an answered criterion on an ordinary turn. Each one is printed with its turn so it can be read. Some may be the simulated person really qualifying an answer, and reading tells which.

**Output.** A committed result under `evals/results/corrections/NN-<prompt version>.json`. It records the model, quantization, temperature, seed and thinking mode, the prompt version, each turn's outcome with the model's raw corrections, and the prompt's length in characters. A printed table goes beside it. About 60 read calls at about 7 s is **8 minutes a replay**.

**Runs, each with its claim:**

1. **Before**, on `main`'s prompt: what the current read call catches on these turns today. The original runs used older prompts, so their outcome isn't the baseline.
2. **After (a):** whether the field catches them.
3. **After (b), only if gate 1 asks:** whether the separate call does.

### The bar for gate 1, fixed now

- **(a) is enough** if it catches **at least 9 of 11**, and at least 2 more than the before replay, with **at most 1 false correction** in the ordinary sample after reading.
- **Otherwise (b) is built and replayed** against the same bar.
- **If neither meets it,** the gate decides between shipping the better one with its numbers reported and stopping the slice. Every replay is reported, kept or not.

## 6. The dev re-run

`npm run eval:screening -- --dev`, the five dev vignettes from labels on the local model, committed under `evals/results/screening/dev/` as `13-<prompt version>.json`. It takes about 80 minutes, plus 15 to 25 under (b). The owner runs it in their own terminal if `OMLX_API_KEY` isn't in Claude's shell, as in 0021. Compared by `npm run screening:compare` against `12-834179395652.json`.

**The bar, fixed now:**

- **Answering didn't get worse:** confidently wrong no more than 3 + 2, and abstention no more than 0.05 + 0.05, 0021's bar.
- **Corrections caught:** of the 5 dev facts with `laterSays`, how many end `unresolved`. Reported. The run's own path decides when each correction arrives, so this is one sample beside the replay's controlled one.
- **False corrections:** every criterion ending `contradicted` on a fact without `laterSays` is read in its transcript. One that unsettles a right answer is a false correction. None is the expectation. Any is the gate's call.

## 7. Gate: the owner corrects themselves in the app

After the dev re-run, the owner plays one screening in `npm run app -- --examples` on the local model. While answering a later question, they correct an earlier answer, in their own words and without naming what they mean. They read two things:

- whether the next message acknowledged it and sounded like being heard;
- whether the review shows that row as contradicted, with both quotes.

Only a person can judge the first. It's the owner's, and a short one.

## 8. Documentation

- **`docs/screening-agent.md`:** how corrections are noticed now, what the replay and dev run found, and the limits (§10). "Where the agent fails" and the worked example stay as measured, labelled with their prompt version, because the scored run isn't repeated.
- **`docs/limitations.md`:** the line on missed corrections says what changed and what's still unmeasured on the scored set.
- **README:** one plain clause, that the agent notices when someone corrects an earlier answer, if gate 1 passes. No numbers change.
- **ROADMAP:** the row, the carried-forward table entries for 0007 and 0009's missed-correction items, and what the gates found.
- **CLAUDE.md:** the commands table gains `npm run corrections:replay`.

## 9. What the plan must gate

- **Gate 1 (§5), after the before and (a) replays, before the dev re-run.** Is (a) enough, or is (b) built? It guards the 80-minute run, and a change that adds a call to every reply in every conversation for good. The count can be delegated. Choosing (b) adds cost to every hosted screening, so that choice is the owner's.
- **Gate 2 (§6), after the dev re-run.** Did answering get worse, and are there false corrections? It decides whether the README's numbers still describe this agent. Delegable.
- **Gate 3 (§7), the owner in the app.** The owner's alone. It can be held in the same sitting as gate 2.

## 10. Out of scope, and known limits

- Settling a corrected criterion on the later answer, or asking the person to confirm it (intent decision 2).
- A later answer to an `unresolved` criterion ("I don't know", then remembering). Still ignored.
- A vaguer correction of a clinical report (`unclear` after a reported `holds`). Still ignored as `already-settled`, as today.
- The scored run, new vignettes, simulator changes and grader changes.
- The parse-source corrections in `EVAL_RUN`: their criteria have parse ids, and the six labelled turns measure the same read call.
- Any change in `src/web/`.
