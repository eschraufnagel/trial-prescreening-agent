# intent: 0015 parser on nested protocols

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-10 ("ok"). The constraints (local model only, no `--spend`, proportionate measurement, nothing that needs clinical judgment) are the owner's. Decisions 1 to 8 were Claude's recommendations, accepted as written
**Date:** 2026-10
**Scope:** The quote-location step of the parser, so that a criterion quoted together with its heading is kept instead of thrown away. The prompt, the agent, the labels and every committed result stay as they are.

---

## Problem

**A long protocol that nests criteria under a heading loses them.** At 0013's gate, NCT06090266 (melanoma and solid tumours, 10.8k characters, cohorts) came back with 45 criteria. 11 were rejected and 6 passages went unclaimed. The agent never asks about a rejected criterion.

**All 11 rejections have the same shape.** The model quoted a heading and one of the items under it as one string, dropping the list marker between them:

> Source: `8. Recent or ongoing serious infection including the following:` ⏎⏎ `   2. Uncontrolled infection with human immunodeficiency virus (HIV). …`
> Quote: `Recent or ongoing serious infection including the following: Uncontrolled infection with human immunodeficiency virus (HIV).`

Both halves are in the source verbatim. Joined, they aren't, so `locateQuote` rejects the quote, as it should for any text it can't find. The 11 are the five infection items (any Grade 3+ infection, HIV, hepatitis B, hepatitis C, tuberculosis) and the five "For Cohorts A2, B1, B2, and B3 only:" items, each under its heading. The 11th, Cohort B3's prior-therapy requirement, is joined to a heading with no colon, with a sibling item ("i. Cohort B2 …") between the two.

**What the evidence already shows, from a replay of the committed gate parse with no model call.** The replay was a scratch script, outside the repository.

- A rule accepting "a heading ending in a colon, plus one numbered item under it" **recovers 10 of the 11.** The B3 one stays rejected.
- **Unclaimed passages go from 6 to 8, not down.**
  - Three of the six were unclaimed only because their criteria were rejected, and they are now claimed.
  - Recovering the infection items exposes each one's **carve-out** as a gap of its own, for example "Subjects on stable highly active antiretroviral therapy (HAART) with undetectable viral load … are eligible."
  - Of the 8 left, 7 are carve-outs and 1 is the B3 item.
- **Carve-outs are a separate, older behaviour.** The prompt asks for "the smallest span that contains the whole criterion". The model quotes the exclusion sentence and leaves the exception sentences after it unclaimed. NCT04385368, labelled and in the measured set, shows the same thing: 12 unclaimed passages in each of its three committed samples, mostly "… are eligible" and "The following are exceptions to this criterion".

**Nothing in the measured set is affected.** The five labelled studies' current parses (prompt `e1e694b399d4`) have no rejections at all. Across every committed parse there are two, both from 0011: a stitched prefix on NCT00077350 ("Patients must have" + later text) and a retyped "etc . ." on NCT04841811. Neither is a heading join, and both must stay rejected.

**Found while reading, and not caused by this slice: cohort scope never reaches the agent.** `fromParse` passes the agent four fields and drops `appliesTo`, and neither the review nor the tester panel shows it. Seven of NCT06090266's kept criteria are already cohort-scoped, and the agent asks them of everyone. The five recovered cohort exclusions would join them.

## Proposed outcome

- **The location step accepts a heading joined to one of its own items,** under a rule narrow enough that every quote the net rejects today, adversarial or real, is still rejected.
- **A recovered criterion points at its item, not its heading,** and is marked as joined, the way a whitespace-only match is marked `loose`.
- **On NCT06090266's committed gate parse, rejections fall from 11 to 1,** shown by a deterministic test over the committed record.
- **`docs/limitations.md` is rewritten** to what is still true: the B3 shape, carve-outs, and cohort scope.

## Absent on purpose

- **No prompt change.** See decision 1.
- **No fix for carve-outs.** See decision 5.
- **No fix for cohort scope.** Carrying `appliesTo` to the agent changes `ScreeningCriterion`, which is pinned to four fields, and so changes the agent. That means re-running the vignettes. It's recorded for a later slice.
- **No change to the agent, the coordinator review's rules, the labels or any committed result.**
- **No new labels.** NCT06090266 stays unlabelled. Rejected and unclaimed counts are deterministic and need none.

## Constraints

- **Local model only, and no `--spend`** (owner). The one model run below uses oMLX.
- **The net stays a net.** The eight adversarial cases in `tests/criteria/adversarial.test.ts` and both real 0011 rejections keep failing location. Loosening the check adds adversarial cases for the new shape. It never removes old ones.
- **No clinical judgment at any gate** (owner). Every check is a count, a test, or reading whether a quote is in the source.
- **Proportionate.** Each model run names its claim in one line (owner; 0011 was stopped for over-measuring).

## Decisions

1. **The fix goes in the location step, not the prompt.**
   - **It's deterministic and provable without a model.** The replay already shows 10 of 11 recovered.
   - **It leaves the measured set alone.** The prompt version doesn't move, so no committed parse, parser grade or screening key changes. The rule only sees quotes that would otherwise be rejected, and the five labelled parses have none.
   - **A prompt change is the opposite on every count.** 0011 found small prompt edits flip whole blocks and need three samples of NCT04385368 to judge.
   - **The net needs the rule even with a prompt fix.** A model told to quote only the item will still sometimes join, so a prompt change would come on top of this rule, never instead of it.

