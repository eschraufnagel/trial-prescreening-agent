# spec: 0023 who a criterion is for

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-11
**Date:** 2026-11
**Intent:** [intent.md](intent.md), accepted by the owner (2026-11), with its three decisions as recommended

---

## 1. Summary

A `does-not-apply` reading closes a criterion only when it's about the criterion the last question asked. On any other open criterion, code holds it back as `unclear`, the way 0009 holds back a determination that wasn't said outright. The criterion stays open, keeps the person's words, and is asked in its turn. On a criterion that's already settled, it's ignored as `already-settled`, so it can't unsettle anything. Both cases are decided in `applyReadings`, where the other rules live.

The read prompt's `does-not-apply` wording is tightened for the criterion that was asked, with the failing case as its example: "Pregnant women are excluded" becomes "The person is pregnant."

What `does-not-apply` does when it counts is unchanged. One dev re-run measures it against run 13. No replay, no scored run, no extra model call, no change to the page.

## 2. Decisions taken before this spec

From the intent, accepted as recommended:

1. Both a code rule and a prompt edit, in one change, measured by one run (§3.1, §3.2).
2. What an accepted `does-not-apply` does is unchanged: `unresolved`, reason `does-not-apply`, or for a clinical criterion `chart-review` reporting `does-not-apply` (§3.3).
3. One dev re-run. No replay, no scored run (§5).

## 3. The agent

### 3.1 The rule: `does-not-apply` counts only where it was asked

`ApplyInput` gains `askedAbout: string | null`, the criterion the last question named (`draft.pending` in `session.ts`, already passed to the read call). In `applyReadings`, after rule 1 and the outright hold-back, a reading of `does-not-apply` for a criterion other than `askedAbout` is handled by the criterion's state:

- **Open:** applied as `unclear`, with `withheld: "does-not-apply"` on its evidence. That's exactly what `asApplied` does today when a `does-not-apply` isn't said outright, so it needs no new type. The criterion stays open, its reason is `unclear`, and the agenda asks it in document order. The quote stays on the row as evidence, so the coordinator sees "I'm a man" if the question never comes.
- **Settled, or `chart-review` with a report:** ignored, `why: "already-settled"`. Today it would unsettle a settled answer to `contradicted` (0022 spec §3.2). Saying one's sex doesn't correct an answer about that row (OQ 3).
- **Unresolved:** ignored, as today.

It applies to both lists the read call returns, readings and corrections, because they go through `applyReadings` together (0022). It applies to patient and clinical criteria alike. In run 13 it would also have kept open the clinical pregnancy-test rows NCT00077350 L18 and L22, closed as `chart-review` from the same "I'm a man" reply.

**What counts as asked (OQ 1):** the last question's `criterionId` only. "Are you pregnant or breastfeeding?" is recorded against one id, so the other is asked separately: one more question, cheap. A gate can overturn this if the dev run shows combined questions asked twice in a way that reads badly.

**Why held back, not dropped (OQ 2).** Three options:

| | Where it goes | Page | Read call sees it next turn |
| --- | --- | --- | --- |
| **Held back as `unclear` (proposed)** | the row's evidence, `withheld: "does-not-apply"` | no change | yes, as "said so far" |
| Ignored, new `why` | `ignoredReadings` | `readingLines` in `src/web/review.ts` needs a sentence for the new `why`; it falls into the "isn't asked in conversation" sentence otherwise, which is wrong | no |
| Dropped silently | nowhere | no change | no |

Dropping hides a reading, which the review has never done. A new `why` touches the page, which the intent left out. Holding back reuses a mechanism the review and tests already handle. Its risk: the next read call sees "said so far: unclear, from 'I'm a man…'" beside the asked criterion, which may invite the same misreading. Then it's the asked criterion, and the prompt edit (§3.2) has to carry it. The dev run shows whether it does, and gate 1 can switch to the ignored option.

**Restore.** No state type changes. `Evidence.withheld` already allows `does-not-apply`. A conversation saved before this slice continues under the new rule from its next reply.

