# spec: 0004 screening agent

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0004-screening-agent/intent.md`

---

## 1. Summary

A screening agent in `src/screening/`. It works through one study's criteria in a conversation it drives, and returns a result with one finding per criterion, each with the participant's words behind it, and no verdict. Vignettes, a simulated participant, graders and committed results are under `evals/`. Closes product open question 6.

## 2. Decisions taken before this spec

The intent settled seven questions. This table restates them as constraints on the design, so the rest of the spec can cite them by number.

| # | Decision | Consequence here |
| --- | --- | --- |
| D1 | Screen against the labels for the headline, and once more against cached parses | Two runs over the same vignettes, reported side by side. §8.3 defines how the parse run is scored, since parsed criteria do not line up one-to-one with labels |
| D2 | `clinical` criteria are asked about, never settled by the answer | A `clinical` finding can only ever be `chart-review` or `not-raised`. The code enforces this, not the prompt. §4.2 refines which `clinical` criteria are raised at all |
| D3 | Code owns the loop | The model is called to *phrase* a question and to *read* an answer, and nothing else. Order, eligibility to ask, retries and termination are code |
| D4 | The participant is the local model, played from structured facts, and checked | The simulator lives in `evals/`, never in `src/`. Findings resting on a flagged participant turn are excluded from scoring and counted (§8.4) |
| D5 | No early stop | Every raisable criterion is raised. Conversations run 23 to 47 questions (§4.2) |
| D6 | All five labelled studies, local model only | No frontier call anywhere in this slice, including graders |
| D7 | Independent vignette drafter deferred to 0007 | `evals/cases/VIGNETTES.md` is written so a second drafter could follow it |

## 3. Input

The agent takes a list of `ScreeningCriterion`, not the parser's `Criterion`. Two adapters feed it.

```ts
interface ScreeningCriterion {
  id: string;            // label id ("L7") or parsed criterion id
  polarity: "inclusion" | "exclusion";
  type: CriterionType;   // from src/criteria/types.ts, unchanged
  text: string;          // the statement the agent asks about
}
```

- **From labels** (`evals/`): `text` is the label's `quote`, passed through `normalize()` from `src/criteria/` so registry escapes like `\>=` are not shown to the model. `normalize()` still leaves `\^` in place; that known gap is carried, not fixed (intent, "Absent on purpose").
- **From a parse**: `text` is the parsed criterion's `text`, which the model already rendered as a statement. `id` is an ordinal, `P1` to `Pn` in document order, not the parser's own id. `src/criteria/parse.ts` lets several criteria share one source span, and those share a span-derived id. The adapter keeps a map back to the parsed criterion for grading.

Both adapters live in `evals/` (`evals/screening-input.ts`), because they read label sets, and `src/` may not import `evals/` (§9).

The agent never sees label ids' meaning, the vignette, or the source span. It needs only these four fields. That is what keeps `src/screening/` free of any `evals/` import (§9).

Only the eligibility block is screened. The registry's structured `minimumAge`, `maximumAge` and `sex` fields are not used. Where age appears in the criteria text, it is asked like any other criterion.

## 4. What the agent does

### 4.1 The loop

```
open        fixed template (§4.4)
repeat:
  pick      the next raisable criterion that is still open        [code]
  ask       phrase one question about it                         [model: ask]
  receive   participant's reply
  read      what the reply says about any open criterion        [model: read]
  apply     update findings under the rules in §5                [code]
