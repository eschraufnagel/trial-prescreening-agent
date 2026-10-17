# intent: 0004 screening agent

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. A conversation agent that works through one study's criteria with a simulated participant, records a per-criterion finding with the evidence behind it, abstains where it cannot resolve one, and hands off. The patient vignettes that measure it, and the graders that score them. No transport, no API, no UI, no parser changes.

---

## Problem

After three slices the project can turn a protocol into criteria and can say how well it did that. It still cannot put a single question to anyone. The product intent names the conversation as the part consuming coordinator hours, and nothing in the repository holds one yet.

The conversation is easy to build and hard to trust, and the second half of that is the whole slice. An LLM will cheerfully hold a prescreening chat. The failure worth worrying about is not that it cannot talk. It is that it writes down *met* for a requirement the person never actually addressed, and the coordinator reading the summary has no way to tell that finding from one that was earned. A confident wrong answer costs more than an abstention, because an abstention is visible and a wrong answer is not. Everything this slice measures is built around that asymmetry.

Four things make it harder than wiring a prompt to a loop.

**Most criteria are not the patient's to answer.** Across the 252 labelled criteria, 61 are `patient`, 137 are `clinical`, 30 `definitional` and 24 `protocol`. An agent that only raises `patient` criteria settles about a quarter of a protocol and hands the rest back. An agent that asks about everything will ask someone whether their tumour tissue is adequate for central PD-L1 testing. Many `clinical` criteria sit between the two: a person usually knows whether they have had chemotherapy, but their word alone is not the chart. What the agent does with a criterion depends on its type. That rule is the agent's central design decision, and it has to be something the coordinator can read.

**The criteria it inherits are imperfect in known ways.** 0003 measured them. The parser bundles requirements the annotation guide splits (merge rate 0.20 pooled, 0.36 on one study), and this agent asks one thing at a time, so it cannot ask half of a bundled criterion. The parser's type errors run toward `clinical`: 22 `patient` criteria were called `clinical`. If type decides what gets asked, those 22 go unasked by construction. That comes from the parser, not the agent, and a measurement that cannot tell the two apart will blame the wrong slice.

**There is no ground truth for a conversation yet.** Product open question 6, reassigned here from 0003, asks whether it should come from hand-authored vignettes, generated cases, or both. Whatever the answer, measuring a multi-turn exchange needs something to play the participant. A scripted participant is deterministic but cannot answer a question it did not anticipate. A model playing the participant can, but it adds a second source of error: when it misstates its own vignette, the agent gets blamed for a fact the simulator invented.

**The ground truth cannot rest on clinical judgment, because nobody here can supply it.** The 0003 label sets were drafted by Claude against `evals/cases/ANNOTATION.md`, not by a clinician, and the README already says what that does to the claim. This slice must not rely on a human deciding whether *"I had some chemo in 2023, carboplatin and something"* satisfies *"no more than one prior platinum-based regimen."* An expected outcome has to follow from the vignette by construction, so that checking it means reading, not judging medicine. Where a finding would need a clinician to settle it, the correct behavior is to defer to the coordinator. The grader should reward the deferral and must not invent an answer to grade against.

## Proposed outcome

**A screening agent** in `src/screening/`. Given one study's criteria, it conducts a conversation through an interface that stands in for the participant, and produces a result: one entry per criterion, each carrying a finding, the evidence behind it, and why it was or was not raised. The vocabulary of findings is a spec decision. At minimum it has to separate *answered and satisfied*, *answered and not satisfied*, *raised but unresolved*, and *not the patient's to answer, left for the coordinator*. The result carries no overall eligibility verdict and no field that reads as one. The coordinator constraint holds because of how the result is shaped, not because the prompt asks for it.

**Evidence that can be checked.** Every finding cites the participant's words: the turn, and a verbatim quote from it. The quote is located in the transcript deterministically, the same way 0002 locates a criterion's quote in the protocol. A finding whose evidence does not occur in the transcript is rejected, not kept. That makes "the agent claimed the person said something they did not" a mechanical check rather than a reading exercise.

**A conversation that behaves like short messages.** One question at a time. Every criterion the agent would raise gets raised, even after an answer that already rules the person out of this study (decision 5). Free-text answers. Answers that arrive out of order, with the participant volunteering something about a criterion not yet raised. Answers that are vague, contradictory, or refused. State that can be serialized and resumed from a transcript, because 0005 puts this behind a transport and a browser tab, and a conversation that only exists in memory will not survive that.

**Patient vignettes with expected outcomes**, under `evals/cases/`. Each is written against specific labelled criteria. Its facts are phrased in the criterion's own terms, so the expected finding follows from reading the two side by side. Criteria whose resolution would need clinical interpretation get *defer* as the expected outcome and are marked as such. Each vignette also carries a behavior (cooperative, vague, volunteers early, contradicts itself, declines) so the set exercises the conversation and not just the lookup. Vignettes record their provenance the way 0003's label sets do, including who drafted them and what the drafter had seen.