### 3.2 The prompt

`READ_SYSTEM_PROMPT`'s `does-not-apply` bullet becomes, roughly:

> - "does-not-apply": only for the criterion the question was about, when the criterion's own words are about one group of people (only men, or only women) and the reply places the person outside it. A condition is not a group. "Pregnant women are excluded" is about being pregnant, so a man who says he isn't pregnant gives "does-not-hold", like anyone who says they aren't taking a medicine. A criterion that names several groups ("women who could become pregnant and men must...") applies to anyone in any of them. Saying who you are answers no other criterion.

The EXCLUSION example list in the statement rule gains the case L20 got wrong:

> "Pregnant women are excluded" becomes "The person is pregnant."

Nothing else in the prompt moves (OQ 4). The prompt already marks the asked criterion (`THE QUESTION WAS ABOUT:`), so the bullet's first clause points at something the model can see.

### 3.3 What stays as it is

- `applyPatient` and `applyClinical`: an accepted `does-not-apply` closes as today.
- `asApplied`: a `does-not-apply` not said outright is held back, as today, asked or not.
- The ask call, `MAX_ASKS` (2 per criterion), the agenda's order and the conversation's end.
- `ScreeningCriterion`'s four fields, the review's rule, the grader, the vignettes, the simulator.

### 3.4 Versions

`READ_SYSTEM_PROMPT` changes, so `PROMPT_VERSION` changes. `PROMPT_LAYOUT` goes to 8 as well, because the rule changes what a reading does, and the version should name that even if a gate removes the prompt edit. Without a new version, `eval:screening` keys conversations by the old one and resumes run 13 from the cache.

### 3.5 0022's replay

`evals/corrections/replay.ts` rebuilds recorded conversations through `applyReadings` and a test holds the rebuild to each conversation's committed statuses. Those conversations were recorded under the old rule, and `EVAL_RUN`'s labelled conversations hold volunteered `does-not-apply` readings (for example L20 read at a question about L19). **Requirement:** that test passes unchanged. The plan decides how: the rebuild applies the rule a conversation was recorded under, or the rule is shown not to change any of those six conversations. Either way, nothing in that test's expectations is edited.

### 3.6 The page

No change in `src/web/`, `src/transport/`, `src/server/` or `scripts/app/`: §3.1 holds the reading back instead of adding a new `why` the review would have to word. `npm run test:e2e` isn't required locally; CI runs it on the PR.

## 4. Tests

In `tests/screening/apply.test.ts` and `tests/screening/session.test.ts`, deterministic, no model:

1. A `does-not-apply` for the asked criterion closes it `unresolved`, reason `does-not-apply`, as today.
2. A `does-not-apply` for another open patient criterion leaves it open, reason `unclear`, with the quote as evidence and `withheld: "does-not-apply"`.
3. The same for an open clinical criterion: open, not `chart-review`.
4. A `does-not-apply` for another settled criterion leaves it settled and is listed in `ignored` as `already-settled`. The same reading for the asked criterion still unsettles it to `contradicted`, as today.
5. A `does-not-apply` in `corrections` follows the same rule as one in `readings`.
6. A `does-not-apply` with `outright: false` for the asked criterion is held back as `unclear`, as today.
7. Session: a reply read as `does-not-apply` on the asked criterion and two others closes only the asked one, and the next question asks one of the others.
8. `askedAbout: null` (the reply to the opening) closes nothing on `does-not-apply`.
9. The prompt tests: the bullet's first clause and the L20 example are in `READ_SYSTEM_PROMPT`, and `PROMPT_LAYOUT` is 8. Existing assertions change only for the layout number.
10. 0022's replay rebuild test passes unchanged (§3.5).

## 5. The dev re-run

