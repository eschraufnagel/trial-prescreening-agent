# intent: 0021 serve the participant

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-10
**Scope:** One slice. When the person being screened asks for something, such as an explanation, the reason for a question or what happens next, the agent responds before it moves on. A confused answer isn't recorded as an answer. The code still chooses every criterion and still ends the conversation. Local model only. The product intent's line on the participant changes, in the open.

---

## Problem

**The agent can answer questions but can't hold a conversation.** In the app, on NCT06557512, the agent asked whether the person had "any medical or mental health conditions that might make it hard to take part". The person replied "No, but elaborate on this." The agent then asked about seizures, starting with "To clarify". That was the next criterion (P16), not an explanation of the last one (P15).

**What happened in the code.** The read call took "No" from the reply and recorded P15 as `does-not-hold`. That closed P15, so `nextCriterion` moved on to P16. The ask call for P16 saw the request in the recent conversation and borrowed its tone, but its job was a question about P16. The only rule the ask prompt has for this is one line: "If their last message asked you something, you may answer briefly in a few words before your question" ([prompts.ts:24](../../src/screening/prompts.ts)). And by then the question was about a different criterion.

**The model isn't the limit. The design is.** The model can tell that "elaborate on this" is a request. The read call's output has no place to say so, though: every reading is a statement about a criterion. So the model did the nearest thing it was allowed and reported the "No". That's deliberate. 0004 made the model do two narrow jobs (phrase one question, read one reply) and gave every decision about the flow to code, so tests could pin "never asks more than twice" and "never decides eligibility". Nothing in that split stops the model from noticing a request. Nothing in it gave the request a path either.

**It costs both people.**

- **The participant** asked for help and got the next question. That's the cold chatbot this project shouldn't be. Someone being screened for a cancer trial is often anxious, unfamiliar with the terms and on their own, so being guided is part of the service, not decoration.
- **The coordinator** sees P15 recorded as a clean "No", from someone who said in the same message that they didn't understand the question. The review shows an answer the person hadn't actually given. Of the two, that one is worse, because it is quiet.

**Why it was never caught.** The product intent calls the prospective participant the *secondary* user ([intent.md:42](../0000-product/intent.md)). Every measurement since 0004 asks whether the coordinator can trust the output. None asks whether the person was helped. No vignette asks for help: the simulator's people answer, contradict themselves, hedge, decline or don't know, but they never ask what something means. So no number could have moved.

## Proposed outcome

**The agent recognises when the person wants something, and says so.** The read call can report a request in a reply, alongside or instead of readings, naming its kind and the criterion it is about. The kinds the spec starts from:

- **Explain:** "what does that mean?", "elaborate on this", "I don't understand".
- **Why:** "why do you need to know that?"
- **About the study or the process:** "what is this study?", "who will see this?", "what happens next?"
- **Pause or stop:** "can we stop?", "I need a minute".

A correction ("actually, I did have gemcitabine") is already handled by 0009 and stays as it is.

**Code decides what a request does. The model doesn't.**

- **Explain or why, about the criterion just asked.** The criterion stays open. No reading from that reply is recorded for it, because an answer given while asking what the question means isn't an answer. The next turn is the same criterion again, in a respond-then-ask form. A request doesn't use up one of the criterion's two asks, but each criterion gets at most one explanation, so the conversation still always ends.
- **About the study or the process.** The agent answers briefly from fixed text and the trial's own record (its title and summary, and what the opening already says about the coordinator), then asks the pending question again.
- **Pause or stop.** The agent says the person can stop at any time and that a coordinator will follow up. Stopping already works through the transport, so what the code does here is for the spec.

**The ask call gains a respond-then-ask mode.** When the code says the person asked for an explanation, the prompt says so directly. It is given the criterion's protocol words, the person's request and the instruction to explain in plain words before asking again. It is told to explain the question, not the person's situation. The rules that stay:

- no eligibility talk;
- no medical advice;
- no comment on what an answer means for them.

