# spec: 0008 frontier adapters

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0008-frontier-adapters/intent.md`

---

## 1. Summary

Three new adapters, for Anthropic, OpenAI and xAI, implement `ModelAdapter` in `src/models/` over plain `fetch`, injected so tests pass recorded responses and nothing reaches the network. One factory builds every adapter from a model spec such as `anthropic:claude-haiku-4-5`. The model-calling scripts take one spec per role from the command line, and every role defaults to oMLX. A paid run is dry by default. It prints an estimate and stops unless `--spend` is given. When it does run, a budget wrapper caps calls and dollars, retries within the cap and appends what was spent to a committed log. Anthropic gets prompt caching and a batch path, wired into the parser eval. Results record what each role ran on, including a temperature or seed that couldn't be set. A smoke script, run by the owner with their own key, turns documentation-derived fixtures into recorded ones. The running application, the terminal chat and the plain-language renderer stay local. The agent, the prompts and every committed result are unchanged.

## 2. Decisions taken before this spec

| # | Decision | Consequence here |
| --- | --- | --- |
| D1 | Plain `fetch` through an injected function, not the provider SDKs | No new dependency (§5). Hosts are literals the boundary test can read (§10) |
| D2 | Configuration per role, every role defaults to local | Role flags (§6.3). Runs record each role's model (§8) |
| D3 | Dry by default, capped, named on the command line | `--spend`, `--max-calls`, `--max-usd` (§7) |
| D4 | One live call per provider, run by the owner, not a merge condition | `npm run models:smoke` (§9.2). Gate 2 (§13) |
| D5 | Two gates: defaults, then the smoke calls | §13 |

The intent's ten open questions are answered here:

| Intent question | Answer | Section |
| --- | --- | --- |
| 1. OpenAI's and xAI's surfaces | Both through Chat Completions, sharing a core with oMLX. Defaults `gpt-6-luna` and `grok-4.3`, both with reasoning set to `none`. OpenAI sends no seed. xAI sends one, recorded as best effort | §3, §5.3 |
| 2. JSON from Claude | The prompt's existing instruction, plus one shared tolerant parse used by every adapter: trimmed text, optionally inside one Markdown fence. No schema, no change to `CompletionRequest` | §5.1 |
| 3. The descriptor change | `temperature: number \| null`. A new optional `unset` records why a field is null, and `seedGuarantee` records "best effort". `thinking: "off"` holds for every admitted model. Committed results read unchanged | §4 |
| 4. The config format | `provider[:model]`. `--model` for one-role scripts, and `--agent`, `--participant`, `--fidelity` for the screening eval. Each script prints its roles before anything runs | §6 |
| 5. The estimator | Offline, 3.0 characters per token, an expected figure and a ceiling. The ceiling is a real bound. A committed, dated price table, and a model outside it is refused | §7.1 |
| 6. The cap | 100 calls and $1.00 per invocation by default, both hard. A stop mid-conversation leaves it resumable, like an outage | §7.2 |
| 7. Retries and rate limits | In the budget wrapper, so each attempt counts. Two retries on 429, 529, 5xx and connection failures, honouring `retry-after` up to 60 s | §7.3 |
| 8. Which runner gets batch | The parser eval (`npm run eval -- --batch`), with a ledger so an interrupted batch is collected, not paid for again | §7.5 |
| 9. Where "no frontier in the running application" sits | Two factory functions. The app, the chat and the renderer can only reach `createLocalAdapter`, and the boundary test checks that by reference | §6.2, §10 |
| 10. The smoke script | One `ask` and one `read` on a fixed made-up criterion, plus one batch of two for Anthropic. Bodies only, ids replaced, and it refuses to write a body that contains the key | §9.2 |

## 3. Providers and models

The models this slice admits, with prices and behaviour as documented in 2026-09. They are committed as a table in `src/models/catalog.ts`, with the date and each source URL.

| Spec | Input / output per MTok | Cached input | Batch | Temperature | Seed | Reasoning off by |
| --- | --- | --- | --- | --- | --- | --- |
| `anthropic:claude-haiku-4-5` (default) | $1.00 / $5.00 | write $1.25, read $0.10 | 50% off | sent, 0 | none exists | not sending `thinking` |
| `anthropic:claude-sonnet-5` | $2.00 / $10.00 | write $2.50, read $0.20 | 50% off | not settable (400 if sent) | none exists | `thinking: {type: "disabled"}` |
| `openai:gpt-6-luna` (default) | $0.10 / $0.50 | read $0.01 | not built | sent, 0 (allowed only with reasoning `none`) | not sent (undocumented for this model) | `reasoning_effort: "none"` |
| `xai:grok-4.3` (default) | $1.25 / $2.50 (prompts under 200K) | read $0.20 | not built | sent, 0 | sent, best effort | `reasoning_effort: "none"` |

Sources: the claude-api skill (cached 2026-06) for Anthropic; `developers.openai.com/api/docs/pricing`, `/models/gpt-6-luna` and `/guides/latest-model` for OpenAI; `docs.x.ai/docs/models/grok-4.3` and `docs.x.ai/developers/rest-api-reference/inference/chat-completions` for xAI.

**The admission rule is that reasoning can be switched off.** 0004 carried forward that a comparison has to hold reasoning mode fixed across models or report it. The local agent runs with it off. Every admitted model can run with it off, so every frontier result is `thinking: "off"` like the local one, and the comparison doesn't have to explain a difference in reasoning. Opus 5.5 and Fable 5.1 can't turn thinking off and aren't admitted. Adding a model is a one-row diff to the catalog, in the open, with its price. That is a cost control too: a mistyped id is refused rather than run at an unknown price.

**What changed from the intent's guesses.** OpenAI's cheapest current model is a tenth of Haiku's price. At the intent's assumptions, a full 30-conversation screening eval on `gpt-6-luna` costs about $0.30. Claude still goes first because that's the order the owner chose, and nothing here changes it.

**Chat Completions is xAI's legacy endpoint.** xAI documents it as the "stateless, OpenAI-compatible predecessor" of its Responses API, with no removal date. OpenAI recommends Responses too but documents Chat Completions as supported for `gpt-6-luna`. Using Chat Completions for both keeps one request shape across oMLX, OpenAI and xAI, so the three differ only in host, model and the fields in the table. If either provider removes it, the change is confined to that provider's file.

## 4. The adapter surface

`ModelAdapter` and `CompletionRequest` don't change. The changes are additive and all in `src/models/types.ts`:

```ts
interface ModelDescriptor {
  model: string;
  quantization: string;        // "none" for a hosted model
  temperature: number | null;  // null: not settable on this model; the provider's default applied
  seed: number | null;         // null: not sent, or the provider has none
  adapter: string;             // "omlx" | "anthropic" | "openai" | "xai" | "fake"
  thinking?: "off";
  /** Why a field is null, in words. Present only when one is. */
  unset?: { temperature?: string; seed?: string };
  /** Present when a seed was sent but the provider only promises best effort. */
  seedGuarantee?: "best-effort";
}

