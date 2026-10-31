# spec: 0021 serve the participant

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-10
**Intent:** [intent.md](intent.md), all five decisions accepted by the owner (2026-10)

---

## 1. Summary

The read call can report that a reply asks the agent for something. Code decides what that does. An explanation request about the pending question keeps the criterion open, records nothing from that reply for it, and makes the next turn a respond-then-ask of the same criterion. The model writes that turn from the criterion's words. A respond-then-ask turn doesn't use up an ask, and each criterion gets at most one. Questions about the study are answered from fixed facts. A request to stop gets fixed text. The ask prompt stops presenting a new topic as a follow-up.

Measured by deterministic tests of the code path, one re-run of the five dev vignettes, and the owner playing it in the app. The scored run isn't repeated. The product intent's line on the participant is rewritten.

## 2. Decisions taken before this spec

From the intent, accepted as recommended:

1. The product intent's line on the participant is rewritten (§8).
2. A reply that asks for an explanation of the pending criterion records no reading for it (§3.2).
3. Plain-language renderings stay out of `src/screening/`. Explanations come from the protocol's words.
4. The simulator is unchanged. Help is measured by deterministic tests and the owner's gate. The five dev vignettes are re-run once, to check that answering didn't get worse (§6).
5. The scored run is not repeated. `EVAL_RUN` stays 0009's, served by its recorded versions, as 0009 decision 5 allows.

## 3. The agent

### 3.1 The read call reports a request

The read call's output gains one top-level field beside `readings`:

```json
{ "readings": [ ... ], "request": null }
{ "readings": [ ... ], "request": { "kind": "explain", "quote": "elaborate on this" } }
```

| Kind | The reply… | Examples |
| --- | --- | --- |
| `explain` | asks what the question, or a word in it, means, or says they don't understand it | "what does that mean?", "elaborate on this", "I don't follow", "what's a resection?" |
| `why` | asks why the question is asked | "why do you need to know?" |
| `study` | asks about the study, who sees the answers or what happens next | "what is this trial?", "who reads this?", "what happens after?" |
| `stop` | asks to stop or pause | "can we stop?", "I need a break" |

The read prompt gains a paragraph, roughly:

> Then say whether the reply asks the research assistant for something. "explain": it asks what the question or a word in it means, or says they don't understand it. "why": it asks why the question is asked. "study": it asks about the study, who sees their answers, or what happens next. "stop": it asks to stop or pause. Quote the asking words exactly. Use null when the reply asks for nothing. Saying "I'm not sure" or "I don't know" answers the question; it is not a request.

The last sentence matters most. A false `explain` costs a repeated question, and the vignettes say "not sure" often.

**One request per reply.** If a reply asks two things, the model picks one. A request names no criterion: `explain` and `why` are taken to be about the pending question. Asking about an earlier question is a known limit (§9).

**Parsing** (`readRead` in `calls.ts`). An absent or `null` request is `null`. A request with an unrecognised kind, or with no string quote, is dropped as `null` rather than failing the response. This is the same leniency 0009 gave a missing quote: a turn should never fail over the optional part. The return type becomes `{ readings: Reading[]; request: ParticipantRequest | null }`.

**Rule 1 applies.** A request's quote must locate in the message (`locateEvidence`), like a reading's. One that doesn't is dropped and listed in `rejectedRequests` (§3.5). A request the person didn't make never changes the flow.

### 3.2 What code does with a request

A new module, `src/screening/requests.ts`, holds the rules. `MAX_RESPONSES = 1`, beside `MAX_ASKS`. "Respond" means the next agent turn is a respond-then-ask of the pending criterion P: P stays `pending`, `P.responses` goes up by 1 and `P.timesAsked` doesn't change.

Let P be the pending criterion when the reply arrived. Readings are applied as today except where the table says otherwise.

