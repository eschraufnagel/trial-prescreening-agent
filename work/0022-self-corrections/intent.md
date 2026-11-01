# intent: 0022 self-corrections

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-10, with all five decisions as recommended. See [spec.md](spec.md)
**Date:** 2026-10
**Scope:** One slice. When the person corrects an earlier answer in a reply to a different question ("It was more recent than I said: three weeks ago, not two months"), the agent notices. The first answer stops standing alone, and the coordinator sees both. The person is told the correction was noted. Code still decides what a correction does. Local model only.

---

## Problem

**A correction volunteered in a reply about something else is still missed.** In the latest dev run (`evals/results/screening/dev/12-834179395652.json`, NCT04385368-dev), the agent asked about major surgery in the last 28 days (L64), and the person said "No, my operation was about two months ago". It then asked about immune-suppressing medication (L65), and the person replied:

> "It was more recent than I said: three weeks ago, not two months. As for the immune-suppressing meds, I use an inhaled steroid…"

The read call returned readings for L65 only. L64 stayed `does-not-hold` on "about two months ago". The coordinator review shows a clean "No" for recent surgery, from someone who said one turn later that it was three weeks ago. The correction is only in the transcript, attached to no row.

**It has been the weakest spot since 0004, and it is the shape 0009 didn't fix.**

- 0004 (ROADMAP, "Carried forward from 0004"): "The read call is shown already-answered criteria so that it can notice a correction, and mostly does not."
- 0009 showed the read call what was recorded and the person's words for each answered criterion, most recent first. That fixed corrections made while answering the same criterion. It didn't fix this shape (ROADMAP, "Carried forward from 0009"): "A correction volunteered in the reply to a different question… is read only for the question it answers. That happened even with the corrected criterion at the top of the answered list the read call is shown."
- In the scored run `EVAL_RUN` names (`02-2c46ada9a1d5.json`), from labels, 3 of the 6 scripted corrections were missed (NCT00077350-v2 L3 and L15, NCT04385368-v3 L70). Missed self-corrections are 4 of that run's 17 confidently wrong findings ([docs/screening-agent.md](../../docs/screening-agent.md), "Where the agent fails"). In the latest dev run, 1 of 5 was missed (L64, above).
- 0007 (ROADMAP): "A missed self-correction is only in the transcript… nothing points at the correction."

**Every scripted correction has this shape.** The simulator delivers `laterSays` in the reply after the fact was used, "Before answering, correct something you said earlier…" (`evals/participant/simulate.ts`). That reply usually answers a different question. So the vignettes already test exactly this case, and the fix can be measured without touching the simulator.

**What code already does is right. The read call just doesn't report it.** When the read call does report a correction, `applyPatient` and `applyClinical` in [apply.ts](../../src/screening/apply.ts) turn a settled answer into `unresolved` (or a clinical report into `contradicted`), and the coordinator sees both quotes. In the file's words: "The agent does not pick a side; the coordinator sees both quotes." The vignettes expect `unresolved` for every fact with `laterSays`. The miss is in detection, not in the rule.

**Why the read call misses it.** It has one main job: read the reply against the question just asked. Noticing a correction is a second job, buried in a paragraph of a long prompt. The correction often doesn't name its subject ("It was more recent…"), so nothing in it points at L64 except what L64 recorded. 0004's design gives the model narrow jobs and code every decision. Here the model has two jobs in one call, and it drops the one that isn't asked about.

**It costs both people.**

- **The coordinator** sees an answer the person withdrew. It is the same quiet error 0021 named: a clean finding the person's own words contradict.
- **The person** corrected themselves and heard nothing back. Someone who stops to fix an earlier answer should know it was heard. That is 0021's theme, serving the participant.

## Proposed outcome

**The agent notices a correction of an earlier answer, wherever in the conversation it comes.** For each reply, whether it changes, qualifies or contradicts an answered criterion becomes an explicit question the model answers, not a hope buried in the read prompt. Decision 1 is how.

**Code decides what a correction does, as it does today.** A detected correction goes through the existing rules, unchanged: the settled answer becomes `unresolved`, reason `contradicted`, and both quotes are the evidence. The coordinator decides which answer stands. The agent never adopts the newer answer (decision 2).

**Rule 1 holds.** A correction's quote has to be found in the reply, like any reading. A correction the person didn't make can't unsettle anything.

**The person hears that it was noted.** The next message acknowledges the correction in a few words ("Thanks for letting me know, I've noted that") before its question. It doesn't re-ask or confirm the corrected criterion (decision 3).