interface TokenUsage {
  inputTokens: number;         // input billed at the full rate
  outputTokens: number;
  cacheWriteTokens?: number;   // Anthropic only
  cacheReadTokens?: number;
}

interface CompletionResponse {
  // ...as now, plus:
  /** The model id the provider says answered, when it returns one. */
  servedModel?: string;
}
```

`OmlxAdapter`'s descriptor is unchanged, so every committed result reads the same. The two eval result types (`evals/runner.ts`, `evals/screening-runner.ts`) widen `temperature` to `number | null`. Every place that prints one prints `not settable` for null, and `seed` prints `none` for null, followed by the `unset` reason.

For every frontier model, the descriptor records `unset.seed` as one of two reasons:
- Claude: "the Claude API has no seed parameter"
- OpenAI: "not documented for gpt-6-luna; not sent"

Sonnet 5 records `unset.temperature` as "rejected by claude-sonnet-5; the provider's default applied". xAI records `seed: 20260921` and `seedGuarantee: "best-effort"`.

**What an unseeded run means** is stated once, in the README (§12). A run with `seed: null`, or with a best-effort seed, is one sample. Re-running it can give different numbers, and a difference between two models can't be read without knowing how much each varies against itself. This slice measures none of that.

## 5. The adapters

Each adapter is one file under `src/models/`. Each takes `{ env?, fetchImpl?, model }` and gets its key from `readKey(provider, env)` in `src/models/keys.ts`, which reads exactly one environment variable per provider. It throws `ModelError` naming that variable when it's absent or empty, before any request, and never falls back to another credential source. `keys.ts` also has `keyAppearsIn(provider, text, env)`, which the smoke script uses (§9.2) so that no script ever holds a key's value itself. None is exported from `src/models/index.ts`: only the factory can build one (§6.2). Tests import the files directly.

### 5.1 Shared parts

`src/models/json.ts` has `parseModelJson(text)`. It trims the text and strips one surrounding fence (a line of three backticks, optionally followed by `json`) if there is one, then runs `JSON.parse`. Anything else is "model output is not JSON", as now. **All four adapters use it, oMLX included.** oMLX in JSON mode has never produced a fence, so its behaviour on every recorded response is unchanged, and a test pins that. What counts as valid JSON is then the same for every provider, which the comparison needs.

`src/models/chat-completions.ts` holds what oMLX, OpenAI and xAI share: `firstChoice`, `finishReasonFrom` and a `usageFrom` that also reads `prompt_tokens_details.cached_tokens`. These are moved out of `omlx.ts` unchanged, and `omlx.test.ts` has to pass without an edit. Cached tokens are counted inside `prompt_tokens` there, so `inputTokens` is `prompt_tokens - cached_tokens`, and `cacheReadTokens` is the cached count.

`src/models/redact.ts` has `redact(text, key)`, which replaces the key with `[key]`. Every frontier adapter passes every `ModelError` problem string through it. That covers response bodies, `fetch` rejection messages and anything else that might echo a header.

### 5.2 Anthropic (`src/models/anthropic.ts`)

- `POST https://api.anthropic.com/v1/messages`, with headers `x-api-key`, `anthropic-version: 2023-06-01` and `content-type: application/json`. The key is read from `ANTHROPIC_API_KEY`.
- Body: `model`, `max_tokens` (from `maxOutputTokens`), `system: [{ type: "text", text, cache_control: { type: "ephemeral" } }]`, `messages: [{ role: "user", content: user }]`. `temperature: 0` and `thinking: { type: "disabled" }` are sent where the catalog says so.
- Response: the text blocks of `content`, joined, go through `parseModelJson`. `stop_reason` is mapped: `end_turn` to `stop`, `max_tokens` to `length` (with the same partial-output handling as oMLX), and anything else to `other`. **`refusal` throws** a non-retryable `ModelError` whose problems begin `refused:` and name `stop_details.category` if present. `isRefusal(error)` joins `isConnectionFailure` in `errors.ts`, so a refusal can't be read as a parser fault.
- Usage: `input_tokens`, `output_tokens`, `cache_creation_input_tokens` and `cache_read_input_tokens` map to `TokenUsage`. `model` maps to `servedModel`.
- HTTP errors: the status and the redacted body, 500 characters at most. 429, 529 and 5xx are marked retryable, with `retry-after` parsed when present (§7.3). 401 says "check ANTHROPIC_API_KEY", without the key.
- Timeout: 600 s.