close       fixed template (§4.4)
```

**Order** is document order: inclusion and exclusion interleaved as they appear in the source, which usually puts diagnosis and age first. A criterion already settled by an out-of-order answer is skipped when its turn comes.

**Attempts.** A criterion is asked at most twice. If the second reading is still unclear or partial, the finding is `unresolved`. A decline is not asked again.

**Follow-up on partial answers.** Many criteria bundle several requirements: *previously untreated, pathologically confirmed, resectable Stage II–IIIB*. A reply that covers some and not others is read as `partial`, with the missing part named, and the second ask is a follow-up about only that part: *"Has a surgeon said whether the tumor can be removed?"* The follow-up uses the same two-ask budget, so it deepens the conversation without lengthening the worst case. These bounds are what guarantee the loop terminates, and they are tested with a fake adapter that never gives a clear answer.

**Out-of-order answers.** The read call is shown every open raisable criterion, not only the one just asked, and may return readings for any of them. It is also shown the criteria already answered, marked to be reported only if the reply corrects them. Without that, a contradiction of a settled answer would be invisible. That is how *"I'm 64 and I've never had chemo"* settles two criteria in one turn.

**Model calls per turn: two** (ask, read), plus one for the simulated participant in evals. Merging ask and read into one call would save a third of the time, but it would put the choice of the next criterion back in the model's hands, which is what D3 rules out. If the timed conversation (§11) shows the run is impractical, reconsider it at the plan gate, not in code.

### 4.2 Which criteria are raised

| Type | Raised? | Possible statuses |
| --- | --- | --- |
| `patient` | Yes | `holds`, `does-not-hold`, `unresolved` |
| `clinical`, not a lab value | Yes, as patient-reported | `chart-review` |
| `clinical`, lab value | No | `not-raised` (reason `lab-value`) |
| `protocol` | No | `not-raised` (reason `protocol`) |
| `definitional` | No | `not-raised` (reason `definitional`) |

**The lab-value rule refines D2.** 23 of the 137 labelled `clinical` criteria name a laboratory measurement: creatinine, bilirubin, platelets, neutrophils, haemoglobin, transaminases, potassium, magnesium, INR and the like. Almost nobody knows their creatinine clearance. Asking anyway turns the conversation into a string of "I don't know" and adds nothing to what the chart will show. The rule is textual, not clinical: a `clinical` criterion is a lab value when its text matches a fixed list of analyte names and units (`mg/dL`, `/mm3`, `/mcL`, `x ULN`, `mL/min`, …). The list is one constant with its reasoning beside it, and tests pin both matches and non-matches. It misfires, and the misfires are already known. NCT04385368 L50 excludes a *leukocyte-depleted blood transfusion*, which a patient can answer, and the analyte name catches it. "Adequate organ function" (NCT04316364 L6) is a lab requirement in all but name and slips through, so it will be asked. That is the cost of a rule anyone can read. The result records `lab-value` on every criterion it skips, so a misfire can be seen, and both cases are pinned in tests.

Raised per study under this rule, with labels as input:

| Study | `patient` | `clinical` asked | Not raised | Questions (minimum) |
| --- | --- | --- | --- | --- |
| NCT04316364 | 8 | 15 | 1 | 23 |
| NCT00077350 | 10 | 19 | 8 | 29 |
| NCT03433469 | 12 | 27 | 34 | 39 |
| NCT06728852 | 12 | 25 | 7 | 37 |
| NCT04385368 | 19 | 28 | 27 | 47 |

Forty-seven questions is a long prescreen. D5 accepted that, and the README will say so rather than hide it.

### 4.3 The two model calls

Both are single-turn calls through the existing `ModelAdapter.complete`, with the transcript rendered into the user prompt. **The adapter is not widened.** Its doc comment in `src/models/types.ts` anticipated that this slice would add multi-turn. D3 made that unnecessary, and the comment is corrected in this slice to say so. One further, opt-in change to `src/models/` was found necessary at step 20: a `thinking: false` adapter option that switches the model's reasoning mode off, recorded on the descriptor. The screening agent, simulator and fidelity check use it, and the parser does not. See the plan's change table.

**ask** — given the study title, the transcript so far and the one criterion to raise, returns `{ "message": string }`: a single short question in plain language. For a `clinical` criterion, the prompt asks for a question that makes "I don't know" an easy, acceptable answer. The call is told nothing about other criteria.

**read** — given the transcript, the latest participant message, and the open raisable criteria (id, type, text), returns:

```jsonc
{ "readings": [
  { "criterionId": "L8", "reading": "does-not-hold", "quote": "never had any chemo" },
  { "criterionId": "L2", "reading": "unknown",       "quote": "not sure what stage" }
] }
```

`reading` is one of `holds`, `does-not-hold`, `partial` (answers some of the criterion's requirements and not others; carries a `missing` field naming what is left, which the follow-up asks about), `unclear`, `unknown` (the person says they don't know), or `declined`. The reading is about **whether the criterion's statement is true of the person**, never whether that is good or bad for eligibility. For an exclusion, the statement is the disqualifying condition, however the protocol words it: *"must not have received prior gemcitabine"* holds when the person did receive it. This follows `ANNOTATION.md` Rule 2, and the read prompt says so explicitly, because several exclusions in the corpus are written as prohibitions. For an exclusion such as *Pregnant*, "no" is `does-not-hold`. The model is never asked to reason through polarity. That removes a class of double-negative error the parser eval already showed is real (a third of NCT00077350's exclusions sit under an inclusion heading).

Both calls use `responseFormat: "json"` and a small `maxOutputTokens` (256 for ask, 1024 for read), which also keeps each call fast. A truncated or unparseable response is retried once, then the turn fails, and a failed turn is resumable (§7).

### 4.4 What the code says itself

The opening and closing messages are fixed templates in `src/screening/`, not model output. The opening names the study's `briefTitle`, says this is a short set of questions, that any question can be skipped, and that a study coordinator reviews everything. The closing thanks the person and says a coordinator will follow up. **Neither says anything about eligibility, and neither can**, because the model never writes them. The only model-written text the participant sees is questions, and §8.2 counts any verdict language that slips into them.

## 5. Findings, and how readings become them

```ts
type FindingStatus = "holds" | "does-not-hold" | "unresolved" | "chart-review" | "not-raised";

