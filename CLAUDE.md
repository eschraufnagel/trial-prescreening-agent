# CLAUDE.md

## What this is

A local proof of concept: an agent that conducts a prescreening conversation for a clinical trial, evaluates the person against eligibility criteria parsed from a real published protocol, and hands a reviewable result to a human coordinator.

The eval harness is the primary artifact. The agent exists to give the harness something to measure. Read `work/0000-product/intent.md` before making design decisions.

## Non-negotiable constraints

These come from the product intent. Do not violate them, and flag it if an instruction would require violating one.

- No PHI anywhere. Patient data is synthetic or hand-authored. This applies to fixtures, tests, logs, comments and commit messages.
- No real patient contact path. No SMS, email, telephony or outbound messaging of any kind. The transport is local and simulated.
- No live network calls at runtime, with one exception. The pinned trial corpus is fetched by a script and saved as fixtures, which the running application reads. Since slice 0013, the app's Trials screen fetches one study from `clinicaltrials.gov` when a person clicks Add or Refresh, and at no other time. Since slice 0008, scripts a person runs may call three named frontier hosts from `src/models/`, and only with `--spend`. Since slice 0017, the running application (`npm run app`, the server) calls a model off this machine only when a person has chosen Anthropic, OpenAI or xAI in the app's Settings and saved a key there; the local model is the default, and `screening:chat` stays local.
- No secrets in the repo, including in example config.
- No cloud deployment surface. No hosting config, no infrastructure code. The one exception is `.github/workflows/check.yml` (0021). It runs `npm run check` and `npm run test:e2e` on `main` and every PR, and nothing else: no deploy, no model, no secret.
- The coordinator makes the determination. The agent produces a recommendation with its evidence and hands off. It abstains rather than guesses. No code path issues a final eligibility decision.

## How work is done here

Work happens in slices. Each slice is one change, in its own numbered folder under `work/`, on its own branch, landing as one PR.

```
work/ROADMAP.md                    # what each slice covers, and which open questions it closes
work/0000-product/intent.md        # the vision, written once
work/0001-trial-data/
  intent.md    what is wanted, why, constraints, open questions
  spec.md      requirements and design
  plan.md      files that change, stages and gates, order of work, risks, proof
```

For each slice:

1. Write `intent.md`. Do not start from the product intent alone; each slice gets its own.
2. Write `spec.md` from the intent.
3. **Use plan mode** to produce `plan.md`. Read the codebase, do not edit it. Iterate until someone who never saw the conversation could implement from the plan alone. Commit `plan.md` before writing code.
4. Implement, one stage at a time, stopping at each gate. If implementation diverges from the plan, update `plan.md` in the same commit. An out-of-date plan is a merge blocker.
5. Run the review passes in `REVIEW.md` before opening the PR.

### Stages and gates

`plan.md` breaks the slice into numbered steps, one commit each, and groups those steps into **stages** separated by **review gates**.

A stage is a run of steps that can be implemented without stopping. A gate is a decision that the next stage depends on — not a status update, and not a request to skim a diff. Work does not cross a gate unattended.

Writing them:

- Put the stage and gate table at the top of "Order of work," before the steps. The steps stay as they are; the table only says where the pauses fall.
- A gate names what is being decided and what it costs to be wrong. "Review the loader" is not a gate. "Confirm the corpus is genuinely hard, because no test can and a soft one inflates the next slice's results" is.
- Justify a gate by what the *next* stage spends — a network run, a corpus that later slices build on, a toolchain everything inherits. A gate that guards nothing downstream is ceremony.
- Not every stage needs one. A stage that ends in documentation or a test with no decision attached goes straight to the next.
- A gate whose answer is always yes is not doing its job, the same way a review pass that always comes back clean is not.
- Skipping a gate is allowed. Saying so in the PR is not optional.

Some decisions cannot be delegated: anything only a human can judge, anything that spends real resources, anything that later slices build on. Those are the gates. Put them in `plan.md` where they can be argued with, not in the conversation that produced it.

For bug fixes: write the failing test first, commit it, then make it pass. Do not edit the test to make it pass.

## Conventions

