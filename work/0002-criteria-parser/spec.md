# spec: 0002 criteria parser

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0002-criteria-parser/intent.md`

---

## 1. Summary

Three things ship: a model adapter (`src/models/`), a criteria parser (`src/criteria/`), and a change to the network boundary test that admits the adapter under a loopback-only exception. The parser reads a `Trial` from the 0001 loader and returns structured criteria, each traceable to a span of the original registry text.

Open questions 2 and 4 from the product intent close here. Their answers are in §3 and §5.

## 2. Decisions taken before this spec

Recorded because the rest of the document depends on them.

| # | Decision | Consequence |
| --- | --- | --- |
| D1 | Model emits `type`; `patientAnswerable` is derived in code | One model judgment per criterion, not two. The mapping is a pure function, unit-tested without a model. Closes OQ2. |
| D2 | `src/models/` stays under `src/`; the boundary test gains a loopback-only exception | 0007's frontier swap is forced to be a visible change to that test rather than a silent config edit. |
| D3 | API key comes from `OMLX_API_KEY`; a committed `.env.example` documents the name with an empty value | `.gitignore` already ignores `.env`/`.env.*` and un-ignores `.env.example`. A test asserts the example never carries a value. |
| D4 | Local model is oMLX 0.6.4 serving `Qwen3.6-35B-A3B-MLX-8bit` at `http://127.0.0.1:8000/v1` | Closes OQ4, subject to the gate in §9. |

## 3. The criteria schema

```ts
/** What kind of statement this is. The model's judgment, one per criterion. */
export type CriterionType =
  | "patient"       // the patient can answer from their own knowledge
  | "clinical"      // requires a chart, a lab value, or an assay result
  | "definitional"  // scopes a term used elsewhere; asserts nothing about a person
  | "protocol";     // addressed to the site or the investigator, not the participant

export type CriterionPolarity = "inclusion" | "exclusion";

export interface Criterion {
  /** Stable within one parse. See §3.2. */
  id: string;
  polarity: CriterionPolarity;
  type: CriterionType;
  /** The criterion as the model rendered it: one testable statement, lightly cleaned. */
  text: string;
  /** Where it came from. Offsets index the ORIGINAL `criteriaText`. See §4.3. */
  source: SourceSpan;
  /** Present only when the criterion applies to part of the study. See §3.3. */
  appliesTo?: string;
  /**
   * Model's confidence that this span is one criterion of this type, 0-1, or
   * null when it did not give one. Nullable for the same reason `seed` and
   * `healthyVolunteers` are: "unsure" and "said nothing" are different facts.
   */
  confidence: number | null;
}

export interface SourceSpan {
  start: number;   // inclusive, into trial.eligibility.criteriaText
  end: number;     // exclusive
  text: string;    // the exact original substring, for display and adjudication
}

export interface ParsedCriteria {
  nctId: string;
  criteria: Criterion[];
  /** Everything needed to reproduce this parse. See §5.4. */
  run: ModelRunMetadata;
  /** Spans of the source that no criterion claimed. See §4.4. */
  unclaimed: SourceSpan[];
}
```

**3.1 Answerability is derived, not stored.**

```ts
export function isPatientAnswerable(criterion: Criterion): boolean {
  return criterion.type === "patient";
}
```

A function, not a field, so it cannot drift out of sync with `type` and cannot be serialized into an eval result as an independent fact. When 0004 disagrees with the mapping, this is the one place that changes.

**3.2 Criterion identity.** `id` is `${nctId}:${start}-${end}`, with `#2`, `#3` appended for the second and later criteria drawn from the same span. Derived from the source span rather than from an ordinal across the trial, so that two parses of the same block produce the same id for the same sentence even if one parse finds an extra criterion earlier in the text.

*Corrected after the first real run.* This originally allowed one criterion per span and rejected the rest as duplicates. That was wrong, and the first parse of NCT00106626 showed it: one sentence there carries three requirements — age, diagnosis, and no more than two prior systemic therapies — and §6.7 asks for exactly that split, so the model quoted the sentence once per criterion and five real criteria were discarded to satisfy a bookkeeping rule. Only a genuine restatement (same span *and* same statement) is now rejected. This is a partial answer to intent OQ4 and is enough for 0003 to align two runs; it is not claimed to survive a criterion being split differently between runs, which is a real case 0003 has to handle.

