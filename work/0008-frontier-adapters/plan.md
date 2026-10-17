# plan: 0008 frontier adapters

**Intent:** `work/0008-frontier-adapters/intent.md` · **Spec:** `work/0008-frontier-adapters/spec.md`
**Branch:** `0008-frontier-adapters` (from `main` at `9c91e64`; intent `a0ae7d6`, spec `6de5d27`)

---

## Context

The owner wants the project able to use Anthropic, OpenAI and xAI, but not using any of them yet. When they do, it will be Claude first, at the lowest cost that tells them something. So 0008 builds three frontier adapters behind the existing `ModelAdapter` in `src/models/`, chosen per role by a command-line spec, and proves them against recorded responses through an injected `fetch`. It also builds the cost controls before anything can spend: an estimate, dry by default, caps on calls and dollars, a committed spend log, prompt caching and a batch path.

**What's scarce here is money and trust, not model time.** No step in this plan makes a paid call. Claude never holds a key, never writes one to `.env`, and never passes `--spend`. The one live path is the smoke script at Gate 2, which the owner runs themselves. Until then, every fixture is written from documentation, and says so.

`src/screening/`, `src/criteria/`, `src/plain/`, `src/server/`, `src/web/`, `src/transport/`, `data/`, the labels, the vignettes and every committed result are not touched. `PROMPT_VERSION` stays `c5778afe9cbd`, and oMLX's behaviour and descriptor are unchanged.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. Built and proven offline** | 1–10 | **Gate 1** | With no key and no `--spend`, `npm run eval:screening -- --agent anthropic` and `npm run eval -- --model anthropic --batch` print their roles and estimate, then exit 0. `npm test` covers all three adapters, the budget, the batch path and the boundaries |
| **B. The smoke calls (optional)** | 11 | **Gate 2** | The owner's recordings replace the documentation-derived fixtures, for the providers they ran. The calibration ratio is printed, and the spend log has its first lines |
| **C. Documentation, review, PR** | 12–13 | PR | CLAUDE.md's network rule restated, the README's "Model providers and cost" section, the roadmap carried forward |

**Gate 1: the defaults later paid runs inherit (spec §13.1).**
The owner runs, with no frontier key in `.env` and without `--spend`:
- `npm run eval:screening -- --agent anthropic`
- `npm run eval:screening -- --agent openai --all`
- `npm run eval -- --model anthropic --batch`
- `npm run eval -- --model anthropic:claude-opus-5-5` (must be refused)

They decide:
1. Are the admitted models and per-provider defaults right: Haiku 4.5, Sonnet 5, GPT-6 Luna, Grok 4.3?
2. Are the caps right: 100 calls and $1.00 per invocation?
3. Is one conversation (`NCT00077350-v1` from labels) the right smallest-first default?
4. Is `--spend` the right name?
5. Can they tell from the estimate alone what would be spent, on which model, for which role, and the most it could cost?

*Why it guards Stages B and C:* every paid run in the held slice starts from these defaults, and the README documents them. An unclear estimate or a generous cap is how a PoC bill surprises you. It can come back no: if question 5's answer is "not really", the estimate's output changes before anything else.

**The owner can delegate this gate.** It's about defaults and legibility, and its value doesn't come from an independent reader. If they delegate, the PR says so.

**Passed 2026-09, on Claude's recommendation: the owner delegated the gate ("pass Gate").** The PR says so. Claude ran the four commands with no frontier key and no `--spend`, and recommended keeping every default:
1. the four admitted models and the cheapest per provider as default;
2. 100 calls and $1.00 per invocation;
3. one conversation, `NCT00077350-v1` from labels (about $0.16 on Haiku 4.5);
4. `--spend`;
5. the estimate is legible.

Question 5 had come back no during step 8, before the gate. The first draft said nothing when the cap would cut a run short, and its "at most" figure could be lower than the expected one. Both were fixed there (change table). Left as is: with a cap too low for the run, "at most" is below "expected", and the line under it says why.

**Gate 2: the smoke calls (spec §9.2, §13.2). Optional.**
The owner puts `ANTHROPIC_API_KEY` in `.env` and runs:
- `npm run models:smoke -- anthropic`, which is dry and shows the estimate
- then `-- anthropic --spend`
- then `-- anthropic --batch --spend`
- then the same for `openai` and `xai` if they have keys

