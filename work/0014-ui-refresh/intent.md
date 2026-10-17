# intent: 0014 UI refresh

**Author:** the repository owner
**Status:** The design is the owner's pick of the mockups (2026-10: "Looks great, go"). The rest are Claude's recommendations, open to argument at the gate
**Date:** 2026-10
**Scope:** One slice. The page is restyled and reorganised around what a person does: add trials, screen against one, read the review. No change to the agent, the parser, the server's rules or any measurement, and no model runs.

---

## Problem

**The page reads like an internal test tool.** It's called "Prescreening test page". The start page mixes trials, a person's conversations and the eval run in one long list. The Trials page added in 0013 is grey rows of text. The tester panel takes half the conversation screen. Project words ("measured set", "parsed, not checked against labels", "tester view") are left for a newcomer to decode. With 0013 the app became something a person clones and uses for their own trials, and the page hasn't caught up.

**There's no way to see what the AI read from a trial before screening against it.** The criteria the parser made from a protocol are visible only one at a time, in the tester panel, during a conversation.

## Proposed outcome

The mockups at https://claude.ai/artifact/Uht1U7kkVxYb1mMKmcJXER (private to the owner), built into the page:

1. **A name and navigation:** "Trial Prescreening", with **Trials · Screenings · Reviews** in a header that also says which model is running.
2. **Trials** (the home page): your trials as cards, each with a status badge, condition chips, a link to ClinicalTrials.gov, **Start screening** and **See the checklist**, and a quieter Refresh and Remove. Remove asks to confirm. With no trials, a first-run panel explains the three steps.
3. **A trial's checklist** (new): what the AI read, as counts (rules read, ones the person can answer, ones needing records), then "Who can join" and "Who can't join". Each rule is tagged by who can settle it, and the published text sits in a fold-out.
4. **Screenings:** start one from a ready trial, and continue one in progress.
5. **Reviews:** finished conversations, the person's own and, with `--examples`, the eval run's, each opening the coordinator review.
6. **A conversation:** a cleaner chat headed by the trial, with the tester panel folded away behind a button. The panel's contents are unchanged.

## Absent on purpose

- **The coordinator review's content.** It gets the new header and spacing only. Its rules (no sorting, colouring or summarising by outcome) are enforced by `tests/web/review.test.ts` and the boundary test, and stay.
- **No new dependency.** Plain CSS with the existing colour variables, dark mode included.
- **No change to what the agent sees, or to any route's rules.** One read-only route is added, for a trial's checklist.

## Constraints

- **A criterion's words still go through `CriterionText`** (the boundary test). The checklist uses it.
- **The browser test keeps its coverage.** Its specs change wherever the page they drive changes. No case is dropped, and each still checks the behaviour it checked before.
- **Plain words on the page.** No slice numbers or project jargon a newcomer would have to look up.

## Decisions

1. **Design: the owner's pick of the mockups.** Option A, with the app's current palette.
2. **Routes:**
   - `#/` is Trials, the home page; `#/trials` still works.
   - `#/t/<NCT ID>` is a trial's checklist.
   - `#/screenings` and `#/reviews` are new.
   - `#/c/<id>` and `#/review/<id>` are unchanged.
   - The old start page's three lists move to Screenings and Reviews.
3. **Tags on the checklist come from the criterion's type:**
   - `patient`: "Person answers"
   - `clinical`: "Records"
   - `protocol`: "For the study site"
   - `definitional`: "Definition"
4. **The conversation's progress line says "Question N",** counting the agent's questions. It doesn't say "of about M", which would be a guess.
5. **The tester panel starts folded.** The choice is remembered in the browser, where that works.
6. **A fourth README screenshot, the Trials page.** It's the first thing a newcomer sees.

## Added at the gate (owner, 2026-10)

- **The coordinator review, made scannable.** The owner found it "a lot of information" and asked for "a quick summary and ultimate suggestion".
  - The summary is built as what's left for the coordinator: one count per group, then each rule folded to a line.
  - The suggestion was declined for now, at the owner's choice, after Claude raised the conflict with 0007's rule. An overall suggestion would rest mostly on rules nobody has checked, and would invite skipping the rows.
  - If wanted later, it's its own slice that changes the rule deliberately and measures the suggestion before it ships.

- **Deleting screenings, and no names (owner, 2026-10).** The coordinator can delete their own screenings, in progress or finished, with a confirmation. The eval run's stay. Asked whether a person should give their name, the owner agreed to readable labels made by the app instead (trial and start time), under the no-PHI rule.

## Gates

- **One, after the page is built and before the browser specs, screenshots and docs are redone: the owner uses the running app beside the mockups.** It decides whether the build matches what was picked. Stage B rewrites specs and pictures against the page, so a change after them costs that work twice. No clinical judgment is needed.

## Open questions for the spec

1. The checklist route's shape.
2. The CSS: what's replaced, and what the review keeps.
3. Which spec steps change, case by case.