**3.3 Arm- and phase-conditional criteria** (intent OQ5). `appliesTo` carries the condition verbatim from the source — `"Phase I portion"`, `"Arm A"` — and is absent when the criterion applies unconditionally. Not modelled as structure, because one study in twelve (NCT03377023) needs it, and a structural representation invented for one study will be wrong for the second. 0004 treats a criterion with `appliesTo` as applying only when the patient is a candidate for that part.

**3.4 What the schema deliberately omits.** No numeric bounds extracted from the text (`age >= 18`), no units, no temporal windows. Those are a second parsing problem with their own failure modes, and 0004 can screen against a well-delimited sentence without them. Revisit when the screening agent proves it cannot.

## 4. Normalization

Deterministic, no model, fully unit-tested. Runs before the model sees the text.

**4.1 What is normalized.**

| Input | Output | Why |
| --- | --- | --- |
| `\r\n`, `\r` | `\n` | Line-ending variance is not signal. |
| `1\.`, `\>=`, `\<`, `\*`, `\-` | `1.`, `>=`, `<`, `*`, `-` | Registry-escaped markdown that survived into the text. NCT03753685 numbers every criterion this way. |
| Three or more consecutive `\n` | Two | Paragraph breaks vary; more than a blank line carries nothing. |
| Trailing whitespace on a line | Removed | Noise in the prompt, and makes spans harder to read. |

**4.2 What is not normalized.** Bullet markers are left exactly as they are, including their absence. The corpus deliberately contains blocks with no list structure (NCT06728852, NCT07229729) and blocks whose sub-items run inline (NCT00743379), and rewriting those into a uniform list is the parser's job to do semantically, not a regex's job to fake. Case, spelling, abbreviations and clinical terminology are untouched.

**4.3 Offsets map back to the original.** Normalization emits a per-character map — `sourceIndex[i]` is the offset in `criteriaText` of normalized character `i` — sufficient to map any offset in the normalized string back to the original. *(Implemented as a map rather than the edit list this spec first proposed: it costs one number per character, nothing at 16KB, and turns offset translation into an array read instead of arithmetic over a list of splices, which is the kind of code that is subtly wrong for months.)* `SourceSpan.start`/`end` are original-text offsets, and `SourceSpan.text` is sliced from the original. This is what makes a determination in 0006 citable against the registry text rather than against our cleaned copy.

Requirement: for every criterion, `criteriaText.slice(start, end)` equals `source.text`. Asserted as a property in tests over all twelve fixtures whenever a parse fixture is available.

**4.4 Unclaimed spans.** Any region of the source longer than a configurable threshold (default 80 characters, non-whitespace) that no criterion's span covers is reported in `ParsedCriteria.unclaimed`. This is the parser's own account of what it did not understand, and it is the cheapest available signal that the model dropped the back half of a 16KB block. It is not an error; it is data for the §9 gate and for 0003.

## 5. The model adapter

**5.1 Interface.** The whole surface, in `src/models/types.ts`:

```ts
export interface ModelAdapter {
  readonly descriptor: ModelDescriptor;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

export interface CompletionRequest {
  system: string;
  user: string;
  /** Adapter asks for JSON and fails the response if it does not parse. */
  responseFormat: "json";
  maxOutputTokens: number;
}

export interface CompletionResponse {
  /** Parsed JSON. Validation against an expected shape is the caller's job. */
  content: unknown;
  raw: string;
  finishReason: "stop" | "length" | "other";
  usage: { inputTokens: number; outputTokens: number };
}
```

Narrow on purpose. No streaming, no tools, no multi-turn: 0004 needs multi-turn and will widen it deliberately, with the swap in 0007 still working. No model-specific options leak through.

**5.2 The oMLX implementation.** `src/models/omlx.ts`, speaking OpenAI-compatible `POST /v1/chat/completions`. Reads configuration from the environment: `OMLX_BASE_URL` (default `http://127.0.0.1:8000/v1`), `OMLX_API_KEY` (required), `OMLX_MODEL` (default `Qwen3.6-35B-A3B-MLX-8bit`).