They decide, per provider, whether the recordings replace the fixtures, and whether the adapter is "recorded" or "written from documentation" in the README and PR. If calibration is off by more than 25%, the characters-per-token constant is changed in a commit that says why.

**Claude can't do this gate:** it spends the owner's money with the owner's key, and Claude doesn't handle keys. It needs no independent reader and no clinical judgment. **Skipping it is allowed.** The plan's change table and the PR then say which adapters are unrecorded.

*Why it guards Stage C:* the README states each adapter's standing, and the held slice's first paid run relies on it.

**Skipped 2026-09: the owner chose not to spend money now ("I don't want to spend money right now, so pass the smoke").** No live call was made in this slice. Every fixture under `tests/fixtures/models/` is still "written from documentation, not yet seen from the API". `CHARS_PER_TOKEN` is uncalibrated, and the spend log does not exist yet. The README, the roadmap and the PR say all three adapters are built and proven against documentation only. The first paid run of any provider should start with `npm run models:smoke -- <provider> --spend`.

Stage C needs no gate. It ends in documentation and the review passes.

---

### Steps

Each step is one commit. `npm test`, `npm run typecheck` and `npm run lint` pass at every commit, and lint is read by its exit code (`npx biome check . >/dev/null; echo $?`), not its last line. Tests inject `fetchImpl`, sleep and clock. None uses `vi.mock`, `vi.stubGlobal`, `vi.spyOn` or `vi.useFakeTimers`, because `tests/boundary.test.ts` (the `replacesShared` rule) forbids them.

**Stage A: built and proven offline**

1. **Commit this plan, reconcile the spec with the repository, and record the baseline.**
   - Baseline: 724 tests (717 passed, 7 expected fail). Record Vitest's duration over three runs.
   - Spec §6.3 "every labelled study, which is five calls": `labelledStudies()` in `evals/runner.ts` returns five. That holds.
   - Spec §8: `readParse(vignette.nctId, parsesDir, ctx.agent.descriptor)` in `evals/screening-runner.ts` keys parses by the *agent's* model. A frontier agent screening from parses would look for parses made by that frontier model. So with a frontier agent, `eval:screening` defaults to `--source labels`. `--source parse` then fails that conversation with "no cached parse for <model>", rather than silently using the local model's parse. That's recorded in the spec in this commit.
   - Spec §5.1: `omlx.test.ts` imports `OmlxAdapter` from the barrel, which is fine. The class stays exported, and §10's rule forbids its *value* use only under `src/` and `scripts/`, not in `tests/`.

2. **Types, shared JSON parse, and the Chat Completions core.**
   - `src/models/types.ts`: `temperature: number | null`, `unset`, `seedGuarantee`, `TokenUsage.cacheWriteTokens` and `cacheReadTokens`, `CompletionResponse.servedModel` (spec §4).
   - `src/models/json.ts`: `parseModelJson`.
   - `src/models/chat-completions.ts`: `firstChoice`, `finishReasonFrom` and `usageFrom` move out of `omlx.ts` unchanged. `usageFrom` also reads `prompt_tokens_details.cached_tokens`. `omlx.ts` imports them and parses with `parseModelJson`.
   - `evals/runner.ts` and `evals/screening-runner.ts` widen `temperature` to `number | null`. Printers in `scripts/run-screening-eval.ts`, `run-eval.ts`, `parse-criteria.ts` and `render-plain.ts` use one helper, `describeSettings(descriptor)` in `src/models/describe.ts`. It prints `not settable` and `none` followed by the `unset` reason.
   - Tests: `tests/models/json.test.ts`, and a `describeSettings` test. **`tests/models/omlx.test.ts` must pass with no edit.** The committed eval run still loads (`tests/fixtures/eval-run.ts` is unchanged).

3. **Catalog, keys, redaction, specs, `.env.example`.**
   - `src/models/catalog.ts`: the four entries from spec §3. Each has prices (including batch and cache rates), `temperature: 0 | null`, `seed: "send" | null`, the reasoning-off field, the cache minimum, and the `unset` reasons. The file also holds `PRICES_AS_OF = "2026-09"`, the source URLs, and `DEFAULT_MODEL_FOR` per provider.
   - `src/models/keys.ts`: `readKey(provider, env)` and `keyAppearsIn(provider, text, env)`. This is the only file naming the three variables.
   - `src/models/redact.ts`: `redact`.
   - `src/models/spec.ts`: `parseModelSpec`.
   - `.env.example`: `ANTHROPIC_API_KEY=`, `OPENAI_API_KEY=` and `XAI_API_KEY=`, empty, with a comment that a key there never selects a model.
   - Tests: `tests/models/{catalog,keys,spec}.test.ts`. `env-example.test.ts`'s expected list becomes six variables.

