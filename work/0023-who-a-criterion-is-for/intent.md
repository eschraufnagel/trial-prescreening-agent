# intent: 0023 who a criterion is for

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-11
**Date:** 2026-11
**Scope:** One slice. "I'm a man, so not pregnant" or "I'm a woman" stops closing pregnancy, breastfeeding and contraception criteria as *does not apply* when they apply to the person. Those rows get asked and answered, so abstention on the dev run comes back within 0.10 without confidently wrong getting worse. Local model only.

---

## Problem

**One reply about the person's sex closes criteria nobody asked about.** In the dev run 0022 ended on (`evals/results/screening/dev/13-f761514b3da8.json`), abstention was 7 of 42 (0.17), against 0022's bar of 0.10. Six of the seven are this. Read from the conversations behind the run (the local cache, `evals/results/screening/conversations/`, gitignored):

| Conversation | Row | Its words | Asked? | Reply the reading came from |
| --- | --- | --- | --- | --- |
| NCT00077350-dev | L20 | "Pregnant women are excluded from this study" | yes, turn 21 | "No. I'm a man, so not pregnant." |
| NCT00077350-dev | L21 | "breastfeeding should be discontinued if the mother is treated…" | no | the same reply |
| NCT00077350-dev | L23 | "women of child-bearing potential **and men** must agree to use adequate contraception…" | no | the same reply |
| NCT03433469-dev | L67 | "pregnant" | no | "I'm a woman, so that question doesn't apply to me", to L49, a question for men |
| NCT03433469-dev | L68 | "breastfeeding" | no | the same reply |
| NCT04385368-dev | L73 | "**male or female** patients of reproductive potential who are not willing to employ effective birth control…" | no | "No, I'm a man, I'm not pregnant.", to L71 |

Each ended `unresolved`, reason `does-not-apply`. The grader expected `does-not-hold` or `holds`, so each counts as an abstention.

**Five of the six were never asked** (`timesAsked: 0`). The read call gives readings for every criterion a reply speaks to, and it gave a volunteered `does-not-apply` to the neighbouring reproductive criteria. `applyPatient` in [apply.ts](../../src/screening/apply.ts) closes an open criterion on `does-not-apply` at once, so the agent never asks it. For L23 and L73 that loses an answer the person could have given: they name men, and "I'm a man" says nothing about agreeing to contraception. For L67 and L68, "I'm a woman" said she was outside a criterion for men, and nothing about pregnancy.

**The sixth was asked, and misread.** L20's reading carried the statement "The person is a pregnant woman." The read prompt already forbids both halves of that. The statement rule says "add nothing it doesn't say: no group of people", and the `does-not-apply` rule says: "'Pregnant' or 'breastfeeding' names a condition, not a group, so it applies to everyone… A criterion that names several groups ('women who could become pregnant and men must...') applies to anyone in any of them." The model does it anyway. The same conversation's L71 ("No, I'm a man, I'm not pregnant") was read right, as `does-not-hold`.

**It's been known since 0009, and the prompt alone hasn't fixed it.**

- 0009 added `does-not-apply` and the wording above. ROADMAP, findings from 0009: "Four of the eleven across the run are 'I'm a man, so I'm not pregnant' read as does-not-apply to a criterion about a condition. The prompt says pregnancy names a condition, not a group, and the model does it anyway, about once per dev iteration too."
- 0012 recorded it as a known limitation.
- 0021's dev run (`12-834179395652.json`) had two such: NCT00077350 L20 and NCT04316364 L7.
- 0022's prompt changed the conversations' paths, and it came up six times. The owner accepted 0022 with the cost recorded and left this for its own slice (`work/0022-self-corrections/plan.md`, Gate record, gate 2). The ROADMAP's carried-forward table now points the 0009 abstention entry at this slice.

**It costs the coordinator.** A row that should read "No" for pregnancy reads as open, with "I'm a man" as its only evidence. A contraception row that names men is open with no question asked, so the coordinator has to go back to the person for an answer the agent could have asked for.

**The direction is safe, and that's why it's been left.** A wrong `does-not-apply` abstains; it never settles. But it's now the largest source of abstention on the dev set, and 0022's bar can't be met while it stays.