Failure behavior, all throwing `ModelError` with the endpoint and model named:
- `OMLX_API_KEY` unset → throws before any request, naming the variable and saying not to put it in a file in the repository.
- Base URL resolving to anything but `127.0.0.1`/`localhost` → throws. The constraint is enforced in code, not only in the test.
- Connection refused → throws with "is oMLX running?" and the configured URL.
- Non-2xx → throws with status and response body.
- `finishReason === "length"` → surfaced, not swallowed. §6.3 says what the parser does with it.
- Body that is not JSON → throws with the first 500 characters of what came back.

**5.3 The fake.** `src/models/fake.ts`, a `ModelAdapter` returning scripted responses in order, recording the requests it received. Part of the deliverable, not a test helper hidden in `tests/`, because 0003 through 0007 all need it. Exported from `src/models/index.ts`.

**5.4 Run metadata.** Every `CompletionResponse` carries, and every `ParsedCriteria` records:

```ts
export interface ModelRunMetadata {
  model: string;          // "Qwen3.6-35B-A3B-MLX-8bit"
  quantization: string;   // "8bit"
  temperature: number;    // 0
  seed: number;           // pinned; see §9
  promptVersion: string;  // hash of the system prompt
  adapter: string;        // "omlx" | "fake"
  timestamp: string;
}
```

`CLAUDE.md` requires the first four on any reported result. `promptVersion` is here because a parse result compared across slices is meaningless if the prompt silently changed; it is a hash of the system prompt string, computed at call time.

## 6. The parser

**6.1 Entry point.** `parseCriteria(trial: Trial, adapter: ModelAdapter): Promise<ParsedCriteria>` in `src/criteria/parse.ts`. Takes the adapter as an argument rather than constructing one, so tests and 0007 pass a different one without configuration.

**6.2 One call per trial.** The largest block is 16KB (~4k tokens); all twelve fit comfortably in context. Chunking would cut clauses off from the context that makes them interpretable — a sub-item under "Dose escalation subjects:" means nothing alone. The cost of this decision is output length, not input length, and §6.3 handles that explicitly rather than hoping.

**6.3 Truncation is an error, never a partial result.** `maxOutputTokens` is set generously (8192). If `finishReason` is `"length"`, `parseCriteria` throws `CriteriaParseError` naming the trial and the criteria recovered so far. A truncated parse that returned successfully would silently drop the exclusion criteria at the end of every long block, which is precisely the kind of failure the eval harness in 0003 would then measure as if it were model quality. If this fires in practice, chunking gets its own slice.

**6.4 Model output is untrusted.** The model returns JSON; it may return the wrong shape, an unknown `type`, a span that does not exist in the source, or a `text` it invented. Validation in `src/criteria/validate.ts`, hand-written in the style of `src/trials/validate.ts`, collecting every problem before throwing:
- Unknown `type` or `polarity` → reject the criterion, record it, do not coerce to a default.
- `start`/`end` outside the text, or `end <= start` → reject.
- A span whose text does not appear at the stated offsets → the model guessed offsets. §6.5.

**6.5 Spans are located, not trusted.** Asking a model for character offsets into a 16KB string is asking for arithmetic it is bad at. The model returns the criterion's `quote` — a verbatim substring — and the parser locates that quote in the normalized text itself, then maps the offset back through §4.3. A quote that does not occur verbatim is a hallucination and the criterion is rejected with its text recorded. One tolerance: a quote matching except in its whitespace is accepted and flagged `loose`, since a model that reflows a criterion across a line break has copied it correctly in every respect that matters, and rejecting those would discard real criteria to punish cosmetic infidelity. A corpus where most quotes need the loose match is one whose parse should be read more suspiciously, which is why the flag is reported rather than swallowed. A quote occurring more than once resolves to the first occurrence after the previous criterion's end, which also keeps criteria in document order.

**6.6 Rejected criteria are reported, not silently dropped.** `CriteriaParseError` is for failures that invalidate the whole parse (truncation, unparseable JSON, zero valid criteria). Individual rejected criteria are returned in a `rejected: RejectedCriterion[]` field on `ParsedCriteria` with the reason. A parse that rejects nine of forty criteria should be visibly bad, not quietly short.

