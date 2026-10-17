# The criteria parser

How a trial's eligibility text is turned into a checklist, how that is measured against hand labels, and where it fails. Part of the [Trial Prescreening Agent](../README.md) documentation.

## The criteria parser

`parseCriteria(trial, adapter)` in `src/criteria/` splits an eligibility block into individual criteria, each classified as one of four kinds and carrying the span of registry text it came from.

| Type | Meaning |
| --- | --- |
| `patient` | Who the participant is, what was done to them or by them, and what they will agree to: treatments, medications, surgery, vaccines, other studies, drug allergies, pregnancy, consent. Even when a chart also records it |
| `clinical` | A condition, diagnosis, symptom, test result or clinician's assessment. Even when the participant knows it |
| `definitional` | Defines a term used elsewhere; asserts nothing about a person |
| `protocol` | Addressed to the site, not the participant |

Whether a criterion is patient-answerable is derived from its type by a function, not stored — so it cannot drift out of sync with the classification.

Until slice 0011 the two were told apart by who could answer: a chart, or the participant. Most prior treatments fit both, and the model sided with the chart. The labels had followed the rule in the table all along, unwritten. It's now in the prompt and in `evals/cases/ANNOTATION.md`, where the 7 of 198 labels it contradicts are listed.

The model is asked for a verbatim quote rather than character offsets, and the parser locates that quote in the source itself. A quote that does not occur is a hallucination, and the criterion is rejected with its text recorded rather than quietly kept. Tests built from the corpus's own traps show the check fires (`tests/criteria/adversarial.test.ts`), and in 0011 it fired on two real parses: a quote with an extra space, and one stitched from two criteria. **One loosening, in 0015.** A long protocol nests criteria under a heading ("Recent or ongoing serious infection including the following:", then a numbered list), and the model sometimes quotes the heading and one item as one string. Both halves are in the source, but the joined string isn't, so the check used to reject it. It now accepts such a quote only when the source has exactly that layout:
- the heading is a whole line ending in its colon;
- the item starts a line;
- the item is inside the heading's list, indented deeper, before the list ends.

The criterion is then located at the item, and the heading is kept beside it as `heading`. Anything else is still rejected: a heading from elsewhere, an item from another list, an altered half, a skip from one item to a later one, a colon partway along a line. Three shapes that may be honest are refused on purpose until one is seen: a heading that is only the tail of its line, an inline sub-item ("… b. AST …"), and a sub-list that isn't indented. `tests/criteria/adversarial.test.ts` pins each of these. The check still checks the quote, not the criterion's `text`, which is what the agent reads. A faithful quote with its meaning reversed passes, and no check catches that. Truncated output is a hard failure, never a short parse. What no criterion claimed is reported as `unclaimed`.

To run it against a study, with a local model serving an OpenAI-compatible endpoint:

```
cp .env.example .env    # then set OMLX_API_KEY
npm run parse:criteria -- NCT04316364
npm run parse:criteria -- --all
```

The adapter in `src/models/` is the only code that calls a model, and it may only address this machine — `tests/boundary.test.ts` fails on a non-loopback host.

## What the harness measures

Five of the twelve protocols are labelled by hand: every criterion a reader found, and every passage they decided was *not* a criterion, with a written reason. That second half is what makes recall measurable — without it, text the parser did not claim is ambiguous between a missed requirement and correctly-ignored narrative.

```
npm run eval                        every labelled study, reusing cached parses
npm run eval -- NCT04385368         one study
npm run eval:inspect -- NCT04385368 evals/results/parses/<file>.json
npm run eval:compare -- <before.json> <after.json>   0011's bar, pooled, dev and held back
```

Parses are committed under `evals/results/parses/`, and `npm test` re-grades every committed result from them, so each number below can be checked from a fresh clone.

### Results

`Qwen3.6-35B-A3B-MLX-8bit` via oMLX 0.6.4, temperature 0, seed 20260921, prompt `73c3b301c4a9`, matcher v2. Committed in full under `evals/results/`.

| Study | Labels | Coverage recall | Strict recall | Merge rate | Precision | Type accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| NCT00077350 | 37 | 1.00 | 0.86 | 0.14 | 0.97 | 0.88 |
| NCT03433469 | 73 | 1.00 | 0.66 | 0.34 | 0.98 | 0.83 |
| NCT04316364 | 24 | 1.00 | 0.88 | 0.13 | 1.00 | 0.90 |
| NCT04385368 | 74 | 0.78 | 0.76 | 0.03 | 0.89 | 0.66 |
| NCT06728852 | 44 | 1.00 | 0.64 | 0.36 | 0.97 | 1.00 |
| **pooled** | **252** | **0.94** | **0.73** | **0.20** | **0.95** | **0.82** |