- **Language:** TypeScript, strict mode. Node 24 LTS or newer (`engines.node: ">=24"`); developed on v26.8.2.
- **Stack:** React + Vite for the UI, Fastify for the local API, Vitest for tests.
- **Dependencies:** kept small. Adding one is a plan-level decision, not an implementation detail.
- **Model access** goes through the adapters in `src/models/`, and anything outside it gets one from a factory. `createLocalAdapter` builds oMLX only; the chat and `plain:render` use it. `createAppAdapter` (0017) is the running app's: oMLX, or the provider chosen in Settings with the key saved there, always inside the budget wrapper, and named only in `src/server/models.ts`. `createAdapter` also builds Anthropic, OpenAI and xAI, always inside the budget wrapper, for the scripts. A script's model is chosen by a spec on the command line (`--agent anthropic`, `--model openai:gpt-6-luna`), never by `.env`, which holds keys only; the app's is chosen in Settings, and a hosted key for the app comes only from Settings, never from `.env`. Admitted frontier models, their prices and what each accepts are in `src/models/catalog.ts`. Adding one is a one-entry diff with its price.
- **Paid runs are dry by default.** In the app, a hosted model is capped per screening ($0.50) and per trial read ($0.25), adjustable in Settings, and logs to gitignored `local/spend.jsonl`. In the scripts, a run naming a frontier provider prints its roles and an estimate and exits, unless given `--spend`. It is capped at 100 calls and $1.00 per invocation (`--max-calls`, `--max-usd`), and appends what it spent to `evals/results/spend.jsonl`. Never pass `--spend` without the owner's go-ahead, and never create or edit `.env`.
- **Transport** goes through the `MessageTransport` interface. The conversation layer does not know it is talking to a web UI.
- **`tests/`, `e2e/` and `evals/` are different things.** `tests/` is deterministic, fast, and runs on every commit. `e2e/` is the browser test (slice 0010). It's deterministic and uses no model, but it needs a browser and a built page, so it runs on demand before a page change's PR, never in `npm test`. `evals/` measures model behavior, is slower and non-deterministic, and runs on a schedule and before release. Do not put model-dependent assertions in `tests/` or `e2e/`.
- **Nothing under `tests/` reads a gitignored file**, so `npm test` passes from a fresh clone. The review reads committed review files, not the conversation cache.
- **Eval results are committed** to `evals/results/` so that any number appearing in the README or `docs/` is traceable to a run. The README is short and for anyone who opens the repository: the problem, what it does, how to run it (with no model, a local model or a hosted one) and how it was built. It names no one, and it reports no findings; detail, results and limitations go in `docs/`, one file per part.
- **Parses are committed** under `evals/results/parses/`. A parse that a committed parser result depends on is committed in the same change, and `tests/evals/committed-results.test.ts` re-grades every committed result from its parses. A parse's file is named by its identity: prompt version, normalization version (`NORMALIZE_VERSION`, bumped by hand, pinned by a test) and reasoning mode. A screening conversation made from a parse carries that identity in its key.
- **Any reported result records** model name, quantization, temperature and seed. A result without them is not a result.
- **No tool attribution.** Never add "Generated with Claude Code" to a pull request description, and never add `Co-Authored-By: Claude ...` trailers to commits. This repository's history is the author's work product, not an advertisement. This overrides any default guidance to the contrary.

## Where things live

This is the intended layout. Most of it does not exist yet. Create directories as slices need them rather than scaffolding empty folders up front, but put new code where this says it goes.

```
README.md        short, plain-language, for technical and non-technical readers
docs/            the detail behind it, one file per part, and docs/images/ for the README's demo, screenshots and the GitHub preview card
work/            the intent/spec/plan chain, one folder per slice
src/
  trials/        fixture loading (no network; the fetch script lives in scripts/)
  criteria/      eligibility parser
  screening/     conversation agent
  plain/         plain-language renderings of criteria, and the check that decides whether one is shown
  models/        model adapter (the only place a model is called)
  transport/     MessageTransport interface and the web implementation
  server/        local API
  web/           React UI: conversation pane and coordinator review pane
data/
  trials/        saved trial JSON, committed, trimmed to fields in use
  plain/         committed plain-language renderings, one file per labelled study, made by plain:render
  cases/         hand-authored patient vignettes
evals/
  cases/         eval task definitions
  graders/       deterministic graders and LLM judges
  results/       committed run output
    screening/review/  what the coordinator review reads for each served or scored run, made by review:export
scripts/         one-off scripts run by a person, never imported by the application
tests/           deterministic tests only
e2e/             browser tests of the page, run by npm run test:e2e; output under e2e/.out/, gitignored
added-trials/    trials added by link on the app's Trials screen, one file each; gitignored, like chats/
local/           the app's Settings (chosen model, keys, caps) and its own spend ledger; gitignored, written 0600
.github/workflows/check.yml   CI: npm run check and npm run test:e2e on main and every PR; nothing else
```

