# plan: 0003 eval harness

**Intent:** `work/0003-eval-harness/intent.md` · **Spec:** `work/0003-eval-harness/spec.md`
**Branch:** `0003-eval-harness` (from `main` at `a0ee49a`)

---

## Context

Slice 0002 produced 481 criteria across twelve protocols and no evidence that any one is correct. Its own signals were measured and cannot serve: source coverage sits at 89–98% for eleven of twelve studies whatever their formatting, and the rejection count is zero across all 481. A parser silently dropping a third of every block would score the same.

The product intent calls the eval harness the primary artifact and says the agent exists to give it something to measure. This is that slice.

Decisions already taken (spec §2): **recall against hand labels is the primary metric**, type accuracy second, self-consistency a label-free secondary; **five protocols get labelled** — NCT04385368, NCT03433469, NCT00077350, NCT06728852, NCT04316364.

Outcome: a labelled set authored from source, a matcher whose disagreements are inspectable, deterministic graders, committed results, and a README number that traces to a run.

**The scarce resource is the owner's labelling time, not compute.** The stage order exists to get the labelling tool into their hands first and keep it unblocked while the rest is built.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at |
| --- | --- | --- |
| **A. Label format and skeleton tool** | 1–4 | **Gate 1** |
| **B. Matcher and graders** | 5–8 | **Gate 2** |
| **C. Runner, caching, results** | 9–12 | no gate |
| **D. Full run, README, PR** | 13–15 | PR |

**Gate 1 — is the label format workable, and does the skeleton split usefully?**
Claude drafts **NCT00077350** from source and the owner adjudicates it end to end (spec D3, D4), and says whether the format survives contact with a real protocol: are `criteria` and `notCriteria` the right two buckets, is `why` worth writing per passage, does the splitter produce passages a human wants to promote rather than repair?

Why it guards the next stage: the other four studies are roughly 175 more criteria of the same work. A format change after they are labelled means re-labelling by hand, and it is the one cost in this slice that cannot be re-spent. Everything downstream — matcher, graders, results schema, README — reads this format.

Requires the owner: nothing further. **Closed 2026-09 without adjudication**, and the reason matters: the seven calls put to them were annotation conventions, not clinical judgments, and they are a technology leader rather than a clinician. Asking them to arbitrate `A and B is one criterion or two` was a mis-framing on Claude's part.

Adjudication was the mechanism supplying independence, so its removal is a real loss recorded as spec D3. The substitute is `evals/cases/ANNOTATION.md`: the conventions written down and applied mechanically, so the labels are reproducible and arguable rather than resting on in-the-moment taste. Seven criteria cite the rule that decided them.

Applying the guide changed three of the seven from the first draft — a clarifying clause merged into its criterion, a two-threshold haematology requirement split, and a five-condition cardiopulmonary list split — taking NCT00077350 from 33 criteria to 37.

The format itself held: two buckets were enough, every span sliced back out, and the one thing that broke was the splitter hiding a short criterion, which is fixed and pinned by a test.

*Changed from the approved plan.* The gate study was NCT04316364 and the labels were to be authored from scratch. Both moved: labelling is now model-drafted and human-adjudicated to cut the human cost, and the gate study moved because Claude had already read NCT04316364's parse output during 0002 — a drafted label set for it would be anchored to the answer. Spec §2 and §4 carry the reasoning and the cost.

**Gate 2 — is the matcher calibrated, or is it manufacturing the answer?**
Run the matcher over NCT04316364's labels against a cached 0002 parse and **read every pair and every unmatched item by hand**. The questions are whether the 0.3 floor admits junk or rejects real matches, whether `0.6 × IoU + 0.4 × token overlap` orders candidates sensibly, and whether three criteria sharing one sentence are separated correctly.

Why it guards the next stage: the matcher decides every number this project will publish. A floor set too low inflates recall; set too high it invents misses. Stage C grades four more studies and Stage D puts a number in the README — both worthless if the rule is wrong, and neither can detect it, because a miscalibrated matcher produces plausible numbers. This is the one place where being wrong is invisible in the output.

Requires the owner: reading the diagnostics for one study. This is the judgment the slice exists to get.

### Steps

Each step is one commit.