| Request | P has a response left (`responses < MAX_RESPONSES`) | P has used its response |
| --- | --- | --- |
| `explain`, `why` | Readings for P from this reply are **not applied**. Each goes to `ignoredReadings` with `why: "asked-to-explain"`. Other criteria's readings apply. Respond. | Readings apply as normal. The next turn is chosen as today. The ask call is told the person asked again and should be offered the coordinator (§3.3). |
| `study` | Readings apply. If P is still open, respond. If P is settled, the next criterion is asked as today, with the study answer first (§3.3). | Readings apply. The next turn is chosen as today, with no study answer. |
| `stop` | Readings apply. If P is still open, the agent sends `STOP_TEMPLATE` followed by P's last question, word for word, with no model call. Counts as P's response. If P is settled, `STOP_TEMPLATE` followed by the next question as today. | Readings apply. The next turn is chosen as today. |

**Why this always ends.** A criterion is asked at most `MAX_ASKS + MAX_RESPONSES` = 3 times, and every turn either asks an open criterion with asks or responses left, or closes. A test pins it (§4).

**Why `explain` records nothing for P.** In "No, but elaborate on this", the "No" was given before the person understood the question. Recording it is the quiet error the intent names. P is asked again after the explanation, and that answer is the evidence.

`nextCriterion` is unchanged. A respond turn doesn't go through it: P is still pending, still open and still has its asks.

### 3.3 The ask call's respond-then-ask mode

`AskContext` gains `request?: { kind: RequestKind; quote: string; again?: true }`. `buildAskPrompt` adds one block after `CRITERION`/`KIND`/`FOLLOW-UP`:

