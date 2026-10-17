# Plain language

How each criterion gets a plain-language version, and the check that it doesn't change what the criterion requires. Part of the [Trial Prescreening Agent](../README.md) documentation.

## Plain language

Eligibility criteria are written for clinicians. "Platelet count >= 100,000/mm^3", "histologically confirmed NSCLC; cytology alone is not acceptable". Each labelled criterion now has a plain-language rendering, shown under the protocol's words in the tester panel:

> **Protocol:** Patients must have histologically confirmed non-small cell lung cancer (NSCLC); cytology alone is not acceptable
> **Plain language:** Has non-small cell lung cancer (NSCLC) confirmed by examining a tissue sample (histologically); cytology alone (examining cells) is not acceptable.

A rendering is a rewording, not a reframing. It says the same statement in plainer words, keeps every number, comparison, negation and named drug or gene, and never says who can take part: "Pregnant" becomes "Is pregnant", and the panel's polarity tag says it is an exclusion. It is always shown beside the protocol's words, never instead of them.

**The agent never sees a rendering.** It asks and reads from the protocol's words, as it did when it was measured above. A boundary test keeps `src/screening/` from importing the renderings, and the agent's `PROMPT_VERSION` is unchanged.

```
npm run plain:check                 every rendering beside its criterion, with the check's verdict and the counts below
npm run plain:render -- <NCT ID>    remake a study's renderings with the local model (about 3.5 s a criterion)
```

Renderings are made ahead of time by `plain:render`, run by a person, and committed in `data/plain/`. Nothing is generated while the page runs.

### The check

A rendering is shown only if a deterministic check passes it, in `src/plain/check.ts`. The check compares the two texts as text, not meaning:

- every number and unit, both ways; which way each comparison points; whether a time window runs before or after
- the number of negations, including "un-" and "non-"
- every abbreviation, gene, variant and drug name, both ways
- a fixed list of words that change what is required ("active", "prior", "known", "any", "only", "or" …)
- no word about taking part ("you", "eligible", "enrol" …) unless the protocol uses one, and a verdict with a condition ("eligible if…") must be kept

When it refuses, the panel says why:

> **Protocol:** Non-leukocyte-depleted whole blood transfusion within 120 days of genetic sample collection.
> **No plain version: the check found** negations: 1 in the protocol, 0 in the plain

A refused first attempt gets one retry, told what the check found. There is no third try. The word lists live in `src/plain/vocabulary.ts`, and because the check runs whenever renderings are loaded, tightening it changes what is shown without regenerating anything.

The check is tested by breaking every committed rendering it passes, one way at a time, and requiring each broken version to be refused for its own reason: 95 numbers dropped, 71 comparisons flipped, 23 time windows turned round, 46 negations removed, 100 terms swapped, 127 scope words deleted and 230 verdict words added. All 692 are refused. What it cannot see is written down as named tests that expect it to miss: a wrong explanation, a clause dropped that holds nothing it extracts, "and" turned into "or", an ordinary word changed, a negation moved to another clause, and before and after swapped where no time is involved.

### Results

Local model `Qwen3.6-35B-A3B-MLX-8bit` (8-bit), temperature 0, seed 20260921, reasoning off, prompt `e5a58e26c2ac`. Counts from `npm run plain:check` at the commit that adds this section.

| | Criteria |
| --- | --- |
| Labelled criteria | 252 |
| Shown on the first try | 215 |
| Shown after the retry | 15 |
| Not shown | 22 |

Of the 22 not shown, 17 are refused for a negation count, mostly a "not" or "no" inside an explanation, such as "azoospermia (no sperm in the semen)". The prompt asks for explanations without negations; the model does not always comply. The check stays strict because an explanation that adds a negation is exactly what it exists to stop, and every refusal shows its reason.

### The reading

A person who did not write the renderings, the check or the prompt read 49 of them beside their protocol words: all of NCT00077350, which was not used to settle the renderings' format (though two of its refusals were among those behind a later prompt rule), and every rendering elsewhere that passed only on the retry. For each pair, two questions that need no medical knowledge: is anything on the left missing on the right, and does the right add a condition? The record is `work/0006-plain-language/reading.md`.

**Read 49, found 7, of which 3 are now caught by the check.** A permission with a condition ("are eligible if the patient is > 3 weeks post…") had become a requirement ("Has brain metastases…"). Two retries had been pushed into putting back a verdict ("is not eligible") that the statement form rightly drops. The rule built from the first also refused one rendering outside the reading, with the same fault. Three more were missing "are excluded from the study", which is by design: the polarity tag says it. One was a wrong explanation: "IP", an investigational product, explained as "an intervention group". It is still shown, and named as a known gap.

### What these numbers do not mean

- **Nobody on this project has verified the explanations of terms.** That is a clinical question. The check makes sure an explanation takes nothing away and brings in no number, negation or named term; it cannot tell whether "(histologically)" is explained correctly. One wrong explanation was found in 49 read. Another, "allogeneic" explained as a donor "who is not a close relative", is not shown only because the check refused its negation. A check of explanations by an independent, frontier model is planned for slice 0008.
- **The check, its vocabulary and the prompt share an author.** The reading was done by someone else, and it is what found three of the check's faults.
- **A retry can make things worse.** Told that a negation count was wrong, the model more than once satisfied it by changing a criterion's meaning: removing a "not" that belonged there, or adding "would not" three times. Once the check passed the result and it was shown, which is how "un-" and "non-" came to count as negations. The retry is not trusted to be an improvement, only to be checked again.
- **92% shown is not 92% correct.** It is the share the check found nothing wrong with. The reading is the evidence about the rest, and it read 49 of 230.
