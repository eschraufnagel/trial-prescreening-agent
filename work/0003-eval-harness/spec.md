# spec: 0003 eval harness

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0003-eval-harness/intent.md`

---

## 1. Summary

A labelled set for five protocols, a matcher, deterministic graders, and committed results. Closes product open question 3.

## 2. Decisions taken before this spec

| # | Decision | Consequence |
| --- | --- | --- |
| D1 | **Recall against labels is the primary metric** — coverage recall after the Gate 2 revision, see §3. Type accuracy second. Self-consistency is a secondary that needs no labels | A missed criterion is a question never asked of a patient, and 0004 cannot notice its absence. Precision failures are visible to a coordinator; recall failures are not. |
| D2 | **Five protocols are labelled** | Roughly 195 criteria by the parser's count. See §4 for which five and what the choice gives up. |
| D3 | **Labels are model-authored against a written annotation guide** (`evals/cases/ANNOTATION.md`) | Superseded the plan for human adjudication. The seven judgment calls raised at Gate 1 turned out to be annotation-convention questions — granularity, semantics, type definitions already fixed in 0002 — not clinical ones, and the adjudicator is a technology leader rather than a clinician, so adjudication was not supplying the independence it was meant to. **The labels are therefore authored by the same party that wrote the extraction prompt, and recall measures prompt-following rather than correctness.** The guide is the mitigation: conventions explicit enough that a second annotator could apply them and the disagreement be measured. That measurement is not in this slice, and until it exists the headline number cannot be called accuracy or compared to published results. |
| D4 | **The gate study is NCT00077350**, not NCT04316364 | Claude had already inspected NCT04316364's parse output during 0002's Gate 2, including the tissue-adequacy type call — so a drafted label set for it would be anchored to the parser's answer. Only summary counts were ever seen for NCT00077350. |

## 3. What is measured

| Metric | Definition | Role |
| --- | --- | --- |
| **Coverage recall** | (matched + merged) ÷ all labels | **Primary.** Whether the output told a coordinator about the requirement, in any form. |
| **Strict recall** | matched ÷ all labels | Always reported beside coverage, never alone. Requires the criterion to be its own object. |
| **Merge rate** | merged ÷ all labels | Requirements captured only inside a bundled criterion. Kept out of recall so granularity failure cannot hide there. |
| **Type accuracy** | matched pairs with the same `type` ÷ matched pairs | Secondary. Answers whether the 0002 schema survives contact with a labeller. |
| Polarity accuracy | matched pairs with the same `polarity` ÷ matched pairs | Cheap, and a polarity error is a criterion read backwards. |
| Precision | matched predictions ÷ all predictions | Reported, not optimized. |
| **Narrative false positives** | predictions whose span falls in `notCriteria` (§5) | The measure nothing in 0002 could produce. Separates "invented a criterion out of procedural prose" from "extracted something the labeller merely worded differently." |
| Self-consistency | criterion-set agreement across runs at differing seeds | Secondary, no labels needed, so it can run over all twelve. |

**Why recall became two numbers (revised at Gate 2).** The first matcher required one prediction per label and reported recall 0.86 on NCT00077350 — yet all five apparent misses sat inside a criterion the parser had returned, bundling two requirements where the guide says two. Nothing was absent: the metric was measuring merge-versus-split disagreement and reporting it as missing content. Coverage answers what a reader assumes recall means; strict recall and merge rate keep the granularity failure visible, which matters because 0004 asks one question at a time and cannot ask half of a bundled criterion.

Coverage is gameable alone — one criterion per protocol would score near 1.0 — so it is never reported without strict recall beside it, and the pair gives the degeneracy away. Coverage uses span *containment* rather than IoU, since IoU punishes the size mismatch a bundled criterion inherently is.

Recall is reported per study as well as pooled. A single pooled number hides that one protocol may be carrying every failure, which is precisely what 0002 found.

## 4. The labelled set

**The five, and why each is in:**

| Study | Extracted in 0002 | What it contributes |
| --- | --- | --- |
| NCT04385368 | 63 | The only known real failure. 46% unclaimed, mixing correctly-skipped narrative with at least one dropped requirement. Without this study the set measures nothing that is known to be hard. |
| NCT03433469 | 49 | The only study where `definitional` fired. Also states one criterion as an alternation over three EGFR mutations, which the matcher must not score as three misses. |
| NCT00077350 | 33 | Cooperative-group prose with embedded justifications, and the heaviest span sharing in the corpus — eleven criteria drawn from sentences another criterion also quotes. This is the study that stresses §6 hardest. |
| NCT06728852 | 29 | No list structure whatsoever. Criterion boundaries exist only in meaning. |
| NCT04316364 | 21 | Short, and contains the tissue-adequacy requirement that must type `protocol` rather than `clinical`. Keeps the set affordable while adding a known type boundary. |

**What this gives up.** NCT00743379 is excluded despite being the corpus's worst-formatted block. It alone yields 114 criteria — more than half the labelling budget — and its difficulty is arm-conditional eligibility across four cohorts, which is an `appliesTo` question rather than a recall question. Excluding it means this slice measures recall on five studies and says nothing about the study most likely to strain `appliesTo`. Recorded here rather than discovered later.

**Labels are authored from the source, never from parser output.** Seeding a label file with what the parser found would make the labels agree with the parser by construction, and every number downstream would be circular. §8 describes the skeleton tool, which splits source text deterministically and never calls a model or the parser — asserted by `tests/boundary.test.ts`, which caught a real violation on its first run.

**Provenance, stated because it limits the claim (D3).** Labels are authored by the same party that wrote the extraction prompt, from source, with no access to any parse, and following `evals/cases/ANNOTATION.md`. Human adjudication was planned and did not survive contact: the contested cases were annotation conventions rather than clinical judgments, and there was no independent party better placed to settle them. **Consequence: agreement between a parse and a label is partly agreement between a prompt and its author, so the resulting recall is not comparable to TrialGPT's 87.3% and must not be described as accuracy against expert judgment.** The README says so. The guide is what makes the conventions arguable rather than tacit; measuring a second annotator against them is the real fix and is not in this slice.

## 5. Label format

One file per study, `evals/cases/labels/<nctId>.json`:

```jsonc
{
  "nctId": "NCT04316364",
  "labelledAt": "2026-09",
  "criteriaTextSha": "<sha256 of the fixture's criteriaText>",
  "criteria": [
    {
      "id": "L1",
      "quote": "Eastern Cooperative Oncology Group (ECOG) performance status 0 or 1",
      "start": 23,
      "end": 90,
      "polarity": "inclusion",
      "type": "clinical",
      "note": "optional, for a judgment call worth defending"
    }
  ],
  "notCriteria": [
    {
      "start": 946,
      "end": 1671,
      "quote": "This consent will cover the study-specific first screening procedures…",
      "why": "procedural narrative about consent timing; asserts no requirement on the participant"
    }
  ]
}
```

**`notCriteria` is the load-bearing half.** It records that a human read a passage and decided it is not a criterion. Without it, an unclaimed span is ambiguous between "the parser missed a requirement" and "the parser correctly ignored narrative" — the exact ambiguity that made 0002's coverage figure useless. With it, a prediction landing there is a measurable false positive, and a label absent from a prediction is a measurable miss.

`criteriaTextSha` pins labels to the protocol text they were written against. A refetch that changes `criteriaText` invalidates the labels loudly rather than silently shifting every offset. A test asserts every label file matches its fixture.

## 6. Matching

The harness's most consequential internal decision. Too loose and recall is flattered; too strict and the parser is punished for splitting a sentence differently than the labeller did — which 0002 showed is a real and legitimate disagreement, one sentence yielding three criteria.

**The rule:**

1. A prediction and a label are *candidates* if their source spans overlap at all.
2. Each candidate pair is scored: `0.6 × span IoU + 0.4 × token overlap of the statement text` (F1 over lowercased content tokens). Span alone cannot separate three criteria sharing one sentence; text alone would match a criterion to a similarly-worded one elsewhere in the block.
3. Pairs are taken in descending score, greedily, each prediction and label used once, with a floor of **0.3** below which a pair is not a match.
4. Unmatched labels are **misses**. Unmatched predictions are **extras**, and an extra whose span lies within a `notCriteria` region is additionally a **narrative false positive**.

**Every matched pair and every unmatched item is written to the result file with its score.** The rule will be wrong in individual cases; what matters is that its mistakes are inspectable rather than buried in an aggregate. If reading the diagnostics shows the floor is misplaced, that is a finding and a plan change, not a quiet constant edit.

Weights and floor are constants in one module with this reasoning beside them. Changing either changes every historical comparison, so results record the matcher version alongside the model settings.

## 7. Architecture

```
evals/
  cases/labels/<nctId>.json     ground truth, hand-authored, committed
  graders/match.ts              §6
  graders/metrics.ts            §3
  runner.ts                     orchestration
  results/<date>-<promptVersion>.json
  results/parses/<nctId>-<promptVersion>-<seed>.json    cached parses
