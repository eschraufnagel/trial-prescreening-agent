# intent: 0003 eval harness

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. Measure the criteria parser: a labelled set, graders, committed results, and a number in the README that traces to a run. No parser changes to chase a score, no conversation, no UI.

---

## Problem

The product intent says the eval harness is the primary artifact and that the agent exists to give it something to measure. After two slices the repository has the agent and not the harness.

Slice 0002 produced 481 criteria across twelve protocols and **no evidence that any one of them is correct**. The README says so in as many words, because the alternative was to report counts as though they were results. That gap is this slice.

Three things make it more than "write some tests."

**The parser's own signals do not discriminate.** This was measured, not assumed. Source coverage sits at 89-98% for eleven of twelve studies regardless of house style, and the rejection count is zero across all 481 criteria. A parser that silently dropped a third of every block would produce numbers in the same range, which is the definition of a metric that cannot tell good from bad. Whatever this slice measures, it cannot be these.

**The one known failure is exactly the case a cheap metric misses.** NCT04385368 leaves 46% of its text unclaimed. Most of that is procedural narrative the parser was right to skip — ICF signing windows, imaging recommendations, notes to the operating surgeon. At least one is a genuine eligibility requirement it dropped: *"The primary tumor must be deemed resectable by a multidisciplinary evaluation..."*. Nothing computable distinguishes those two cases. A human deciding, once, per criterion, is what makes the difference measurable, and that human judgment is the artifact this slice has to produce.

**A comparison is already on the record.** The product intent cites TrialGPT at 87.3% criterion-level matching accuracy against expert performance of 88.7-90.0%, and frames it as the reference point this project measures itself against rather than a claim it inherits. Measuring against it at all requires criterion-level labels. Without them the README can report that the pipeline runs, which it already does, and nothing else.

## Proposed outcome

**A labelled set.** Hand-authored ground truth for the criteria in some subset of the twelve protocols: for each criterion that a careful reader finds in the source, its span, its polarity, and its type. This is the expensive part and the whole point. 481 criteria is more than can be labelled carefully in one slice, so the subset is chosen deliberately and its selection recorded, the way the corpus itself was in 0001.

**Graders.** Deterministic ones first: recall and precision of extracted criteria against the labels, and type accuracy on the criteria that match. Recall is the number that matters, because a missed criterion is a question never asked of a patient and the screening agent in 0004 cannot notice its absence.

**Committed results.** Under `evals/results/`, each recording model, quantization, temperature, seed and prompt version, so that any number in the README is traceable to a specific run against a specific parse of a specific protocol version.

**A README number that means something.** Replacing the current table of counts with a measured result, including where the parser fails.

**Absent on purpose:** no changes to the parser. If the harness shows the parser is weak, that finding is the slice's output and the fix is a later slice. Editing the thing being measured in the slice that builds the measurement is how a harness gets quietly tuned until it agrees with whatever the parser already does — and `REVIEW.md` has a pass about exactly this.

Also absent: patient vignettes. The roadmap's sixth open question is about hand-authored patient cases tied to criteria, which is what measuring the *screening agent* needs. This slice measures the *parser*, whose ground truth is labelled criteria. The two are different artifacts and conflating them would put 0004's evaluation inside 0003's scope.

## Affected users and systems

**Me, labelling.** The only human in the loop, and the binding cost of the slice. Labelling is slow, and labelling badly produces a harness that measures agreement with a careless reader. How much can be labelled well is a real limit on what this slice can claim.

**The criteria parser, slice 0002.** The subject. It is not modified here.

**The screening agent, slice 0004.** The consumer of this slice's answer. If parser recall is poor, 0004 is building on criteria that are missing requirements, and it needs to know that before it starts rather than after.

**The model comparison, slice 0007.** Runs this harness against two adapters. Whatever shape the results take here, 0007 reads them.

**The local model,** through the existing adapter. Nothing new: `Qwen3.6-35B-A3B-MLX-8bit` at temperature 0, seed 20260921, pinned in 0002.

**Not touched:** no transport, no server, no UI, no changes to `data/trials/`, no changes to `src/criteria/` or `src/models/`.

## Constraints

- **`evals/` is not `tests/`.** Model-dependent, slow, non-deterministic, run on a schedule and before release rather than on every commit. `tests/` stays under a second and offline. The harness's own logic — scoring, matching, reporting — is deterministic and gets tests like anything else.
- **Runs are expensive and degrade.** Parsing all twelve took roughly 45 minutes in 0002, generation slowed about fourfold across the batch, and one study blew a twenty-minute timeout that parsed in 78 seconds alone. The harness has to survive that: parses cached and reusable, studies runnable individually, a failure late in a batch not destroying the earlier results.
- **Results are committed** with model, quantization, temperature, seed and prompt version. A result without them is not a result.
- **The parser is not edited to improve a score.** Any change to `src/criteria/` in this slice is a finding in the PR, not a quiet commit.
- **Labels are a committed artifact, reviewable and arguable.** A label that is wrong should be visible as wrong in a diff.
- **No PHI.** Labels describe published protocol text. Any patient-shaped example is invented.
- **No live network at runtime**, unchanged. The model is local, via the existing adapter.
- **TypeScript strict, Vitest, Node 24**, dependencies still small.

## Open questions

1. **What is the primary metric?** Product open question 3. The evidence from 0002 narrows it: coverage and rejection count are measurably non-discriminating, and the runtime is seed-reproducible, so self-consistency across runs measures the prompt rather than the runtime. Leaning toward recall against labels as primary with type accuracy second, and self-consistency as a cheap secondary that needs no labels. Needs deciding before the graders are written, because it determines how much labelling this slice must afford.

2. **How many studies get labelled, and which?** NCT04385368 is the obvious first, being the only one with a known real failure. Beyond that the choice trades coverage of the corpus against depth of labelling. A set of three carefully labelled protocols may be worth more than eight labelled in a hurry.

3. **What counts as a match between a predicted criterion and a label?** Span overlap, text similarity, or a human adjudicating disagreements. This is the harness's most consequential internal decision: too loose and recall is flattered, too strict and the parser is punished for splitting a sentence differently than the labeller did. 0002 already showed one sentence legitimately yielding three criteria.

4. **Does the hallucination check get tested here?** It has never fired — zero rejections in 481 criteria — so nothing establishes that it works on a model less willing to copy text. Adversarial cases would establish it. Whether that belongs in this slice or a later one is open.

5. **Is a second model needed to make the numbers mean anything?** A single model's score against a single labeller is a data point without a scale. Slice 0007 exists for the comparison, but there is an argument for pulling a small frontier-model run forward so this slice's number has something to sit against.