**A warmer manner throughout, within the same rules.** Acknowledge what the person said. Use "To clarify" only when something is actually being clarified. Never present a new topic as a follow-up. This is wording, so no deterministic test can pin it. The owner's gate reads it instead.

**The coordinator review shows what happened.** A turn where the person asked for help, and the agent's response, are in the transcript the review already shows. The criterion's evidence comes from the answer given after the explanation. The review's rule holds: everything is about one criterion, and nothing is sorted or coloured by outcome.

**The product intent says the participant is served.** The line calling the participant secondary is rewritten. The coordinator is still the one whose trust the eval measures. The participant is the person the conversation serves, and being helped when they ask is part of what the agent is judged on. See decision 1.

## Absent on purpose

- **Free conversation.** The agent responds to a request and returns to the pending question. It doesn't chat, and it doesn't take questions on topics the screening doesn't cover.
- **Medical advice, or anything about the person's own case.** "Would I be a good fit?" or "is my tumour near the brainstem a problem?" gets the same answer as today: a coordinator will review it.
- **The model choosing what comes next.** The order, the number of asks and the end of the conversation stay in code.
- **Plain-language renderings in the explanation.** See decision 3.
- **A new screen or layout.** The page shows messages as it does now.
- **Changes to the simulator's existing behaviour, or to the scored vignettes.**

## Affected users and systems

**The participant.** Asking "what does that mean?" gets an explanation and the same question again, not the next question. Questions about the study and the process get a short answer. The tone is warmer.

**The coordinator.** Fewer answers recorded from someone who didn't understand the question. The transcript shows where they asked for help and what they were told.

