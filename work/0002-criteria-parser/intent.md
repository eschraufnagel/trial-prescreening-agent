# intent: 0002 criteria parser

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. Turn a trial's free-text eligibility block into structured criteria, and land the model adapter that does it. No eval harness, no golden set, no conversation, no UI.

---

## Problem

Slice 0001 left twelve protocols on disk with their eligibility text stored byte-for-byte, deliberately uninterpreted. `criteriaText` is a single string per study, between 1.2KB and 16KB, and nothing downstream can do anything with it. The screening agent in 0004 needs to know what to ask about; it cannot ask about a paragraph. The eval harness in 0003 needs criterion-level units to score; there is no criterion-level anything to score yet. The coordinator pane in 0006 needs to show a determination against a named criterion. All three are blocked on the same missing object.

Three things make this harder than "split on newlines."

**The formatting is genuinely inconsistent, and that was the point of the corpus.** Surveying the twelve: some blocks are asterisk bullets, some are numbered, NCT03753685 numbers its criteria with escaped markup that survived into the text (`1\.`), NCT00743379 runs its `a.`/`b.` sub-items inline so a sub-criterion begins mid-sentence, and NCT06728852 and NCT07229729 have no reliable list structure at all. A parser that finds criterion boundaries by looking for list markers will work on half the corpus and silently mangle the rest. Mangled how matters: the failure mode is not a crash, it is two criteria fused into one, which then produces one determination where two were owed.

**Not every sentence in the block is a criterion a patient can be screened against.** The same text carries at least four kinds of statement: things the patient knows (age, prior lines of therapy, whether they can travel), things only a chart or an assay knows (ECOG status, PD-L1 by central testing, lab values), definitional clauses that scope a term used elsewhere rather than asserting anything about a person, and protocol constraints addressed to the site rather than to the participant. NCT04316364 requires adequate tissue for central PD-L1 testing without requiring any particular result — a logistical requirement wearing biomarker vocabulary. NCT03377023 branches its inclusion criteria by study arm, so a criterion is conditional on which part of the study the patient would enter. Flattening all of this into a list of inclusion and exclusion strings throws away exactly the distinctions 0004 needs to decide what to put in front of a person.

**This is the first model use in the project, so the boundary questions become real.** `src/models/` has been an entry in the layout and a promise in `CLAUDE.md`; here it becomes code that something depends on. It is also the first thing under `src/` that opens an HTTP connection, to a local model runtime, which `tests/trials/boundary.test.ts` currently forbids for everything reachable from `src/`. That test was written to be argued with rather than loosened, and this slice is where the argument happens.

## Proposed outcome

**A criteria schema.** One TypeScript type describing a parsed criterion, closing open question 2 with a decision recorded rather than a default taken. It carries at minimum: the source text span it came from, whether it is inclusion or exclusion, a category, and enough structure for 0004 to decide whether to ask a patient about it. The two live sub-questions — whether patient-answerability is a model output or derived from category, and whether a `type` field is needed to separate genuine patient criteria from definitional clauses and protocol constraints — get answered in `spec.md` with reasons, because both answers have downstream cost. Deriving answerability from category is cheaper to evaluate and harder to get right; asking the model for it directly is one more thing that can be wrong per criterion.

**A parser.** `parseCriteria(trial): ParsedCriteria` in `src/criteria/`. Takes a `Trial` from the loader, returns structured criteria. Deterministic pre-processing (normalizing the escaped markup and line endings that 0001 deliberately left alone) is separable from the model call and testable without a model. Every criterion keeps a pointer back into the original text, so a coordinator in 0006 can see the sentence the system read, and so a disagreement in 0003 can be adjudicated against the source rather than against the parse.

**A model adapter.** `src/models/`, the only place in the project that calls a model. An interface narrow enough that slice 0007 swaps a frontier model in by configuration, and a local implementation speaking to an OpenAI-compatible endpoint. It records model name, quantization, temperature and seed on every call, because `CLAUDE.md` says a result without them is not a result, and this is the slice that makes that enforceable rather than aspirational.

**A pinned local model,** closing open question 4. Candidate is a quantized 30B-class model via MLX. Pinning it means a name, a quantization, a temperature and a seed committed to the repository, and a note on what it takes to run it. Slice 0007's comparison is meaningless if the local side of it was never pinned.

**A decision about the network boundary,** written down. `src/models/` talks to localhost over HTTP. The product constraint is that the application makes no live *network* calls — no dependency on a remote service at runtime — and a model runtime on the same machine is arguably not that, but "arguably" is not a test. Either the boundary test gets a narrow, justified exception for the adapter, or the adapter goes somewhere the test does not reach. This is settled in `spec.md` before code, not discovered during implementation by watching a test go red.

