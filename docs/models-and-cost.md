# Model providers and cost

The local model everything was measured on, the hosted models the app can use, and what they cost. Part of the [Trial Prescreening Agent](../README.md) documentation.

## Model providers and cost

Everything measured so far ran on a local model, and no number in these docs comes from a hosted one. The project can also use Anthropic, OpenAI and xAI (slice 0008): in the app, when a person chooses one in Settings (slice 0017), and in the evaluation scripts, with `--spend`. The comparison with the local model is a later slice, run only when the repository owner says so.

### In the app

**Settings chooses the model** for the agent and for reading an added trial's rules: the local model (the default), or Anthropic, OpenAI or xAI with a key pasted there. The key is kept in `local/settings.json`, which is gitignored and readable only by its owner, and the page is only ever shown its last four characters. A key in `.env` is never used by the app: a hosted key for the app comes only from Settings, so spending through the app always rests on a key someone pasted there for it. **Test** makes one agent call on a made-up question, capped at 2¢.

**What it costs**, estimated by the same functions that price the eval's paid runs, on the longest example conversation (78 calls) and the five labelled trials averaged. These overestimate: Anthropic's smoke run found the token count about 1.4× too high.

| Model | One screening | Reading one trial |
| --- | --- | --- |
| `openai:gpt-6-luna` | about $0.03 | about $0.003 |
| `anthropic:claude-haiku-4-5` | about $0.29 | about $0.03 |
| `anthropic:claude-sonnet-5` | about $0.58 | about $0.06 |
| `xai:grok-4.3` | about $0.33 | about $0.02 |

At gate 2 (2026-10), the owner's own run on Haiku 4.5 cost $0.0005 for the test, $0.0076 to read NCT05854498 into 12 criteria, and about $0.01 for three answers.

**Capped and logged.**

- **The caps:** each screening stops at $0.50 and each trial read at $0.25, both adjustable in Settings. A screening that reaches its limit keeps what it has, says so, and continues if the limit is raised.
- **A screening keeps the model it started on.** Switching models in Settings doesn't move an unfinished screening; it says which model to switch back to.
- **The ledger:** every turn, trial read and test appends what it spent to `local/spend.jsonl`, in the same shape as the eval's committed ledger, which stays separate.
- **A restart** starts a resumed screening's cap from zero; the ledger keeps the true total.

**Which models have met the live API** is recorded in the catalog (`smokeTested`). A test requires each date to match a committed `models:smoke` run. Today that's only `anthropic:claude-haiku-4-5` (2026-10). Settings marks the others "Not yet tested against the live API", and their first live call is the person's own Test.

**A screening on a hosted model is unmeasured.** The agent and the parser were tuned and measured on the local model, and their prompts are unchanged. The screening, its review and the trial card say which model made them.

### In the evaluation scripts

**Choosing a model is a command-line flag.** Each role takes a spec: `omlx`, a provider name for its cheapest admitted model, or `provider:model`.

```
npm run eval:screening -- --agent anthropic        the agent on Claude Haiku 4.5; participant and fidelity check stay local
npm run eval -- --model openai                     the parser on GPT-6 Luna
npm run eval -- --model anthropic --batch          the same five studies as one Anthropic batch, at half price
```

Every role defaults to the local model, so swapping the agent never swaps the simulated participant or the fidelity check that measure it. `.env` holds the scripts' keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`) and nothing that chooses a model. A key sitting there never turns a run into a paid one. The terminal chat and the plain-language renderer can't use a hosted provider at all.

To run one: put the provider's key in `.env`, name the model as above (this prints the expected cost and stops), then add `--spend` to run it for real.

**The admitted models**, with prices as of 2026-09, per million tokens (`src/models/catalog.ts`):

| Model | Input / output | Temperature | Seed |
| --- | --- | --- | --- |
| `anthropic:claude-haiku-4-5` (default) | $1.00 / $5.00 | 0 | none: the Claude API has none |
| `anthropic:claude-sonnet-5` | $2.00 / $10.00 | not settable: rejected by the model | none |
| `openai:gpt-6-luna` (default) | $0.10 / $0.50 | 0 | not sent: undocumented for this model |
| `xai:grok-4.3` (default) | $1.25 / $2.50 | 0 | sent, best effort only |

Each one can run with reasoning off, as the local agent does. That is the admission rule, so a comparison doesn't have to explain a difference in reasoning. Claude Opus 5.5 and Fable 5.1 can't turn it off and are refused by name. Any model not in the catalog is refused too, not run at an unknown price.

**A result from any of these is one sample.** No Claude model takes a seed, OpenAI's isn't used, and xAI's is best effort. Results record `seed: null` (or the seed and "best effort") with the reason, and a temperature that couldn't be sent as "not settable". Re-running can give different numbers, and a difference between two models means little until each has been run enough to see how much it varies against itself. How many runs that takes is the comparison slice's first question.

**Nothing is spent by accident.**

- **Dry by default.** A run naming a frontier provider prints each role's model and settings, an expected cost and the most it could cost, then exits. It spends only with `--spend`.
- **Capped.** 100 calls and $1.00 per invocation by default (`--max-calls`, `--max-usd`), shared by every paid role in the run, retries included. A run expected to cost more, or to need more calls than the cap, is refused before it starts. One that reaches a cap stops, and resumes on the next run.
- **Smallest first.** A paid screening run defaults to one conversation, `NCT00077350-v1` from labels, estimated at about $0.16 on Haiku 4.5. `--all` runs every vignette.
- **Logged.** Each paid run appends what it spent to `evals/results/spend.jsonl`, and every estimate prints the project's total so far.

**What caching and batching save, honestly.**

- The Anthropic adapter marks each system prompt cacheable and records cache reads and writes. On this project's prompts that saves nothing on Haiku 4.5: its prompts are 300–900 tokens, and Haiku caches nothing under 4,096. Making the screening prompts cache well would mean reordering them, which changes the agent, so it belongs with the agent fixes.
- Batching halves the price, and is built for Anthropic and wired into the parser eval only. A conversation can't be batched simply, because each turn needs the reply before it. Running the screening eval in lockstep batches would take about a hundred rounds of up to an hour each to save about half of a few dollars. Whether that's worth it is the comparison slice's decision.

**Only Anthropic's adapter has been tested against the live API.** Each is proven by `npm test` against recorded responses through an injected HTTP layer, offline and free. Anthropic's are real recordings, from the owner's smoke run in 2026-10. OpenAI's and xAI's were written from the providers' documentation, because no live call has been made with them. `npm run models:smoke -- <provider> --spend` makes one live `ask` and `read` call, a fraction of a cent. It replaces the fixtures with real responses, scrubbed of ids and refused if they contain the key, and checks the estimate's token counts. Until it has been run, an adapter is built, not proven.
