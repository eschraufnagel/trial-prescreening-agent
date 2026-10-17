# The coordinator review

What a coordinator sees after a screening, where it deliberately stops, and whether it helps a coordinator or could replace one. Part of the [Trial Prescreening Agent](../README.md) documentation.

## The coordinator review

A finished screening, laid out for the person who decides. Open it from a finished conversation or from **Reviews**, which with `npm run app -- --examples` or `--fake` also lists the 30 conversations of the screening agent's latest measured run, 0009's. The reading below was made on 0004's run, before the fixes, and its numbers are of that run.

Since slice 0014 it opens with **What's left for you**: each group's count and what to do with it, and never a total or a verdict. Each rule is one line (its id, inclusion or exclusion, the finding and the rule's words) that opens to show the plain-language version, why, how often it was asked and the conversation behind it. The first group with rules starts open. Asked for "a quick summary and ultimate suggestion", the owner chose this over an overall suggestion, which would combine criteria against the rule below and rest mostly on rules nobody has checked.

Rows are grouped by what the coordinator does next, not by how they came out:

| Group | What to do |
| --- | --- |
| Settled from the participant's words | Check that the words say this |
| Needs chart review | Confirm in the medical record. What the participant reported is shown |
| Unresolved | Raised, not settled. Follow up or check the record |
| Not raised in the conversation | Not asked, by design. Check as usual |

Each row shows the criterion's protocol words and plain version, then the finding with inclusion or exclusion applied in words, for that criterion only:

> **L19 · Exclusion** · *Does not apply, by the participant's account*
> **Protocol:** Pregnant · **Plain language:** Is pregnant.
> 39 Are you currently pregnant? · 40 No, I am not pregnant.

Under the finding are every question the agent asked about that criterion and the full reply, with the words the agent read highlighted. A reply that settled the criterion while answering a question about something else is shown too, with that question. Any reading the agent discarded, because its quote was not in the reply, is also shown. The whole conversation is below the groups.

### Where it stops

The review says, for each criterion, what the participant's words establish. It never combines criteria. Every word and number it shows is fixed text, a count of one group, or about exactly one criterion. There is no summary line, no colour or icon for how a row went, and no ordering that puts exclusions that apply first. That ordering would be the most useful one in a real clinic, where one reported exclusion ends a prescreen, and it is also a verdict by position. Nothing in the review can be edited, and there is no place to record a decision.

This is enforced by a test, not by care: `tests/web/review.test.ts` flips every settled finding in 30 real conversations and a made-up one, and requires that nothing change but each row's own finding words. A version of the review that promotes rows by outcome fails it. Another test holds everything the review writes itself to contain no "eligible", "verdict", "score" or "total", and the review's data has no field a decision could go in.

### Augmentation or replacement

The project intent's first open question is whether this argues that an agent helps a coordinator or replaces one. What the evidence here supports:

- **Replacement is not argued.** Replacing prescreening means acting on findings nobody reviews. 0004's agent was confidently wrong on 0.15 of the findings it settled (24 of 163 across all fifteen, from hand labels, with abstention at 0.01). 0009's is wrong on 0.06 (9 of 144), with abstention at 0.06 (see [The screening agent](screening-agent.md)). One settled finding in sixteen is still wrong. The review also makes plain how much it leaves anyway. Across the 15 labelled conversations of 0004's run, 164 of 756 rows (22%) were settled from the participant's words, 342 went to chart review, 19 stayed unresolved and 231 were never raised. Only 61 of the 252 labelled criteria can be settled by a conversation at all, however good the agent is. Slice 0011's parser passes more of those to the agent when it works from a trial's own text (120 of 183 patient facts across the fifteen vignettes, up from 84), but nobody has screened from it yet, so the numbers above are unchanged.
- **Augmentation is argued, and was tested once, by a model.** The test is whether a reader using only the review can see the agent's mistakes. Ten conversations of 0004's run were read blind: v1 and v3 of each labelled study, 107 settled rows, holding 15 findings graded wrong. For each row the question was: does what the participant said, as shown here, say what this row says?

| | Rows | Reader said no |
| --- | --- | --- |
| Graded wrong | 15 | 10 |
| Graded correct | 91 | 1 |

The catches are uneven. Four of the ten are one easy pattern: a criterion for the other sex ("Female patients of childbearing potential must…" for a man), which the agent recorded as not met and the reader rightly questioned. Two were found in the transcript, where a later turn contradicted the row's quote, not in the row itself. In all five misses, the words that show the mistake were in the row. Two were half-hearted agreements the reader took as a yes ("I suppose so, if they need me to"). Two were answers the vignette leaves to the coordinator's judgment ("I could quit if I had to"). One is wrong only against the grade: the denial the vignette scripted before the participant's correction was never said, so on what was said the agent was right, and the count against the question is 10 of 14. The one false alarm was the reader's error. The record is `work/0007-coordinator-review-pane/reading.md`; `npm run review:score` reproduces the numbers.

### What these numbers do not mean

- **The reader was not independent.** It was a Claude model, given only the sheet and the review pages and told to open nothing else. Which model, and at what settings, was not recorded, so this result falls short of the rule that every reported result names them. It is the same kind of model that played the participants and wrote the vignettes, so its blind spots may be theirs. It is not a coordinator. The reading the plan asked for, by a person new to the project, has not been done. The three conversations held back for it went to slice 0009 instead, as the least-seen subset, and none is planned now.
- **Nothing here measures time saved.** The reader recorded 0–1 minutes a conversation, which is a model's reading speed. No comparison with holding the conversation by hand was made, and no real coordinator was involved.
- **It never said "can't tell".** Four of its five misses were judgment calls where a person might have. A model reader answers every question literally.
- **15 wrong findings and one reader** is a sample, not a rate. It shows that the review puts the agent's mistakes on the page where they can be seen. It does not show how often a coordinator would see them.
- **Screened from the parser, the review cannot show what the parser dropped.** It says so at the top, and no parsed conversation was read.