### 5.3 OpenAI and xAI (`src/models/openai.ts`, `src/models/xai.ts`)

Both call `POST <host>/v1/chat/completions` with `authorization: Bearer <key>`. The hosts are `https://api.openai.com` and `https://api.x.ai`, and the keys come from `OPENAI_API_KEY` and `XAI_API_KEY`. The body has `model`, `messages` (system and user), `max_completion_tokens`, `reasoning_effort: "none"`, `temperature: 0`, and `response_format: { type: "json_object" }`. xAI also sends `seed`. The response is read through the shared core. `model` maps to `servedModel`. Error handling and timeout are as in §5.2.

Whether `gpt-6-luna` honours `json_object` with `reasoning_effort: "none"` on Chat Completions is documented only by implication. The fixtures say so until a smoke call records the real answer.

### 5.4 Batch (`src/models/anthropic-batch.ts`)

`AnthropicBatchAdapter` implements `ModelAdapter`, so callers don't know they're batched. `complete()` queues the request and returns a promise. Once no new request has arrived for `quietMs` (500 by default), the queue is submitted as one batch:

1. `POST /v1/messages/batches` with `{ requests: [{ custom_id, params }] }`. `params` is the same body as §5.2, and `custom_id` is a hash of it.
2. Poll `GET /v1/messages/batches/{id}` every `pollMs` (60,000 by default) until `processing_status` is `ended`. The progress line shows `request_counts`.
3. Fetch `results_url`, **only after checking that its host is `api.anthropic.com`**. Otherwise it throws. Then read the JSONL and match each line by `custom_id`, never by position. `succeeded` resolves that request's promise through the same response reader as §5.2. `errored`, `canceled` and `expired` reject it with a `ModelError` naming the type.

