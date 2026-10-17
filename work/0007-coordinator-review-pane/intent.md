# intent: 0007 coordinator review pane

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. A review pane for a finished screening: every criterion's finding with the participant's words behind it, grouped by what the coordinator has to do next, with inclusion and exclusion said in words for each criterion and never combined into a verdict. It opens on conversations from the page and on the 30 committed eval conversations. It closes product open question 1 as far as a PoC can, and says how far that is. The agent is not changed.

---

## Problem

The product intent names the coordinator as the decision-maker and the review pane as where they make the decision. Six slices in, the coordinator has nothing to read. The pieces exist:

- `ScreeningSession` produces a `ScreeningResult` when a conversation ends: findings with located quotes, the transcript, a `Handoff` grouping by status, rejected and ignored readings, and the run metadata. The service holds it (`result(id)`) and saves it in `chats/`. No route returns it.
- `GET /api/conversations/:id` returns criteria, progress and plain-language renderings, and the tester panel shows them. The panel is deliberately not the pane. It has no totals, no grouping and no polarity, and says so on screen.
- 230 of the 252 labelled criteria have a checked plain rendering, shown through `CriterionText`.
- 30 finished conversations from 0004's eval run are committed under `evals/results/screening/conversations/`, each with a full `ScreeningResult` from the pinned model.

What's missing is the view that turns those into something a person can act on. Building it raises three problems the earlier slices could put off.

**Polarity has to be applied somewhere, and that is one step from a verdict.** A finding describes the criterion's statement. For the exclusion "Pregnant", a participant who says she is not has `does-not-hold`. That's good news for her, and nothing on screen says so. At 0006's reading I counted the missing "are excluded" three times. The renderings leave verdict wording out on purpose, so the pane is where "exclusion" gets said. Once each row says "exclusion, does not apply" or "inclusion, not met", adding them up is easy, and the sum is an eligibility decision. The product intent says no code path issues one. The pane has to state exactly where it stops, and a test has to be able to check it.

**The agent is often wrong, and the pane is where that either gets caught or gets passed on.** From labels, 0004 measured 24 confidently wrong findings out of 163 (0.15), with abstention at 0.01. About half the answers that should have stayed open were settled. A pane that shows "holds" with a tick invites the coordinator to trust it. A pane that shows the question the agent asked, the reply, and the quote it read has a chance of letting the coordinator see the mistake. How much of a chance is the open question.

**Open question 1 has been decided by default so far.** The product intent argues augmentation and says the review pane assumes it. The roadmap says the argument can't be made honestly until the pane exists. The numbers in hand already point one way. Replacement means acting on findings nobody reviews, and 0.15 confidently wrong rules that out for this agent. But "the agent is too wrong to replace anyone" is only half of the augmentation argument. The other half is that review catches enough of those errors, at a cost worth paying, to leave the coordinator ahead. Nothing has measured that.

## Proposed outcome

**A route that returns a finished screening.** `GET` on a finished conversation returns what the pane needs: the `ScreeningResult`, the criteria it was screened against, their plain renderings, and the source (labels or parse). Findings carry only criterion ids, so the criteria have to come along. Before the conversation finishes, the route says it is not finished. It never returns a partial result. The existing test that no route answers with anything verdict-shaped is extended to cover it.

**A pane, on its own page.** The coordinator doesn't watch the conversation happen. They open a finished one. So the pane gets its own view (`#/review/<id>`), with a link from a finished conversation and a list of reviewable conversations on the start page. The tester panel stays as it is, for me, while a conversation runs.

**The committed eval conversations open in the pane.** `scripts/app.ts` loads them from `evals/results/screening/conversations/` the way it loads labels, and passes them in as read-only, finished conversations. That gives the pane 30 real results from the pinned model on the first day, with no model running. It also makes the reading gate possible (decision 4). The pane shows only what the coordinator would have: the result, the criteria and the renderings. It never shows the vignette, the simulated participant's persona, the expected outcomes or the grade. That matters for the reading gate, and it is also simply true of a real handoff.

**What the pane shows, top to bottom:**

1. **A header that never changes with the findings.** The study, the conversation id, the source, and a fixed sentence saying the pane holds the agent's record of what the participant said, and the coordinator decides. The model, quantization, temperature, seed and prompt version are in a footer, because a result without them is not a result. In scripted mode, a banner says the agent was not the model. For a conversation screened from parses, a line says the criteria came from the parser and some may be missing or mis-typed. 0004 found only 84 of 183 patient criteria reached the agent intact from parses, and the pane can't show a criterion the parser dropped.