- **`explain`:** `REQUEST: They asked what this question means ("<quote>"). First explain the question in plain words, in one or two short sentences, using only the CRITERION's words: what it asks about and what any medical term in it means. Then ask the question again.`
- **`why`:** `REQUEST: They asked why you are asking ("<quote>"). First say in one sentence why: the study can only include people who meet its requirements, and this is one of them. Then ask the question again.`
- **`study`:** `REQUEST: They asked about the study or the process ("<quote>"). First answer in one or two sentences, from STUDY FACTS only. If STUDY FACTS don't cover it, say the study coordinator can answer that. Then ask the question.` Followed by `STUDY FACTS`, a fixed list in `templates.ts`: the study's title; that this is a short prescreening and not enrolment; that a study coordinator reviews every answer and follows up; that any question can be skipped; that they can stop at any time.
- **`again: true`** (the person asked to explain or asked why, and P's response is used): `REQUEST: They asked again ("<quote>"). Say briefly that the study coordinator can go over it with them, then ask the question.`

**The system prompt changes in four places:**

- **Removed:** "If their last message asked you something, you may answer briefly in a few words before your question, but give no medical advice." REQUEST now does this job.
- **Added:** "If REQUEST is given, do what it says first, then ask. Explain the question, never the person's own situation or what an answer would mean for them. Give no medical advice. The whole message may be up to 450 characters, still with one question mark."
- **Added:** "Begin with 'To clarify' or similar only when FOLLOW-UP or REQUEST is given. A new criterion is a new question: do not present it as a follow-up."
- **Kept:** "never say or suggest whether the person is eligible…" and the rest.

A respond turn is a `question` turn with `criterionId: P` and `responds: <kind>` (§3.5). So the review files it under P's row, beside the reply that answers it, and the grader counts it as a question (§3.7).

`ASK_SYSTEM_PROMPT` and `READ_SYSTEM_PROMPT` change and `PROMPT_LAYOUT` goes to 6, so `PROMPT_VERSION` changes.

### 3.4 Fixed text

In `templates.ts`, beside the opening and closing, and checked against `VERDICT_PATTERN` by the existing test:

- `STOP_TEMPLATE`: "Of course. You can stop at any time by closing this page, and a study coordinator will still follow up on what you've told me so far. If you'd like to keep going, here is the question again:"
- `STUDY_FACTS`: the list in §3.3, with `{title}`.

### 3.5 Types and state

In `types.ts`:

- `RequestKind = "explain" | "why" | "study" | "stop"`.
- `ParticipantRequest { kind: RequestKind; quote: string }`.
- `Turn` gains `request?: ParticipantRequest` on a participant reply whose request located, and `responds?: RequestKind` on an agent question that answers one.
- `Progress` and `Finding` gain `responses?: number`. Absent means 0, so conversations saved before this slice restore unchanged and `ScreeningState.version` stays 1.
- `IgnoredReading["why"]` gains `"asked-to-explain"`.
- `ScreeningState` and `ScreeningResult` gain `rejectedRequests?: { turn: number; kind: RequestKind; quote: string }[]`. They're optional for the same reason.

`ScreeningCriterion` keeps its four fields. `StudyContext` is unchanged: `STUDY_FACTS` uses only the title, because no trial record carries a summary today.

### 3.6 Words on the page and in the review

- **Review transcript.** A reply carrying `request` shows a fixed label from a typed record in `src/web/review.ts`, so typecheck requires one per kind: *Asked what this means*, *Asked why*, *Asked about the study*, *Asked to stop*. A respond turn needs no label: it reads as an explanation.
- **Review rows.** Unchanged in shape. The respond turn appears in P's row because it is a question about P. The reading that `asked-to-explain` set aside isn't evidence, so it isn't marked. `tests/web/review.test.ts` passes unchanged.
- **Reason words.** `asked-to-explain` is a reason for ignoring a reading, not a finding reason, so no finding word is added. If the tester panel lists ignored readings, it gets the words "set aside: they asked what the question meant".
- **The question number.** `questionCount` in `ParticipantPane.tsx` and its sibling in `ConversationView.tsx` don't count a turn with `responds`. The number stays on the question being explained, so it reads as the same question and not as question 17.

### 3.7 The grader

Unchanged, and `SCREENING_GRADER_VERSION` stays.

- `VERDICT_PATTERN` already runs over every agent turn, so respond turns and fixed text are covered.
- `multiQuestion` and `overLength` count respond turns. A respond turn may run to 450 characters, past `MAX_QUESTION_LENGTH` (320). The dev vignettes never ask for anything, so the dev re-run has no respond turns. A conversation in the app may show over-length counts, and that's expected.

### 3.8 Cost

- **Read call:** one more short field, a few output tokens.
- **Ask call:** unchanged in number of calls. A respond turn is one ask call, the same as a follow-up.
- **`stop`:** no model call.
- **Dev vignettes:** they never ask, so the re-run costs what 0009's did, about 80 minutes.
- **A conversation in the app:** one more ask per request, at most one per criterion.

### 3.9 What doesn't change

- The order of criteria, `MAX_ASKS`, `raisability` and `finalize`.
- `applyReadings`'s rules for readings that apply.
- Atomic turns and restore-from-state.
- The transport, the server's routes, the boundaries, the review's rule and the simulator.

## 4. Tests

Deterministic, under `tests/screening/` and `tests/web/`, with a `FakeModelAdapter`:

1. **The case that started it.** P15 pending, the read returns `{readings:[P15 does-not-hold "No"], request:{explain,"elaborate on this"}}`. P15 stays open with no evidence. `ignoredReadings` has P15 with `asked-to-explain`. The next agent turn is a question about P15 with `responds: "explain"`. `timesAsked` is 1 and `responses` is 1. The ask prompt contains `REQUEST:` and the quote.
2. **The other criteria still apply.** The same reply also reads P16 as `does-not-hold`, and P16's evidence is recorded.
3. **The cap.** A second `explain` on P15 applies its reading, the next turn moves on, and the ask prompt has `again`.
4. **Termination.** A participant who asks `explain` on every turn finishes, with no criterion asked more than 3 times.
5. **`study`** with P still open responds. With P settled by the same reply, the next criterion is asked and the prompt carries `STUDY FACTS`.
6. **`stop`** makes no model call for the agent turn, and its text is `STOP_TEMPLATE` followed by P's last question.
7. **Rule 1.** A request whose quote isn't in the message is dropped to `rejectedRequests` and changes nothing else.
8. **Parsing.** A missing request, `null`, an unknown kind and a missing quote all come back as `null` without failing. A valid one round-trips.
9. **Restore.** A state saved without `responses` or `rejectedRequests` restores and continues.
10. **Prompts.** The ask system prompt no longer contains the removed line and contains the "To clarify" rule. `PROMPT_LAYOUT` is 6.
11. **Fixed text** passes `VERDICT_PATTERN`, beside the opening and closing.
12. **The page.** `questionCount` doesn't count a `responds` turn. The review's request label exists for every kind, which typecheck already enforces.
13. **Transparency.** A session and the service over `MemoryTransport` reach identical state through a scripted `[explain]` reply (see plan step 4).

## 5. Fake mode and the browser test

`scripts/app/scripted-agent.ts`:

- A reply starting `[explain]` reads as `request: {kind:"explain", quote:<the rest>}`, with no readings.
- An ask prompt with a `REQUEST:` line answers `(scripted) That question asks whether this is true for you: <criterion>. Is it?`

`tests/scripts/scripted-agent.test.ts` covers both. `e2e/conversation.spec.ts` gains **case 12** (8 to 11 are taken): send `[explain] what does that mean?`. The next agent message starts "(scripted) That question asks", the question number hasn't moved, and the finished conversation's review shows *Asked what this means* on that reply.

## 6. The dev re-run

`npm run eval:screening -- --dev`, the five dev vignettes from labels, local model, committed under `evals/results/screening/dev/` as before. Compared with `npm run screening:compare` against 0009's final dev run; the plan names the file.

**The bar, fixed now:**

- **Answering didn't get worse:** confidently wrong on the five no more than 0009's dev result plus 2, and abstention no more than plus 0.05. One run moves by about that much with no change at all (0009 §8.4).
- **No false requests:** no dev vignette ever asks for anything, so every located request in the run is a false positive. The count is reported, and each one is read in its transcript. Zero is expected. One or two "not sure"-shaped false positives are the gate's call. More means the read prompt's paragraph is wrong.

If the bar fails, the gate decides between fixing and re-running (one more dev run, committed beside the first) and running the scored set. The first run is always reported.

## 7. Gate 1: the owner plays it

In `npm run app -- --examples` on the local model, the owner plays at least three screenings and, across them, asks in each of these ways:

- "what does that mean?" on a clinical question;
- "why do you need that?";
- "what is this study?";
- an answer and a request in one message, as in "No, but elaborate on this";
- a second "explain" on the same question.

The owner reads four things:

- whether each request got a response before the agent moved on;
- whether an explanation explained the question and not their case;
- whether it sounded like someone helping;
- whether the review shows what happened, with no answer recorded from the confused reply.

Only a person can judge this. It is the owner's, not delegated. If they delegate anyway, the plan and the PR say it wasn't independent.

## 8. The product intent

`work/0000-product/intent.md` line 42 becomes:

> **Secondary participant: the prospective trial participant.** The person the conversation serves. Interacts through a short-message conversation. Simulated in this project; no real person is contacted at any point. When they ask what something means, why it is asked or what happens next, the agent responds before moving on, and an answer given before they understood the question isn't recorded.

The heading keeps "secondary", because the coordinator's trust is still the eval's primary question. The sentence says what the participant is owed. It changes in the same commit as the agent change, with the reason in the commit message.

## 9. Documentation

- **`docs/screening-agent.md`:** what a request is, the four kinds, what code does with each, the cap, and the known limits:
  - a request is taken to be about the pending question;
  - one request per reply;
  - explanations come from the protocol's words, not 0006's renderings;
  - the scored numbers come from 0009's prompt version.
- **`docs/coordinator-review.md`:** the request labels, and that an answer set aside for an explanation isn't evidence.
- **README:** one sentence in what the agent does, that it explains a question when asked. No numbers change.
- **ROADMAP:** the row goes to Done, with what the dev re-run and the gate found.
- **CLAUDE.md:** the `--fake` line gains `[explain] ...`, and the `test:e2e` line's case count changes.

## 10. What the plan must gate

- **Gate 1 (§7):** before the dev re-run and the docs. It guards the 80-minute run and the docs, both of which describe an agent the owner hasn't yet judged.
- **Gate 2 (§6):** after the dev re-run. It decides whether the README's numbers still describe this agent, or whether the scored run is needed. Delegable.

## 11. Out of scope

- A simulated participant who asks for help, and new dev vignettes (intent decision 4).
- The scored run (intent decision 5).
- Explaining from plain-language renderings (intent decision 3).
- Answering from a trial summary, which no trial record carries.
- Requests about an earlier question, or several requests in one reply.
- Real stopping or pausing in the transport: `stop` only says how, which is to close the page.
