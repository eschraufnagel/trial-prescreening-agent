# plan: 0002 criteria parser

**Intent:** `work/0002-criteria-parser/intent.md` · **Spec:** `work/0002-criteria-parser/spec.md`
**Branch:** `0002-criteria-parser` (from `main` at `e86dc9b`)

---

## Context

Slice 0001 left twelve NSCLC protocols on disk with `eligibility.criteriaText` stored byte-for-byte and deliberately uninterpreted. Nothing downstream can use a paragraph: 0004 can't ask a patient about it, 0003 has no criterion-level unit to score, 0006 has no named criterion to cite. This slice produces that unit.

It is also the project's first model use, so `src/models/` becomes real code here, and it is the first thing under `src/` that opens a socket — which `tests/trials/boundary.test.ts` currently forbids outright. That test was written to be argued with rather than loosened.

Decisions already taken (spec §2): the model emits a criterion `type` and answerability is derived from it in code; the adapter stays under `src/` behind a loopback-only exception; the API key comes from `OMLX_API_KEY` with a valueless committed `.env.example`; the local model is oMLX 0.6.4 serving `Qwen3.6-35B-A3B-MLX-8bit` at `http://127.0.0.1:8000/v1`.

Outcome: `parseCriteria(trial, adapter)` returns structured criteria, each traceable to a span of the original registry text, with an explicit account of what it rejected and what it failed to claim. No measurement of whether the parse is *correct* — that is 0003, deliberately.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at |
| --- | --- | --- |
| **A. Adapter and boundary** | 1–6 | **Gate 1** |
| **B. Deterministic core** | 7–11 | no gate |
| **C. Prompt and parser** | 12–15 | **Gate 2** |
| **D. Recorded fixtures and docs** | 16–18 | PR |

**Gate 1 — does oMLX actually give us a reproducible run?**
Decides whether `seed` in `ModelRunMetadata` is a real pin or decoration, and whether the adapter can rely on `response_format: json_object`. Run the same request twice with the same seed and diff; then repeat with `response_format` omitted to see whether the endpoint requires the prompt to carry the JSON instruction instead.

Why it guards the next stage: `CLAUDE.md` requires a seed on any reported result, and 0003's self-consistency metric (product OQ3) means something different depending on the answer. With a working seed, run-to-run variance is a property of the prompt; without one it is a property of the runtime and cannot be separated from it. Building stage C's prompt and then discovering the runtime is non-deterministic means 0003 inherits a metric it cannot compute. Cost of being wrong: 0003's primary metric.

Requires the owner: oMLX running, and `OMLX_API_KEY` in a local `.env`.

**Answered, 2026-09.** oMLX 0.6.4, `Qwen3.6-35B-A3B-MLX-8bit`.

- **`seed` pins the sample.** Five consecutive runs at temperature 1.5 with seed 42 produced byte-identical output; seeds 43 and 44 each produced something different. The pin is real, and `SEED` in `src/models/omlx.ts` means what it says.
- **`temperature` reaches the sampler.** Established before trusting the seed result. A first probe found every run identical across temperature 0 and 0.8 and across differing seeds, which would equally have been explained by the runtime ignoring both parameters. It was not: at temperature 1.5 on a high-entropy prompt, output diverges. The extraction task is simply peaked enough that 0.8 still lands on the greedy path — a useful thing to know about this corpus, and the reason the first probe was not taken at face value. Response caching was ruled out separately: repeat calls cost a full ~7s each.
- **`response_format: json_object` is required, not optional.** With it, the model returns clean JSON immediately. Without it, this model emits a `"Thinking Process:"` preamble and reasons in prose — in the probe it burned 400 output tokens without reaching an answer and stopped on `length`. Stage C's prompt cannot rely on instruction alone, and the adapter keeps asking for the format.
- **Rough cost:** ~7s and ~91 output tokens for a 1.2KB block. The 16KB block is the one to watch at Gate 2.

Consequence for 0003: run-to-run variance is attributable to the prompt, so self-consistency is a usable metric rather than a measurement of the runtime.

**Gate 2 — is the corpus genuinely hard, and is this parse worth building 0003 on?**
First real parse of all twelve. Read NCT00743379 (inline `a.`/`b.` sub-items) and NCT06728852 (no list structure) by hand against the source text, and look at `unclaimed` spans and the rejection rate across the set.