`npm run eval:screening -- --dev`, the five dev vignettes from labels on the local model, committed as `evals/results/screening/dev/14-<prompt version>.json`. Run 13 took about 52 minutes. The rows kept open add about seven questions across the five conversations (from run 13's transcripts: NCT00077350 L18, L21, L22, L23; NCT03433469 L67, L68; NCT04385368 L73), a few minutes more, so **about 55 to 60 minutes**. *Claim: abstention is back within 0.10, on live conversations, without moving abstentions into wrong answers.* The owner runs it in their own terminal if `OMLX_API_KEY` isn't in Claude's shell, as in 0021 and 0022. Compared by `npm run screening:compare` against `13-f761514b3da8.json` (OQ 6).

**The bar, fixed now:**

- **Abstention no more than 0.10.** On run 13's 42 answerable rows, that's 4 at most.
- **Confidently wrong no more than 3**, run 13's count. The slice settles more rows, so a new wrong one is possible; the bar doesn't give room for it.
- **Every `does-not-apply` finding** in the run is read in its transcript and listed: asked or not, and whether the criterion's words name only the other sex.
- **Every new wrong row** is read and its cause recorded. NCT06728852 L15 (the menopause case, wrong in runs 12 and 13) is reported either way.
- **Questions added** per conversation, and whether any criterion hit `MAX_ASKS` because of the rule (OQ 5).

**The baseline (OQ 6).** Run 13, because it's the agent this changes and it was compared on the same vignettes and settings. Run 12's 0.05 is reported beside it for context, not as the bar. Gate 1 can overturn.

## 6. Gate: the owner says "I'm a man" in the app. Optional

In `npm run app -- --examples` on the local model, the owner answers a pregnancy question with "No, I'm a man" and reads whether the review shows pregnancy and breastfeeding as "No", and whether the contraception row was asked. A reader who didn't write the prompts. Proposed as **optional**: §4's tests pin the rule, and the run reads every `does-not-apply`. The owner decides in the plan whether to hold it. 0022's equivalent was skipped.

## 7. Documentation (OQ 7)

- **`docs/screening-agent.md`:** the abstention paragraph under "Corrections, since 0022" says what changed and run 14's numbers, and a short section on who a criterion is for. The scored table and worked example stay, labelled with their prompt version.
- **`docs/limitations.md`:** the 0022 abstention line is replaced by what's true after run 14.
- **ROADMAP:** the slice's row, and the carried-forward 0009 abstention entry closed if the bar is met, or updated with what's left.
- **README:** no change. It doesn't name this misreading.

## 8. Concerns for the owner

1. **A real `does-not-apply` costs a question.** A man asked about pregnancy who volunteers "and I'm not a woman" to a criterion only for women now gets that criterion asked too. In run 13 every volunteered `does-not-apply` was wrong or unhelpful, so the trade is good on this evidence. *Deciding:* accept a slightly longer conversation for fewer closed-unasked rows.
2. **The prompt edit can move other readings**, as 0011 and 0022 found. The bar's confidently-wrong count is what catches it. *Deciding:* accept that risk, or ship the code rule alone (§3.4 makes either measurable).
3. **The bar has no room.** Confidently wrong no more than 3 on a run of five conversations is strict, and one new wrong row from a newly asked question fails it. *Deciding:* keep it strict, as the intent asked ("not worse"), with gate 1 free to accept a miss on reading.
4. **No hosted cost.** No call is added.

## 9. What the plan must gate

- **Gate 1, after the dev re-run.** Is abstention within 0.10 and confidently wrong no more than 3? Claude counts it and reads every `does-not-apply` finding and new wrong row. Delegable; the owner can overrule. A miss is the owner's: ship with the numbers, revise once, or stop. It decides whether the docs and ROADMAP can say the 0009 entry is closed.
- **Gate 2, optional, the owner in the app (§6).**

No gate is needed before the run: it's local, free and about an hour, and the change before it is pinned by tests.

## 10. Out of scope, and known limits

- Changing what an accepted `does-not-apply` does.
- Code deciding who a criterion is for.
- The menopause direction (NCT06728852 L15), watched, not targeted.
- A combined question recorded against one criterion: the other is asked again.
- The scored run, simulator, vignettes, labels and grader.
- Any change in `src/web/`.
