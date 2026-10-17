# intent: 0008 frontier adapters

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. Adapters for Anthropic, OpenAI and xAI behind the existing `ModelAdapter` in `src/models/`, chosen by configuration, proven against recorded responses, with cost controls built in before anything can spend. Nothing in this slice calls a paid API unless I run it myself. The comparison this slice used to be, and the independent checks that were waiting on a frontier model, move to a held slice that runs only when I say so. The agent, the prompts and every committed result are unchanged.

---

## Problem

The roadmap row for 0008 says "local model against a frontier model by swapping the adapter". That's no longer this slice. I'm not ready to spend on a frontier model, and when I am, I want the spending to be deliberate, estimated and capped, not a side effect of a script that happened to find a key. So 0008 builds the ability and uses none of it.

The pieces are closer than the roadmap makes them sound, and further than the word "swap" suggests.

**The seam exists.** Nothing outside `src/models/` calls a model, and `tests/boundary.test.ts` makes sure of it. The parser and the screening agent take a `ModelAdapter` and can't build one. `ModelDescriptor.seed` is already `number | null`, because "this runtime cannot be seeded" and "this run was seeded with 0" are different facts.

**But choosing a model is a code change today.** Six scripts construct `OmlxAdapter` by name (`app`, `chat`, `parse-criteria`, `render-plain`, `run-eval`, `run-screening-eval`), and `scripts/app.ts` checks `instanceof OmlxAdapter`. The boundary test covers `src/` and not `scripts/`. "Configuration, not a code change" needs one factory those six call, and then no script names a concrete adapter again.

**One eval run uses the model in three roles.** 0004's committed run made 4,192 calls: 2,096 by the agent, 1,048 by the simulated participant and 1,048 by the fidelity check. A single "which model" setting would swap all three. That's the wrong experiment, because the simulator and the check are the ruler and the agent is what's measured. It also triples the bill. Configuration has to be per role, and every role except the one named stays on oMLX.

**The frontier APIs don't behave like oMLX, and some of the differences reach the results.** Checked against current Claude API documentation (the claude-api skill, cached 2026-06). OpenAI and xAI facts are for the spec to confirm from their own docs.

- **No Claude model takes a seed.** There's no seed parameter at all. Every Claude result will record `seed: null`.
- **Temperature is rejected on the newer Claude models.** Sonnet 5, Opus 5, Opus 5.5 and Fable 5/5.1 return a 400 if `temperature` is sent. Haiku 4.5 still takes it. So "temperature 0" is a property of some models and not others, and `ModelDescriptor.temperature`, a plain number today, can't honestly record "not settable".
- **Thinking can't always be switched off.** The agent runs with reasoning off (0004). Haiku 4.5 doesn't think unless asked. Sonnet 5 can turn it off. Opus 5.5 and Fable can't, and their thinking is billed as output.
- **There's no JSON mode.** oMLX takes `response_format: json_object`. Claude has structured outputs, which need a schema, and our requests carry only `responseFormat: "json"`. Assistant prefill, the old trick, returns a 400 on current models.
- **A refusal is its own stop reason.** Claude can decline with `stop_reason: "refusal"`. The adapter has to report that as a refusal, not as unparseable JSON, or a model declining to discuss pregnancy looks like a parser bug.
- **Prompt caching has a floor, and our prompts are under it.** The agent's system prompts are about 1,250 and 1,950 characters, the parser's about 3,200 and the plain renderer's about 3,470. That's roughly 300 to 900 tokens. Caching won't engage below 4,096 tokens on Haiku 4.5, 1,024 on Sonnet 5 and 512 on Opus 5. The stable parts of the read prompt (the criteria list) come *after* the transcript, which changes every turn, so the prefix that repeats is only the system prompt. Honestly: caching built into the adapter will save close to nothing on today's prompts. Reordering them would change the agent, which this slice doesn't do.
- **Batch pricing doesn't fit a conversation.** The Batches API is 50% off, and most batches finish within an hour, but it can take up to 24 hours. It suits independent calls, like the parser over twelve studies or the renderer over 252 criteria. A screening conversation is sequential. Each turn needs the previous reply. Batching it means running all 30 conversations in lockstep, one batch per step, which is about a hundred rounds of up to an hour each.