Why it guards the next stage: no test can answer this, and `work/ROADMAP.md` carries it forward from 0001 explicitly — *if the parser handles all twelve comfortably, suspect the corpus before believing the parser.* Stage D commits recorded model responses that become test fixtures, and 0003 then builds a harness around this output shape. A soft corpus inflates every number this project later reports. Cost of being wrong: the eval harness measures a parser against a corpus that flatters it, and the README reports it.

Requires the owner: reading two parses against their source. This is the judgment the slice exists to get.

**Answered, 2026-09.** All twelve parsed. `Qwen3.6-35B-A3B-MLX-8bit`, temperature 0, seed 20260921, prompt `73c3b301c4a9`.

| | |
| --- | --- |
| Criteria extracted | 481 across twelve studies |
| Rejected | **0** |
| Source coverage | 89-98% on eleven; **NCT04385368 at 51%** |

- **The corpus is not hard on the axis it was built for.** Eleven of twelve sit at 89-98% regardless of house style — asterisk bullets, escaped `1\.` numbering, inline `a.`/`b.` sub-items, or no list structure at all. NCT00743379, the worst-formatted block, produced 114 criteria correctly segmented across four drug-combination cohorts. Formatting variance no longer discriminates, so a thirteenth awkwardly-formatted protocol would buy nothing.
- **Both deliberate near-misses were caught.** NCT00966472 mentions EGFR only as prior therapy, and it came back an exclusion rather than a gating inclusion. NCT04316364's tissue-adequacy requirement typed as `protocol` rather than `clinical`, which is the boundary case §6.7 states.
- **Zero rejections in 481 criteria means the quote-location safety net has never fired in anger.** That is evidence about the model's willingness to copy text, not about the corpus. Stressing it needs adversarial cases in `evals/`, not more protocols.
- **NCT04385368 is the only genuinely hard study, and it fails differently than expected.** 46% of its text went unclaimed, and twelve of nineteen unclaimed spans carry obligation language. Some are correctly skipped narrative — live-vaccine notes, ICF procedure, imaging recommendations. At least one is a real miss: *"The primary tumor must be deemed resectable by a multidisciplinary evaluation..."* is an eligibility requirement the parser dropped. Its difficulty is length and embedded procedural prose, not formatting.
- **`definitional` fired in one study of twelve** (NCT03433469, four criteria). The type is barely exercised by this corpus.

Consequence for 0003, and the main thing this gate produced: **coverage and rejection count do not discriminate, so neither can be the primary metric.** Recall against hand-labelled criteria can, and NCT04385368 is the study to label first. This is evidence toward open question 3, gathered before that slice starts.

Operational finding: generation degraded roughly fourfold across a twelve-study batch (144s early, 654s late for comparable blocks), and one study blew a twenty-minute timeout that parsed in 78s when run alone. Parsing the corpus is a ~45-minute operation that can fail near the end, and a failure there says nothing about the study it lands on.

### Steps

Each step is one commit.

**Stage A — adapter and boundary**

1. `src/models/types.ts` — `ModelAdapter`, `CompletionRequest`, `CompletionResponse`, `ModelDescriptor`, `ModelRunMetadata`, and `ModelError` following the `TrialFixtureError` shape in `src/trials/types.ts` (context string + collected `problems`, every fault before throwing).
2. `src/models/config.ts` — reads `OMLX_BASE_URL` (default `http://127.0.0.1:8000/v1`), `OMLX_API_KEY` (required), `OMLX_MODEL` (default `Qwen3.6-35B-A3B-MLX-8bit`). Throws naming the variable when the key is unset, and **throws when the resolved host is not `127.0.0.1`/`localhost`** — the loopback constraint enforced in code, not only in the test. Plus `.env.example` carrying `OMLX_API_KEY=` with no value. `.gitignore` already ignores `.env`/`.env.*` and un-ignores `.env.example`; no change needed there.
3. `src/models/omlx.ts` — `POST /v1/chat/completions`. Temperature `0` and the pinned seed are constants in code, not env: they are part of the pinned run, not local configuration. Failure paths per spec §5.2, each naming endpoint and model.
4. `src/models/fake.ts` + `src/models/index.ts` — scripted responses in order, records requests received. Shipped in `src/`, not `tests/`, because 0003–0007 all need it.
5. Boundary test: move `tests/trials/boundary.test.ts` → `tests/boundary.test.ts`, walk from all three `index.ts` entry points, and apply the exception **per file, not per graph** — a module under `src/models/` may use `fetch()`; every other pattern stays forbidden there and the absolute rule holds everywhere else. This matters because `src/criteria/` imports `src/models/`, so a graph-level allowance would silently exempt the parser. Add the host-literal rule (any host literal under `src/models/` must be loopback) and a detector proof for it, in the style of the existing "known offender" test.
6. Adapter tests — request construction against a fake HTTP layer, and every failure path from spec §5.2.