**Stage A — label format and skeleton tool**

1. `evals/cases/types.ts` — `LabelSet`, `LabelledCriterion`, `NotCriterion`, reusing `CriterionType` and `CriterionPolarity` from `src/criteria/index.ts` rather than redeclaring them. A `LabelError` in the shape of `TrialFixtureError` (context + collected problems).
2. `evals/cases/load.ts` — reads and validates a label file, hand-written in the style of `src/trials/validate.ts`: every problem collected, spans checked against the fixture, `criteriaTextSha` compared to the fixture's actual text. A stale label set fails loudly rather than shifting every offset silently.
3. `scripts/label-criteria.ts` + `npm run label:criteria` — emits the skeleton. Splits normalized text via `normalize()` from `src/criteria/` plus deterministic line-break and sentence rules; every passage starts in `notCriteria` with an empty `why`. **Imports nothing from `src/criteria/parse.ts` or `src/models/`**, so labels cannot be seeded from parser output. Refuses to overwrite an existing label file.
4. Tests for 1–3: validation faults, sha mismatch, deterministic splitting, and an assertion that the skeleton tool's module graph does not reach a model or the parser — the same walk `tests/boundary.test.ts` already uses.

→ **Gate 1**

**Stage B — matcher and graders**

5. `evals/graders/match.ts` — spec §6. Candidate pairs from any span overlap, scored `0.6 × span IoU + 0.4 × token F1`, greedy descending, floor 0.3, each item used once. Weights and floor are named constants with the reasoning beside them, plus a `MATCHER_VERSION` recorded in results.
6. `evals/graders/metrics.ts` — recall, precision, type accuracy, polarity accuracy, narrative false positives, per study and pooled.
7. Tests for 5–6: exact match, partial overlap, three criteria sharing one span, an alternation matched as one rather than three misses, a near-miss below the floor, a prediction inside `notCriteria`, and the all-miss and all-match edges.
8. `scripts/inspect-match.ts` + `npm run eval:inspect` — prints every pair with its score and every unmatched item, for reading at Gate 2. Reads a cached parse and a label file; calls no model.

→ **Gate 2**

**Stage C — runner, caching, results**

9. `evals/runner.ts` — orchestration. Parses via the existing `parseCriteria(trial, adapter)`, grades, writes results. Per-study results written as each completes.
10. Parse cache: `evals/results/parses/<nctId>-<promptVersion>-<seed>.json`, reused unless `--refresh`. A study that fails is recorded and the run continues; the result names what is missing and why. This is a correctness requirement, not a convenience — 0002 measured a 45-minute corpus run degrading fourfold with a late timeout.
11. `scripts/run-eval.ts` + `npm run eval` — runs the labelled five by default, `--all` for the self-consistency secondary over all twelve, `--study <id>` for one.
12. Tests for 9–11 with `FakeModelAdapter`: cache hit and miss on changed prompt version or seed, a failed study leaving earlier results intact and named in the output, resumability.

**Stage D — full run, README, PR**

13. Run the harness over the five labelled studies. Commit results to `evals/results/`.
14. README: replace the 0002 count table with the measured result, per study and pooled, including where the parser fails. Update `CLAUDE.md` verification table and `work/ROADMAP.md` — mark 0003 done, close open question 3, record what the numbers were.
15. Reconcile `plan.md`, run the five `REVIEW.md` passes, open the PR.

---

## What changed during implementation

| Change | Why |
| --- | --- |
| Labels became model-authored against a written guide, not human-adjudicated (spec D3) | The contested cases were annotation conventions, not clinical judgments, and there was no independent party better placed to settle them. Costs the slice its independence; `ANNOTATION.md` is the mitigation and the README states the limit. |
| Gate study moved from NCT04316364 to NCT00077350 (spec D4) | Claude had already read NCT04316364's parse during 0002. |
| Recall became three numbers: coverage, strict, merge rate (spec §3) | Gate 2 found the one-to-one matcher reporting recall 0.86 while every apparent miss sat inside a criterion the parser had returned. It was measuring merge-versus-split and calling it missing content. |
| Coverage uses span containment, not IoU | IoU punishes the size mismatch a bundled criterion inherently is: one prediction spanning a 1213-character bullet scored 0.06 against a 43-character label it fully contained. |
| `provenance` added to the label format | Whether the drafter had seen a study's parse varies per study and bounds what the numbers mean. |
| The skeleton's length floor lowered, and its heading rule taught to look for list markers | Both were hiding real criteria from the labeller — `Hemoglobin >= 9 g/L`, and four criteria that end in a colon while introducing their exceptions. A label set that omits a criterion charges the parser a false positive for finding it. |
| Committed results trimmed to diagnostics rather than the full matching | 343KB of mostly-correct pairs nobody reads. Full diagnostics stay reproducible from the cached parse. |
| Rule 1 of the annotation guide gained a split/keep line | Drafting NCT06728852 showed the rule as first written cutting too finely. |