**A ledger stops an interrupted batch from being paid for twice.** On submit, `{ batchId, submittedAt, customIds }` is written to a directory passed in by the caller (`evals/results/batches/`, gitignored). When `complete()` gets a request whose `custom_id` is in a ledger entry less than 29 days old, it collects that batch's result instead of submitting again.

Clock, sleep and fetch are injected. The tests use a fake clock and no real waiting.

## 6. Choosing a model

### 6.1 Specs

`parseModelSpec(text)` in `src/models/spec.ts` reads `omlx`, `omlx:<model>`, `anthropic`, `anthropic:<model>`, `openai[:<model>]`, `xai[:<model>]`. A provider without a model means that provider's default from the catalog. A frontier model not in the catalog is refused, and the message lists the admitted ones. `omlx` with no model means `OMLX_MODEL` or the pinned default, as now.

### 6.2 Two factories

- `createLocalAdapter(spec, options)` builds oMLX or the fake and refuses any frontier spec with a clear message. `options.thinking` passes through to oMLX exactly as the scripts pass it today.
- `createAdapter(spec, options)` builds anything. For a frontier spec, `options.budget` is required (§7.2), and the result is always the provider's adapter inside the budget wrapper. There's no way to get an unwrapped frontier adapter from `src/models/index.ts`.

`app.ts`, `chat.ts` and `render-plain.ts` use `createLocalAdapter`. `run-eval.ts`, `run-screening-eval.ts` and `parse-criteria.ts` use `createAdapter`. `app.ts`'s `instanceof OmlxAdapter` becomes a check on `descriptor.adapter`.

**Why the renderer stays local.** `plain:render` writes `data/plain/`, the committed renderings the coordinator review shows. A frontier rendering would replace a checked local one in a committed file. The held slice's use for a frontier model there is to *check* explanations, not to write them, so opening the renderer to a frontier model is a decision for that slice.

### 6.3 Flags

Parsed by `scripts/lib/model-flags.ts`, shared by the three frontier-capable scripts:

| Flag | Meaning | Default |
| --- | --- | --- |
| `--model <spec>` | The one role of `eval` (parser) and `parse:criteria` | `omlx` |
| `--agent <spec>`, `--participant <spec>`, `--fidelity <spec>` | The three roles of `eval:screening` | `omlx` each, independently |
| `--spend` | Actually run a paid role. Without it, print the estimate and exit 0 | off |
| `--max-calls <n>` | Hard cap on frontier calls, retries included, per invocation | 100 |
| `--max-usd <x>` | Hard stop on spend computed from usage, per invocation | 1.00 |
| `--batch` | `eval` only, Anthropic only: submit as a batch at half price | off |
| `--all` | `eval:screening` with a frontier role: every vignette, not one | off |

Before anything runs, each script prints one line per role, for example `agent anthropic:claude-haiku-4-5 (temperature 0, seed none, thinking off)`, `participant omlx:Qwen3.6-35B-A3B-MLX-8bit` and so on. `.env` is never read for a provider or a model. It holds keys and the existing `OMLX_*` variables only.