2. **Groups by what the coordinator has to do next, not by outcome.** Four groups, each with its count:
   - **Settled from the participant's words.** `holds` and `does-not-hold` together. What to do: check the words.
   - **Needs chart review.** `clinical` criteria. What the person reported is shown as reported, not as a finding.
   - **Unresolved.** Raised and not settled, with the reason in words: unclear, didn't know, declined, contradicted themselves, answered part of it, the conversation ended first, or the agent's quote wasn't in what they said.
   - **Not raised.** Never put to the participant, and why: a protocol requirement, a definition, a lab value.

   Within each group, criteria stay in protocol order (decision 1).

3. **Each criterion, in one row:**
   - its id, and **inclusion or exclusion, in words**
   - the protocol's words and the plain rendering, through `CriterionText`
   - for settled rows, the finding with polarity applied, in words, for this criterion only: an inclusion is "met" or "not met" by the participant's account, an exclusion "applies" or "does not apply". The spec settles the exact wording. For chart-review rows, the same words applied to what the person reported, marked as reported.
   - **the participant's words behind it.** Every question the agent asked about this criterion, the full reply, and the quote the agent read highlighted in it, with turn numbers. Quotes are capped at about 12 words (0004), so a quote alone can drop the "actually, no" that follows it. The full reply is where a coordinator sees a self-correction the agent missed, and the question is where they see a question that was badly put.
   - any reading discarded for this criterion because its quote wasn't in the reply, as a plain line. A coordinator should know the agent claimed something it couldn't point to.

4. **The whole transcript**, below the groups, with each turn linked to the rows that cite it.

**Plain language, through `CriterionText`.** The boundary test already requires that only `CriterionText` shows a criterion's words, and the pane follows it. A shown rendering sits under the protocol words, as in the tester panel. A criterion with no plain version shows the protocol words and one line: "No plain-language version." The check's problem lines ("number added: 5ml") help me test the renderings, but they don't help a coordinator read the criterion. The pane leaves them out and says which state it is (not made, failed the check, out of date), so nothing is hidden. Parsed criteria have no renderings, and the pane says so once, in the header, not on every row. `CriterionText` gets a way to tell whether it is in the tester panel or the pane. The spec decides the prop. It stays the one place.

**Polarity goes in the row, not the rendering.** The rendering stays a statement ("Is pregnant"). "Exclusion" and "does not apply" sit in the row around it. That keeps 0006's rule that renderings carry no verdict wording. It also means a failed or missing rendering doesn't lose the polarity.

**Numbers in the README, for open question 1** (decision 3):

- How much of the screening the conversation can settle at all. For the labelled criteria: 61 of 252 are `patient`. The rest go to the chart or are never raised, however good the agent is. For each committed conversation, how many rows fall in each group.
- The agent's error rate from 0004, restated beside the pane: 0.15 confidently wrong, 0.01 abstention.
- What the reading gate found: of the known wrong findings in the conversations read, how many a reader caught from the pane alone, how many correct findings they questioned, and how long each conversation took to review.
- A plain statement of what this slice can't claim.

**Absent on purpose:**

- **No verdict, no summary of outcomes, no score.** No line, colour, icon, sort order or count that depends on more than one finding's outcome. Group counts depend on status, not polarity (decision 1).
- **No recording of the coordinator's decision.** A field for a disposition is exactly what `tests/screening/session.test.ts` and `tests/server/app.test.ts` forbid, and the reason for those tests (a result with no field for a verdict can't be shown as one) applies to the pane's data too. What a coordinator would record, and where, is a real workflow question. It belongs to a system with real coordinators, not to this PoC. Nothing in the pane is editable.
- **No agent change.** `PROMPT_VERSION` stays `c5778afe9cbd`, and the transparency test from 0005 passes unchanged. The pane reads results. It never produces them.
- **No suggested next question.** Telling the coordinator what to ask about an unresolved criterion would be new model output with no check. The pane shows the reason and the questions already asked.
- **No renderings for parsed criteria.** As in 0006.
- **No generation at runtime and no model call to show the pane.**
- **No change to the tester panel**, except a link to the review when the conversation is done.

## Affected users and systems

**The coordinator.** The reader this slice is for, and who the product intent says decides. There is no real coordinator on this project. The pane is designed from what a coordinator has to do with a finished screening, and the reading gate measures a lay reader standing in for one. The README has to say that.

**Me.** I look at the pane at the first gate (decision 5). I'm not the right reader for the second (decision 4).

