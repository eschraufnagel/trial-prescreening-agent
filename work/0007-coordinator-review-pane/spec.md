# spec: 0007 coordinator review pane

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0007-coordinator-review-pane/intent.md`

---

## 1. Summary

A new route returns a finished conversation's `ScreeningResult`, with the criteria it was screened against, their plain renderings and its source. A new view, `#/review/<id>`, lays it out for a coordinator. Rows are grouped by what the coordinator does next and kept in protocol order within each group. Each row shows the protocol's words and plain rendering through `CriterionText`, the finding with inclusion or exclusion applied in words, and the questions and replies behind it. The launcher also serves the 30 conversations of 0004's committed eval run as read-only, finished conversations, so the pane has real results with no model running. A test enforces where the pane stops: flip every settled finding and nothing outside the rows' polarity words may change. A blinded reading of ten committed conversations measures how many of the agent's known wrong findings a reader catches from the pane. The agent, the renderings and every committed result are unchanged.

## 2. Decisions taken before this spec

| # | Decision | Consequence here |
| --- | --- | --- |
| D1 | Group by the coordinator's next action, keep protocol order, and apply polarity per row only | Four groups (§6.2). No sorting or colour by outcome (§6.5) |
| D2 | Where the pane stops is a test: fixed text, a count of one group, or one criterion | The flip test and the wording test (§8.1) |
| D3 | Open question 1 is answered as far as the evidence goes | README numbers (§10.2) from `review:score` and the committed results |
| D4 | A blinded reading gate, by a reader who hasn't seen the vignettes | §9. Claude may not be the reader |
| D5 | Something to look at after the first stage, on conversations outside the reading set | Gate 1 uses a fake-mode conversation and the two v2 examples already seen (§11) |

The intent's eight open questions are answered here:

| Intent question | Answer | Section |
| --- | --- | --- |
| 1. The route | A separate `GET /api/conversations/:id/review`. `409 not-finished` before the end. The inspection route doesn't change | §4 |
| 2. Serving committed conversations | Loaded by the launcher, from the committed run's own list, in every mode and source. Held read-only by the service, beside `chats/`, with their own id form | §5 |
| 3. Polarity wording | Inclusion: *met* / *not met*. Exclusion: *applies* / *does not apply*. Always after "by the participant's account" or "participant reported" | §6.3 |
| 4. A reply's context | Every question asked about the criterion with the reply that followed it, plus any other reply a reading for this criterion cited. The whole transcript sits below. A self-correction the agent never read is only in the transcript, and the reading measures that | §6.4 |
| 5. Ignored readings | Shown on the row they concern | §6.4 |
| 6. `CriterionText`'s variant | An `audience` prop, `"tester"` by default. Still the one component that reads criterion text | §7 |
| 7. Reading set and answer sheet | v1 and v3 of each labelled study: ten conversations, 15 known wrong findings, three with none. A generated sheet in `work/`, scored by a script after | §9 |
| 8. A low catch rate | Report it and carry it forward. The five v2 conversations are held back, and three of them are still unseen: a changed pane gets one second reading on those, and only if the first reading's notes point to something the pane failed to show | §9.5 |

## 3. What the pane may say

This is the rule the tests enforce (§8.1), stated once.

Every piece of text or structure the pane produces is one of:

1. **Fixed.** The same for every conversation, or depending only on the conversation's identity: study, id, source, mode, run metadata.
2. **A count of one group.** How many rows are in *Settled from the participant's words*, and so on. Groups are defined by `FindingStatus` (§6.2), never by polarity, so a count can't mean "how many count against them".
3. **About exactly one criterion.** Its words, its finding with polarity applied, its questions, replies, quotes and readings.

Nothing else. In particular, no text, count, colour, icon, order or position depends on which way two or more findings went. The pane has no field, route or control that records a decision. Nothing in it is editable.

## 4. The route

`GET /api/conversations/:id/review`, added in `registerInspectionRoutes`:

| Case | Response |
| --- | --- |
| Unknown id | `404 { error: "unknown-conversation" }` |
| Known, not finished | `409 { error: "not-finished" }` |
| Finished | `200 ConversationReview` |