interface Finding {
  criterionId: string;
  status: FindingStatus;
  reason: FindingReason;   // "answered" | "partial" | "unclear" | "unknown" | "declined" | "contradicted"
                           // | "evidence-not-found" | "lab-value" | "protocol" | "definitional"
  /** chart-review only: what the person said, which the chart has to confirm. */
  reported?: "holds" | "does-not-hold" | "partial" | "unknown";
  evidence: Evidence[];    // { turn: number; quote: string } — located, never trusted
  timesAsked: number;
}
```

The rules, applied by code to each reading:

1. **Evidence must locate.** The reading's `quote` is searched for in the latest participant message, exactly and then allowing whitespace to differ, the same approach as `src/criteria/locate.ts`. Only the latest message is searched, so the model cannot attribute an earlier answer to a new reading. A reading whose quote does not occur is discarded, and if it would have produced a determination, the finding records `evidence-not-found`. This is the mechanical check from the intent: "the agent claimed the person said something they did not." The locator is a small new function in `src/screening/`. `locate.ts` is not reused, because its signature is bound to the criteria coordinate system and `src/criteria/` is not touched in this slice.
2. **`patient` criteria.** `holds` and `does-not-hold` settle the finding. `unclear` and `partial` leave it open for its second ask, which for `partial` targets the missing part; if still not settled, it is `unresolved` with reason `unclear` or `partial`. `unknown` and `declined` make it `unresolved` at once.
3. **`clinical` criteria.** Any reading sets `status: "chart-review"`, and `reported` becomes `holds`, `does-not-hold`, `partial` or `unknown`. A `partial` clinical reading still earns its follow-up. The finding stays `chart-review` either way, but a complete report is a better note for the coordinator. The status never becomes `holds` or `does-not-hold`, whatever the model returns. This is D2, enforced by a type-level switch and pinned by a test.
4. **Contradiction.** A later reading that disagrees with a settled one sets the finding to `unresolved`, reason `contradicted`, keeping both pieces of evidence. The agent does not pick a side. The coordinator sees both quotes.
5. **Readings for criteria that are not open or not raisable are ignored** and counted, since they show the model reaching past what it was shown.

**The result has no verdict.** `ScreeningResult` carries the findings, the transcript, the run metadata and a handoff summary: ids grouped by status. It has no field for overall eligibility, no count of criteria met, and nothing a UI could render as a single yes or no. A test serializes a result and fails on any key matching `/eligib|verdict|disposition|qualif/i`. Whether a finding counts for or against the person depends on polarity. That is derived for display in 0006, never stored, following the precedent of `isPatientAnswerable`.

## 6. Architecture

```
src/screening/
  types.ts        ScreeningCriterion, Finding, Transcript, ScreeningState, ScreeningResult
  agenda.ts       raisability (§4.2, incl. the lab-value constant), order, attempts   [no model]
  apply.ts        readings → findings (§5)                                            [no model]
  evidence.ts     quote location in a participant message                              [no model]
  prompts.ts      ask and read prompts, templates (§4.4), PROMPT_VERSION
  calls.ts        ask() and read(): adapter call, envelope validation, one retry
  session.ts      ScreeningSession: start(), receive(text), state(), fromState()
  index.ts