**The prospective participant.** Unaffected. The pane is on the coordinator's side. Nothing a participant sees changes.

**`src/screening/`.** Not touched. The pane consumes `ScreeningResult` as it is. If the spec finds it needs something the result doesn't have, that's a finding to raise, not a field to add quietly.

**`src/server/`.** A new route, and the service learns to hold read-only finished conversations passed in by the launcher. **`scripts/app.ts`** loads the committed eval conversations and strips them down to the result and criteria before the server sees them. **`src/web/`** gets the review view, its logic as plain functions in the style of `logic.ts` so it can be tested in Node, a list entry on the start page, and the `CriterionText` change. **`tests/`** gains the no-verdict tests in decision 2 and route tests. **`tests/boundary.test.ts`** keeps holding: `CriterionText` is still the one place.

**CLAUDE.md, the README and the roadmap.** The pane in the verifying table, a README section with the numbers above, open question 1's row in the roadmap, and a carried-forward list.

**Not touched:** `src/screening/`, `src/plain/`, `src/criteria/`, `src/models/`, `data/`, the labels, the vignettes, and every committed result.

## Constraints

- **The coordinator decides. The pane stops at one criterion.** It may say, per criterion, what the participant's words establish and what that means for an inclusion or an exclusion. It may count criteria per group. It may not say, suggest or visually imply anything about the person that combines criteria. Decision 2 says how that is tested.
- **The protocol's words are always on screen**, for every criterion, whether or not there is a plain version.
- **Every settled finding shows the words it rests on.** The code already guarantees that every `holds` and `does-not-hold` has a located quote. The pane guarantees the quote is shown in its reply, beside the question that drew it.
- **Blind to the answers.** Nothing the pane shows or the route returns comes from a vignette, a grade or a label's notes. A test checks the route's response for fields that exist only in eval files.
- **No gate needs clinical judgment.** The questions asked of a reader are about whether a reply says what a finding says. Where spotting an error needs medicine, the reader answers "can't tell", and that's reported as its own number, not counted as a miss.
- **Deterministic.** No model call anywhere in the slice. `npm test` stays deterministic and fast.
- **No new dependencies.** Plain React, as the page is now.
- **No PHI, no network beyond the existing exceptions, loopback only.** The committed conversations are synthetic. `chats/` stays gitignored.

## Decisions

1. **Group by the coordinator's next action, keep protocol order, and apply polarity per row only.**

   The obvious layout puts anything that counts against the participant first: exclusions that apply, inclusions not met. In a real clinic that's the most useful thing on the page, because one reported exclusion ends the prescreen, and most prescreens end that way. It is also a summary. A pane whose top row is "exclusion: applies" has told the coordinator the answer, and a pane whose top row is harmless has told them the opposite. The pane would be deciding what the coordinator looks at first by the direction of the findings, and that is the ordering a verdict would produce.

   So groups follow what the coordinator has to do (check the words, check the chart, follow up, or nothing from this conversation), and each group keeps protocol order. Polarity is said in words on every settled row, so an exclusion that applies is easy to spot when scanning. It just isn't promoted. The cost is a few seconds of scanning per conversation, on about ten settled rows. That's small next to the cost of a pane that ranks the person.

   This also makes the stopping point testable, which a softer rule would not.

2. **Where the pane stops, as a test.** Everything the pane says is one of three things: fixed text, a count of one group, or something about exactly one criterion. A test checks this directly. It builds the pane's model (the plain-function output the components lay out) from a finished result. Then it builds it again from the same result with every settled finding flipped, `holds` to `does-not-hold` and back, and every chart-review `reported` flipped the same way. Everything outside the rows (header, group headings, counts, notes, order of rows) must be identical, byte for byte. Only the per-row polarity words may change. A second test runs the pattern the existing tests use (`eligib|verdict|disposition|qualif|score|total`) over every string the pane writes itself. Criterion text, renderings and quotes are excluded, because protocols contain "eligible for resection" and 0004 found the pattern matching them. The route is added to the existing all-routes verdict test.

   If a later slice wants to promote exclusions that apply, the flip test fails. That's the point. It turns a quiet design drift into a visible change to a test, the same way the network rule works.