2. **The rule, kept narrow.** A quote that fails both the exact and the whitespace-loose match is accepted only when it splits into a heading and an item, joined by whitespace, where:
   - the heading is found verbatim, and ends in a colon at the end of its line;
   - the item is found verbatim after the heading and starts a list item (the model may keep or drop its marker);
   - the item is inside the heading's list: no line between them sits at the heading's own level or shallower.

   Anything else is rejected exactly as now. That includes a heading from elsewhere, a prefix that isn't a heading (0011's "Patients must have"), an item from outside the heading's list, the two halves in reverse order, and an altered half.

3. **A recovered criterion's span is its item.**
   - The heading's span would run across the sibling items above it.
   - The heading is kept beside the item as a second span, and the criterion is marked as joined.
   - The agent sees no difference: the model's `text` already carries the heading's meaning ("The subject has an uncontrolled infection with HIV"), and `ScreeningCriterion` stays four fields.
   - Whether the page shows the heading is a spec question. The lean is no page change, since the heading is display only and the page is out of scope.

4. **The B3 shape stays rejected.** Accepting it means accepting a quote that skips over a sibling item's text, and skipping text is the stitch the net exists to catch. It's named as the one remaining rejection.

5. **Carve-outs are out of scope, counted, and named as the next parser problem.**
   - **Why it's a different fix.** The agent reads `text`, not the source. Carrying an exception means the model writing it into `text`, which is a prompt change across every study, with 0011's measurement cost.
   - **What fixed means for unclaimed passages.** None is left unclaimed *because its criterion was rejected for a heading join*. It doesn't mean the count falls. On the gate parse the count is expected to rise from 6 to 8, and the docs say why.
   - **Which way the error now points.** Before, the HIV exclusion wasn't asked at all, so someone with uncontrolled HIV went unflagged. After, it's asked without its HAART exception, so someone who qualifies under the exception is flagged for the coordinator. For a prescreen a person reviews, that's the safer error.

6. **What "fixed" means, written before any run:**
   - **(a) Replay, deterministic, in `npm test`.** On the committed NCT06090266 gate record, re-locating its rejected quotes recovers the 10 heading joins, and only the B3 quote stays rejected.
   - **(b) The net, deterministic, in `npm test`.** All eight existing adversarial cases and both real 0011 rejections still fail location. New adversarial cases for the joined shape fail too: wrong heading, non-heading prefix, item outside the heading's list, reversed order, altered heading, altered item.
   - **(c) The measured set, deterministic.** `npm test`'s re-grade of every committed result passes unchanged, and no committed parse changes.
   - **(d) Out of sample, one model run.** A fresh parse of NCT06090266, made after the rule is frozen, leaves **no rejection whose quote is a heading plus an item in that heading's list**. Its totals are reported, not judged against the gate's, because the long protocol's parse moves between days.

   If (d) fails, the rule isn't tuned against the run that failed it. The miss is recorded, and the owner decides at the gate.

7. **Model runs: one.**

   | Run | Claim it supports |
   | --- | --- |
   | One fresh local parse of NCT06090266, after the rule is frozen (about 2 min) | The rule recovers heading joins in a parse it wasn't written against |

   **Not run:**
   - **The parser eval.** By construction it can't move, and (c) shows it. This replaces the roadmap's "measured on the parser eval" with an argument and a test.
   - **The other two gate trials.** They had nothing rejected, so the rule has nothing to act on.
   - **Repeats of the fresh parse.** Same-day repeats were identical in 0011.

8. **Trials already added keep their old parse.** Refresh with unchanged text keeps the stored parse (`src/server/trials.ts:259`). Making it re-locate would be a server change for a handful of trials on one machine. The docs say to remove the trial and add it again. No server or page change.

## Gates

- **One, after the rule, its tests and the replay are committed, and before the model run and the docs.** It confirms that the adversarial cases for the joined shape are the right ones, and that the replay's 10 of 11 doesn't come from a rule that's too loose.
  - **Why it's a gate.** It decides whether the run means anything. A rule loose enough to pass (d) by accepting stitches would turn a safety net into a hole, and no later test would notice.
  - **What the owner reads.** Each new adversarial quote beside the source, and whether it's in the source as written. No clinical judgment is needed.
- **The run's result decides what the docs claim,** as written in decision 6. It isn't a second gate unless (d) fails.

## Open questions for the spec

1. Where the rule lives: inside `locateQuote`, or a second pass in `locate.ts` called from `locateAll`. How "level" is read from indentation and list markers in normalized text, given that `normalize` deliberately leaves bullets alone.
2. The field names for the heading span and the joined mark, and whether `findUnclaimed` counts the heading as claimed.
3. Whether a parse records the location rule's version. No committed parse changes under it, but an added trial's record does.
4. Whether the Trials screen's "couldn't be matched" and "weren't read" wording needs a change, given that unclaimed passages can rise.
5. Where cohort scope and carve-outs are recorded for later: `docs/limitations.md` and the roadmap's open-items table.