evals/
  cases/VIGNETTES.md                     conventions for writing vignettes (D7)
  cases/vignettes/<nctId>/<id>.json      ground truth, committed
  cases/vignettes.ts                     loader and validation
  participant/simulate.ts                the simulated participant (D4), via the adapter
  participant/prompt.ts                  its prompt, SIMULATOR_VERSION
  graders/screening.ts                   §8
  screening-runner.ts                    orchestration, caching, resume
  results/screening/<timestamp>.json     committed run output
  results/screening/conversations/…      one file per conversation, written every turn (gitignored cache)

scripts/
  run-screening-eval.ts                  npm run eval:screening
  show-conversation.ts                   npm run screening:show -- <conversation file>
```

**`ScreeningSession` is push-driven.** `start()` returns the opening message and first question. `receive(text)` takes one participant message and returns the next agent message, or the closing message together with the result. It does not know where messages come from. In this slice the eval runner calls it. In 0005, a `MessageTransport` does. The participant is not an interface inside `src/`, so the conversation layer holds no notion of a user at all, which is the property CLAUDE.md asks of the transport boundary.

**State is plain JSON.** `state()` returns everything needed to continue. `fromState(state, adapter)` resumes. After every turn, the eval runner writes the state to the conversation file. A test drives a session with a fake adapter, serializes and restores it after every turn, and asserts the result matches an uninterrupted run. That one property serves 0005's resumable conversations and survives oMLX going down mid-run.

**`PROMPT_VERSION`** hashes both screening prompts and both templates, the same way `src/criteria/prompt.ts` does. `SIMULATOR_VERSION` hashes the participant prompt. Both are recorded on every result.

## 7. Running it

`npm run eval:screening` runs every vignette twice, once from labels and once from the cached parse (D1). `-- <nctId>` limits the run to one study, `-- --source labels|parse` to one input, and `-- --refresh` ignores cached conversations.

- **Conversations are cached** under `results/screening/conversations/`. The key is vignette id, input source, model, `PROMPT_VERSION`, `SIMULATOR_VERSION` and seed. A finished conversation is reused. A partial one resumes from its saved state.
- **A model failure** ends that conversation's attempt with its state saved, and the run moves on. **Two consecutive connection failures stop the run**, with a message telling the operator to check oMLX's `/health` endpoint and rerun. Rerunning resumes everything. If the server is down, carrying on through forty conversations would only record forty identical failures.
- **The parse run uses 0003's cached parses** in `evals/results/parses/`, found with `cacheKey()` from `evals/runner.ts`. That directory is gitignored: the parses are a local cache keyed by model, prompt `73c3b301c4a9` and seed, not committed files. This runner never parses. A missing parse is a failure for that study, named in the result, and `npm run eval -- <nctId>` regenerates it.
- **What is committed** is the run result, meaning the numbers plus per-finding diagnostics carrying the quotes behind every confidently wrong finding and every flagged turn, and one worked-example conversation for the README. Conversation files are a gitignored cache, like the parses. Thirty transcripts of up to fifty turns would make the repository unpleasant to read, the same reasoning that trimmed the trial fixtures in 0001.
- **A dev vignette** (`evals/cases/vignettes/dev/`) is run with `--dev` and never scored. Prompts are iterated against it and nothing else, so tuning cannot leak into the headline.
- **Results record** model, quantization, temperature, seed, adapter, `PROMPT_VERSION`, `SIMULATOR_VERSION`, vignette-set hash, grader version, wall time and call count per conversation. The last two are what make the run budget legible.

`npm run screening:show` renders one conversation file as a readable transcript with its findings. This produces the worked example in the README, and it is how a person reads a flagged conversation.

## 8. Measurement

### 8.1 Vignettes

One file per vignette, `evals/cases/vignettes/<nctId>/<nctId>-v<N>.json`:

```jsonc
{
  "id": "NCT04316364-v1",
  "nctId": "NCT04316364",
  "labelSetSha": "<sha256 of the label file this was written against>",
  "behavior": "cooperative",   // cooperative | vague | volunteers | contradicts | declines
  "persona": "Retired bus driver, 67, answers in short sentences.",
  "facts": [
    { "label": "L8",  "says": "I haven't had any cancer treatment yet.",      "expected": "does-not-hold" },
    { "label": "L19", "says": "No, I'm not pregnant.",                         "expected": "does-not-hold" },
    { "label": "L22", "says": null, "declines": true,                           "expected": "unresolved" },
    { "label": "L2",  "says": "They told me it's stage III and I haven't started treatment.",
                      "reported": "holds" },
    { "label": "L12", "says": "I don't know anything about my heart, no one's mentioned it.",
                      "reported": "unknown" }
  ],
  "provenance": { "drafter": "…", "guide": "evals/cases/VIGNETTES.md", "sawAgentPrompt": false }
}
```

- **Every `patient` label in the study has a fact in every vignette.** The loader enforces this, so a vignette cannot quietly leave out a hard criterion.
- **`expected` is one of `holds`, `does-not-hold`, `unresolved` or `defer`,** and is about the statement, as in §4.3. `defer` marks a `patient` criterion whose truth cannot be read off the fact without interpretation. Any abstention is correct for it, and any determination is wrong.
- **`clinical` facts are optional,** because a persona only knows some things. Where present, `reported` is what the person is expected to say. It is graded only where the fact restates the criterion in its own terms. `protocol` and `definitional` labels need no entry; their expected status is `not-raised` by definition.
- **`contradicts` vignettes** give a fact a second `laterSays` that reverses it, and the expected outcome is `unresolved`.
- `labelSetSha` pins a vignette to the labels it was written against, the same way `criteriaTextSha` pins labels to the protocol.

**Expected outcomes by construction.** `VIGNETTES.md` requires every `says` to restate or plainly negate the criterion's own words, or to give a number compared against a number in the criterion ("I'm 64" against "≥ 18 years"). If writing a fact would require deciding what a clinical term covers — whether a past condition counts as "significant", whether a drug counts as "systemic therapy" — the drafter either writes a fact that avoids the question or marks the label `defer`. **No expected outcome in this slice rests on a medical judgment**, and checking one means reading two sentences side by side.

**The set:** three vignettes per study, fifteen in all. Across the set, each of the five behaviors is a vignette's primary behavior at least twice. Within any vignette, individual facts can carry `declines` or `laterSays`, so every vignette tests something besides pure cooperation.

**Drafted before the agent's prompts exist** (intent, Constraints). `provenance.sawAgentPrompt` is `false` for every vignette in this slice. A vignette changed after the agent has run against it is listed in the PR with its reason.

### 8.2 What is measured, labels run

Scored over `patient` labels, where the agent can reach a determination:

| Metric | Definition | Role |
| --- | --- | --- |
| **Confidently wrong** | determinations (`holds`/`does-not-hold`) that disagree with `expected`, or that land on a label expected `unresolved` or `defer` ÷ all determinations | **Headline.** Of what the agent committed to, how much a coordinator could not trust |
| **Abstention** | labels expected `holds`/`does-not-hold` that the agent left `unresolved` ÷ those labels | **Always beside the headline.** An agent that never commits scores zero wrong, and this number exposes that |
| Correct abstention | labels expected `unresolved`/`defer` that the agent left `unresolved` ÷ those labels | Whether declines and contradictions are respected |
| Evidence rejections | readings discarded because their quote did not occur | The mechanical hallucination check. Expected to be rare, and it has to be seen to fire (§10) |

Reported beside them, not scored as accuracy:

- **Reported agreement** on `clinical` labels with a graded `reported`: how often the agent heard what the person said. A misheard clinical answer is not a wrong determination, because the agent made none, but it is a wrong note to a coordinator.
- **Conversation discipline**, counted from the transcript: agent turns containing more than one question mark; agent turns longer than 320 characters (two SMS segments); agent turns matching a fixed verdict-language pattern (`eligible`, `qualify`, `not a candidate`, …); readings ignored under §5.5; **follow-ups asked** (second asks of a criterion, split by whether the first reading was `partial` or `unclear`), which shows whether the agent digs deeper at all; turns and model calls per conversation; wall time.

Asking about a `protocol` or `definitional` criterion, and issuing a determination on a `clinical` one, are not metrics. The code makes them impossible, so they are tests (§10).

Per study and pooled, as in 0003, because a pooled number hides a single study carrying every failure.

### 8.3 The parse run

Parsed criteria are matched to labels with 0003's matcher (`evals/graders/match.ts`, unchanged). Each label then falls into exactly one category:

| Category | Meaning |
| --- | --- |
| Scored | Matched one-to-one with a parsed criterion of the same type. Graded as in §8.2 |
| Mis-typed | Matched, but the parser gave it a different type, so it was handled under the wrong row of §4.2. A `patient` label parsed as `clinical` becomes `chart-review` by construction |
| Bundled | Covered only inside a merged criterion. Reported, not scored: one finding about "A and B" cannot be fairly graded against A and B separately |
| Missed upstream | No parsed criterion covers it. It was never asked |

The story the two runs tell together is in the difference. The headline numbers from labels show what the agent does given good criteria. The four categories show where the parser's known faults (0.20 merge rate, the `clinical` collapse, NCT04385368's dropped requirements) land in a conversation. The README reports both tables.

### 8.4 Simulator fidelity

The simulator is the local model, given the persona, the behavior and the facts as a numbered list, and told to answer only from them, saying it doesn't know anything else. Each reply is `{ "message": string, "usedFacts": ["L8"] }`.

Fidelity is checked twice:

1. **Deterministic.** A reply citing a fact the vignette does not contain is flagged. So is a reply that cites nothing but is long enough to assert something (a threshold in the grader, with its reasoning written beside it).
2. **A local-model fidelity check** per participant turn: given the facts and the reply, does the reply assert anything absent from or contrary to them? It runs on the local model (D6) and is non-deterministic. It is a flag for reading, never a score.

A finding whose evidence comes from a flagged turn is **excluded from scoring and counted as simulator-affected**. It is not charged to the agent. The result lists every flagged turn with its reason, and `screening:show` highlights them. If flagging is frequent, that is a finding about the simulator and is reported as one. Excluded findings are never quietly dropped.

## 9. Boundaries, asserted by tests

- **No network under `src/screening/`.** Already covered: `tests/boundary.test.ts` discovers module entry points, so `src/screening/index.ts` is walked automatically. Its minimum module count is raised so the new module is visibly included.
- **Nothing outside `src/models/` constructs a model.** New: no file under `src/` outside `src/models/` imports `OmlxAdapter` as a value. The screening agent receives a `ModelAdapter` and cannot pick one. This is the model-boundary test CLAUDE.md says a slice owes, and it also covers `src/criteria/`.
- **`src/` never imports `evals/`.** New: the agent cannot reach vignettes, expected outcomes or the simulator. Without this, "the agent never sees the vignette" rests on discipline.
- **The simulator cannot see the agent's state.** Its input is the transcript's text and the vignette. By construction, `simulate()` takes no `ScreeningState`, and its signature is pinned by a test.

## 10. Testing

`tests/` stays deterministic, offline and under a second. Every model is a `FakeModelAdapter`.

| Area | Tested with |
| --- | --- |
| Raisability | Each type, and lab-value matches and non-matches, including the two known misfires: NCT04385368 L50 matched, "Adequate organ function" not |
| Order and attempts | Document order; an out-of-order answer skips a criterion; unclear twice → `unresolved`; decline → not re-asked; a model that never answers clearly still terminates |
| Readings → findings | Every rule in §5, including a `clinical` reading of `holds` that must still produce `chart-review`, and contradiction keeping both quotes |
| Evidence | Exact and whitespace-loose location; a quote from an earlier turn is rejected; a fabricated quote is rejected and shows up as `evidence-not-found`. This is the case that proves the check fires |
| Envelopes | Malformed ask/read output retried once, then the turn fails; truncation is a failure |
| No verdict | Serialized result has no eligibility-shaped key; templates contain no verdict language |
| Resume | Serialize and restore after every turn equals an uninterrupted run |
| Vignette loading | Missing `patient` label, unknown label id, `labelSetSha` mismatch, `expected` on a `clinical` fact |
| Graders | Hand-built findings against hand-built expectations: all correct, all abstained, one confidently wrong, `defer` with a determination, simulator-affected exclusion |
| Parse-run categories | A scored, a mis-typed, a bundled and a missed label from a small fixture parse |
| Runner | Cache hit and miss by key; a failure saves state and the next run resumes; two connection failures stop the run |

## 11. What the plan must gate

Named here so the plan puts them where they can be argued with:

1. **Vignettes and graders frozen before the agent's prompts are written.** Everything after this is measured against them. A weak set inflates every number the README later reports, and no test can tell. The question for you is not clinical. It is whether each expected outcome visibly follows from its fact under `VIGNETTES.md`, and whether the behaviors are hard enough.
2. **One timed conversation on NCT04316364**, after the agent works end to end, before the full run. It sets the real per-call time and decides whether the full run (thirty conversations of 23 to 47 questions, four model calls per question counting the simulator and its fidelity check: roughly 4,000 calls) is an afternoon or several days. If it is several days, the plan narrows the parse run before spending the time, rather than after.
3. **Reading the full run before the README is written.** Flagged simulator turns and confidently wrong findings get read by a person, because a grader that disagrees with a transcript could be wrong about either one.

## 12. Out of scope

No transport, server or UI (0005). No coordinator pane (0006). No change to `src/criteria/`, `src/trials/`, the label sets, 0003's matcher or its committed results. The one change under `src/models/` is the doc comment in §4.3. No frontier model, anywhere. No new dependency: the adapter, `fetch` and hand-written validation already cover everything here. No routing a person to other trials. The answers are kept, and using them is later work (intent, decision 5).

## 13. Documentation

- **README:** a section on the screening agent. One complete conversation rendered by `screening:show`, the labels-run table, the parse-run table, where the agent fails, and a plain statement that the vignettes, graders and prompts share an author.
- **ROADMAP:** 0004 marked done. Product open question 6 closed. Anything 0005 to 0007 need to know goes in "Carried forward from 0004".
- **CLAUDE.md:** the two new commands in the verification table.