4. **The Anthropic adapter.**
   - `src/models/anthropic.ts`, per spec §5.2. `isRefusal` goes in `errors.ts`. `ModelError` gains optional `retryable?: boolean` and `retryAfterMs?: number`, set by the frontier adapters and read by the budget wrapper.
   - Fixtures under `tests/fixtures/models/anthropic/`, written from documentation with a provenance line: ask ok, read ok, truncated, refusal, fenced JSON, 400, 401, 429 with `retry-after`, 529.
   - `tests/models/fixtures.ts` holds the fixture loader and `fixtureFetch`, which returns a fixture and records the request.
   - Tests: `tests/models/anthropic.test.ts` (spec §11 items 1 and 2 for Anthropic). Haiku's body has `temperature: 0` and no `thinking`. Sonnet 5's has no `temperature` and has `thinking: {type: "disabled"}`. `cache_control` sits on the system block. The sentinel key appears only in the `x-api-key` header, and in nothing a caller sees on any failure fixture.

5. **The OpenAI and xAI adapters.**
   - `src/models/openai.ts` and `src/models/xai.ts` on the shared core, per spec §5.3. Fixtures are under `tests/fixtures/models/{openai,xai}/`.
   - Tests: `tests/models/{openai,xai}.test.ts`. Luna's body has no `seed`. xAI's has `seed: 20260921`, and its descriptor has `seedGuarantee: "best-effort"`. Both have `reasoning_effort: "none"`, `temperature: 0` and `response_format: json_object`. Cached tokens are split out of `prompt_tokens`.
   - `tests/models/fixtures.test.ts` checks every fixture under `tests/fixtures/models/` for a provenance line and for nothing key-shaped.

6. **Budget, retries, estimate, spend log.**
   - `src/models/budget.ts`: `BudgetedAdapter`, `Budget` and `isBudgetStop`, with retries per spec §7.3. Sleep is injected. Priced from the catalog.
   - `src/models/estimate.ts`: `estimate(entry, workload, { batch })` returns expected and ceiling figures, and `formatEstimate`. It's pure.
   - `src/models/spend.ts`: `SpendRecord`, and `appendSpend(path, record)`, which appends one JSON line.
   - Tests: `tests/models/{budget,estimate,spend}.test.ts` (spec §11 items 4 and 5, except the dry-by-default proof, which needs the flags and comes in step 8).

7. **Two factories, the scripts switched to them, and the boundaries.**
   - `src/models/factory.ts`:
     - `createLocalAdapter(spec, { env?, thinking? })` builds oMLX, or the fake for `fake`.
     - `createAdapter(spec, { env?, thinking?, budget?, fetchImpl?, batch? })` builds anything. A frontier spec without a budget is refused, and a frontier adapter is always returned wrapped.
   - `index.ts` exports the factories, the spec parser, `describeSettings`, the budget types, `estimate`, `appendSpend`, `isRefusal` and `isBudgetStop`. **Not** the frontier adapter classes.
   - Scripts:
     - `app.ts` uses `createLocalAdapter`, and its `instanceof OmlxAdapter` becomes `descriptor.adapter === "omlx"`.
     - `chat.ts` and `render-plain.ts` use `createLocalAdapter`.
     - `run-eval.ts`, `run-screening-eval.ts` and `parse-criteria.ts` use `createAdapter` with an `omlx` spec for now. The flags come in step 8, so behaviour is identical in this step.
   - `tests/boundary.test.ts` (spec §10):
     - `FRONTIER_HOSTS` maps each host to the file(s) allowed it. The "only lets the models module address this machine" test becomes "only the named file may name each frontier host". It gets fire-proofs for a host in the wrong file and an unknown host.
     - "Only `src/models/` chooses a model" is extended to `scripts/` and to all five adapter classes.
     - A new "the running application can't build a frontier adapter" check covers `src/server/`, `src/transport/`, `src/web/`, `scripts/app.ts`, `scripts/app/*`, `scripts/chat.ts` and `scripts/render-plain.ts`.
     - A new "keys are read in one place" check.
     - The header comment is rewritten to describe what now stands.
   - Tests: `tests/models/factory.test.ts` (spec §11 item 7).