**Smallest first.** With a frontier role and no study named, `eval:screening` runs one conversation: `NCT00077350-v1` from labels, 58 agent calls in 0004's run. The dev vignette is for tuning prompts and is never scored, so a first paid run on it would buy nothing to compare. More needs study ids, or `--all`, named explicitly. `eval` with a frontier model and no study named runs every labelled study, which is five calls.

## 7. Cost controls

### 7.1 The estimate

`src/models/estimate.ts` is pure. Given a catalog entry, a workload and whether it's batched, it returns expected and ceiling figures for calls, input tokens, output tokens and dollars. It prints the catalog's price date and the running total from the spend log (§7.4). It needs no key and makes no call.

Workloads are built next to their runners:

- **Parser eval** (`evals/estimate.ts`). Input is the real system prompt plus each study's normalized criteria text, at 3.0 characters per token. Claude's tokenizer runs nearer 3.5, so this overestimates on purpose. Expected output is twice the criteria text's tokens, a guess the first live run calibrates. The ceiling is `max_tokens` (16,384) per call.
- **Screening eval** (`evals/screening-estimate.ts`). Expected calls per vignette and source are its agent calls in the committed 0004 run, plus 25%. Expected input per call is the real system prompt, plus a user prompt built by the real builders from the vignette's criteria, with a made-up transcript at the context window's turn count and 150 characters a turn. Expected output is 60 tokens for an ask and 150 for a read. The ceiling is `--max-calls` × (the largest prompt + `max_tokens`). Only frontier roles are counted. Local roles cost $0.

**The ceiling is a real bound, not an estimate.** The call cap limits calls, `max_tokens` limits output, and every admitted model runs with reasoning off, so there are no hidden thinking tokens. The one thing the ceiling can't bound is a prompt larger than the largest one built, and the spend stop catches that.

The run refuses to start, even with `--spend`, if the *expected* cost exceeds `--max-usd`. The message says to raise it. If the ceiling exceeds `--max-usd`, it warns and runs: the spend stop halts it at the limit.

### 7.2 The budget wrapper

`BudgetedAdapter` in `src/models/budget.ts` wraps every frontier adapter and holds a `Budget { maxCalls, maxUsd, spend: true }`. Before each attempt it checks both limits. Once either is reached, it throws `ModelError` with a problem beginning `budget:`, and `isBudgetStop(error)` recognises it. After each response, it adds the usage priced from the catalog. Batch responses are priced at the batch rate, and cache reads and writes at theirs.

Both runners treat `isBudgetStop` as **stop the run now**, not "this conversation failed". A conversation stopped mid-turn is left exactly as an oMLX outage leaves it, and a later invocation with a new budget resumes it. The budget is per invocation. What stops the total drifting is the log (§7.4), which every estimate prints.

### 7.3 Retries

The wrapper retries a `ModelError` marked retryable (429, 529, 5xx, connection failure) up to twice. It waits for `retry-after` if the error gave one, at most 60 s, and otherwise 2 s then 8 s. Every attempt counts against the call cap. Refusals, 400s, 401s and output that isn't JSON aren't retried here. Callers such as `withRetry` in `src/screening/calls.ts` keep their own single retry for malformed output. Sleep is injected.

### 7.4 The spend log

Each invocation that spent anything appends one line to `evals/results/spend.jsonl`, which is committed. (`evals/results/batches/`, the batch ledger, is gitignored like the conversation cache.) The line records: date, script, role, spec, served model ids, calls, all four token counts, dollars at catalog prices, whether it was batched, and the catalog's price date. The smoke script appends too. There's no key, no request content and no id in it. The estimate prints the log's total, so the running cost of the project is one line on every paid run, and the numbers any README figure rests on are traceable to the log.

### 7.5 Caching and batch