→ **Gate 1**

**Stage B — deterministic core** (no model anywhere in these steps)

7. `src/criteria/types.ts` — `Criterion`, `CriterionType`, `CriterionPolarity`, `SourceSpan`, `ParsedCriteria`, `RejectedCriterion`, and `isPatientAnswerable` as a function, not a field.
8. `src/criteria/normalize.ts` — the table in spec §4.1, emitting a per-character `sourceIndex` map from normalized offset back to original offset. Bullet markers untouched. *(Landed as a map rather than the planned edit list; simpler and harder to get wrong. Spec §4.3 updated to match.)*
9. `src/criteria/locate.ts` — locate a model-supplied verbatim quote in normalized text, map back through `sourceIndex`. Duplicate quotes resolve to the first occurrence after the previous criterion's end, which also keeps criteria in document order. *(Added during implementation: a whitespace-tolerant fallback, reported as a `loose` flag. A model that reflows a criterion across a line break has copied it correctly in every way that matters. Spec §6.5 updated.)*
10. `src/criteria/validate.ts` — validates untrusted model output, hand-written in the style of `src/trials/validate.ts`, collecting every problem. Unknown `type`/`polarity` rejects the criterion rather than coercing to a default.
11. Tests for 8–10, including the round-trip property over all twelve real fixtures: `criteriaText.slice(start, end) === source.text`. *(Landed paired with each unit's own commit rather than as one trailing commit, so no commit in this stage adds untested code.)*

**Stage C — prompt and parser**

12. `src/criteria/prompt.ts` — versioned constant, the four `CriterionType` definitions with their boundary cases stated (tissue *adequacy* without a required *result* is `protocol`, not `clinical`; a clause defining "prior line of therapy" is `definitional`). Few-shot examples from protocols **outside** the corpus, so the twelve stay unseen.
13. `src/criteria/parse.ts` + `src/criteria/index.ts` — orchestration: normalize → one call → validate → locate → assemble. *(Corrected after the first real run: several criteria may share a source span, since one sentence often carries several requirements and the prompt asks for them to be split. Ids disambiguate with `#2`; only a genuine restatement is rejected. Spec §3.2 updated.)* `finishReason === "length"` throws `CriteriaParseError` naming the trial and what was recovered. Rejected criteria are returned, not dropped. `unclaimed` spans computed against an 80-character non-whitespace threshold.
14. `scripts/parse-criteria.ts` + `npm run parse:criteria` — person-run, prints a parse and optionally writes it to a scratch path. Lives in `scripts/` alongside `fetch-trials.ts`, never imported by the application. This is the instrument for Gate 2.
15. Parser tests driven by `FakeModelAdapter`: truncation throws, hallucinated quote is rejected, zero valid criteria throws, `unclaimed` reports a dropped tail.

→ **Gate 2**

**Stage D — recorded fixtures and docs**

16. Capture real oMLX responses for two or three trials into `tests/criteria/fixtures/model-responses/` and assert post-processing against output the model actually produced. *(Spec §8 said `tests/fixtures/model-responses/`; this follows the existing `tests/<area>/fixtures/` convention instead — `spec.md` gets corrected in this commit.)*
17. Update `README.md` (what exists, how to run the parser, the pinned model and its settings), `CLAUDE.md` "Verifying your work" with `npm run parse:criteria`, and `work/ROADMAP.md`: mark 0002 done, close OQ2 and OQ4, record what Gate 2 concluded about corpus difficulty under "Carried forward".
18. Reconcile `plan.md` with what was actually built, then run the five `REVIEW.md` passes and open the PR.

---

## What changed during implementation

Recorded here so the plan is not read as a description of something else. Divergences noted inline above are not repeated.

| Change | Why |
| --- | --- |
| `readOmlxConfig` completes a bare origin to `/v1`, and treats an empty variable as unset | The first real `.env` set `OMLX_BASE_URL=http://127.0.0.1:8000`, the listen address oMLX's own settings pane displays. It would have 404'd. |
| `OmlxAdapter` returns a truncated response instead of rejecting it as malformed JSON | Cut-off output *is* incomplete JSON, so the adapter's error named the symptom and the caller's truncation handling — which knows the trial and what to do — was unreachable for the case it exists to catch. |
| Request timeout raised to 1200s, and a failed body read reports its cause | Five minutes was too short for a 35B local model, and the failure surfaced as "response body could not be read", which says nothing. |
| `DEFAULT_MAX_OUTPUT_TOKENS` 8192 → 16384 | 8192 truncated NCT00743379, which yields 114 criteria. Set from measurement. |
| Source coverage measured as a span union, not a sum | The sum reported 262% for NCT00077350, whose criteria share sentences. A coverage figure above 100% is nonsense and it was being read at a gate. |
| `--record`, `--max-output-tokens` flags on the parse script | Step 16 needed real model output; recording it is a flag on the existing script rather than a second tool. The token flag let the budget be measured at the gate without editing a constant. |

Every one of these came from running the parser rather than from a test, which is the argument for the gates having been where they were.

---

## Files that change

**New:** `src/models/{types,config,omlx,fake,index}.ts`, `src/criteria/{types,normalize,locate,validate,prompt,parse,index}.ts`, `scripts/parse-criteria.ts`, `.env.example`, `tests/models/*.test.ts`, `tests/criteria/*.test.ts`, `tests/criteria/fixtures/model-responses/*.json`, `tests/boundary.test.ts`.

**Modified:** `package.json` (one script, no dependencies), `README.md`, `CLAUDE.md`, `work/ROADMAP.md`, `work/0002-criteria-parser/spec.md` (step 16 correction).

**Deleted:** `tests/trials/boundary.test.ts` (moved).

**Untouched:** `data/trials/`, `src/trials/`, `scripts/fetch-trials.ts`.

---

## Toolchain constraints to write against

Read from `tsconfig.json`; each has bitten this shape of code before:

- `exactOptionalPropertyTypes` — `appliesTo?: string` cannot be assigned `undefined`. Build the object with a conditional spread, not `appliesTo: maybeUndefined`.
- `noUncheckedIndexedAccess` — every array index and `match[1]` is `T | undefined`. The existing code handles this with explicit `=== undefined` guards; follow it.
- `verbatimModuleSyntax` — `import type` for type-only imports.
- ESM with `.js` specifiers on relative imports, resolved back to `.ts` by the boundary test's walker.
- No new dependencies. Node 24 has `fetch`; validation is hand-written.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| oMLX ignores `seed`, so runs are not reproducible | Gate 1 is exactly this question. If unsupported: record `seed: null` with a note rather than a number that does nothing, and tell 0003 its self-consistency metric measures runtime plus prompt, not prompt alone. |
| oMLX does not support `response_format: json_object` | Also Gate 1. Fallback is prompt-instructed JSON plus extraction of the first balanced `{...}`, with the adapter still failing loudly on unparseable output. |
| A 16KB block overruns `maxOutputTokens` (8192) | Truncation is a loud error by design (spec §6.3), so it cannot masquerade as a short parse. If it fires at Gate 2, chunking becomes its own slice rather than an unplanned edit here. |
| Model returns quotes that are not verbatim | `locate.ts` rejects them and records the text. A high rejection rate at Gate 2 is a prompt problem, addressed in stage C before the gate closes. |
| The corpus turns out to be easy | Gate 2, and the roadmap already warns about it. The honest outcome is to say so in the PR and revisit the corpus, not to accept a flattering result. |
| Parse is slow — 35B MoE at 8-bit, ~39.6GB resident, twelve long prompts | Not a correctness risk. Stage C's script parses one trial by default so iteration does not require the full set. |

---

## Proof

- `npm test` — deterministic, no network, still under a second. New tests per spec §8.
- `npm run typecheck`, `npm run lint` — clean.
- Boundary: `tests/boundary.test.ts` passes, **and** its two detector proofs fail when fed a known offender — the existing `fetch-trials.ts` proof plus a new non-loopback host string. A check that cannot fail is not doing its job.
- A deliberate check that swapping `OMLX_BASE_URL` to a non-loopback host throws at construction.
- Gate 1: two identical seeded requests, diffed.
- Gate 2: parses of NCT00743379 and NCT06728852 read against their source by hand.
- No committed eval results — that is 0003. The only committed model output is the recorded responses used as test fixtures in step 16.