## Proposed outcome

**A volunteered `does-not-apply` no longer closes a criterion.** `does-not-apply` stays what it is (0009's decision, below), but it settles who a criterion is for only for the criterion just asked about. On any other criterion, it doesn't close it, so the criterion stays open and is asked in its turn (decision 1). That's five of the six above, decided in code and pinned by a test.

**The asked criterion is read as the prompt already says.** The `does-not-apply` and statement wording is tightened, with the failing case as its example: "Pregnant women are excluded" is a statement about pregnancy, and a man who isn't pregnant gives `does-not-hold` (decision 1). This is the sixth, and the follow-up questions the first change creates: once L21 is asked of a man, his "I'm a man, I'm not breastfeeding" must be read as `does-not-hold` too.

**What `does-not-apply` does is unchanged** when it's accepted: `unresolved`, reason `does-not-apply`, for the coordinator.

**Measured by one dev re-run**, against run 13: abstention within 0.10, and confidently wrong not worse (decision 3).

## Absent on purpose

- **Changing what `does-not-apply` does.** 0009 made it `unresolved` with its own reason, not a new status, so the review's groups and `tests/web/review.test.ts` hold. It stays.
- **Code that decides who a criterion is for.** No word list of "women", "men", "female". L20's own words say "Pregnant women", so a check on the criterion's words would accept the misreading. Who a criterion is for stays the model's reading; code only limits where that reading can close a row.
- **The other direction.** NCT06728852 L15 ("Female patients of childbearing potential must…") was read `holds` for a woman twelve years past menopause, in runs 12 and 13; the vignette expects `defer`. It's confidently wrong, and the same family of criteria, but the opposite mistake. It's watched by the bar, not targeted.
- **The simulator, vignettes, labels and grader.** They're the ruler.
- **The scored run.** 13 hours. The README's numbers stay labelled as prompt `2c46ada9a1d5`'s, as 0021 and 0022 left them.
- **Plain-language renderings, the page and the fake agent.**

## Affected users and systems

**The coordinator.** Pregnancy and breastfeeding rows read "No" for a man who said he isn't, and a contraception row that names men is asked rather than left open.

**The participant.** One to three more questions in a conversation where this fired, each about something they can answer.

**`src/screening/`.** Where a reading is applied (`session.ts` or `apply.ts`), the `does-not-apply` and statement wording in `READ_SYSTEM_PROMPT` ([prompts.ts](../../src/screening/prompts.ts)), and `PROMPT_LAYOUT`. A code-only change must still bump it: the eval's conversation key is the prompt version, so without a new one the dev run would resume from run 13's cached conversations and measure nothing.

**`docs/`, ROADMAP.** The abstention paragraph in `docs/screening-agent.md` ("Corrections, since 0022"), `docs/limitations.md`, the 0009 abstention entry in the ROADMAP's carried-forward table, and the slice's row.

**Not touched:** `src/criteria/`, `src/plain/`, `src/models/`, `src/transport/`, `src/web/`, `scripts/app/`, the simulator, the vignettes, labels, the grader, `data/`.

## Constraints

- **The coordinator makes the determination.** Nothing here settles a row that wouldn't settle on the person's own words.
- **Rule 1 holds.** Every reading still quotes the reply.
- **The conversation always ends.** A row kept open is asked within the existing ask limits.
- **The boundaries hold.** `tests/boundary.test.ts` and `tests/web/review.test.ts` pass unchanged; `ScreeningCriterion` keeps its four fields.
- **Restore holds.** A conversation saved before this slice continues.
- **Local model only.** No extra model call, so nothing changes for a hosted user's spend.
- **Proportionate.** One dev run, justified in one line.
- **No gate needs clinical judgment.** Whether a criterion names men is in its words.
- **`npm test` stays near a second, and deterministic.**

## Decisions

1. **Where the fix goes. Recommend (c), both.**
   - **(a) Code: a volunteered `does-not-apply` doesn't close a criterion.** It's accepted only for the criterion the last question asked about (`askedAbout` in `session.ts`). On any other, it's recorded as ignored, with its quote, and the criterion stays open. Deterministic, testable, and it covers five of the six. The cost: when a volunteered `does-not-apply` is right (a man, a criterion only for women), that criterion is asked too, one more question.
   - **(b) Prompt: tighten the wording** for the asked criterion. Name the failing statement as an example, and say that a person's sex places them outside a criterion only when its words name only the other sex. It covers L20, and the questions (a) adds. But the current wording already says this and the model ignores it, and rewording the read prompt can move unrelated readings (0011, 0022).
   - **(c) Both**, in one change, measured by one run. (a) alone likely trades five abstentions for five more questions, some answered "I'm a man" and misread the same way on the asked criterion. (b) alone is what 0009 tried.
   - Rejected: a check on the criterion's words for a group, since L20 says "women"; a separate call to judge who a criterion is for, which adds a call to every reply for a mistake that abstains.
2. **What `does-not-apply` does: unchanged.** Recommend keeping 0009's rule.
3. **How it's measured. Recommend one dev re-run, no replay, no scored run.**
   - **The five dev vignettes, re-run once** (about 52 to 80 minutes on the local model, a little longer with the added questions). *Claim: abstention is back within 0.10 and confidently wrong isn't worse, on live conversations.* Compared with run 13 by `screening:compare`. Every `does-not-apply` finding in it is read in its transcript.
   - **No replay.** 0022's `corrections:replay` could rebuild the six turns, but (a) is decided in code and pinned by a test, and the replay can't show what the newly asked questions get. Only the live run measures the bar.
   - **No scored run.**

## Gates, proposed for the plan to argue with

None needs clinical judgment.

- **After the dev re-run: is abstention within 0.10, with confidently wrong no worse than run 13's 3?** Claude counts it and reads every `does-not-apply` finding and every new wrong row in its transcript. Delegable; the owner can overrule. What it costs to be wrong: the README and docs keep describing a cost the agent no longer has, or a fix that only moved abstentions into wrong answers ships as a fix. If the bar is missed, the owner decides whether to ship with the numbers or stop.
- **Optional, the owner's: in the app, say "I'm a man" to a pregnancy question.** Read whether the review shows "No" for pregnancy and breastfeeding, and whether the contraception row was asked. Cheap, and a reader who didn't write the prompts. 0022's equivalent was skipped; the plan says whether to hold this one.

## Open questions for the spec

1. **What counts as asked.** The criterion the last question named, or also a criterion the agent asked in the same question ("Are you pregnant or breastfeeding?" names one id)? Leaning: the last question's `criterionId` only. A combined question costs a second ask on the other criterion, which is cheap.
2. **Where an ignored `does-not-apply` goes.** Dropped, kept in `ignoredReadings`, or kept as the row's evidence while it stays open? Leaning: `ignoredReadings`, so the tester panel shows it and the row's evidence stays the person's answers.
3. **Corrections.** A volunteered `does-not-apply` in `corrections`, on an answered criterion, would today unsettle it to `contradicted`. Leaning: the same rule, ignored, because it isn't a correction of anything the person said about that row.
4. **The prompt's words.** What exactly changes, and whether the statement rule gets the L20 example. Leaning: the smallest edit that names "Pregnant women are excluded" → "The person is pregnant", and says `does-not-apply` is only for the criterion just asked. Nothing else in the prompt moves.
5. **Conversation length and the ask limits.** How many questions the kept-open rows add, and whether any conversation hits its limit. Leaning: the spec counts them from run 13's transcripts (one to three per affected conversation), and the dev run reports it.
6. **The bar's baseline.** Run 13 (3 of 38 wrong, 0.17), or run 12 (3 of 44, 0.05)? Leaning: abstention within 0.10 absolute, confidently wrong no more than run 13's 3, and the compare against run 13, so the slice is judged against the agent it changes.
7. **What the docs say.** Leaning: `docs/screening-agent.md` replaces the abstention paragraph's cause with what changed and run 14's numbers; `docs/limitations.md` likewise; the ROADMAP closes the 0009 entry if the bar is met. The README doesn't name this misreading, so it doesn't change.