3. **Open question 1 is answered as far as the evidence goes, and no further.**

   *What this slice can claim.* That this project argues augmentation, and why. Replacement means acting on findings without review, and this agent is confidently wrong on 0.15 of them. That the share of a screening a conversation can settle at all is small: 61 of 252 labelled criteria. The rest go to a chart or are never raised, which bounds what any agent could take off a coordinator here. And that, for the conversations read at the reading gate, a reader using only the pane caught some number of the known wrong findings, questioned some number of correct ones, and took some number of minutes per conversation.

   *What it can't claim.* Anything about time saved for real coordinators. There are none here, and no comparison with conducting the conversation by hand is measured. That review catches errors in general: the sample is a few conversations, and one reader. Anything about headcount. Anything about a frontier model, which is 0008.

   *What makes augmentation an argument rather than a default.* The pane has to make the agent's errors catchable and show what's left for the coordinator. Then the reading gate has to measure whether they are caught. If a reader catches few of the known errors, the honest conclusion is that this pane does not yet support augmentation either, and the README says that. A gate whose answer is always yes is not doing its job.

4. **A blinded reading gate, on committed conversations, by a reader who has not seen the vignettes.**

   The reader opens chosen conversations in the pane and, for every settled finding and every chart-review "reported", answers one question: *does the participant's reply, as shown, say what this row says about this criterion?* Yes, no, or can't tell. They don't see the grade. Afterwards their answers are compared with 0004's grading. The numbers are known wrong findings marked "no" (caught), correct ones marked "no" (false alarms), "can't tell" on each, and time per conversation.

   The conversations are chosen by a rule, before anyone reads, and the spec sets the rule. My proposal: a mix of conversations from labels that contain wrong findings and ones that contain none, so the reader can't assume every conversation has an error. 11 of the 15 from labels contain at least one of the 24, and 4 contain none.

   **This gate needs an independent reader, so don't delegate it.** Claude wrote the vignettes and knows every expected outcome, so a reading by Claude measures nothing. I've seen two of these conversations already (the `NCT00077350-v2` and `NCT04316364-v2` examples from 0004's Gate 2), and I know the four kinds of error 0004 found. If I read, those two are excluded, and the README says the reader knew the error kinds. A reader who has never seen the project would be better. The question is still a reading question, not a clinical one.

   **A reader can't be un-blinded.** Once a conversation has been read, it can't be read blind again, by that reader or anyone they talked to. That's what the first gate guards.

5. **Something to look at after the first stage, on conversations outside the reading set.**

   The first stage builds the route, the launcher loading of committed conversations, and a first version of the pane, grouping and polarity wording included, with no tests of the pane beyond what it takes to build. At that point `npm run app -- --fake` lists the 30 committed conversations and any finished fake-mode ones, and each opens in the pane. I review it on a fake-mode conversation and on the two eval conversations I've already seen.

   The gate after that stage decides the pane's **shape and wording** before the tests are built around it and before any blind reading is spent on it. Can you tell, per row, whether the participant's words support the finding without leaving the row? Is "exclusion, does not apply" clear, or does it read as a verdict? Are the four groups the right ones? Is the full reply enough context, or does the question before it need to be there too? What's the cost of getting this wrong? Blind readings done on the wrong layout can't be redone with the same reader and conversations. And the flip test and wording test are built around the shape, so they'd have to be rebuilt too. None of these questions are clinical.

## Open questions for the spec

1. **The route.** A separate `GET /api/conversations/:id/review`, or the result folded into the existing inspection once done. A separate route keeps the tester panel's contract unchanged and makes "not finished yet" a clear answer.
2. **How committed conversations are served.** Loaded by the launcher and held read-only beside the ones in `chats/`, or listed separately. Their ids differ from `chats/` ids (`NCT…-v2-labels-…`), and `CONVERSATION_ID` would reject them. Whether they appear with `--source parse` too.
3. **The polarity wording.** "Met / not met" and "applies / does not apply" are the proposal. The words must not match the verdict pattern, and they must read as being about one criterion, not the person.
4. **What a reply's context is.** The question and reply only, or the turn before as well. A self-correction can come several turns later, in a reply to a different question. Does the row show every reply that mentions the criterion, or only those the agent quoted? The agent only quoted what it read, and the missed self-correction is the case the pane most needs to show.
5. **Ignored readings.** Shown per criterion, or only counted. They're readings for criteria that were already settled, which is often exactly the missed self-correction.
6. **`CriterionText`'s variant.** A prop for audience, or a second small component that wraps it. Either way the boundary test's one-place rule has to still hold, and say so.
7. **The reading set and the answer sheet.** Which conversations, by what rule, how many. What the reader records answers in (a file the pane can't see, so the pane never learns the answers). How time is measured.
8. **What happens if the gate's catch rate is low.** Whether this slice changes the pane and reads again with fresh conversations, or reports the number and carries it forward. The first uses up blind material. The second is honest but leaves the argument unsupported.