**Absent on purpose:** no eval harness, no golden set, no graders, no committed run output. The temptation here is to measure the parser in the same slice that writes it, and the reason not to is that a parser and its scoring written by the same hand in the same sitting agree with each other by construction. 0003 builds the measurement against a parser that already exists and cannot be quietly reshaped to score well. Whatever this slice learns about how to measure the parser is written down for 0003 rather than acted on.

## Affected users and systems

**Me, deciding whether the parse is any good.** Until 0003 exists there is no harness, so the only judgment available is reading parser output against the source text by hand. That reading is the real gate in this slice, and it is also the first honest test of whether the corpus is hard enough. `work/ROADMAP.md` carries this forward from 0001: if the parser handles all twelve comfortably, suspect the corpus before believing the parser.

**The screening agent, slice 0004.** The parser's real consumer and the reason the schema is a decision rather than a detail. It needs to know which criteria to raise with a patient, which to mark as requiring chart review, and which are not questions at all.

**The eval harness, slice 0003.** Scores this output, and needs criterion-level units stable enough to compare across runs. Non-determinism matters here: the same block parsed twice may not produce the same criteria, and whether that instability is measured or suppressed is 0003's call, not this slice's.

**The model comparison, slice 0007.** Depends on the adapter interface being narrow and on the local model being pinned. Both are produced here.

**A local model runtime,** over an OpenAI-compatible HTTP endpoint on this machine. Started by a person, not by the application.

**Not touched:** no transport, no server, no UI, no changes to the fixtures. `data/trials/` is read-only to this slice.

## Constraints

- **No PHI.** No patient data appears in this slice at all; the inputs are published protocols. Any example in a test or doc comment is protocol text or invented.
- **No live network calls at runtime.** The local model endpoint is the one thing in tension with this, and resolving that tension explicitly is part of the slice rather than a side effect of it.
- **No model-dependent assertions in `tests/`.** `tests/` stays deterministic and under a second. Normalization, schema validation and the adapter's request construction are testable there; what the model returns is not. The adapter is faked in tests, and the fake is part of the deliverable.
- **Nothing outside `src/models/` calls a model.** Asserted by a test in this slice, the same way the network boundary was asserted in 0001. This is the slice that owes that test.
- **Dependencies stay small.** A model client library is a plan-level decision. The endpoint is OpenAI-compatible and Node has `fetch`, so the default is no new runtime dependency unless `spec.md` argues for one. Schema validation of model output is the one place where a library may genuinely pay for itself, since parsing untrusted JSON from a model is a different problem from validating a fixture written by our own script.
- **Criteria text is not edited.** If the parser trips on a study's formatting, the fix is in the parser. Normalization happens in memory, never written back to `data/trials/`.
- **TypeScript strict, Vitest, Node 24**, per `CLAUDE.md`.
- **Results record model, quantization, temperature and seed.** Anything reported from this slice carries all four.

## Open questions

1. **Is patient-answerability a model judgment or a derived property?** Deriving it from category is deterministic, cheap to evaluate and auditable, but categories are coarse and the mapping will be wrong at the edges. Asking the model adds a per-criterion failure mode that 0003 then has to measure separately. Leaning derived, with the category as the model output, but this is a schema decision that 0004 inherits and should be argued in `spec.md`.

2. **Does the schema need a `type` field?** The block contains patient criteria, chart-dependent criteria, definitional clauses and site-facing protocol constraints. Whether those are four values of one field, an orthogonal flag, or something 0004 derives is unresolved. The cost of getting it wrong is a reshape in 0004 with the harness already pinned to the old shape.

3. **Where does the model adapter sit relative to the network boundary test?** Exception in the test, or code outside `src/`. Both are defensible and the choice is permanent in practice, since 0004 through 0007 all import it.

4. **How is criterion identity established across runs?** 0003 wants to compare two parses of the same block, which requires knowing that a criterion in run A is the same criterion as one in run B. A source-text span may be enough, or may not survive normalization. Noted here because the schema decision constrains the answer, even though the problem belongs to 0003.

5. **How is arm- and phase-conditional eligibility represented?** NCT03377023 has separate inclusion sets per arm. Options are to flatten and lose the condition, to parse per arm, or to attach the condition to the criterion. This is one study in twelve, which argues for the cheapest thing that does not lie about the source.

6. **Does the parse happen once per trial, or once per criterion?** A 16KB block in one call risks truncation and degraded attention at the end of the block; chunking risks losing the context that makes a clause interpretable. This is a plan-level decision with a real effect on both cost and quality.