**Caching.** The Anthropic adapter always marks the system prompt cacheable (§5.2), and the log records cache writes and reads. The system prompts here are 300 to 900 tokens, and Haiku 4.5 caches nothing under 4,096, so the expected saving on Haiku is zero. The README says that (§12). On Sonnet 5, whose floor is 1,024, the parser's and renderer's system prompts come close. The screening prompts don't, because the part that repeats is short and comes before the transcript, which changes every turn. Reordering them would change the agent, so it belongs with the agent fixes. OpenAI and xAI cache automatically, and their cached tokens are recorded too.

**Batch.** `npm run eval -- --model anthropic --batch --spend` builds `AnthropicBatchAdapter` inside the budget wrapper. `runEval` gains `concurrency`, which defaults to 1 as now and is set to every study when batched, so all parse requests queue together and go as one batch. The screening eval has no batch mode. Running conversations in lockstep batches is the held slice's decision, with its time cost (about a hundred rounds of up to an hour) stated beside its saving (about half of a few dollars).

## 8. Recording results

- **Every run records every role.** `ScreeningRun` gains optional `participantModel` and `fidelityModel` descriptors, written when they differ from the agent's. When they don't, the run looks exactly as it does now. `EvalRun` records its one role, as now.
- **Frontier runs record spend.** Both run types gain an optional `spend` field, the same record as the log line (§7.4), written only when a frontier role ran.
- **Cache keys don't collide.** `conversationKey` adds the participant's and fidelity check's model ids when they differ from the agent's, so a conversation simulated by a different participant is never resumed as if it were the same. Every existing key is unchanged, so the committed eval run still loads under `EVAL_RUN`. The parse cache key already includes the model. A frontier conversation key includes `null` for the seed, which is accurate.
- **A frontier agent screens from labels by default.** `readParse` keys a cached parse by the agent's descriptor, so a frontier agent screening from parses would look for parses made by that frontier model, not the local parser's. With a frontier agent, `eval:screening` defaults to `--source labels`. An explicit `--source parse` fails each conversation with "no cached parse for <model>" rather than quietly borrowing the local model's parse. Which parser a frontier comparison should screen from is the held slice's question.
- **The runners' role defaults stay** (participant and fidelity default to the agent's adapter), because tests rely on them. `run-screening-eval.ts` always passes all three explicitly, so the script never inherits them.

## 9. Recorded responses and the smoke script

### 9.1 Fixtures

`tests/fixtures/models/<provider>/*.json`, one response body per file:

```json
{
  "provenance": "written from https://… in 2026-09, not yet seen from the API",
  "status": 200,
  "headers": { "retry-after": "3" },
  "body": { }
}
```

`headers` holds only what the adapter reads (`retry-after`), never anything else. The set:

| Provider | Fixtures |
| --- | --- |
| Anthropic | ask ok, read ok, truncated (`max_tokens`), refusal, fenced JSON, 400, 401, 429 with `retry-after`, 529. Batch: created, in progress, ended, results JSONL with one succeeded and one errored line |
| OpenAI | ok, truncated (`length`), cached tokens in usage, 400, 401, 429 |
| xAI | ok, truncated, 400, 401, 429 |

All of them start as "written from" fixtures. The smoke script (§9.2) replaces the ok, and for Anthropic the batch ones, with recordings. The error ones stay written from documentation, and their provenance says so.

A test loads every fixture through a fake `fetchImpl` that returns it and records the request. It checks that no fixture contains a string shaped like a key (`sk-ant-`, `sk-`, `xai-` followed by 20 or more key characters), and that every fixture has a provenance line.

### 9.2 `npm run models:smoke -- <provider> [--batch] --spend`

`scripts/models-smoke.ts`, run by the owner and never by Claude:

1. Build the provider's default adapter through `createAdapter` with a budget of 4 calls and $0.05.
2. Print the estimate. Without `--spend`, stop there.
3. Send one `ask` and one `read` from the real agent's prompt builders, on a made-up criterion ("Age 18 years or older", inclusion) and a made-up transcript ("I'm 54."). With `--batch` (Anthropic only), send the same two as one batch.
4. Check that each response parses with the agent's own validators, and print pass or fail per call. That tells whether the adapter works end to end, not whether the model is good.
5. Scrub each body:
   - Replace ids (`msg_…`, `msgbatch_…`, `chatcmpl-…`, `id` fields) with fixed placeholders.
   - Drop all headers except `retry-after`.
   - **Refuse to write** if `keyAppearsIn` finds the key's value anywhere in the body.
   - Write it over the matching fixture with `provenance: "recorded 2026-…-… from <served model>"`.