8. **Roles, flags, estimates, and the runners.**
   - `scripts/lib/model-flags.ts`: parses the flags of spec §6.3 into role specs, `spend`, `maxCalls`, `maxUsd`, `batch` and `all`, and prints the role lines. It's a pure function over `argv`, so it can be tested.
   - `evals/estimate.ts` (parser workload) and `evals/screening-estimate.ts` (screening workload), per spec §7.1. The screening one reads per-vignette agent calls from the committed 0004 run through the same loader `tests/fixtures/eval-run.ts` uses.
   - `evals/screening-runner.ts`:
     - records `participantModel` and `fidelityModel` when they differ from the agent's;
     - `conversationKey` adds their model ids only when they differ;
     - `isBudgetStop` stops the run now;
     - `spend` is written on the run when a frontier role ran.
   - `evals/runner.ts`: `isBudgetStop` stops remaining studies, and `spend` is written on the run.
   - `scripts/run-screening-eval.ts`:
     - all three roles are passed explicitly;
     - a frontier agent defaults to `NCT00077350-v1` from labels unless studies or `--all` are named, and to `--source labels`;
     - estimate first, and without `--spend` print it and exit 0 before any adapter is built;
     - with `--spend`, refuse if expected cost is over `--max-usd`, then run, then append to `evals/results/spend.jsonl`.
   - `run-eval.ts` and `parse-criteria.ts` get the same flow with `--model`.
   - Tests:
     - `tests/scripts/model-flags.test.ts`;
     - `tests/evals/estimate.test.ts`, with fixed workloads to the cent;
     - `tests/evals/screening-runner` additions (spec §11 item 8), using `FakeModelAdapter` wrapped in `BudgetedAdapter`;
     - the dry-by-default proof: the flow function (factored as `planRun(argv, env)` in each script's module, exported for the test) returns "estimate only" with an env holding no key.

9. **Batch.**
   - `src/models/anthropic-batch.ts`: `AnthropicBatchAdapter` per spec §5.4, with an injected clock, sleep and ledger directory. `createAdapter({ batch: true })` builds it for Anthropic and refuses batch for the others.
   - `evals/runner.ts`: `EvalOptions.concurrency`, which defaults to 1. Studies run in groups of that size, and outcomes keep study order.
   - `run-eval.ts`: `--batch` sets concurrency to the study count, and batch pricing goes into the estimate.
   - `.gitignore`: `evals/results/batches/`.
   - Fixtures: batch created, in progress, ended, and results JSONL (one succeeded, one errored).
   - Tests: `tests/models/anthropic-batch.test.ts` (spec §11 item 6), including a ledger hit proved by a fetch that fails the test on a second `POST /v1/messages/batches`, and a `results_url` on another host.

10. **The smoke script, built and not run.**
    - `scripts/models-smoke.ts` and `npm run models:smoke` (`node --env-file-if-exists=.env --import tsx`). The flow is spec §9.2's.
    - Scrubbing is `scrubForFixture(body, provider, env)` in `scripts/lib/scrub.ts`. It replaces ids, keeps only `retry-after`, and throws if `keyAppearsIn`.
    - Tests: `tests/scripts/scrub.test.ts` covers id replacement, the headers dropped, and the refusal to write a body carrying the sentinel. A dry run with no key prints the estimate.
    - *See:* the Gate 1 commands.

→ **Gate 1.** Changes it asks for are their own commits, recorded in the change table.

**Stage B: the smoke calls**

11. **The owner runs `models:smoke`.** Claude commits whatever they run:
    - the recorded fixtures (after checking the diff shows bodies only, placeholders for ids, and no key);
    - the spend log lines;
    - any calibration change;
    - the adapter's own fix, if a recording shows the adapter was wrong. That fix is a failing test first, using the recording, committed, then the fix, per CLAUDE.md's bug rule.
    If they skip it, this step is only a line in the change table.

→ **Gate 2.**

**Stage C: documentation, review, PR**

12. **Documentation.**
    - CLAUDE.md:
      - the network non-negotiable and the boundaries paragraph restated per spec §12;
      - the verifying table gains `models:smoke` and the flags;
      - the model-access convention names the two factories.
    - README: a "Model providers and cost" section, per spec §12.
    - `work/ROADMAP.md`: the 0008 row done, and "Carried forward from 0008".
    - This plan's change table and file list, as built.

13. **Review passes and PR.** Run `REVIEW.md`'s passes and fix what they find, each fix its own commit. Then open the PR. It says which gates were delegated or skipped, and which adapters are recorded. No attribution lines.

---

## What changed during implementation

| Step | Change | Why |
| --- | --- | --- |
| 1 | Baseline recorded: 724 tests (717 passed, 7 expected fail), 655–680 ms over three runs | So Gate 1 can say what the new tests cost |
| 4 | `tests/boundary.test.ts`'s transport-route check ("names the message routes only in…") now skips `src/models/` | It matches any string ending `/messages`, and Anthropic's endpoint is `/v1/messages`: a provider's URL, not this app's route. Skipped by directory, so a route anywhere else is still caught |
| 4 | Failure reporting shared in `src/models/failures.ts`, with the provider passed in | So the three frontier adapters report failures identically and redact in one place |
| 5 | OpenAI and xAI are one class, `FrontierChatAdapter` in `src/models/frontier-chat.ts`, with `openai.ts` and `xai.ts` holding only their host and name. Tested together in `tests/models/chat-providers.test.ts`, not two files | They differ only in host, model and catalog fields. Each host literal still sits in its own file, for the boundary test |
| 6 | Budget, estimate and spend tests are one file, `tests/models/budget.test.ts` | They share the scripted inner adapter and the catalog entries; three files would repeat both |
| 7 | The host rule now walks every file under `src/models/`, not only files reachable from an entry point, and a second test proves each frontier host is named in its file | A host in a file nothing imports yet would otherwise slip past until it was imported |
| 7 | The catalog's documentation sources are written without `https://` | The host rule flagged them, correctly: they were URL literals in `src/models/`. They're citations nothing fetches, and writing them as references keeps the rule strict rather than exempting documentation hosts |
| 7 | `FrontierChatAdapter` is also on the boundary test's list of classes only the factory may use | It's the class `OpenAIAdapter` and `XaiAdapter` extend |
| 8 | A `BudgetPool` is shared by every frontier adapter in one invocation | Without it, two paid roles would each get the full cap, and "per invocation" would mean twice the limit |
| 8 | A run the call cap would cut short says so in the estimate, and is refused with `--spend` | Found by running the dry estimate: `--agent openai --all` expects 1,335 calls against a cap of 100, and the first draft said nothing about it. "At most" is now never above `--max-usd` |
| 8 | `planScreening` and `planEval` take a spend-log path instead of an env | They never read the environment at all, which is a stronger form of "builds no adapter and reads no key" than passing an env without one |
| 9 | Batch tests are in `tests/models/anthropic-batch.test.ts`; the runner's concurrency test is in `tests/evals/runner.test.ts` | As planned; recorded for the file list |
| 10 | Tests of the fixtures the smoke script overwrites (`ask-ok`, `read-ok`, `ok`, `batch-results`) now read their expectations from the fixture, through helpers in `tests/models/fixtures.ts`. The batch tests' errored line is written in the test | Otherwise a real recording would break tests that asserted the documentation fixtures' text and token counts, and they'd have to be edited to pass. Error, truncated, refusal and cached fixtures are never overwritten, so their tests keep literals |
| 10 | The smoke script's calls are the agent's own `ask` and `read` from `src/screening/calls.ts`, so "pass" means the agent's validators accepted the response | Stronger than checking the shape by hand, and no agent code changes |
| 11 | Skipped: no smoke calls were run (Gate 2) | The owner chose not to spend money in this slice |
| 12 | `tests/evals/estimate.test.ts` not created | The estimate is tested in `tests/models/budget.test.ts`, and its workloads through the scripts' plans in `tests/scripts/model-flags.test.ts` |
| 13 | Review: the dollar cap now reserves each call's worst case (prompt plus `max_tokens`) while it is in flight | Calls sent together all passed a check made before any came back, so a batch could overshoot `--max-usd` by its cost. Failing test committed first (`f13fcf2`) |
| 13 | Review: a request whose batch result wasn't a success is dropped from the ledger | Otherwise every rerun collected the same errored result and the request could never be resubmitted. Failing test committed first (`f13fcf2`). One earlier assertion, that the ledger keeps both ids after one errored, encoded the fault and was changed to the intended behaviour |

## Files that change

As built. Where this differs from the plan as approved, the change table above says why.

**New:**
- `src/models/`:
  - adapters: `anthropic`, `anthropic-batch`, `frontier-chat`, `openai`, `xai`
  - shared reading: `chat-completions`, `json`, `http`, `failures`
  - choosing and costing: `catalog`, `spec`, `factory`, `budget`, `estimate`, `spend`
  - keys and records: `keys`, `redact`, `describe`
- `evals/{estimate,screening-estimate}.ts`
- `scripts/models-smoke.ts`, `scripts/lib/{model-flags,scrub}.ts`
- `tests/models/`:
  - `{json,catalog,anthropic,chat-providers,fixtures,budget,factory,anthropic-batch}.test.ts`
  - `tests/models/fixtures.ts`, the fixture loader and helpers
- `tests/scripts/{model-flags,scrub}.test.ts`
- `tests/fixtures/models/{anthropic,openai,xai}/*.json`, all written from documentation
- `work/0008-frontier-adapters/{intent,spec,plan}.md`

**Modified:**
- `src/models/{types,omlx,errors,index}.ts`
- `evals/{runner,screening-runner}.ts`
- `scripts/{app,chat,render-plain,run-eval,run-screening-eval,parse-criteria}.ts`
- `tests/boundary.test.ts`, `tests/models/env-example.test.ts`, `tests/evals/{runner,screening-runner}.test.ts`
- `.env.example`, `.gitignore` (the batch ledger), `package.json` (`models:smoke`)
- `README.md`, `CLAUDE.md`, `work/ROADMAP.md`

**Not created:**
- `tests/evals/estimate.test.ts`. The estimate's arithmetic is tested in `tests/models/budget.test.ts`, and both workload builders run through `planScreening` and `planEval` in `tests/scripts/model-flags.test.ts`.
- `evals/results/spend.jsonl`. Nothing was spent.

**Not touched, checked with `git diff main`:** `src/screening/`, `src/criteria/`, `src/plain/`, `src/server/`, `src/web/`, `src/transport/`, `data/`, `evals/cases/`, and every committed file under `evals/results/`. `PROMPT_VERSION` is still `c5778afe9cbd`.

---

## Risks

- **Fixtures that agree with the code by construction.** Until Gate 2, each adapter is tested against Claude's reading of the provider's documentation. Mitigation: every fixture says so in its provenance line, the README reports each adapter's standing, and Gate 2 exists to replace them. Known example: whether `gpt-6-luna` honours `json_object` with `reasoning_effort: "none"` is implied, not documented.
- **Spending by accident during development.** Mitigation: Claude never creates or edits `.env`, never passes `--spend`, and every test injects `fetch`. Without `--spend`, the scripts exit before an adapter is built. That's the dry-by-default test, and it runs with an env holding no key. If the owner adds a key before Gate 2, Claude's commands stay dry.
- **Moving the Chat Completions helpers changes oMLX.** Mitigation: `omlx.test.ts` passes unedited, and the committed eval run still loads.
- **A key in an error or a fixture.** Mitigation: `redact` on every frontier error, sentinel-key tests through every failure path, the fixture scan, and the smoke script refusing to write.
- **Prices and admitted models go stale.** Mitigation: `PRICES_AS_OF` is printed with every estimate, and changing the catalog is a visible one-row diff.
- **xAI removes Chat Completions** (it's documented as legacy). Mitigation: the change is confined to `xai.ts`, and it's in the carried-forward list.
- **Test time.** Around 15 new test files. `isolate: false` keeps the per-file cost low. Measured against step 1's baseline at Gate 1, and reported if it grows past about 1 s.

## Verification

- `npm test` (724 plus new, near a second), `npm run typecheck`, and lint by exit code, at every commit.
- Gate 1's four commands, with no frontier key and no `--spend`. Each prints roles and an estimate and exits 0. The Opus 5.5 spec is refused, naming the admitted models.
- `npm run eval:screening -- --dev` and `npm run app -- --fake` still behave as before: roles print `omlx` or `fake`, and no estimate appears for local-only runs.
- `git diff main -- src/screening src/criteria src/plain src/server src/web src/transport data evals/cases` is empty, and `PROMPT_VERSION` is `c5778afe9cbd`.
- `grep -rE "sk-ant-|sk-[A-Za-z0-9]{20}|xai-[A-Za-z0-9]{20}" .` outside `node_modules` finds nothing but the tests' detector patterns.
