# plan: 0004 screening agent

**Intent:** `work/0004-screening-agent/intent.md` · **Spec:** `work/0004-screening-agent/spec.md`
**Branch:** `0004-screening-agent` (from `main` at `2d7506b`; intent `bf2c0df`, spec `fdbf6d5`)

---

## Context

Three slices in, the project can parse a protocol and measure the parse, but it cannot put a question to anyone. This slice builds the conversation: an agent that works through one study's criteria with a participant, records a finding per criterion with the participant's own words as evidence, abstains when it cannot resolve one, and hands off without a verdict. It also builds the measurement: vignettes with expected outcomes, a simulated participant, graders and committed results.

The design is settled in the spec. Code owns the loop, and the model only phrases a question and reads a reply (D3). A `clinical` criterion can never be settled by the patient's answer (D2), and lab values are not asked at all (§4.2). There is no early stop (D5). Every call goes to the local model (D6). The headline is **confidently wrong**, always reported beside **abstention**.

**What is scarce is the owner's reading time and local model hours, not money.** The owner is not a clinician, so no gate asks them for a medical judgment. The gates ask whether an expected outcome visibly follows from a sentence, whether a conversation reads well, and whether a long run is worth its hours.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at |
| --- | --- | --- |
| **A. Formats and reading tool** | 1–5 | no gate |
| **B. Ground truth and graders** | 6–10 | **Gate 1** |
| **C. The agent** | 11–16 | no gate |
| **D. Runner and the timed conversation** | 17–20 | **Gate 2** |
| **E. Full run** | 21 | **Gate 3** |
| **F. Documentation and PR** | 22–24 | PR |

**Gate 1: do the expected outcomes follow from the facts, and are the vignettes hard enough?**
The owner reads NCT04316364's three vignettes in full with `npm run vignettes:check`, which prints each fact beside its criterion's text and expected outcome. For the other twelve vignettes they read the check's warnings: facts that share no words with their criterion, and studies where a behavior is missing. The question is not medical. It is whether each expected outcome follows from reading two sentences side by side under `VIGNETTES.md`, and whether the set would catch an agent that guesses: enough declines, contradictions, vague answers and volunteered facts.

**Passed 2026-09.** The owner read NCT04316364's three vignettes in full, and the set had zero warnings. The gate changed the design once, through a question rather than a correction: why a clinical fact where the patient said "stage II, untreated" to a four-part criterion went ungraded. That led to follow-ups on partial answers (spec §4.1) and to one or two clinical facts per vignette restating their whole criterion, with graded clinical facts going from 16 to 29. Two display fixes also came out of the reading: the sheet now says when a fact is ungraded, and it warns only where a determination rests on unmatched words.

*Why it guards the next stage:* the agent's prompts are written after this gate. Every number the README reports is measured against these vignettes. A soft set inflates all of them, and no test can tell. Changing a vignette after the agent has run against it is a PR finding. So this is the last point where changing one is free.

**Gate 2: does a real conversation read well, and is the full run worth its hours?**
Run the dev vignette (step 18) end to end on the local model. The owner reads the rendered transcript (HTML) and the timing report, and screens themselves with `npm run screening:chat` to see how the agent handles answers no vignette anticipated. They decide three things:
1. Does the conversation flow well enough to tell the story? If not, iterate on the prompts, against the dev vignette only.
2. Is the full run, fifteen vignettes from labels plus fifteen from parses, an acceptable number of hours? If not, narrow the parse run to one vignette per study.
3. Should ask and read be merged into one call to save a third of the time? Spec §4.1 says that is decided here, not in code.

**Passed 2026-09.** Getting the dev conversation to run on the real model took five fixes, all in the change table: a quoted transcript format, reasoning switched off (an opt-in adapter change, confirmed by the owner), a simulator told that "no" is a fact it does not have, capped quotes against a repetition loop, and failed replies kept. The final dev run had 21 questions in about ten minutes and nothing confidently wrong. The owner's decisions:
1. The conversation flows well enough to go on. For the next stage of the project, criteria should be presented in plain language. Inclusion and exclusion criteria read as medical jargon that most people, the owner included, do not fully understand. Carried forward to the roadmap.
2. Run everything: fifteen vignettes from labels and fifteen from parses, about 9–10 hours at about 28 s per question.
3. Ask and read stay separate calls.
4. Two fidelity fixes approved, as grader changes after the Gate 1 freeze: the uncited-reply flag no longer fires on replies that say they don't know, and a flagged reply excludes only the findings for criteria it did not cite. The model fidelity check stays a flag for reading, never a score.