**The network rule has to move, visibly.** CLAUDE.md's non-negotiables say no live network calls at runtime, and that nothing under `src/` makes a network call at all, except three named loopback exceptions. A frontier adapter is a call off this machine from `src/models/`. The product intent allows frontier calls "confined to the comparison slice and release-gating evals", so this is sanctioned, but it widens a binding rule. It should widen in the narrowest form, where a test can see it, and the running application should stay exactly as local as it is.

**What it costs, as far as I can estimate before anything is measured.** Assumptions: about 70 agent calls per conversation (2,096 over 30), about 1,000 input tokens and 100 output tokens per call, and no caching. The simulator and fidelity check stay local and cost nothing.

| Run | Haiku 4.5 ($1 / $5 per MTok) | Sonnet 5 ($2 / $10) |
| --- | --- | --- |
| One live call to prove an adapter | under $0.01 | under $0.01 |
| One vignette, agent only | about $0.10 | about $0.20 |
| Full screening eval (30 conversations), agent only | about $3 | about $6 |
| Same, if it could be batched | about $1.50 | about $3 |
| Parser over the twelve studies | well under $1 | about $1 |

These are rough, within a factor of two either way. The estimator this slice builds replaces them. The point they make: on the cheapest model, the runs I'd actually do cost a few dollars. The cost controls matter less for planned runs than for unplanned ones: a retry loop, a mistyped model id that lands on Fable 5.1 at $10 / $50 with thinking always on, or an ambient `.env` line that quietly turns every local run into a paid one.

## Proposed outcome

**Adapters for three providers, in `src/models/`, behind `ModelAdapter`.** Anthropic's Messages API in one file. OpenAI and xAI in files of their own, sharing an OpenAI-compatible core with oMLX where the wire format really is shared, and separate where it isn't. Each takes an injected `fetchImpl`, the way `OmlxAdapter` already does, so tests pass a fake HTTP layer and nothing mocks a module or stubs a global. The `ModelAdapter` interface stays as narrow as it is. What the new adapters need goes in their constructors or in a separate batch surface, not in `CompletionRequest`.

**One factory, and configuration per role.** `createAdapter(config)` in `src/models/` is the only thing that constructs an adapter, and the six scripts call it. The config names a provider and a model per role (agent, participant, fidelity check, parser, renderer). Every role defaults to oMLX. The boundary test's "only `src/models/` chooses a model" rule extends to `scripts/`: no script names a concrete adapter as a value.

**A paid provider is named on the command line, never in `.env`.** `.env` holds keys, nothing else. A run uses a frontier provider only when the command that starts it says so (`--agent anthropic:claude-haiku-4-5`, or whatever the spec settles on). A key sitting in `.env` never changes which model a run uses. That keeps a paid run from ever being ambient.

**Keys.** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `XAI_API_KEY`, read from the environment, documented by name only in `.env.example` (whose existing test already requires the values to be empty). An adapter refuses to construct without its key and says which variable is missing, the way `readOmlxConfig` does. The Anthropic adapter reads the variable and nothing else. It does not fall back to an `ant` CLI profile or any other credential found on the machine. The key appears in one request header and nowhere else: not in an error, a descriptor, a log line, a result or a recorded fixture. Tests prove that with a sentinel key through every failure path.

**Named hosts, in named files.** `api.anthropic.com` only in the Anthropic adapter, `api.openai.com` only in the OpenAI one, `api.x.ai` only in the xAI one. Each is a literal, not an environment variable. oMLX's base URL can come from the environment because the code rejects anything off loopback. A frontier base URL from the environment could point anywhere, and the boundary test, which reads source, couldn't see it. `tests/boundary.test.ts` gains the three hosts as named exceptions, each proved to fire, and a host outside its own file still fails the suite.

**The running application stays local.** `npm run app`, the server under `src/server/` and `npm run screening:chat` accept oMLX and the fake, and refuse a frontier provider. A test checks that nothing reachable from the server or the app's launcher can construct one. The product intent's "no live network calls at runtime" then still holds for the thing that runs. Frontier calls happen only in scripts a person runs. It also means nothing a person types into the page or the chat is ever sent to a third party.

**Results record what was actually run.** Every result from a frontier adapter records provider, the model id asked for, the model id the provider says answered (if it returns a dated or snapshot id), temperature, seed and the thinking or effort setting. Where a setting couldn't be sent, it says that rather than a number. `ModelDescriptor.temperature` becomes `number | null`, with null meaning "not settable on this model, the provider's default applied", and the recorded note says which. `seed: null` gets the same treatment.