**`src/screening/`.** The read prompt and output (a request field), `applyReadings` or a sibling that handles requests, the agenda (an explanation that doesn't count as an ask, with a cap of one), the ask prompt (respond-then-ask), `ScreeningState` (what was asked for), the turn kinds if a response needs one, and `PROMPT_VERSION`. Restore-from-state and atomic turns stay.

**`src/web/review.ts`** and anything that maps turn kinds, readings or reasons to words, if any are added.

**`scripts/app/` fake agent.** A scripted reading of a request, so the browser test can exercise it with no model.

**`e2e/`.** One case: a request for an explanation, then the same criterion asked again.

**`evals/cases/vignettes/dev/` and the simulator.** A way for a simulated person to ask for help. See decision 4.

**`work/0000-product/intent.md`.** One line on the participant.

**README, `docs/`, roadmap.** What the agent does when someone asks, and the slice's row.

**Not touched:** `src/criteria/`, `src/plain/`, `src/models/`, `src/transport/`, the scored vignettes, labels, `data/`.

## Constraints

- **The coordinator makes the determination.** Nothing a request triggers comments on eligibility. The verdict-language check in the grader applies to responses as it does to questions.
- **No medical advice.** An explanation is of the question's words, from the protocol's words.
- **The conversation always ends.** At most one explanation per criterion, pinned by a test, like `MAX_ASKS`.
- **The boundaries hold.** `tests/boundary.test.ts` passes unchanged: nothing outside `src/models/` calls a model, `src/screening/` doesn't import `src/plain/`, and `ScreeningCriterion` keeps its four fields.
- **The review's rule holds.** `tests/web/review.test.ts` passes unchanged.
- **Transparency holds.** 0005's identical-state test, over `MemoryTransport` and HTTP, keeps passing, and gets a scripted request.
- **Local model only.** No paid call.
- **Proportionate.** Each run this slice adds says in one line what claim it supports.
- **No gate needs clinical judgment.**
- **`npm test` stays near a second, and deterministic.**

## Decisions

1. **The product intent changes. Recommend yes, in this slice, in the open.** The intent calls the participant secondary, and that framing is why nothing measured this. Proposed rewrite of line 42: *"The prospective trial participant: the person the conversation serves. Simulated in this project; no real person is contacted. When they ask what something means, why it is asked or what happens next, the agent responds before moving on."* The coordinator's trust stays the eval's primary question. **The owner's call**, because it changes what the project is for.

2. **A confused answer isn't recorded. Recommend yes.** When a reply both answers and asks for an explanation of the same criterion ("No, but elaborate"), no reading is recorded for that criterion from that reply. The alternative is to record "No" and explain anyway, which keeps a clean denial in the review from someone who didn't understand the question. Its one advantage is a shorter conversation.

3. **Plain-language renderings in the explanation: no, again.** 0009 decision 2 said no, and this is the strongest case yet for revisiting it: 0006's renderings are checked explanations. But crossing the boundary means the agent asks from words the read call never sees, and it needs a rendering for every trial added by link, which 0006 doesn't make. The ask call explains from the protocol's words, as it already phrases from them. If the explanations prove poor at the gate, renderings are the next lever, in their own slice.

4. **How a simulated person asks for help. Open, and it touches the ruler.** The roadmap says a simulator change "changes the ruler, so never in the same slice as an agent change". Two ways this slice can measure without breaking that:
   - **(a) Leave the simulator alone, and measure help with deterministic tests and the owner's gate.** Scripted conversations, with a fake adapter, pin the code path: a request keeps the criterion open, records nothing, triggers a respond-then-ask turn, and is capped. Whether the explanation is any good is the owner's reading of real conversations in the app (gate 1). The five dev vignettes are re-run once (about 80 minutes) to check that nothing else got worse.
   - **(b) Add a code-triggered request to the simulator**, on the same `INSTRUCTION FOR THIS REPLY` mechanism `laterSays` uses: a new optional field on a dev fact, such as `asksFirst`, and new dev vignettes that use it. This bumps `SIMULATOR_LAYOUT` and so `SIMULATOR_VERSION` for every run, which separates every later result from 0009's.

   Recommend **(a)**. The claim this slice makes is "the agent helps when asked, and nothing else got worse". A deterministic test pins the first half better than a simulator does, and the owner's reading judges the half no test can. (b) is the stronger measure for a later slice that is about measuring this.

5. **The scored run: not re-run. Recommend no.** The prompts change, so `PROMPT_VERSION` changes, and the 30 conversations of `EVAL_RUN` (0009's) no longer match today's code. 0009 decision 5 already lets the review serve a run by its recorded versions. A 13-hour re-run would measure answering, which this slice doesn't set out to change. The dev re-run in decision 4 checks it didn't get worse. The README says which prompt version its numbers come from. If the dev re-run shows a drop, the scored run becomes the gate's decision.

## Gates, proposed for the plan to argue with

None needs clinical judgment.

- **Before the dev re-run and the docs: does the agent serve the person now?** The owner plays several screenings in the app on the local model and asks for help in different ways: "what does that mean?", "why?", "what is this study?", and a reply that answers and asks at once. The owner reads whether the agent explained before moving on, whether the explanation was of the question and not of their case, whether it sounded like someone helping, and whether the review shows what happened. Only a person can judge this, and its value comes from the reader not being the author of the prompts. **Don't delegate it to me.** What it costs to be wrong: the slice ships an agent that still feels cold, with a test suite that says it handles requests.
- **After the dev re-run: did answering get worse?** Compared by `screening:compare` against 0009's dev baseline. Whether a difference of a finding or two is noise or a fault is a reading of transcripts, so I can recommend and the owner can delegate. What it costs to be wrong: a README that still reports 0009's numbers for an agent that no longer earns them.

## Open questions for the spec

1. **The request field**: its shape, its kinds, whether it names a criterion, and what the read prompt says about a reply that answers one criterion and asks about another.
2. **The explanation cap** and how it shows in `Progress`: a separate count, or a flag on the last ask.
3. **Pause and stop**: what the code does, given that the transport can already stop a conversation.
4. **The study and process answers**: which parts are fixed text and which are drawn from the trial's record, and how long they can be.
5. **Turn kinds**: whether a respond-then-ask turn is still a `question`, or a new kind the review names.
6. **The fake agent's script** for a request, so `test:e2e` covers it.
7. **What the README and `docs/` say**, and whether one served conversation becomes the worked example.