```ts
// src/server/types.ts
export interface ConversationReview {
  id: string;
  /** Where it came from: the page or terminal (`chats/`), or 0004's committed eval run. */
  origin: "conversation" | "eval-run";
  source: CriteriaSource;
  /** Every criterion the conversation was screened against, in protocol order. */
  criteria: ScreeningCriterion[];
  /** Plain-language display by criterion id. Empty for parsed criteria. */
  plain: Record<string, PlainDisplay>;
  /** Exactly as the session produced it. Not reshaped. */
  result: ScreeningResult;
}
```

- `ConversationService.review(id)` builds it: the live conversation's `result` and `state.criteria`, `plain` exactly as `inspect` chooses it today (labels only, from the served study), and the conversation's own `source`. For a conversation from the eval run, everything comes from what the launcher passed in (§5).
- A finished conversation that has no `result`: a `chats/` file saved by an older build could be `done` without one. That returns `409 { error: "no-result" }`, not a result rebuilt on the fly.
- The route never returns anything from a vignette: no `vignetteId`, no participant persona, no memory, no grade. A test checks the response's keys against a list of fields that exist only in eval files (§8.3).
- `ScreeningResult` doesn't change. The route adds criteria, plain and source around it.

## 5. Committed conversations

### 5.1 Which ones

The conversations of the committed run `evals/results/screening/01-c5778afe9cbd.json`: 15 from labels and 15 from parses. The launcher reads the run file's `conversations` list and, for each entry, loads the matching file under `evals/results/screening/conversations/`. The match is by vignette id and source, plus the run's model, prompt version, simulator version, seed and thinking setting. The run file names the conversations that were graded, so no dev or failed file is loaded. The run file is named in one constant in `scripts/app.ts`. A later eval run changes that constant, visibly.

### 5.2 How

`scripts/app.ts` gains `loadEvalRun()`. For each file it passes on only:

```ts
// src/server/types.ts
export interface FinishedConversation {
  id: string;                    // "eval NCT00077350-v1-labels"
  source: CriteriaSource;
  criteria: ScreeningCriterion[]; // from the file's state.criteria
  result: ScreeningResult;        // from the file's result
  plain: Record<string, PlainDisplay>;
}
```

- `plain` is `displayFor(criteria, loadPlainFile(nctId))` for labels, and `{}` for parses. `displayFor` checks each rendering's `textSha` against the criterion text in the file, so a label edited since the run shows as stale, not as a rendering of different words.
- `vignetteId`, `participant`, `memory`, `timing`, `fidelityChecked`, and every grade stay in the launcher and are never passed to the server. The type has no field for them.
- The ids are `eval <vignette>-<source>`. The space keeps them out of `CONVERSATION_ID`, so they can't collide with a `chats/` file or be saved as one. The route and the page accept them (URL-encoded). `routeFrom`'s pattern widens to allow `%20`, and a test covers it.
- They load in every mode (`--fake` or not) and for either `--source`, because showing them needs no model and each carries its own source.

### 5.3 In the service

`ConversationServiceOptions` gains `finished?: readonly FinishedConversation[]`. The service keeps them in their own map, never on the transport, and never saves them.