*Why it guards the next stage:* Stage E spends roughly 4,000 local model calls, possibly days of machine time. A prompt fault discovered afterwards means spending it twice. Tuning prompts on a scored vignette would contaminate the headline, which is why iteration uses a dev vignette that is never scored.

**Gate 3: are the graders right about what happened?**
The owner reads every confidently wrong finding and every flagged simulator turn, in transcript with `npm run screening:show`. They decide whether each is an agent fault, a simulator fault or a grader fault, and whether the numbers go in the README as they stand.

**Passed 2026-09.** The full run graded all 30 conversations with no failures, in about 11.5 hours. From labels: confidently wrong 15% (24 of 163), abstention 1%. The owner accepted the recommendations:
1. The attribution of the 24 stands: 16 agent (6 missed self-corrections, 4 exclusions read backwards, 4 settled where interpretation was needed, 2 vague yeses accepted), 6 convention (sex-specific criteria asked of the other sex), 2 simulator distortions.
2. `defer` stays the convention for criteria that do not apply to the person.
3. The numbers are reported as measured. The 2 simulator distortions are footnoted with transcripts, not removed by a grader change after the run.
4. The README leads with the finding that the agent is overconfident.
5. Fixing the agent is a later slice, as 0003 left the parser alone.
6. The committed result is trimmed to numbers plus every non-correct finding; full detail stays reproducible from the local conversation cache.