**What happens when a provider can't be seeded.** Every Claude run, and any other that can't be seeded, is recorded as unseeded: `seed: null`, with the reason. A run from an unseeded model is one sample, not a reproducible result, even at temperature 0. It can't be re-run to get the same numbers, and a difference between two runs can't be read as a difference between two models without knowing how much one model varies against itself. This slice doesn't measure that. It makes sure no result can pretend otherwise. How many repeats a comparison needs, and what they cost, is the held slice's first question. Where a provider does take a seed (OpenAI documents one as best effort, to be confirmed per model in the spec), it's sent and recorded, along with any fingerprint the provider returns. The README says best effort isn't the same as oMLX's seed.

**Cost controls, all in `src/models/`, so no caller can go around them:**

1. **An estimate before any paid run.** A run that names a frontier provider prints what it will send (calls per role, input and output tokens, the price table's date) and an estimated cost, then stops. It's dry by default. It spends only with an explicit flag. The estimate works offline, from the prompts the run would build and a characters-per-token ratio. It's calibrated by the first live call's real token counts, and it says how far off it could be. Prices come from a committed table with a date and a source. A model not in the table is refused, not estimated at zero.
2. **A hard cap on calls.** A wrapper every frontier adapter goes through counts calls, retries included, and fails the next one past the cap. The default cap is small (enough for one vignette with its retries). Raising it is a flag on the command line, not a setting that lingers. A second stop on spend, computed from the usage each response reports, backs it up. The spec decides whether the spend stop is hard too.
3. **Prompt caching where it can work.** The Anthropic adapter marks the system prompt cacheable and records cache writes and reads from every response. That's built and tested. On today's prompts it will mostly record zero, and the README says so rather than claiming a saving. Making the agent's prompts cache well is a prompt change, and it belongs with the agent fixes.
4. **Batch pricing for eval runs.** A batch surface beside `ModelAdapter`, for Anthropic only in this slice: submit a set of independent requests, wait, collect by id. It's wired into one runner of independent calls, the parser eval or the plain renderer (spec decides), so the path is exercised end to end. The screening eval stays synchronous. Its lockstep batch mode, and whether a saving of about $1.50 is worth a run that could take days, is the held slice's decision.
5. **Smallest first by default.** With no model named, the default frontier model is the cheapest one on the provider's current list, and the default scope is one vignette (the dev vignette 0004 already defines). For Claude that's Haiku 4.5. It also happens to be the closest match to how the local model runs: it takes `temperature: 0` and doesn't think unless asked. Whether it's *useful* on this task is unknown until it runs, and that's a result the held slice reports, not an assumption this one makes. A bigger model or a bigger scope has to be asked for by name.

**Recorded responses, in `tests/fixtures/models/`.** One set per provider: a normal answer, a truncated one, a refusal, an error body, and a batch's results for Anthropic. Each file carries its provenance: either "recorded <date> from <model>" or "written from <documentation URL> on <date>, not yet seen from the API". Only response bodies are kept. Response headers carry organisation and request ids, and those are dropped. A test fails if any fixture contains anything shaped like a key. `npm test` runs the adapters against these through the injected fetch, stays offline and free, and stays around a second.

**A roadmap row for what moved.** The 0008 row changes to this slice. A new row, held until I say so, takes the model comparison and the independent checks that were waiting on a frontier model:

- the local agent against a frontier agent on the same vignettes (0004's first reason for this slice)
- a second, independent annotator for the parser labels (0003, "the single most valuable thing a later slice could add")
- an independent second drafter for the vignettes (open question 6 says 0008)
- an independent check of the plain-language explanations of terms (0006 says 0008)
- a record of the reader's model in any later model reading (0007)

## Absent on purpose

- **No paid call from `npm test`, from any other test, or from any command I don't run myself.** Not in CI either, since there isn't one.
- **No comparison, no frontier result, no README number from a frontier model.** The held slice does that.
- **No agent change.** `PROMPT_VERSION` stays `c5778afe9cbd`. Prompts aren't reordered for caching, even though that's the only way caching would pay. The transparency test from 0005 passes unchanged.
- **No frontier provider in the page, the server or the terminal chat.**
- **No change to the local model's settings.** `TEMPERATURE`, `SEED`, and the thinking setting per call site stay as they are. Every committed result stays valid.
- **No batch path for OpenAI or xAI**, and no lockstep batching of conversations.
- **No provider SDKs, if the spec agrees** (decision 1).
- **No streaming, no tool use, no multi-turn** in the adapter surface. Same as now.

## Affected users and systems

**Me.** I run anything that spends, with my own key. The slice has to make the cheap, small, dry path the easy one, and anything else a deliberate choice I type.

**The coordinator and the participant.** Unaffected. Nothing they see changes, and nothing that reaches them can use a frontier model.

**`src/models/`.** New adapter files, a factory, the cost wrapper, the price table, the batch surface, and `ModelDescriptor` changes (`temperature: number | null`, a provider field, a reasoning setting general enough for "off", "not asked" and an effort level). `OmlxAdapter` keeps its behaviour and its descriptor, so every recorded oMLX result reads the same.

**`scripts/`.** The six scripts call the factory. The model-calling runners gain the provider flags, the estimate-then-stop behaviour and the cap. `app.ts` and `chat.ts` refuse a frontier provider.

**`tests/`.** Adapter tests against recorded fixtures through injected fetch. Key-hygiene tests. `tests/boundary.test.ts` gains the three named hosts, the `scripts/` rule for constructing adapters, and "nothing the server reaches builds a frontier adapter". Anything that prints or reads `temperature` handles null.

**CLAUDE.md, the README, the roadmap, `.env.example`.** CLAUDE.md's network rule is rewritten to say where the line now is: off-machine calls only from `src/models/`, only to three named hosts, only from scripts a person runs, never from the running application. The verifying table gains the new flags. The README gains a short section on providers and cost, including what caching doesn't save. The roadmap gains the 0008 row, the held row and a carried-forward list.

**Not touched:** `src/screening/`, `src/criteria/`, `src/plain/`, `src/server/` (beyond refusing a provider, if that check belongs there), `src/web/`, `data/`, labels, vignettes, and every committed result.

## Constraints

- **Offline and free by default.** `npm test`, `npm run typecheck`, `npm run lint` and every script run without a flag make no off-machine call. A frontier call needs a key in the environment, a provider named on the command line and a spend flag, all three.
- **The flag comes before the key.** The provider flag and the estimate don't need a key, so I can see what a run would cost before a key exists on the machine.
- **Keys never leave the header.** Not in an error, a log line, a result, a fixture or a commit.
- **The network exception is literal and per file.** Three hostnames as literals, each in one file under `src/models/`, each proved to fire in the boundary test.
- **Results stay results.** Model, quantization, temperature, seed and reasoning setting are recorded for every run. Where one couldn't be set, the record says so and why, and never shows a number that pinned nothing.
- **No PHI leaves the machine.** Only synthetic vignettes, labels and trial text are ever sent. Nothing a person types into the page or the chat can reach a frontier adapter.
- **No gate needs clinical judgment.** Nothing here asks whether a criterion or an answer is medically right.
- **Dependencies stay small.** Any new one is argued in the plan.
- **`npm test` stays near a second**, with `isolate: false` still safe.

## Decisions

1. **Plain `fetch` through an injected function, not the provider SDKs.** The claude-api skill's default is the official SDK, and it has real advantages: typed errors, built-in retries, batch helpers. I'm recommending against it here for four reasons, and the spec can argue with them.
   - The boundary test works by reading source under `src/`. An SDK makes its requests inside `node_modules/`, where the test can't see the host. The named-host exception is only visible if the `fetch` call and the hostname are in our file.
   - Three SDKs is three dependencies, and CLAUDE.md makes each one a plan-level decision. Two of the three wire formats are already spoken by `OmlxAdapter`.
   - SDK retries are a cost path the call cap has to see. Retries we write go through the cap. Retries inside an SDK can be switched off, but that's one more thing to get right.
   - The Anthropic SDK resolves credentials from several places, including CLI profiles on disk. "Refuses to start without its key" is simpler to guarantee when the adapter reads exactly one variable.

   The cost is writing and testing request and response handling ourselves, against recorded responses, which this slice does anyway.

2. **Configuration per role, and every role defaults to local.** Swapping the agent must not swap the simulator or the fidelity check. A comparison run has one role on a frontier model and the rest on the ruler.

3. **The paid path is dry by default, capped and named on the command line.** Three things have to be true for money to move: a key in the environment, a provider on the command line and an explicit spend flag. Without the flag, the run prints its estimate and exits 0. The cap counts every call, retries included.

4. **Should "built" include one live call per provider, run by me with my own key?** My recommendation: **yes for Anthropic, and for the others when I have a key, but not as a condition of merging.**

   The case for it. A recorded response has to be recorded from something. If I write the fixtures from documentation, the same author writes the fixture and the code that reads it, and the test proves they agree. That's the flaw this project has already named twice: labels and prompt sharing an author (0003), and a gate Claude answers about its own work (0006). Here's the kind of thing only a live call catches. If the adapter sends `temperature: 0` to Sonnet 5, the API returns a 400. A fixture written from the assumption that it's accepted would pass. One call (one `ask` and one `read` on a fixed synthetic criterion, on Haiku 4.5) costs a fraction of a cent, and its response becomes the fixture, so the offline tests are pinned to the real API from then on. For Anthropic, one tiny batch too, because the batch path (submit, poll, collect by id, results in any order) is where docs-derived code is most likely to be wrong. It costs a fraction of a cent, but it can take up to 24 hours to come back.

   The case against. It's a network call in a slice that promises none. It needs a key I don't have to create yet. It's a small departure from the product intent's "frontier calls confined to the comparison slice and release-gating evals": a smoke test is neither. For OpenAI and xAI, a key I don't otherwise need is friction for an adapter nobody will use first.

   So: a script (`npm run models:smoke -- anthropic`, name to be settled) that makes the calls, shows the estimate first, needs the spend flag, and writes the scrubbed bodies into `tests/fixtures/models/`. If I run it, the Anthropic fixtures say "recorded". If I don't, or for the providers I skip, they say "written from documentation, not yet seen from the API". The README and the PR say which. The first real use of an unrecorded provider starts with its smoke call. The recordings are the adapter's evidence, not a result: no number from them goes in the README.

5. **Gates.** Proposed for the plan to argue with. None needs clinical judgment. **None gets its value from an independent reader**, so you can delegate either one. The second one you can't delegate to me for a different reason: it spends your money with your key, and I shouldn't handle the key.

   - **After the adapters, cost controls and factory are built and tested offline, before any live call:** confirm the defaults later runs inherit. That's the default model per provider, the default cap, the spend flag's name and behaviour, and the role defaults. What it costs to be wrong: every paid run in the held slice starts from these, and a default that's too generous is exactly how a PoC bill surprises you. I'll bring a recommendation.
   - **The live smoke calls, if you want them (decision 4):** you run the script with your key. What's decided: whether the recorded responses replace the documentation-derived fixtures, and whether each adapter counts as proven or only built. What it costs to be wrong: an adapter that passes its tests and fails its first real call, on the first paid run.

## Open questions for the spec

1. **OpenAI's and xAI's current surfaces.** Which endpoint (OpenAI's chat completions or its newer Responses API), the cheapest useful model ids and prices, whether each takes `temperature` and `seed` on those models, how each asks for JSON, and whether xAI really is wire-compatible enough to share a core. From each provider's documentation, dated, not from memory.
2. **JSON from Claude.** A prompt instruction plus a tolerant parse (fences stripped, one object extracted), or structured outputs with a schema, which means `CompletionRequest` would gain an optional schema that oMLX ignores. The first changes nothing outside `src/models/`. The second is more reliable. Either way, the adapters must not quietly differ in what they accept as valid, or the comparison measures the adapter.
3. **The descriptor change.** The exact shape of "not settable" for temperature and seed, the provider field, and a reasoning field general enough for oMLX's "off", Claude's "not asked" and an effort level. And how the committed oMLX results, which have none of the new fields, still read correctly.
4. **The config format.** Flag syntax per role, what the factory reads, and how a script reports the roles it's running before it starts.
5. **The estimator.** Characters per token per provider, the margin it prints, how the first live call calibrates it, and where the price table lives and says its date.
6. **The cap's default number** and whether the spend stop is hard. Whether a run that hits the cap mid-conversation leaves the conversation resumable, the way an oMLX outage does.
7. **Retries and rate limits.** What the adapter does on a 429 or a 5xx, how many retries, and that each one counts against the cap.
8. **Which runner the batch path is wired into**, the parser eval or the plain renderer, and how a batch that's still running when the script exits is picked up again.
9. **Where the "no frontier provider in the running application" check sits.** In the factory (a flag for local-only callers), in the server, or only in the boundary test.
10. **The smoke script's exact calls and scrubbing rules**, and what it refuses to write.