**Graders and committed results**, under `evals/`. The headline number is the **confidently-wrong rate**: findings of satisfied or not satisfied that contradict the vignette. It is never reported without the **abstention rate** beside it, because an agent that defers on everything scores zero wrong and is useless. The two together are this slice's version of 0003's coverage-and-strict-recall pair: each one alone can be gamed, and together they cannot. Around them sit evidence locatability, and conversation discipline counted deterministically from the transcript: questions put to the participant about `protocol` or `definitional` criteria, turns that ask more than one thing, and repeated questions. Results record model, quantization, temperature, seed and prompt version, as every result here does.

**An answer to product open question 6**, written down with reasons, the way 0003 closed question 3.

**A README section that tells the story.** It shows one complete conversation from a committed run, with the result it produced: each criterion, its finding, and the participant's words behind it. Next to that sits the table, showing how often the agent was confidently wrong, how often it abstained, and how the numbers change when the agent is given parsed criteria instead of labels. Where the agent fails is said as plainly as 0003 said it about the parser. Someone who reads only the README should come away knowing what the agent does, how far to trust it, and why the coordinator still decides.

**Absent on purpose:**

- No transport, server or UI. The agent talks to an interface. The web implementation of that interface is 0005.
- No coordinator pane. The result is shaped for 0006, not rendered.
- No parser changes. The `clinical`-collapse and the `\^` normalization gap are real and known. Fixing either here changes the agent's inputs in the same slice that measures the agent. 0003 refused to edit the parser while measuring it, and the same reasoning applies one layer up.
- No model comparison. That is 0007.

## Affected users and systems

**Me, deciding engineering and annotation questions.** What the finding vocabulary is, how bundled criteria are handled, what counts as a match between a finding and an expected outcome, how many vignettes the runtime can afford. These are mine. Whether a vignette's medical history is realistic, or whether a stated fact truly satisfies a criterion, is not mine to judge. The slice has to be designed so that no gate asks me to. Where that is impossible, the criterion is treated as *defer* and the gap is written down.

**The criteria parser, 0002, and the labels, 0003.** Read-only inputs. Which of the two the agent consumes during measurement is settled in decision 1: both, reported side by side, so the headline number contains only the agent's errors.

**The model adapter, `src/models/`.** Its own doc comment anticipates that this slice widens it for multi-turn and says the widening must be deliberate, with the 0007 swap still working. Whether it needs widening at all depends on how the agent is structured. If code owns the conversation loop and each model call sees the transcript as input, the single-turn surface may hold.

**The local model**, `Qwen3.6-35B-A3B-MLX-8bit` via oMLX, temperature 0, seed 20260921, unchanged. It is slow and it goes down. A conversation is many calls, not one, and possibly twice that if the participant is also a model. The harness has to cache, resume and continue past a failure, as 0003's does. When a call fails, the runtime's health endpoint is checked before the code is suspected.

**Slices 0005 and 0006.** 0005 puts this agent behind `MessageTransport` and needs resumable state and a conversation layer that does not know where messages go. 0006 renders the result and needs every finding traceable to a criterion and to the participant's words.

**Not touched:** `data/trials/`, `src/trials/`, `src/criteria/`, the existing label sets, and the committed 0003 results.

## Constraints

- **No final eligibility decision on any code path.** The result carries per-criterion findings and a handoff, never a verdict. A test asserts this about the result's shape, not just its contents.
- **Abstain rather than guess.** The agent treats *unresolved* as a normal outcome, not a failure. A satisfied or not-satisfied finding without locatable evidence is invalid.
- **No PHI.** Every vignette is invented. No vignette may be adapted from a real case report, forum post or published patient story, however anonymized.
- **No real contact path.** The participant is simulated, in-process or through the adapter. Nothing leaves the machine.
- **The vignettes and their expected outcomes are committed before the agent's prompt is written.** 0002 and 0003 split the parser from its measurement across two slices so that neither was written to agree with the other. This slice holds both, so the separation is carried by order instead: vignettes and graders first, frozen, then the agent. A vignette edited after the agent has run against it is a finding in the PR, with the reason given.
- **Local model only.** No frontier model calls in this slice, for the agent, the simulated participant or the graders. The local model exists so testing does not spend API tokens, and an LLM judge on a hosted model would quietly undo that. A grader that needs a frontier model waits for 0007.
- **Nothing outside `src/models/` calls a model.** This covers the simulated participant too, which calls through the adapter like everything else.
- **`tests/` stays deterministic and under a second.** The agent's control flow, the evidence locator, finding validation, state serialization and every grader are tested against a fake adapter. What the model says is measured in `evals/`, never asserted in `tests/`.
- **Results are committed** under `evals/results/` with model, quantization, temperature, seed and prompt version.
- **Dependencies stay small**, TypeScript strict, Vitest, Node 24, as elsewhere.