**6.7 The prompt** lives in `src/criteria/prompt.ts` as a versioned constant with the four `CriterionType` definitions and their boundary cases stated explicitly — that a criterion requiring tissue *adequacy* without requiring a *result* is `protocol` and not `clinical`, that a clause defining what "prior line of therapy" means is `definitional`. Examples use standard oncology vocabulary — the EGFR exon 19 / T790M / L858R alternation, ECOG, PD-L1 — which appears in thousands of protocols including some in the corpus. *(Corrected in 0003: this originally claimed examples came from protocols outside the corpus, which was not true of the EGFR alternation. Nothing is fitted to the corpus, so this is not training leakage; the claim was simply inaccurate and is now stated as it is.)*

## 7. The boundary test

`tests/trials/boundary.test.ts` moves to `tests/boundary.test.ts`, since it now covers more than trials. It gains:

1. A second walk from `src/models/index.ts` and `src/criteria/index.ts`.
2. An exception: modules under `src/models/` may use `fetch()`. Every other network pattern stays forbidden there, and everything outside `src/models/` keeps the absolute rule.
3. A new assertion that the exception is narrow: any host literal appearing under `src/models/` must be `127.0.0.1` or `localhost`. A non-loopback URL fails the suite.
4. A detector proof for the new rule, in the style of the existing one — a fixture string containing `https://api.example.com` must be caught. A check that cannot fail is not doing its job.
5. An assertion that `src/criteria/` does not itself use `fetch()`: the parser reaches the model only through the adapter.

Requirement: swapping in a frontier model in 0007 must fail this test until the test is deliberately changed.

## 8. Testing

`tests/` stays deterministic and under a second. No test calls oMLX.

| Area | Tested with |
| --- | --- |
| Normalization | Table-driven cases per §4.1, plus the offset map round-tripping on all twelve real fixtures |
| Offset mapping | Property: for random spans of normalized text, mapping back and slicing the original yields the same visible content |
| Schema validation | Malformed model output: wrong types, unknown enum values, out-of-range spans, non-occurring quotes |
| Quote location | Duplicate quotes, quotes spanning a normalization edit, quotes that do not occur |
| Adapter request construction | Fake HTTP layer; asserts headers, body, temperature, seed, and that the key is read from env |
| Adapter failure paths | Missing key, non-loopback URL, connection refused, non-2xx, non-JSON body, `finishReason: "length"` |
| `isPatientAnswerable` | All four `CriterionType` values |
| `.env.example` | Contains `OMLX_API_KEY=` with an empty value and no other assignment with a value |
| Boundary | §7 |

**Recorded responses.** One real oMLX response per two or three trials, captured during the §9 gate and committed under `tests/fixtures/model-responses/`, used to test post-processing deterministically against output the model actually produced rather than output we imagined. These are model output about published protocols; they contain no patient data.

**What is not tested here.** Whether the parse is *correct*. No assertion in `tests/` depends on model behavior. Correctness is 0003's subject, and this slice deliberately ships without measuring it (intent, §Proposed outcome).

## 9. The gate

Between the adapter landing and the parser being built on it, one decision needs a human and a running model:

**Does oMLX honor `seed` and `temperature: 0` well enough for a pinned run to be reproducible?** Unverified — `/v1` refused an unauthenticated probe. The check is the same request twice with the same seed, diffed. It matters because `CLAUDE.md` requires seed on any reported result, and 0003's self-consistency metric (OQ3) means something different if the runtime cannot be made deterministic at all: with a working seed, variance across runs is a property of the prompt; without one, it is a property of the runtime and cannot be separated from it. Being wrong here costs 0003 its primary metric.

Second question at the same gate, from the roadmap's carry-forward: **is the corpus genuinely hard?** Read the parse of NCT00743379 (inline sub-items) and NCT06728852 (no list structure) by hand against the source. If both come out clean on the first attempt, suspect the corpus before believing the parser.

`plan.md` places these and says what happens on each answer.

## 10. Out of scope

No eval harness, graders, golden set or committed results. No conversation, transport, server or UI. No changes to `data/trials/` or to the 0001 loader. No numeric extraction from criteria text. No chunking. No streaming, tool use or multi-turn in the adapter. No second model configured; 0007 does that.

## 11. Dependencies

None added. Node 24 has `fetch`; validation is hand-written in the style already established in `src/trials/validate.ts`. The intent left the door open for a schema library to validate model output, and this spec closes it: the shape is small, the errors that matter are "which criterion, which field," and adding a runtime dependency to produce them is not worth breaking the project's zero-dependency record. Revisit if 0004's conversation state proves a harder shape.