**The review shows it on the row.** A caught correction is already shown on its criterion's row as contradicted, with both quotes. The review's rule is unchanged.

## Absent on purpose

- **Choosing between the two answers.** The coordinator does that. No code path settles a corrected criterion on the later answer.
- **Asking the person to confirm a correction.** That would need a rule for what a confirmation settles, which is decision 2 again.
- **A person who said "I don't know" and later remembers.** `applyPatient` treats `unresolved` as final, and its comment says so: "A person who said 'I don't know' and later remembers is a real case this does not handle." It's a different shape with no vignette. It's recorded, not fixed.
- **Changes to the simulator, the vignettes or the grader.** They are the ruler (ROADMAP: a simulator change "changes the ruler, so never in the same slice as an agent change").
- **Plain-language renderings.** The 0006 boundary holds.
- **A new screen or layout.**

## Affected users and systems

**The coordinator.** Fewer clean findings that the person later withdrew. A caught correction is on its row, as today's caught corrections are.

**The participant.** Hears that their correction was noted.

**`src/screening/`.** The read prompt and its output, or a new call beside it (decision 1). How a correction reaches `applyReadings` (the rules themselves are unchanged). The ask prompt's acknowledgement. `PROMPT_VERSION`.

**`scripts/app/` fake agent.** A scripted correction, so the app and the browser test can show it with no model, if the spec finds the page needs one (open question 5).

**`scripts/`.** Possibly a replay of the read call on recorded correction turns (decision 4).

**README, `docs/`, ROADMAP.** The failure table, the limitations line on missed corrections, and the slice's row.

**Not touched:** `src/criteria/`, `src/plain/`, `src/models/`, `src/transport/`, the simulator, the vignettes, labels, the grader, `data/`.

## Constraints

- **The coordinator makes the determination.** A correction only ever unsettles. It never settles.
- **Rule 1.** A correction's words must be in the reply.
- **The conversation always ends.** A correction adds no ask.
- **The boundaries hold.** `tests/boundary.test.ts` passes unchanged: model calls stay in `src/models/`, `src/screening/` doesn't import `src/plain/`, and `ScreeningCriterion` keeps its four fields.
- **The review's rule holds.** `tests/web/review.test.ts` passes unchanged.
- **Transparency and restore hold.** Saved conversations restore, and a state saved before this slice continues.
- **Local model only.** No paid call. A hosted model in the app pays for whatever decision 1 adds, and the spec says how much.
- **Proportionate.** Each run says in one line what claim it supports.
- **No gate needs clinical judgment.**
- **`npm test` stays near a second, and deterministic.**

## Decisions

1. **Where a correction is noticed. Recommend (a) first, with (b) as the lever if (a) falls short.**
   - **(a) A required field in the read output**, beside 0021's `request`: `"corrects": [ { "criterionId", "quote" } ]`, or empty. The model has to say, for every reply, whether it corrects an answered criterion. It costs no extra call. 0021's `request` field shows that a forced top-level question works on this model (no false requests in five dev conversations). The read call's readings for answered criteria already exist, though, and 0009 found the model ignores that path for this shape. So (a) may not be enough.
   - **(b) A separate correction call** after the read, with one job: here are the answered criteria, what was recorded and the person's words; does this reply change any of them? It is the lever the roadmap names ("a separate correction check per reply: one more model call a turn") and 0004's principle of one narrow job per call. It costs one call per reply once anything is answered: half again as many calls per conversation (one ask and one read a turn today), though a short one. The spec estimates the time on the local model and the spend on a hosted one.
   - (c), a deterministic cue-word filter ("actually", "than I said", "I got that wrong") deciding when to run (b), is rejected. It misses corrections worded any other way, and it puts a guess in code where the model's reading belongs.

   The choice between (a) and (b) is gate 1's, on measured catches. It spends model time, and on a hosted model it spends money.