## Decisions

These started as open questions and were settled before the spec. The reasoning stays here so the spec can build on it without reopening it. One principle runs through all of them: this is a proof of concept, and it has to flow well and tell its story plainly. When two options were otherwise close, the one that produces a clearer conversation and a more legible result won.

1. **The agent screens against the labels, and once more against the parser's output.** The headline numbers come from the labelled criteria. That way a wrong finding is the agent's fault, not a criterion upstream that was missing or bundled. A second run uses the cached parses of the same studies and is reported beside it. The gap between the two is the parser's cost to the agent, measured rather than asserted. It also tells the project's story in one table: what the agent does given good criteria, and what it does given the criteria the pipeline actually produces.

2. **`clinical` criteria are asked about, but never settled by the patient's answer.** The agent raises a `clinical` criterion, records what the person says as patient-reported evidence, and leaves the finding as *needs chart review*. That makes the conversation useful: a person can usually say whether they have had chemotherapy. And no clinical finding rests on someone's recollection alone. `protocol` and `definitional` criteria are never put to the participant. They go to the coordinator as they are. The rule is by type, mechanical and visible in the result. It is not a judgment made per criterion, because deciding which clinical facts a patient reliably knows is close to a clinical call.

3. **The code owns the conversation loop.** Code chooses the next criterion. The model phrases the question and reads the answer. One question per turn, never asking about `protocol` or `definitional` criteria, and never issuing a verdict are therefore properties of the code, tested in `tests/`, not requests in a prompt. The cost is a stiffer conversation, and the phrasing call carries the work of keeping it natural. Out-of-order answers become an explicit problem: when the model reads an answer, it may attach evidence to any unresolved criterion, not only the one just asked. The code then skips a criterion the participant has already answered.

4. **The participant is a model, played from a vignette with structured facts, and checked.** A scripted participant cannot answer a question it did not anticipate, and a code-owned loop with model-phrased questions will ask things in ways no script predicts. So the participant is the local model, given the vignette's facts in structured form and a behavior to play. Its fidelity gets its own check: each participant turn is compared against the structured facts, and a turn asserting something the facts do not contain is flagged. A conversation with a flagged turn is reported separately, not scored against the agent. Simulator errors are counted and shown, not buried in the agent's number.

5. **The conversation does not stop early.** Every criterion the agent would raise is raised, whatever an earlier answer showed. A person excluded from this study by one answer may be a candidate for a different one, and the answers to the remaining questions are what a coordinator would need to find it. Stopping would throw that away. It would also have brought the agent close to acting on a disqualification it is not allowed to decide. The cost is longer conversations, paid in local model time. Routing a person to another trial is not in this slice. The slice only keeps every answer so that later work can.

6. **All five labelled studies, all through the local model.** The studies are NCT00077350, NCT03433469, NCT04316364, NCT04385368 and NCT06728852. The local model is free to run, so the budget is time, not money. The limit on scope is ground truth: a vignette's expected outcomes are written against labelled criteria, and seven of the twelve studies have none. Writing vignettes against their parser output would score the agent against the parser's mistakes. Labelling the remaining seven is mechanical now that the annotation guide exists, but it is a separate change to 0003's artifact and does not belong here. Once those studies are labelled, they join the vignette set without any change to the agent. Each study gets a few vignettes, each exercising a different participant behavior. NCT04316364, the shortest, is built first and used for the timed trial conversation that sizes the rest. The agent, the participant and every eval run go through the local adapter, and no API tokens are spent in this slice.

7. **A second, independent vignette drafter waits for 0007.** In this slice, one party drafts the vignettes, the graders and the agent's prompt. Committing vignettes first stops tuning. It does not stop shared blind spots: a drafter who never imagines a certain kind of evasive answer will neither test for it nor handle it. An independent drafter means a frontier model, which spends API tokens, and 0007 brings a second model in anyway. So this slice writes the vignette conventions down clearly enough for a second drafter to follow, the same way `evals/cases/ANNOTATION.md` does for criteria. It also records each vignette's provenance, and the README says plainly that the vignettes and the agent share an author.

**Product open question 6 is answered by these decisions:** vignettes are authored, not generated. Each is written against specific labelled criteria under written conventions, and its expected outcomes follow by construction. A model is used to *play* a vignette, never to *write* one. That keeps the ground truth reviewable in a diff and free of clinical judgment. `spec.md` records it as closed.