```

**Parses are cached, and that is a correctness requirement rather than a convenience.** 0002 measured a full-corpus run at roughly 45 minutes, degrading about fourfold as it went, with one study blowing a twenty-minute timeout that parsed in 78 seconds alone. So:

- A parse is written to `results/parses/` as soon as it returns, keyed by study, prompt version and seed.
- A run reuses any cached parse matching that key unless `--refresh` is passed.
- A study that fails is recorded as a failure and the run continues. Grading proceeds over what succeeded, and the result says plainly which studies are missing and why.
- Studies are runnable individually.

A run that cannot be resumed after a late failure would make a bad afternoon into a lost one, and would tempt someone to grade whatever subset happened to finish without saying so.

**Results record** model, quantization, temperature, seed, prompt version, matcher version, label-set version, and per-study outcomes. `CLAUDE.md` requires the first four; the rest exist because a number that moved between two runs should be attributable to the thing that changed.

## 8. The labelling workflow

`npm run label:criteria -- <nctId>` emits a skeleton to `evals/cases/labels/<nctId>.json` if none exists.

It splits the normalized source into candidate passages using `src/criteria/normalize.ts` and deterministic punctuation and line-break rules. **It does not call a model and does not read parser output.** Every passage lands in `notCriteria` with an empty `why`, and labelling is the act of promoting passages into `criteria`, splitting a compound passage into several, and writing a reason for each one left behind.

This makes the expensive path the honest one: a passage stays out of the criteria list only when a human has written down why.

## 9. Testing

`tests/` stays deterministic and offline. No test runs the harness against a model.

| Area | Tested with |
| --- | --- |
| Matching | Hand-built pairs: exact, overlapping, three criteria sharing one span, an alternation matched as one, a near-miss below the floor |
| Metrics | Known confusion matrices, including all-miss and all-match edges |
| Label validation | Malformed label files, spans outside the text, `criteriaTextSha` not matching the fixture |
| `notCriteria` accounting | A prediction inside a `notCriteria` span counts once, as both extra and narrative false positive |
| Cache keys | A changed prompt version or seed misses the cache; an unchanged one hits |
| Resumability | A failed study leaves earlier results intact and is named in the output |
| Skeleton tool | Deterministic output for a given input; no model import reachable from it |

## 10. Out of scope

No changes to `src/criteria/` or `src/models/`. No patient vignettes — those are 0004's ground truth, not the parser's. No LLM-as-judge grader: the metrics here are set comparisons against human labels, and adding a model to the scoring path would make the harness's own output non-deterministic in the slice that establishes it. No frontier-model comparison; that is 0007, though §11 notes the argument for pulling a small run forward.

## 11. Open questions

1. **Does a single model's score mean anything without a scale?** Recall of, say, 0.82 against one labeller is a data point with nothing to sit against. TrialGPT's 87.3% is measured on a different corpus with a different task definition and is not a like-for-like comparison. Pulling a small frontier run forward from 0007 would give the number a reference; it also spends money and widens this slice.
2. **Who checks the labeller?** Every number here is agreement with one adjudicator over a drafted set. A second pass over a sample on a different day would bound self-agreement; one fully independent label set, authored without a draft, would bound the drafting bias. The second is the more valuable of the two and is not in this slice.
3. **Does the hallucination check get adversarial cases here or later?** It has never fired in 481 criteria, so nothing establishes it works against a model less willing to copy text.