Read by hand at this gate: the verdict-language pattern matched 14 agent turns and none was a verdict (the criterion's own words "candidate for surgery", "eligible for an R0 resection"). The model fidelity check flagged 375 turns and is too noisy to read exhaustively. Both are recorded as limitations.

*Why it guards the next stage:* Stage F publishes numbers. A grader that disagrees with a transcript could be wrong about either one. Only a person reading can tell which, and once the numbers are in the README they are the project's claim.

### Steps

Each step is one commit.

**Stage A — formats and reading tool**

1. **Reconcile the spec with the repository.** In `spec.md`:
   - §7 and §8.3 say the parse run uses "committed" 0003 parses. `evals/results/parses/` is gitignored, and the five parses are a local cache keyed by prompt `73c3b301c4a9`. Correct the wording: the parse run reads that cache via `cacheKey()` from `evals/runner.ts`, and a missing parse is regenerated by `npm run eval -- <nctId>`, never by this runner.
   - State that conversation files are also a gitignored cache. What gets committed is the run result (numbers plus per-finding diagnostics) and one worked-example conversation.
   - Add the dev vignette (step 18).
   - Parsed criteria can share an id when they come from one span (`src/criteria/parse.ts` allows several criteria per span), so the parse adapter assigns ordinal ids `P1…Pn` and keeps a map back.
2. **`src/screening/types.ts` and `src/screening/index.ts`**, exporting types only: `ScreeningCriterion`, `FindingStatus`, `FindingReason`, `Finding`, `Evidence`, `Turn`, `Transcript`, `ScreeningState`, `ScreeningResult`, `Handoff`, and `ScreeningError` in the collected-problems shape of `ModelError`. Written now because the graders in Stage B read `Finding`. No prompts and no logic, so this does not cross Gate 1's ordering rule.
3. **Vignette types and loader.** Add `Vignette`, `VignetteFact` and `VignetteProvenance` to `evals/cases/types.ts`, and `VignetteError` in the `LabelError` shape. New `evals/cases/vignettes.ts`: `loadVignettes(dir)` and `validateVignette()`, hand-written like `evals/cases/load.ts`, collecting every problem. It enforces:
   - `labelSetSha` equals the sha256 of the label file's bytes.
   - Every `patient` label has exactly one fact, and every fact's label exists.
   - `expected` appears only on `patient` facts, and `reported` only on `clinical` facts. No facts for `protocol` or `definitional` labels.
   - `declines` implies `says: null` and `expected: "unresolved"`.
   - `laterSays` implies `expected: "unresolved"`.
   - `behavior` is in the enum.
   - `provenance.sawAgentPrompt` is present.
   - The directory `dev/` is loaded separately and flagged `dev: true`.
4. **`evals/cases/VIGNETTES.md`**, the drafting conventions (spec §8.1, D7), in the voice of `ANNOTATION.md`:
   - statement-truth semantics
   - facts restate or plainly negate the criterion's words, or compare a number against a number
   - `defer` whenever reading would need interpretation
   - the five behaviors and how per-fact `declines` and `laterSays` mix into a vignette
   - persona is texture, never medical history beyond the facts
   - no real case reports, however anonymized
   - provenance.
5. **`scripts/check-vignettes.ts`, `npm run vignettes:check [nctId]`**, plus tests for steps 3 and 5.
   - It prints each vignette as a reading sheet: label id, type, polarity, the normalized criterion text, then the fact, then the expected outcome.
   - It adds warnings: a fact whose `says` shares no content word with its criterion (a small local tokenizer, not an export from the matcher), a study where any behavior is absent, and a vignette with no `defer`, decline or contradiction at all.
   - It imports nothing from `src/screening/` or `src/models/`.
   - Tests cover every validation fault, the dev split, and warning cases.

**Stage B — ground truth and graders**

6. **Draft the NCT04316364 vignettes**: `v1`, `v2`, `v3` under `evals/cases/vignettes/NCT04316364/`, with three different primary behaviors. `provenance`: drafter `claude-opus-5-5`, `sawAgentPrompt: false`, and a note that the drafter wrote the spec, which is a real anchoring.
7. **Draft the other twelve**, one commit per study, in the order NCT00077350, NCT06728852, NCT03433469, NCT04385368. Across all fifteen, each behavior is primary at least twice. Add `tests/evals/vignettes-committed.test.ts`: every committed vignette loads and validates, the same pattern as `tests/evals/labels.test.ts`.
8. **The simulated participant**, `evals/participant/`:
   - `prompt.ts`: the participant system prompt, taking persona, behavior and a numbered fact list, and told to answer only from them and say "I don't know" to anything else. `SIMULATOR_VERSION = hashPrompt(...)`, reusing `hashPrompt` from `src/criteria/prompt.ts`.
   - `simulate.ts`: `simulate(vignette, transcriptText, adapter)`. The model returns `{ message, usedFacts }`, and the reply is validated. Its signature takes transcript text, never `ScreeningState`.
   - `fidelity.ts`: the deterministic flags (cites a fact the vignette lacks; cites nothing but is longer than a named threshold) and `modelFidelityCheck()` on the local model, returning flags for reading, never a score.
9. **`evals/graders/screening.ts`** (spec §8.2, §8.3):
   - `gradeLabelsRun(findings, vignette, labels, flaggedTurns)`: confidently wrong, abstention, correct abstention, evidence rejections, reported agreement, and simulator-affected exclusions.
   - `countDiscipline(transcript)`: more than one `?` in a turn, more than 320 characters, and the verdict-language pattern (a named constant).
   - `categorizeParseRun(parsed, labels, findings, vignette)`: uses `matchCriteria` from `evals/graders/match.ts` unchanged to sort each label into scored, mis-typed, bundled or missed upstream, and grades only the scored ones.
   - `poolScreening()`, and a `SCREENING_GRADER_VERSION` constant.
10. **Tests for steps 8 and 9**, all with `FakeModelAdapter` and hand-built findings:
    - all correct; all abstained; one confidently wrong; a determination on a `defer` label; a determination on an `unresolved` label
    - a simulator-affected finding excluded and counted
    - each of the four parse categories, from a small fixture parse
    - each fidelity flag
    - the simulator signature cannot receive state (a type-level test via `expectTypeOf`).

→ **Gate 1**

**Stage C — the agent**

11. **`src/screening/agenda.ts`**: `raisability(criterion)`, which returns a raised or not-raised decision and a reason from spec §4.2, the `LAB_VALUE_PATTERN` constant with its reasoning, document order, and attempt bookkeeping (at most two asks; a decline is never re-asked). Tests pin lab-value matches and non-matches, including both known misfires: NCT04385368 L50 matched, "Adequate organ function" not matched.
12. **`src/screening/evidence.ts` and `src/screening/apply.ts`**:
    - `evidence.ts`: quote location in one participant message, exact then whitespace-loose, following the approach in `src/criteria/locate.ts` without importing it.
    - `apply.ts`: readings become findings under every rule in spec §5, including a `clinical` reading of `holds` still producing `chart-review`, contradiction keeping both quotes, a quote from an earlier turn rejected, and readings for closed or unraisable criteria ignored and counted.
    - Tests for all of it.
13. **`src/screening/prompts.ts`** (ask and read system prompts, and user-prompt builders that render the transcript) and **`src/screening/templates.ts`** (the fixed opening and closing messages, spec §4.4). `PROMPT_VERSION` hashes both prompts and both templates with `hashPrompt`. A test asserts that the templates contain no verdict language, using the grader's pattern.
14. **`src/screening/calls.ts`**: `ask()` and `read()` through `ModelAdapter.complete`, with `responseFormat: "json"` and `maxOutputTokens` of 256 and 1024. Envelope validation is hand-written in the style of `src/criteria/validate.ts`. A malformed or truncated response is retried once, then the call throws `ScreeningError`. Tests use a scripted fake.
15. **`src/screening/session.ts`**: `ScreeningSession` with `start()`, `receive(text)`, `state()` and `static fromState(state, adapter)`. It is push-driven and knows nothing about who is on the other end. `receive` returns either `{ kind: "message", text }` or `{ kind: "done", text, result }`.
    - Also: input adapters `fromLabels(labelSet)`, which runs the label quote through `normalize()` and sorts by `start`, and `fromParse(parsed)`, which assigns ordinal ids. These live in `evals/`, not `src/`, because `src/` may not import `evals/` types.
    - Tests: termination with a model that never answers clearly; out-of-order answers skipping a criterion; the serialize-and-restore-after-every-turn run equal to an uninterrupted run; and a serialized result with no key matching `/eligib|verdict|disposition|qualif/i`.
16. **Boundaries and the adapter comment.** Extend `tests/boundary.test.ts`:
    - no file under `src/` imports from `evals/`
    - no file under `src/` outside `src/models/` imports `OmlxAdapter` as a value, with a detector proof that it would fire
    - raise the module-count floor so `src/screening/` is visibly walked.

    Correct the multi-turn doc comment in `src/models/types.ts` (spec §4.3). That is the only edit under `src/models/`.

**Stage D — runner and the timed conversation**

17. **`evals/screening-runner.ts`** (spec §7):
    - For each vignette and source, build criteria, then loop `session.start()` → `simulate()` → `session.receive()` until done.
    - Write the conversation file after every turn, containing session state, participant metadata, per-call timings and call counts.
    - Conversation cache key: vignette id, source, model, `PROMPT_VERSION`, `SIMULATOR_VERSION`, seed.
    - After a conversation completes, run the fidelity pass (cached in the same file), then grade.
    - Write `evals/results/screening/<timestamp>-<PROMPT_VERSION>.json` after every conversation. A `ModelError` saves state and moves on, and two consecutive connection failures stop the run with the `/health` hint.
    - Add `evals/results/screening/conversations/` to `.gitignore`.
    - Tests with the fake: cache hit and miss; a partial conversation resuming; the stop after two failures; the result naming what failed.
18. **The dev vignette**, `evals/cases/vignettes/dev/NCT04316364-dev.json`. It is cooperative with one volunteered fact and one decline, is never scored, and exists so prompts can be iterated without touching the scored set.
19. **Scripts**:
    - `scripts/run-screening-eval.ts` → `npm run eval:screening [nctId] [--source labels|parse] [--dev] [--refresh]`, printing per-conversation timing as it goes.
    - `scripts/show-conversation.ts` → `npm run screening:show -- <file>`, rendering the transcript with findings and highlighting flagged turns. It also writes a self-contained HTML page beside the conversation file (`--html`), with the transcript on one side and findings with their evidence on the other. There are no dependencies and no server: it is a static file opened in a browser, and a preview of what 0006's coordinator pane has to show.
    - `scripts/chat.ts` → `npm run screening:chat -- <nctId>`. The owner plays the participant in the terminal, and the real agent asks questions on the local model through `ScreeningSession`. At the end it prints the findings with their evidence and saves the conversation so `screening:show --html` can render it. Nothing is scored. It is a hands-on test, not a measurement, and it never writes to `evals/results/`.
    - All three scripts load `.env` like `npm run eval`.
20. **Run the dev vignette** on the local model and commit its rendered transcript and timing under `evals/results/screening/dev/` for Gate 2. Prompt iterations from Gate 2 land here as further commits, each recording what changed and why.

→ **Gate 2**

**Stage E — full run**

21. `npm run eval:screening` over all fifteen vignettes, from labels and then from parses (or the narrower parse run if Gate 2 chose it). Commit the result file and the chosen worked-example conversation.

→ **Gate 3**

**Stage F — documentation and PR**

22. **README**: the screening section per spec §13: the worked example, the labels-run table, the parse-run table, where the agent fails, the 23-to-47-question length, and the shared-author limitation. Every number must match the committed result exactly.
23. **`CLAUDE.md`** verification table (three new commands), and **`work/ROADMAP.md`**: 0004 done, product open question 6 closed, and "Carried forward from 0004" for 0005 to 0007.
24. **Reconcile `plan.md`** and fill in "What changed during implementation". Run the five `REVIEW.md` passes and open the PR. The PR body has no tool attribution (CLAUDE.md).

---

## What changed during implementation

Every divergence from this plan is recorded here in the commit that makes it.

| Change | Why |
| --- | --- |
| `vignettes:check` warns only on facts graded as a determination (`expected` or `reported` of `holds`/`does-not-hold`), not on every fact | The first NCT04316364 draft produced six warnings, all on `defer`, vague or ungraded facts that are supposed to need interpretation. At Gate 1 that noise would bury the warning that matters. An extra commit between steps 5 and 6 |
| Statement truth defined for exclusions worded as prohibitions (`VIGNETTES.md` Rule 1, spec §4.3) | NCT00077350 words several exclusions as "must not have…". "Is the statement true" was ambiguous for those until pinned to the disqualifying condition, following `ANNOTATION.md` Rule 2. Found while drafting step 7 |
| Partial answers get a targeted follow-up: new reading and reported value `partial` with a `missing` field; follow-ups counted in discipline (spec §4.1, §4.3, §5, §8.2) | At Gate 1 the owner asked why a patient saying "stage II, untreated" to a four-part criterion was ungraded, and suggested the agent ask clarifying questions. It fits inside the existing two-ask budget. One or two clinical facts per vignette were rewritten to restate their whole criterion with `reported` graded, so a partial first answer that is never followed up shows as a disagreement |
| The lab-value rule matches 23 labelled criteria, not 22; NCT03433469 raises 39 questions, not 40 (spec §4.2) | Writing the pattern for real, potassium and magnesium (NCT03433469 L14) joined the analyte list. They are lab values nobody knows, and the spec's count had been made with a rougher pattern |
| The read call also sees already-answered criteria, marked "report only if the reply corrects or changes that answer" (spec §4.1 said open criteria only) | A read that sees only open criteria can never notice a correction, so the `contradicts` vignettes would have tested nothing. Found writing the session in step 15 |
| `PROMPT_VERSION` also hashes a `PROMPT_LAYOUT` revision and the context window sizes | The per-turn prompt layout is code and cannot be hashed directly. Without this, the step-15 layout change would not have moved the version, and results from two layouts could have been mixed silently |
| Ask sees the last 6 turns, read the last 4, not the whole transcript | Bounds prompt size, and therefore time per call, on 47-question conversations. Both numbers are in the version hash |
| Transcripts in every prompt are quoted, numbered lines; responses wrapped in a one-element array are unwrapped (`objectFrom` in `src/screening/calls.ts`); `PROMPT_LAYOUT` 3 and `SIMULATOR_LAYOUT` 2 | The first dev run (step 20) failed its first question twice. With `ASSISTANT:` / `PERSON:` lines, the local model in JSON mode returned the transcript itself as an array of chat messages. Quoted lines fixed it: 52 tokens in 3–4 s. The same probe showed oMLX's JSON mode wraps every object in an array |
| **`src/models/` changed beyond the doc comment:** `OmlxAdapter` gained an opt-in `thinking: false` option (sends `chat_template_kwargs: { enable_thinking: false }`), and `ModelDescriptor` an optional `thinking: "off"`. The screening scripts use it for agent, simulator and fidelity check. It is in the conversation cache key and the run result | The second dev run failed on the simulated participant: the pinned Qwen model reasons before answering, and JSON mode writes the reasoning into the object as a `thought` key, 350–650 tokens and 15–30 s a call, truncating at the 300-token budget. With reasoning off, the same reply was 88 tokens in about 5 s, a clean object. The default is unchanged, so the parser and 0003's committed results are unaffected and still accurately described. **Flagged for Gate 2:** reasoning mode is part of the experiment's definition, and the model comparison in 0007 has to hold it fixed or report it |
| A retry after a truncated response appends a note to the prompt (`RETRY_AFTER_TRUNCATION`, hashed into `PROMPT_VERSION`); the runner saves a turn's simulated reply before the agent takes it and reuses it on resume; the simulator prompt says "no" is a fact it does not have; the read prompt caps quotes at about 12 words | Found running the dev vignette. The read call fell into a repetition loop ("and an artery and an artery…"), and an identical retry at temperature 0 loops identically. The failing reply had been discarded with the failed turn, which made it undiagnosable. And the simulator answered "no" to nearly every uncovered health question, inventing history on 11 of 17 replies |
| The committed run result is trimmed to numbers and non-correct findings (`forCommit` in the runner), and regenerated from cached conversations without a model call | Decided at Gate 3. The full result was 344 KB of mostly correct outcomes; 0003 trimmed its results for the same reason |
| Two example conversations are committed: one that goes well, and one showing the self-correction failure | The README needs a worked example it can quote verbatim, and the most important failure should be readable without rerunning anything |
| The dev vignette's primary behavior is `volunteers`, not `cooperative` | Only `volunteers` triggers volunteered facts, and one practice conversation should exercise out-of-order answers, a decline and a partial clinical answer |
| Added `npm run screening:chat` and an HTML view in `screening:show` (step 19) | After Gate 1, the owner noted that everything so far had happened out of sight, and there was no way to see or test the work until 0005. Both are small, need no new dependencies, and give hands-on testing at Gate 2. They do not replace 0005's web UI |
| `simulate()` takes the vignette, its label set, the transcript lines, a small `ParticipantMemory` and the adapter, not "transcript text" alone | The simulator needs each fact's topic (the criterion text) to know which fact a question is about, and a memory of what it has said so code can trigger corrections and volunteered facts. It still never receives `ScreeningState`, and the full parameter list is pinned by a type test |
| Contradictions and volunteered facts are triggered by code, not left to the simulator | A model told to "contradict yourself at some point" might never do it, and the vignette would be graded as though it had. The reply after a `laterSays` fact is used is instructed to correct it. A `volunteers` vignette's first reply is instructed to offer its last three settleable facts |

---

## Files that change

As built. Where this differs from the plan as approved, the change table above says why.

**New:**
- `src/screening/{types,agenda,evidence,apply,prompts,templates,calls,session,index}.ts`
- `evals/cases/vignettes.ts`, `evals/cases/VIGNETTES.md`, and `evals/cases/vignettes/**` (15 scored and 1 dev)
- `evals/participant/{prompt,simulate,fidelity}.ts`, `evals/graders/screening.ts`, `evals/screening-runner.ts`, `evals/screening-input.ts` (the `fromLabels` and `fromParse` adapters)
- `evals/results/screening/<timestamp>-c5778afe9cbd.json` (the full run, trimmed), `evals/results/screening/examples/` (two conversations, page and text), `evals/results/screening/dev/` (every dev run result from the step-20 iterations, and the rendered dev conversation)
- `scripts/{check-vignettes,run-screening-eval,show-conversation,chat}.ts`
- `tests/screening/{agenda,apply,calls,prompts,session}.test.ts`, `tests/evals/{vignettes,vignettes-committed,participant,screening-grader,screening-input,screening-runner,show-conversation}.test.ts`

**Modified:**
- `evals/cases/types.ts` (vignette types added; label types untouched)
- `package.json` (five scripts, no dependencies), `.gitignore` (conversation cache and `chats/`), `biome.jsonc` (does not lint those caches)
- `tests/boundary.test.ts`, `tests/models/omlx.test.ts`
- `src/models/types.ts` (the doc comment, and an optional `thinking` on `ModelDescriptor`) and `src/models/omlx.ts` (the opt-in `thinking: false` option). **This diverges from the plan**, which allowed only the doc comment; see the change table
- `README.md`, `CLAUDE.md`, `work/ROADMAP.md`, `work/0004-screening-agent/spec.md`

**Untouched:** `src/criteria/`, `src/trials/`, `data/trials/`, `evals/cases/labels/`, `evals/graders/{match,metrics}.ts`, `evals/runner.ts` (only its exported `cacheKey` is imported), and 0003's committed results. The parser's behavior is unchanged: it does not pass `thinking`.

---

## Reused rather than rebuilt

- `ModelAdapter`, `FakeModelAdapter`, `OmlxAdapter`, `ModelError` from `src/models/`. The adapter surface is unchanged.
- `normalize()` from `src/criteria/normalize.ts`, for label quotes shown to the model.
- `hashPrompt()` from `src/criteria/prompt.ts`, for `PROMPT_VERSION` and `SIMULATOR_VERSION`.
- `CriterionType` and `CriterionPolarity` from `src/criteria/types.ts`.
- `loadLabelSet()` and `criteriaTextSha()` from `evals/cases/load.ts`. `labelSetSha` uses the same sha256 approach.
- `matchCriteria()` from `evals/graders/match.ts`, unchanged, for the parse-run categories. `formatRate()` from `evals/graders/metrics.ts`.
- `cacheKey()` from `evals/runner.ts`, to find the cached 0003 parse.
- The collected-problems error shape (`TrialFixtureError`, `ModelError`, `LabelError`).
- The module-graph walk in `tests/boundary.test.ts`, extended rather than copied.
- The quote-location approach from `src/criteria/locate.ts`, reimplemented in about thirty lines rather than imported. Its signature is bound to `NormalizedText`, and `src/criteria/` is not touched.

---

## Toolchain constraints

Unchanged and each already bitten once: `exactOptionalPropertyTypes` (conditional spread, never `field: undefined`), `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, ESM `.js` specifiers, no new dependencies. `tests/` stays under a second; no test reaches a model.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| The simulator drifts from its vignette, and the agent is blamed | Deterministic and model fidelity flags; flagged findings are excluded and counted, never silently dropped; Gate 3 reads every one |
| The local model returns poor JSON under a growing transcript | One retry, then a resumable failure. Small `maxOutputTokens`. Gate 2 sees it before the full run does |
| The read call over-attributes, settling criteria nobody asked about | Evidence must locate in the latest message; readings for closed criteria are ignored and counted; out-of-order settlements are visible in the transcript |
| The full run takes days, or oMLX goes down partway through | State saved every turn, runs resume, two connection failures stop the run with the `/health` hint. Gate 2 sizes the run before it starts |
| Prompt tuning contaminates the headline | Iteration only against the dev vignette. A prompt change after the full run starts changes `PROMPT_VERSION` and invalidates the cache, so it cannot be mixed silently |
| Vignettes, graders and prompts share an author | Vignettes are committed before prompts (Gate 1). `sawAgentPrompt` is recorded. The README says it plainly. The independent drafter is 0007 (D7) |
| The lab-value rule misfires beyond the two known cases | Every skipped criterion carries `lab-value` in the result, so a misfire is visible to the coordinator and in the parse-run table |
| Gate 1 reading is too heavy for one person | Full reading of one study only. The rest is covered by the check script's warnings, which point at the facts most likely to be wrong |

---

## Proof

- `npm test`, `npm run typecheck`, `npm run lint`: clean, `tests/` still under a second, with the new tests per spec §10.
- Boundaries asserted, each with a detector proof that it fires: `src/` cannot import `evals/`; only `src/models/` constructs a model; `src/screening/` reaches no network.
- The hallucination check is shown to fire: a fabricated quote in a scripted read becomes `evidence-not-found`.
- Gate 1: one study's vignettes read in full by a person.
- Gate 2: one real conversation on the local model, read and timed.
- Stage E: `npm run eval:screening` results committed. Every README number matches the committed result file, and the result records model, quantization, temperature, seed, `PROMPT_VERSION`, `SIMULATOR_VERSION`, vignette-set hash and grader version.