**Coverage recall** asks whether the output told a coordinator about a requirement in any form. **Strict recall** additionally requires the criterion to be its own object. **Merge rate** is the gap: requirements captured only inside a bundled criterion. Coverage is reported never without strict recall beside it, because coverage alone is gameable — one criterion per protocol would score near 1.00 on it and near zero on the other.

### After slice 0011

Same model and settings, matcher v2. The prompt changed from `73c3b301c4a9` to `e1e694b399d4`: the written type rule, one boundary case, and an invented worked example. `normalize()` also stopped leaving `\^` and `\&` in what the model reads. The "before" is 0003's prompt run on that corrected input (`evals/results/02-73c3b301c4a9.json`). The "after" is the frozen prompt (`evals/results/03-e1e694b399d4.json`).

| Study | Coverage recall | Strict recall | Merge rate | Precision | Type accuracy |
| --- | --- | --- | --- | --- | --- |
| NCT00077350 | 1.00 → 1.00 | 0.86 → 0.73 | 0.14 → 0.27 | 0.97 → 0.96 | 0.78 → 0.89 |
| NCT03433469 | 1.00 → 1.00 | 0.66 → 0.96 | 0.34 → 0.04 | 0.98 → 0.97 | 0.85 → 0.91 |
| NCT04316364 | 1.00 → 1.00 | 0.88 → 0.88 | 0.13 → 0.13 | 1.00 → 1.00 | 0.90 → 0.90 |
| NCT04385368 | 0.97 → 0.69 | 0.88 → 0.55 | 0.09 → 0.14 | 0.78 → 0.91 | 0.58 → 0.85 |
| NCT06728852 | 1.00 → 1.00 | 0.64 → 0.64 | 0.36 → 0.36 | 0.97 → 0.97 | 1.00 → 1.00 |
| **pooled** | **0.99 → 0.91** | **0.77 → 0.74** | **0.22 → 0.17** | **0.90 → 0.96** | **0.78 → 0.91** |

- **The collapse toward `clinical` is mostly fixed.** `patient` typed `clinical` went from 25 to 9. Two of the 9 are labels the written rule itself contradicts.
- **Reach rose from 72 to 120 of 183 patient facts** (84 with 0003's parse). Reach is how many patient facts in the fifteen vignettes reach the agent as something the person can settle. It's computed from the parse with no conversation.
- **It didn't generalize much.** The prompt was tuned on NCT04385368 and NCT00077350. On the other three, `patient`→`clinical` went only from 7 to 6. Those three were also parsed at the final prompt before it was frozen, by a scripting mistake, and their summary numbers were seen; they weren't used to change it.
- **It costs coverage on NCT04385368.** That study now misses 23 labels, against 2 before: 13 site obligations, 6 clinical criteria and 4 definitions. **The fix itself is on NCT00077350's bundling:** its merge rate rose from 0.14 to 0.27.
- **The dangerous direction:** 3 `clinical` criteria were typed `patient`, which lets the agent settle them from the person's words. Two of the three were already typed that way before.

**One run of the long protocol is not a measurement.** NCT04385368, given byte-identical input five days apart, came back with 42 of its criteria different: 16 misses in 0003, 2 in 0011's re-run. Three same-day repeats of the final prompt were identical. So either the runtime changed in between, or its output depends on something it doesn't report. The dropped site requirements 0003 reported were largely one unlucky parse. Differences of a few type errors on one study can come from any change to its input: the four-character `\^` fix alone moved NCT00077350 from 2 to 6. Every number here is one run, or three for NCT04385368.

`work/0011-parser-fixes/plan.md` records each prompt version and each gate.

### What the numbers do not mean

**This is not accuracy against expert judgment, and it is not comparable to published criterion-matching results such as TrialGPT's 87.3%.** The labels were written by the same party that wrote the extraction prompt, so agreement between a parse and a label is partly agreement between a prompt and its author. Human adjudication was planned and abandoned when the contested cases turned out to be annotation conventions rather than clinical judgments. `evals/cases/ANNOTATION.md` makes the conventions explicit enough to argue with; measuring a second, independent annotator against them is the real fix and has not been done.

Three of the five label sets were written by a drafter who had already seen that study's parser output. Each label set records this in its `provenance` block.

### Where the parser fails

As of slice 0011's prompt:

- **It drops much of the longest protocol.** NCT04385368 misses 23 of 74 labels, mostly site obligations such as *"normal appearing lymph nodes must be biopsied or removed"*, and 6 clinical criteria, including that the tumour be deemed resectable by a multidisciplinary team. How much it drops varies between runs of that study.
- **Some exposures are still typed `clinical`**, mostly in NCT03433469: current antibiotics, prohibited medications, drug hypersensitivity.
- **It bundles requirements that the guide splits**, at a pooled merge rate of 0.17, up to 0.36 on one study. The content is captured; the packaging is wrong. That matters because the agent asks one question at a time and can't ask half of a bundled criterion.