Three boundaries matter more than the rest. Nothing outside `src/models/` calls a model. Nothing outside `src/transport/` knows how messages are delivered. Nothing under `src/` makes a network call, outside the named exceptions below. The first two exist so later slices are configuration changes rather than rewrites (0008's frontier adapters were exactly that); the third is the runtime constraint from the product intent, and `scripts/` exists so that the code which does reach the network sits outside the tree the application imports from. A boundary should be asserted by a test rather than left to discipline, and all three are, in `tests/boundary.test.ts`: the network boundary from slice 0001, the model boundary from 0004 and the transport boundary from 0005. The network rule has exactly five exceptions, each confined to named files:

- `fetch()` to loopback in `src/models/`
- one frontier host per file in `src/models/` (slice 0008): `api.anthropic.com` in `anthropic.ts` and `anthropic-batch.ts`, `api.openai.com` in `openai.ts`, `api.x.ai` in `xai.ts`
- listening on `127.0.0.1` in `src/server/start.ts`
- relative-path `fetch()` in the page's two API clients
- `fetch()` to `clinicaltrials.gov` in `src/trials/registry.ts` (slice 0013), which the app calls on the Trials screen's Add or Refresh, and `fetch:trials` calls for the corpus

Widening any of them is a visible change to that test. The app reaches the three frontier hosts through those same files, and only through `createAppAdapter` from `src/server/models.ts` (0017), which the test pins. The same test keeps `createAdapter` out of the running application, keeps concrete adapters out of `scripts/` as well as `src/`, and allows the key variables to be named only in `src/models/keys.ts`.

A fourth, smaller one from slice 0006: plain-language renderings are display only. Nothing under `src/screening/` imports `src/plain/`, and `ScreeningCriterion` is pinned to four fields, so the agent asks and reads from the protocol's words. Letting it ask from a rendering changes the agent and means re-running the vignettes.

A fifth, from slice 0007: the coordinator review says what the participant's words establish for each criterion and never combines criteria. Everything it shows is fixed text, a count of one group, or about exactly one criterion. Groups come from a finding's status, never its direction, and rows keep protocol order. `tests/web/review.test.ts` flips every settled finding across the committed eval run and requires that only each row's own finding words change. Sorting, colouring or summarising by outcome fails it, on purpose.

Test files share a module cache (`isolate: false` in `vitest.config.ts`), which keeps `npm test` near half a second. That is safe only while no test mocks a module or stubs a global, and a test in `tests/boundary.test.ts` fails if one does.

Keep saved trial JSON trimmed. The full API response per study is large and mostly unused, and committing twenty raw responses makes the repo unpleasant to read.

## Verifying your work

| Command | Does |
| --- | --- |
| `npm install` | install |
| `npm run check` | typecheck, then lint, then `npm test`, stopping at the first failure and exiting non-zero. Run it before every commit, and commit only if it exits 0. CI (`.github/workflows/check.yml`) runs it again on `main` and every PR |
| `npm test` | Vitest. Deterministic, no network, runs in under a second |
| `npm run typecheck` | `tsc --noEmit`, twice: once for the Node code, once with `tsconfig.web.json` for the page |
| `npm run lint` | `biome check .` — Biome is linter and formatter; there is no ESLint |
| `npm run format` | `biome format --write .` |
| `npm run fetch:trials` | refetch the trial corpus, overwriting fixtures. The request is `fetchStudy` in `src/trials/registry.ts`, shared with the app's Trials screen |
| `npm run fetch:trials -- --dry-run` | report registry drift without writing; non-zero if anything differs |
| `npm run parse:criteria -- <NCT ID>` | parse one study with the local model and print it for reading. Needs `OMLX_API_KEY` and a running oMLX. Slow, non-deterministic in duration, never part of `npm test`. `--cache` also keeps the parse in the eval's cache, for unlabelled studies. `--trial-file <file>` parses the trial in a saved record or trimmed study instead, for a trial the corpus doesn't pin (0015) |
| `npm run label:criteria -- <NCT ID>` | write a labelling skeleton for a study. Deterministic; reaches neither the parser nor a model |
| `npm run eval` | grade the parser against the labelled studies, reusing cached parses. Calls a model on a cache miss. `-- --model anthropic` estimates a frontier run; add `--spend` to run it, `--batch` for Anthropic's half-price batch |
| `npm run eval:inspect -- <NCT ID> <parse.json>` | print every matched pair, miss and near miss for one study |
| `npm run eval -- --dev` | 0011's dev studies only (NCT04385368, NCT00077350), result under `evals/results/dev/`. `--dev NCT04385368 --sample 2` makes a repeat parse beside the first; `--thinking off` runs the parser with reasoning off |
| `npm run eval:compare -- <before.json> <after.json>` | 0011's parser bar, pooled, dev and held back, from committed results and parses. `--samples <more.json>...` judges NCT04385368 by the median; `--noise` compares parses criterion by criterion; `--overlap` lists five-word runs the prompt shares with a protocol. Deterministic; no model |
| `npm run vignettes:check -- [NCT ID]` | print vignettes beside the criteria they test, with warnings. Deterministic; no model |
| `npm run eval:screening` | run every vignette against the screening agent, from labels then from cached parses, and grade. About 13 hours of local model time; resumes after interruption. `-- --dev` runs only the five dev vignettes (77 minutes for 0009's baseline, longer under load). `--agent`, `--participant`, `--fidelity` take a model spec each; a frontier role is dry without `--spend`, and defaults to one conversation unless given `--all` |
| `npm run models:smoke -- <provider>` | one live `ask` and `read` against a frontier provider, capped at 4 calls and $0.05, writing the responses over its fixtures. Dry without `--spend`. **Run by the repository owner only**, with their own key |
| `npm run screening:compare -- <before.json> <after.json>` | compare two committed screening runs on the twelve, labels and parses, and give spec 0009 §8.2's verdict. `--least-seen` adds the three least-seen v2 conversations as a separate block. Reads run files only; deterministic; no model |
| `npm run screening:show -- <file> [--html]` | render a conversation beside its findings; `--html` writes a page to open in a browser |
| `npm run screening:chat -- <NCT ID>` | play the participant yourself against the real agent on the local model. Made-up answers only; saved under gitignored `chats/` |
| `npm run plain:render -- <NCT ID>` | render a labelled study's criteria in plain language with the local model and save them under `data/plain/`. `--all` for every labelled study, `--force` to start one again. Needs `OMLX_API_KEY` and a running oMLX; about 3.5 s a criterion; resumes after interruption |
| `npm run plain:check -- [NCT ID]` | print each labelled criterion beside its plain rendering and the check's verdict, then the counts `docs/plain-language.md` reports. Deterministic; no model. `--reading` prints the reading gate's list |
| `npm run review:sheet` | write the blank answer sheet for 0007's blind reading of the coordinator review: ten conversations of 0004's run (`READING_RUN`), settled rows only. Deterministic; refuses to overwrite a sheet without `--force` |
| `npm run review:score -- [sheet]` | score a filled reading sheet against the grades of 0004's run (`READING_RUN`), the one 0007's reading was made against. `--groups` prints rows per review group over the fifteen labels conversations. Deterministic; no model |
| `npm run app` | build the page and run it at http://127.0.0.1:5005: play the participant against the real agent, with a tester panel showing what it records, and open a finished conversation in the coordinator review. Since 0013 it serves only the trials a person has added, unless given `-- --examples`, which adds the five labelled trials and the 30 conversations of the committed eval run `EVAL_RUN` names (0009's) for review. `-- --fake` implies `--examples` and needs no model, and its scripted agent reads `n/a` as doesn't-apply, `[slow] ...` as a two-second wait, `[down] ...` as the model being unreachable and `[explain] ...`, `[why] ...`, `[study] ...` and `[stop] ...` as that request (0021); `-- --examples --source parse` screens the examples from cached parses; `-- --port N`. Conversations are saved in `chats/`, or `-- --chats-dir <dir>`. The page (0014) is **Trials** (home, `#/`), **Screenings** and **Reviews**. Trials adds any trial by ClinicalTrials.gov link or NCT ID: the server fetches it, the local model parses it in a minute or two, and its card offers **Start screening** and a checklist of what the AI read. A person's own screenings can be deleted; nobody is asked for a name. Added trials are kept in gitignored `added-trials/`, or `-- --trials-dir <dir>`. **Settings** (0017, `#/settings`) chooses the model for the agent and the trial reader (the local model, or Anthropic, OpenAI or xAI with a key saved there), tests it with one call, and sets the caps; it's kept in gitignored `local/`, or `-- --settings-dir <dir>`. Claude never enters a live key there. In `--fake`, only the invented `NCT00000000` can be added, from `scripts/app/registry/`, with a scripted parse |
| `npm run test:e2e` | the browser test: builds the page, runs it with `--fake` on port 5015 and an emptied `e2e/.out/chats/`, `e2e/.out/trials/` and `e2e/.out/settings/`, and drives it in Chromium through thirteen cases. Deterministic, no model, about 20 s. Never part of `npm test`, but CI runs it on `main` and every PR. `-- --headed` to watch, `-- -g <name>` for one case; a failure leaves a trace under `e2e/.out/results/` for `npx playwright show-trace` |
| `npm run screenshots` | write the README's five screenshots (Settings since 0017), the demo's recording and the GitHub preview card, from the real agent, using `e2e/capture.spec.ts` and `playwright.capture.config.ts`. It needs oMLX and an app already running on it: `npm run app -- --examples --port 5035 --chats-dir <tmp> --trials-dir <tmp> --settings-dir <tmp>`, an empty settings folder so it runs on the local model whatever `local/` holds. It stops if the page is in fake mode or on a hosted model. About 2 minutes, and `test:e2e` skips it. The model's words differ each run, so the images are looked at and kept, never regenerated by a test. Run by a person after a page change that alters them |
| `npm run demo` | turn the capture's recording into `docs/images/demo.gif`, sped up where the model works, under 5 MB. Needs `ffmpeg` (`brew install ffmpeg`), a system tool, not a dependency. No model, no network |
| `npx playwright install chromium` | once per machine, before the first `test:e2e`: downloads the pinned browser (about 94 MB) into Playwright's cache, outside the repository |
| `npm run review:export -- <run file>` | write the review file for a run from the local conversation cache, into `evals/results/screening/review/`. A run named by `EVAL_RUN` or `READING_RUN` commits its review file in the same change; a test fails otherwise. Refuses to overwrite a differing file without `--force`. Deterministic; no model |

`npm run app` is how to see the agent work, and its coordinator review is how to see what it hands over. `screening:chat` does the same in a terminal, and `screening:show --html` renders any saved conversation beside its findings.

`parse:criteria` calls a model and is run by a person, like the fetch script. Parsing all twelve takes roughly 45 minutes and slows as it goes, so a study that times out late in a batch may well parse in seconds on its own.

Run `npm run check` before every commit and before opening a PR, and commit only if it passes: `npm run check && git commit ...`. Also run `npm run test:e2e` when the change touches `src/web/`, `src/server/`, `src/transport/`, `src/trials/registry.ts`, `scripts/app.ts`, `scripts/app/`, `vite.config.ts`, `tsconfig.web.json`, `EVAL_RUN`, `READING_RUN` or `evals/results/screening/review/`, and say in the PR that it ran and how many passed. Until slice 0010, a page change was checked only in Node, never in a browser. The fetch script is run by a person, deliberately, and not as part of any other command.

When a test fails, fix the code, not the test.

## Things Claude gets wrong

When the same mistake happens twice, the correction goes here. Keep entries short and specific.

- **Reading lint by its last line.** `npm run lint 2>&1 | tail -1` prints nothing useful when Biome fails. Read the exit code (`npx biome check . >/dev/null; echo $?`) before committing. It let one error into two commits in 0006.
- **Letting a failed check through to a commit.** In 0010 a chain of check commands printed a type error, didn't stop, and the commit went ahead. It's the same miss as reading lint by its last line: output read, exit code not. Commit through `npm run check && git commit ...`, never after a check whose exit code wasn't the gate.
- **Naming a regex helper `escape`.** It shadows a global and fails Biome's `noShadowRestrictedNames`. Call it `escapeRegExp`. Twice in 0006.