6. Print the calibration: the estimate's input tokens against the reported ones, as a ratio. If it's off by more than 25%, the characters-per-token constant is changed by hand in a commit that says why.
7. Append to the spend log.

Nothing from the smoke goes in the README as a result. The recordings are the adapter's evidence.

## 10. Boundaries

`tests/boundary.test.ts` changes, each rule proved to fire:

- **Named hosts.** `api.anthropic.com` may appear only in `anthropic.ts` and `anthropic-batch.ts`, `api.openai.com` only in `openai.ts`, `api.x.ai` only in `xai.ts`. Any other non-loopback host in `src/models/` fails, as now. So does one of these hosts in the wrong file. The file comment's "Slice 0008 swaps in a frontier model" paragraph is rewritten to describe what now stands.
- **`fetch()` stays confined** to `src/models/`, the page's two clients, and the network-exempt files as now. The new adapter files join the per-file exemption by name.
- **Only `src/models/` chooses a model, now including `scripts/`.** No file under `src/` or `scripts/` uses `OmlxAdapter`, `AnthropicAdapter`, `AnthropicBatchAdapter`, `OpenAIAdapter` or `XaiAdapter` as a value. Scripts get adapters from the factories.
- **The running application can't build a frontier adapter.** No file under `src/server/`, `src/transport/` or `src/web/`, and none of `scripts/app.ts`, `scripts/app/*`, `scripts/chat.ts` and `scripts/render-plain.ts`, uses `createAdapter` as a value. They may use `createLocalAdapter`.
- **Keys are read in one place.** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `XAI_API_KEY` appear in source only in `src/models/keys.ts` (and in `.env.example` and tests).
- The existing "no test mocks a module or stubs a global" rule stays, and every new test honours it through injection.

## 11. Tests

All deterministic, offline, and through injected `fetchImpl`, sleep and clock. The whole suite must stay near a second.

1. **Adapters against fixtures** (`tests/models/anthropic.test.ts`, `openai.test.ts`, `xai.test.ts`). For each fixture: the parsed content, finish reason, usage and served model, and the request that was sent. That covers URL, headers present (auth header present, with the sentinel key), body fields per catalog entry: temperature sent or not, seed sent or not, reasoning field, `cache_control` on the system prompt for Anthropic. Sonnet 5's body has no `temperature`. Luna's has no `seed`. A refusal throws and `isRefusal` holds.
2. **Keys.**
   - A missing or empty key throws before any request, naming the variable.
   - With a sentinel key, the sentinel appears in nothing a caller can see: not in the thrown messages from every failure fixture, a `fetch` that rejects with a message containing it, a 400 body that echoes it, the descriptor, the response or the spend record.
   - `readKey` ignores `ANTHROPIC_AUTH_TOKEN` and any other variable. `keyAppearsIn` finds the sentinel and returns false when no key is set.
3. **Shared JSON parse.** A fenced body parses. Prose around the JSON doesn't. Every oMLX test passes unedited.
4. **Budget.**
   - The call cap refuses call `n+1` and `isBudgetStop` holds.
   - The spend stop refuses the next call once priced usage reaches the limit.
   - Retries count against the cap, and `retry-after` is honoured up to 60 s.
   - A 400 isn't retried.
   - Batch and cache prices are applied.
5. **Estimate.**
   - Expected and ceiling figures on a fixed workload, to the cent.
   - A model outside the catalog is refused.
   - An expected cost over `--max-usd` refuses to start.
   - Dry by default: a frontier spec without `--spend` never constructs an adapter, which is proved by passing an env with no key and seeing the estimate print.