Not changed: `src/criteria/` and `src/models/`. A normalization gap found during Stage C (`\^` is not unescaped) was recorded in `work/ROADMAP.md` rather than fixed here.

---

## Files that change

**New:** `evals/cases/{types,load}.ts`, `evals/cases/labels/*.json` (hand-authored), `evals/graders/{match,metrics}.ts`, `evals/runner.ts`, `evals/results/**`, `scripts/{label-criteria,inspect-match,run-eval}.ts`, `tests/evals/*.test.ts`.

**Modified:** `package.json` (three scripts, no dependencies), `README.md`, `CLAUDE.md`, `work/ROADMAP.md`, `tests/boundary.test.ts` (extend the walk to the labelling tool).

**Untouched:** `src/criteria/`, `src/models/`, `src/trials/`, `data/trials/`. Any change under `src/` in this slice is a finding in the PR, not a quiet commit — the parser is not edited in the slice that builds its measurement.

---

## Reused rather than rebuilt

- `normalize()` and `toSourceSpan()` from `src/criteria/normalize.ts` — the skeleton tool splits the same normalized text the parser reads, so label offsets and prediction offsets are in the same coordinate system.
- `parseCriteria(trial, adapter)` and `OmlxAdapter` — the runner constructs no model access of its own.
- `FakeModelAdapter` from `src/models/` — already shipped in `src/` for exactly this.
- `getTrial`/`loadTrials` from `src/trials/`.
- The error shape from `src/trials/types.ts`: context line plus every problem found.
- The module-graph walk in `tests/boundary.test.ts`, extended rather than copied.

---

## Toolchain constraints

Unchanged from 0002 and already bitten once each: `exactOptionalPropertyTypes` (conditional spread, never `field: undefined`), `noUncheckedIndexedAccess` (every index is `T | undefined`), `verbatimModuleSyntax`, ESM `.js` specifiers, no new dependencies.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Labelling proves slower than expected and stalls the slice | Gate 1 uses the shortest study, so the cost is known after one. If it is worse than expected, cutting from five to three is a plan change made with evidence, not a surprise at the end. |
| The matcher is miscalibrated and nobody notices | Gate 2 exists for this, and it is read by hand rather than asserted. Every pair and score goes in the result file so a later disagreement is inspectable. |
| Labels drift from the fixtures after a refetch | `criteriaTextSha` per label file, asserted by a test. |
| A parse fails late in the run and the result silently covers four studies | Per-study results, failures named in the output, `npm test` covering the resume path. |
| The number has nothing to sit against | Real and unresolved (spec §11). Recall of 0.82 against one labeller is a data point without a scale. Flag it in the README rather than implying a comparison with TrialGPT that is not like-for-like. |
| Labeller self-agreement is unmeasured | Out of scope here, recorded as an open question. Worth a second pass over a sample in a later slice. |

---

## Proof

- `npm test` — deterministic, offline, still fast. New tests per spec §9.
- `npm run typecheck`, `npm run lint` — clean.
- Boundary: `tests/boundary.test.ts` extended so the labelling tool cannot reach a model or the parser, with a detector proof that fails when it does. A skeleton seeded from parser output would make every number circular, so this is asserted rather than trusted.
- Gate 1: one study labelled by hand, start to finish.
- Gate 2: matcher diagnostics for that study read pair by pair.
- Stage D: `npm run eval` over five studies, results committed, README numbers matching the committed run exactly.