2. **What a correction does: unchanged. Recommend keeping it.** It unsettles to `unresolved`/`contradicted`, and both quotes are kept. The brief says "record the correction rather than keep the first answer". This does both: the first answer no longer stands, and the correction is on the row. Adopting the later answer instead would make the agent choose which answer is true. The design has refused that since 0004 (`apply.ts`), and every vignette's expected outcome for a corrected fact is `unresolved`. Changing it would change the ruler. **Flagged for the owner,** because it leans against the brief's literal wording.
3. **Acknowledge the correction to the person. Recommend yes, in the next ask, with no extra call.** The ask call is told that the last reply corrected an earlier answer, and it begins with a few words of acknowledgement. The alternative is fixed text before the model's question: deterministic and testable, but colder, and the same every time.
4. **How it's measured. Recommend a read replay, then one dev re-run. No scored run.**
   - **A read replay:** rebuild the read call's input at each recorded correction turn and call the local model once per turn. There are 11 such turns: 6 in `EVAL_RUN`'s conversations from labels and 5 in the latest dev run. It measures detection directly, before and after, in minutes rather than hours. That makes trying (a) before (b) cheap. It also replays a sample of ordinary turns to count false corrections. Whether the scored run's conversations can be rebuilt from committed files is open question 4.
   - **The five dev vignettes, re-run once** (about 80 minutes, more with (b)): no worse at answering, and no false corrections that unsettle a right answer.
   - **The scored run isn't repeated** (13 hours). The README's numbers stay labelled as prompt `2c46ada9a1d5`'s, as 0021 left them. If gate 2 finds a real change, the scored run becomes its decision.
5. **The simulator and vignettes: unchanged.** Every scripted correction already has the target shape, so nothing new is needed to measure it. New held-out vignettes would be cleaner, because the dev five were tuned on in 0009. They would also be a second ruler and a longer slice. The replay's six scored turns are the closest thing to held out.

## Gates, proposed for the plan to argue with

None needs clinical judgment.

- **After the read replay, before the dev re-run: does the lever catch corrections, and is (a) enough or is (b) needed?** The replay gives catches out of 11 and false corrections on ordinary turns. The bar is fixed in the spec, before any run. What's decided: whether to spend an extra model call on every reply, in every conversation, for good. What it costs to be wrong: a field that catches nothing ships as a fix, or every screening pays for an extra call that (a) made unnecessary. The cost to a hosted user is the owner's call. The count itself can be delegated.
- **The owner corrects themselves in the app.** Folded into the first gate or after it. In one screening on the local model, they correct an earlier answer while answering a later question. They read whether the agent acknowledged it, and whether the review shows that row as contradicted with both quotes. Only a person can judge whether the acknowledgement reads as being heard. It's cheap, and it gives the owner a way to see the slice early.
- **After the dev re-run: did answering get worse?** Against 0021's dev run (`12-834179395652.json`), by `screening:compare`, with 0021's bar (confidently wrong no more than plus 2, abstention no more than plus 0.05). Every correction recorded on a fact without `laterSays` is read in its transcript. Delegable. What it costs to be wrong: a README that still reports numbers this agent no longer earns, or false corrections quietly turning right answers into abstentions.

## Open questions for the spec

1. **The correction's shape**, under (a) and under (b): one or several per reply, whether it carries a reading or only a criterion id and quote, and how it reaches `applyReadings`. A correction is a reading of an answered criterion. Leaning: reuse the `Reading` type, so the rules apply unchanged.
2. **Which answered criteria are shown.** All of them, or only the most recent N? A long conversation has dozens, and the prompt grows. Leaning: all of them, most recent first, as 0009 does, measured by the replay. Cut only if the replay shows the length hurts.
3. **False corrections.** A false correction turns a right answer into an abstention. How many on ordinary turns is too many, fixed before the replay. Leaning: none in the dev re-run that unsettles a right answer. At most one in the replay's sample of ordinary turns.
4. **The replay's inputs.** Can the read call's input at a past turn be rebuilt from what's committed: the dev conversations under `evals/results/screening/conversations/`, and `EVAL_RUN`'s review file? Or does it need the gitignored local cache? Leaning: the dev five from committed files. The six scored turns from the local cache if present, reported as such, since `tests/` never reads it.
5. **The page and the browser test.** If the review already shows a contradicted row, does anything on the page change? Leaning: nothing in `src/web/`. A scripted correction in the fake agent only if the spec wants a browser case. `test:e2e` runs anyway if `scripts/app/` changes.
6. **The acknowledgement's words.** What the ask prompt is told, and whether it names the corrected subject ("Thanks, I've noted the operation was three weeks ago"). Repeating it is warmer, but it could misstate it. Leaning: a general acknowledgement that doesn't restate the correction.
7. **What the README and `docs/` say.** The failure table, the limitations line and the worked example (`examples/NCT00077350-v2-labels-0009.html`) all describe this miss. Leaning: the docs say what changed and what the replay and dev run found. The scored-run numbers and the example stay as they are, labelled with their prompt version, because nothing re-ran them.