6. **Batch.** Submit, poll through "in progress" to "ended", and collect results out of order by `custom_id`. An errored line rejects only its own request. A `results_url` on another host throws. A ledger hit collects instead of submitting, which is proved by a fake fetch that fails the test on a second `POST`.
7. **Specs and factories.** Parse and refuse cases. `createLocalAdapter` refuses each frontier provider. `createAdapter` without a budget refuses a frontier spec.
8. **Runners.**
   - `conversationKey` is unchanged when all roles match, and differs when the participant differs.
   - A budget stop halts `runScreening` after the current conversation, and leaves it resumable.
   - `runEval` with `concurrency` batches its studies.
   - Null temperature and seed print as `not settable` and `none`.
9. **Boundaries**, as §10.
10. **`.env.example`** documents the six variables, all empty.

## 12. Documentation

**CLAUDE.md.**
- The non-negotiable "No live network calls at runtime" gains its exception in words: the running application (`npm run app`, the server, `screening:chat`) makes none. Scripts a person runs may call three named hosts from `src/models/`, only with `--spend`.
- The "three boundaries" paragraph becomes four exceptions and names the files.
- The verifying table gains `models:smoke` and the role, `--spend` and budget flags on `eval`, `eval:screening` and `parse:criteria`.
- The model-access convention names the two factories.

**README.** A short "Model providers and cost" section:
- the catalog and its date
- the dry-by-default rule and the caps
- the spend log and its total
- what an unseeded result is
- that caching saves nothing on Haiku with today's prompts, and why
- that batch is built for the parser eval only
- whether each adapter is recorded or only written from documentation, as the fixtures stand at merge

**ROADMAP.** The 0008 row marked done, and a "Carried forward from 0008" list. At minimum it says:
- which adapters are unrecorded
- that the screening prompts would need reordering to cache
- that screening batch is undecided
- that xAI's Chat Completions is legacy
- that OpenAI's seed is unused
- that `plain:render` is local-only on purpose

## 13. What the plan must gate

1. **After the offline build: the defaults.**
   - **When:** the adapters, factories, budget, estimate, batch path, flags and tests all exist and pass.
   - **What gets confirmed:** the catalog's admitted models and defaults, the 100-call and $1.00 caps, the smallest-first scope, `--spend` as the flag's name, and that the estimate's output is readable. The owner sees it by running `npm run eval:screening -- --agent anthropic` and `npm run eval -- --model anthropic --batch` with no key and no `--spend`, and reading what they print.
   - **What rides on it:** every paid run in the held slice inherits these. A cap that's too generous, or an estimate nobody reads because it's unclear, is how a PoC bill surprises you.
   - **Not always yes:** if the printed estimate doesn't make clear what would be spent and on what, it changes before anything else.
   - **Delegable,** with Claude's recommendation. Its value doesn't come from independence.

2. **The smoke calls, optional.** The owner puts a key in `.env` and runs `npm run models:smoke -- anthropic --spend`, then `-- anthropic --batch --spend`, and each other provider they have a key for.
   - **What gets decided:** whether the recordings replace the fixtures, and whether each adapter is "recorded" or "written from documentation" in the README and PR.
   - **What rides on it:** an adapter that passes its tests and fails its first real call wastes the first paid run of the held slice.
   - **Can't be delegated to Claude,** because it spends the owner's money with the owner's key, and Claude doesn't handle keys. It needs no independent reader, and no clinical judgment.
   - **Skipping it is allowed** and is recorded in the plan and the PR.

The rest of the slice (docs, boundary rewording) needs no gate. It ends in tests and text.

## 14. Out of scope

- Any paid call from a test, or from a command run without `--spend`.
- A comparison, or any README result from a frontier model.
- Changes to `src/screening/`, `src/criteria/`, `src/plain/`, the prompts, labels, vignettes, renderings or any committed result.
- Frontier models in `npm run app`, the server, `screening:chat` or `plain:render`.
- Batch for OpenAI or xAI, and lockstep batching of conversations.
- Models that can't run with reasoning off (Opus 5.5, Fable 5.1), until a slice argues for them.
- Structured outputs with schemas, streaming, tool use, and the Responses APIs.
- Provider SDKs and any other new dependency.