- `review(id)` answers for them.
- `inspect(id)` and `state(id)` return `undefined` for them, and `#/c/<id>` shows "No conversation". They have no channel and are not conversations you can continue.
- `list()` includes them after the live ones, with `origin: "eval-run"`. `ConversationSummary` gains `origin` and keeps its other fields (`turns` is the transcript length, `done: true`, `updatedAt` from the result's `run.timestamp`).

### 5.4 The start page

The *Conversations* list gains a *Review* link on every finished conversation. The eval-run conversations go in a separate list below, *From the eval run (simulated participants, read-only)*, each with only *Review*. The finished-conversation view gets one link, *Open the coordinator review*, above the tester panel. The tester panel doesn't change otherwise.

## 6. The pane

### 6.1 Structure

`src/web/review.ts` holds the pane's logic as plain functions, the way `logic.ts` does for the tester panel. `reviewModel(review: ConversationReview): ReviewModel` produces everything the components show, and the components only lay it out. `src/web/ReviewPage.tsx` fetches the review and renders the model. A `409` shows "This conversation hasn't finished. The review opens when it does." and a link back to the conversation.

```ts
export interface ReviewModel {
  frame: {
    title: string;            // "NCT… · <brief title>"
    id: string;
    notes: string[];          // the fixed sentences of §6.6, chosen by source, origin and mode only
    groups: Array<{ key: GroupKey; heading: string; what: string; count: number; rows: string[] }>;
    footer: string[];         // run metadata lines
  };
  rows: Record<string, ReviewRow>;
  transcript: TranscriptLine[];
}
```

`frame` holds everything that isn't about exactly one criterion. That's what the flip test compares (§8.1).

### 6.2 The groups

In this order, each with a heading, a one-line *what to do*, and a count. A group with no rows still shows its heading and 0, so a group's presence carries no information.

| Key | Heading | Statuses | What to do |
| --- | --- | --- | --- |
| `settled` | Settled from the participant's words | `holds`, `does-not-hold` | Check that the words say this |
| `chart` | Needs chart review | `chart-review` | Confirm in the medical record. What they reported is shown |
| `unresolved` | Unresolved | `unresolved` | Raised, not settled. Follow up or check the record |
| `not-raised` | Not raised in the conversation | `not-raised` | Not asked, by design. Check as usual |

Within a group, rows are in the order of `criteria`, which is protocol order.

### 6.3 A row's head and finding

```ts
export interface ReviewRow {
  criterion: ScreeningCriterion;
  plain: PlainDisplay | undefined;
  polarity: "Inclusion" | "Exclusion";
  finding: string;        // the only field whose text depends on which way the finding went
  reason: string | null;  // unresolved and not-raised: the reason in words
  asked: number;
  exchanges: Exchange[];
  readings: string[];     // rejected and ignored readings for this criterion, in words
}
```

`finding` by status and polarity:

| Status | Inclusion | Exclusion |
| --- | --- | --- |
| `holds` | Met, by the participant's account | Applies, by the participant's account |
| `does-not-hold` | Not met, by the participant's account | Does not apply, by the participant's account |
| `chart-review`, reported `holds` | Participant reported: met. Needs the record | Participant reported: applies. Needs the record |
| `chart-review`, reported `does-not-hold` | Participant reported: not met. Needs the record | Participant reported: does not apply. Needs the record |
| `chart-review`, reported `partial` | Participant reported part of it. Needs the record | same |
| `chart-review`, reported `unknown` or none | Participant didn't know. Needs the record | same |
| `unresolved` | Not settled | same |
| `not-raised` | Not asked | same |

`reason` in words: *unclear answer*, *didn't know*, *declined to say*, *contradicted themselves*, *answered part of it*, *the conversation ended before an answer*, *the agent's quote wasn't in what they said*, *a lab value*, *a site or protocol requirement*, *a definition*. `answered` has no reason line.

None of these words match `eligib|verdict|disposition|qualif|score|total` (§8.1). Each is about one criterion: "met" is the criterion's, not the person's.

### 6.4 The words behind a finding

An `Exchange` is one question and the reply that followed it:

```ts
export interface Exchange {
  question: { turn: number; text: string } | null;   // null for the opening's reply
  reply: { turn: number; text: string; marks: Array<{ start: number; end: number; reading: string }> } | null;
}
```

A row's exchanges, in transcript order, without duplicates:

1. Every `question` turn with this `criterionId`, and the participant turn after it (or `null` if the conversation ended there).
2. Every reply turn cited by this criterion's evidence, rejected readings or ignored readings that isn't already included, with the agent turn before it as its question.

`marks` highlight each quote the agent read in that reply for this criterion, located with `locateEvidence` from `src/screening/evidence.ts`, which the session used to accept it. A mark carries the reading (*holds*, *partial* and so on) in the agent's vocabulary. The highlight is the same for every reading. A rejected reading's quote doesn't locate by definition, so it gets no mark.

`readings`, one line each:

- rejected: *At turn N the agent read "…" as holds, but those words weren't in the reply, so it was discarded.*
- ignored, `already-settled`: *At turn N the agent read this as does not hold after it was settled. It was ignored.* This is the one place the agent noticed a later answer, and the coordinator should see it.
- ignored, `not-raisable`: *At turn N the agent read something about this criterion, which isn't asked in conversation. It was ignored.*
- `unknown-criterion` readings concern no criterion. They're counted in the footer.

**What a row can't show.** A self-correction the agent never read, such as "actually, I did have radiation" in reply to a question about something else, is attached to no criterion. Only 2 readings in all 32 committed results were ignored as already settled, so most missed corrections are of this kind. They are only in the transcript. The pane links every row's turns to the transcript, and the transcript is on the same page. The reading records whether a reader found such an error there (§9.3), and the README reports it.

### 6.5 What's absent from the layout

- No colour, icon or style that differs by `finding`. A row's classes come from its group key only.
- No sorting by finding, no filter by finding, no "show only…" control.
- No sum across groups ("22 of 37 checked"), no progress bar.
- No summary sentence in any form.

§8.1's test covers the model. The components' classes are reviewed at Gate 1 and by the §8.2 source check.

### 6.6 Frame text

- **Header note, always:** "The agent's record of what the participant said, criterion by criterion. It is not a decision. The coordinator decides."
- **Scripted mode:** "Scripted agent: not the real model."
- **Eval run:** "From 0004's eval run. The participant was simulated by the model from a written vignette."
- **Parse source:** "The criteria came from the parser, not the labels. Some may be missing or mis-typed, and a missing criterion isn't shown anywhere. These criteria have no plain-language versions."
- **Footer:** model, quantization, temperature, seed, adapter, reasoning setting, prompt version and run time, from `result.run`. Model calls made. The count of readings about no criterion.

### 6.7 The transcript

Below the groups: every turn, numbered, with speaker and text. Each question shows the id of the criterion it raised. Each turn links to the rows that cite it, and each row's turn numbers link to the transcript. Links are in-page anchors. There's no router change beyond `#/review/<id>`.

## 7. `CriterionText`

It gains `audience?: "tester" | "coordinator"`, `"tester"` by default, so the tester panel is unchanged. `plainView(plain, audience)` in `logic.ts` decides the lines:

| State | Tester (unchanged) | Coordinator |
| --- | --- | --- |
| shown | *Plain language*, the text, a *retry* tag | *Plain language*, the text. No retry tag |
| failed | *No plain version: the check found* and the problem lines | *No plain-language version.* One line: "One was made but failed the check." |
| stale | as today | *No plain-language version.* "It was made from earlier wording." |
| missing | as today | *No plain-language version.* "None has been made." |
| none given (parses) | protocol words alone | protocol words alone. The header says why, once (§6.6) |

The protocol words are always shown first, labelled *Protocol*. `CriterionText` stays the only component that reads `criterion.text` or a rendering's text. The boundary test's list stays `["CriterionText.tsx"]`, and `ReviewPage.tsx` passes `criterion` and `plain` through, as `TesterPanel.tsx` does. `review.ts` is logic, not a component. It carries the criterion object and never reads its `.text`, and the boundary rule is extended to cover `src/web/*.ts` files other than `logic.ts` (§8.2).

## 8. Tests

Everything is deterministic and uses no model. The suite is at about 0.55 s. The fixtures here are small hand-built results plus the committed conversations, read once per file, and they should add well under 0.1 s. The plan measures it.

### 8.1 Where the pane stops

- **The flip test.** For each of the 15 labels and 15 parse conversations in the committed run, and for a hand-built result covering every status and reason: build `reviewModel(review)`. Build it again from a copy where every `holds` finding becomes `does-not-hold` and back, and every `reported` `holds` becomes `does-not-hold` and back. Evidence readings flip the same way, so the marks stay consistent. `frame` must be deep-equal. `transcript` must be deep-equal. For every row, everything except `finding` and the reading words in `marks` must be deep-equal. A synthetic "sort settled rows so exclusions that apply come first" version of `reviewModel` is shown to fail the test, so it's known to fire.
- **The wording test.** Every string in `frame`, and every `finding`, `reason`, `readings` line and group heading, must not match `/eligib|verdict|disposition|qualif|score|total/i`. Criterion text, renderings, turn text and quotes are excluded by construction: the test walks the model's own fields and skips `criterion`, `plain`, `exchanges` and `transcript`. A synthetic frame note "Likely eligible" is shown to fail it.
- **No decision can be recorded.** `ConversationReview`'s and `ReviewModel`'s keys are walked, and none match `/eligib|verdict|disposition|qualif|decision|determin/i`. The route test adds `/review` to the existing all-routes verdict test in `tests/server/app.test.ts`, and asserts no non-GET route exists under `/review`.

### 8.2 Boundaries

- `readsCriterionText` is applied to every file under `src/web/` except `CriterionText.tsx` and `logic.ts`, not only components. `review.ts` must pass.
- `ReviewPage.tsx` sets `className` only from a group key or a fixed string. A source check: no `className` expression mentions `finding`, `status`, `polarity` or `reported`, with a synthetic line shown to fire.
- Unchanged and still passing: no network under `src/` beyond the three exceptions (the new API call is a relative path in `src/web/api.ts`), `src/` imports nothing from `evals/`, the transparency test from 0005, `src/screening/` doesn't import `src/plain/`, and `PROMPT_VERSION` is `c5778afe9cbd`.

### 8.3 Route and service

- `review` returns 404, 409 `not-finished`, 409 `no-result`, and 200 with exactly the `ConversationReview` keys.
- An eval-run conversation: served by `review`, absent from `inspect`, `state` and the transport, listed with `origin: "eval-run"`, never written to `chats/`.
- **Blindness.** The keys of every `/review` response for the committed run contain none of `vignetteId`, `participant`, `memory`, `fidelityChecked`, `timing`, `labels`, `expected`, `outcome`, `notCorrect`, `grade`. The launcher's `loadEvalRun` is tested to drop them.
- The launcher loads exactly 30 files for the committed run, 15 per source.

### 8.4 The model

`reviewModel` against a hand-built result covering every status, reason, polarity and reported value. It checks group membership and order, the §6.3 wording table cell by cell, exchanges (a question without a reply, a cited reply outside any question to this criterion, no duplicates), marks located with `locateEvidence`, rejected and ignored reading lines, and each §6.6 note appearing exactly when its condition holds. Committed conversations: every row's exchange turns exist in the transcript, and every located evidence quote has a mark.

## 9. The reading

### 9.1 Who

**Not Claude.** Claude wrote the vignettes and knows every expected outcome. **Preferably a reader new to the project.** If the owner reads, the README says the reader knew the four kinds of error 0004 found. Either way, the reader must not open `evals/`, the vignettes, the labels' notes or 0004's results before finishing, and the README says whether that held.

### 9.2 What

**v1 and v3 of each of the five labelled studies, from labels: ten conversations.** v2 is left out of the first reading because two of the five v2 conversations are the examples the owner saw at 0004's Gate 2. The rule is by version, not by which conversations have errors.

That set holds 15 of the 24 confidently wrong findings, in seven conversations, and three conversations with none (`NCT00077350-v1`, `NCT04316364-v3`, `NCT04385368-v1`). The reader isn't told how many errors there are, or which conversations have them. The sheet presents the conversations in a fixed shuffled order (seed 20260921).

Parse-source conversations aren't read. The parser's losses aren't visible in the pane by construction (§6.6), so a reading can't measure them.

### 9.3 The question

For every row in *Settled from the participant's words*, and every *Needs chart review* row with a reported value:

> Does what the participant said, as shown on this page, say what this row says about this criterion? **Yes**, **no**, or **can't tell**.

"As shown on this page" includes the transcript. A reader who answers *no* writes one line saying where they saw it: *row*, meaning the words in the row, or *transcript*, meaning somewhere else in the conversation. *Can't tell* is the right answer when judging would take medical knowledge. It is reported on its own, never counted as a miss.

For each conversation, the reader records the clock time at opening and at finishing.

**Amended during implementation** (plan, change table): the sheet lists settled rows only. In the reading set there are 107 settled rows and 211 chart-review rows with a reported value, of which 21 are graded and none disagrees with its vignette. Listing them would have tripled the reading and measured nothing a reader could catch, and a tired reader answers the settled rows worse. The reported-value tallies below are dropped with them.

### 9.4 The sheet and the score

- `npm run review:sheet` writes `work/0007-coordinator-review-pane/reading.md`. For each conversation in order: its review link, a start and end time to fill in, and one line per row to answer (`L7 — yes / no / can't tell — where:`). The row list comes from the committed results. The sheet contains no finding, no expected outcome and no grade. It is committed blank before the reading.
- `npm run review:score` reads the filled sheet and the committed run's grades, and prints:
  - **caught:** known wrong findings answered *no*, of 15, and how many of those were marked *transcript*
  - **false alarms:** graded correct findings answered *no*, of the graded correct ones
  - **can't tell**, split by known wrong and graded correct
  - **ungraded rows** answered *no*: rows the vignettes set no expectation for, listed for reading, not scored
  - reported values: disagreements with the vignette's facts answered *no*, of the disagreements in the set
  - **minutes per conversation:** median and range
- Both are scripts under `scripts/`, deterministic, and use no model. `review:score` also runs against a filled test sheet in `tests/`.

### 9.5 If the catch rate is low

The number is reported as it is. The reader's notes are read for one thing: did they miss an error because the pane didn't show something it could have shown? If so, and only if so, the pane is changed and a second reading is done on the three unseen v2 conversations (`NCT03433469-v2`, `NCT04385368-v2`, `NCT06728852-v2`, holding 7 known wrong findings), by a reader who hasn't seen them. Otherwise the result is carried forward to the agent-fixes slice as it stands. There is at most one second reading, because blind material runs out.

## 10. Documentation

### 10.1 CLAUDE.md

`review:sheet` and `review:score` join the command table. The `npm run app` row mentions the review view and that the eval run's conversations are listed. The boundary paragraph gains the pane's rule: everything it says is fixed, a count of one group, or about one criterion, and the flip test in `tests/web/review.test.ts` enforces it.

### 10.2 README

A section, "The coordinator review", covering:

- What the pane shows and where it stops, with the §3 rule and the flip test named.
- **Open question 1**, answered to the limit of the evidence:
  - *Replacement is not argued.* It means acting on findings without review. From labels, 0004 measured 0.15 confidently wrong (24 of 163) with abstention at 0.01, on the pinned model with the settings recorded there.
  - *What a conversation can settle at all.* 61 of the 252 labelled criteria are `patient`. Per-group row counts over the 15 labels conversations, from the committed results.
  - *What review caught.* The §9.4 numbers, the reader's relationship to the project, and whether the blinding held.
  - *What this can't claim.* Time saved for real coordinators. Error-catching in general from one reader and ten conversations. Anything about headcount. Anything about another model, which is 0008's.
- If the catch rate is low, the section says the pane doesn't yet support augmentation either, in those words.

### 10.3 ROADMAP

0007 marked done, open question 1's row updated with what was and wasn't established, and "Carried forward from 0007". That list includes at least: the three unseen v2 conversations, if unused, as blind material for the agent-fixes slice's re-measurement; that unread self-corrections are only in the transcript; and what the reader's notes said the pane lacked.

## 11. What the plan must gate

1. **After Stage 1: the pane's shape and wording.** The route, the launcher's eval-run loading, `reviewModel` and a working `ReviewPage` exist, with no tests beyond what it takes to build. In `npm run app -- --fake`, review a finished fake conversation and the two eval-run conversations already seen at 0004's Gate 2 (`eval NCT00077350-v2-labels`, `eval NCT04316364-v2-labels`). Only those two, because opening any other eval-run conversation spends blind material. The questions, none of them clinical: Can you tell from a row alone whether the words support its finding? Does "Does not apply, by the participant's account" read as being about the criterion, or about the person? Are the four groups right, and in the right order? Is the reading-question workable on this layout, and how long does a conversation take? Does anything in the layout rank or colour rows by how they went? This guards Stage 2, whose tests are built around the model's shape, and Stage 3, whose blind reading can't be redone on the same conversations. Getting it wrong costs both. Gate 1 is not always yes: if a row can't be judged without scrolling the transcript for most findings, the exchange design (§6.4) changes before anything else is built.

2. **After Stage 3: the reading.** Done by the reader in §9.1, not delegated to Claude. The sheet is filled and scored. The decision is §9.5's: report as it stands, or change the pane and read the v2 set. It guards the README's answer to open question 1, which is the claim this slice exists to make carefully.

Stage 2 (the tests of §8, the sheet and score scripts, the boundary changes) needs no gate. It ends in tests that either pass or don't.

## 12. Out of scope

- Any change to `src/screening/`, `src/plain/`, `src/criteria/`, `src/models/`, the prompts, the labels, the vignettes, the renderings, or any committed result under `evals/results/`.
- Recording a coordinator's decision, notes, or any edit.
- Promoting, sorting or colouring by outcome.
- Suggested follow-up questions, or any other new model output.
- Rendering parsed criteria.
- A reading of parse-source conversations.
- New dependencies.
