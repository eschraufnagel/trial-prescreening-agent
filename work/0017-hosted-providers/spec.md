# spec: 0017 hosted providers in the app

**Intent:** [intent.md](intent.md) (accepted 2026-10)
**Date:** 2026-10

What the slice builds, settled from the intent's open questions. The plan says in what order and in which files.

---

## 1. What a person does

1. `npm install`, then `npm run app`. The page opens on Trials.
2. If no model is set up, Trials says so, with a link: "Set up a model in **Settings**."
3. In Settings they pick **Anthropic, OpenAI, xAI or the local model**, then a model, cheapest first, with its price. They paste a key and press **Test** (one small call, under a cent), then **Save**.
4. Back on Trials they add a trial by its link, and it's read by the chosen model. Then they screen against it, or against a built-in example.

Fake mode still needs nothing. `npm run app -- --fake` is unchanged.

## 2. Gate 1, as it stands

- **Anthropic: passed.** The owner ran `models:smoke -- anthropic --spend` in 2026-10. Ask and read pass on `claude-haiku-4-5-20251001`, for about $0.002, and the recordings are committed (`1772a32`).
- **OpenAI and xAI: offered, marked untested** (owner, 2026-10). Their adapters have never made a live call. Settings says so beside each of their models: "Not yet tested against the live API". Testing the connection is the first live call a person makes with them.
- **How "tested" is recorded.** A catalog entry gains `smokeTested: string | null`, the date of a passing smoke run. A test in `npm test` requires that every non-null date has a matching `models:smoke` line for that spec in the committed `evals/results/spend.jsonl`. So a model can't be marked tested without the run that tested it. Today only `anthropic:claude-haiku-4-5` is tested, dated 2026-10.

## 3. Settings, stored

### 3.1 The file

- **Where.** `local/settings.json`, in a new gitignored directory `local/`. `--settings-dir <dir>` points the browser test at `e2e/.out/settings/`. The intent leaned on the `*.local` rule; a named directory with its own `.gitignore` line, beside `chats/` and `added-trials/`, is easier to find and to explain.
- **Mode.** The directory is created 0700 and the file is written 0600, through a temporary file and a rename, so a crash never leaves half a key.
- **Shape** (`version: 1`):

  ```json
  {
    "version": 1,
    "choice": { "provider": "anthropic", "model": "claude-haiku-4-5" },
    "local": { "baseUrl": "http://127.0.0.1:8000/v1", "model": "Qwen3.6-35B-A3B-MLX-8bit" },
    "caps": { "screeningUsd": 0.5, "trialUsd": 0.25 },
    "keys": { "anthropic": "…", "openai": "…", "xai": "…", "omlx": "…" }
  }
  ```

  `choice.provider` is `"omlx"` or one of the three hosted providers. Every field is optional. A missing file means "nothing saved".

### 3.2 Precedence

- **In the app, the saved file wins, field by field.** Anything not saved falls back to the environment (`.env` or the shell), then to the defaults in `src/models/config.ts`.
- **With nothing saved, the app behaves exactly as today:** oMLX from `.env`.
- **The scripts never read `local/`.** They keep `.env` and `--spend`.
- **Amended in step 3: a hosted key is never taken from the environment in the app.** Choosing Anthropic in Settings uses only a key saved in Settings, even if `ANTHROPIC_API_KEY` is in `.env` for the eval scripts. Spending through the app should rest on a key a person pasted there for that purpose, not on one that happened to be lying in `.env`. The fallback to the environment stays for the local model only. A test pins it (`createAppAdapter` "refuses a hosted provider with no saved key, even with one in the environment").

### 3.3 Who touches keys

- **Reading and writing keys is in `src/models/keys.ts`**, beside `readKey`:
  - `savedKey(provider, settings)`;
  - `keyHint(key)`, which gives `…` plus the last four characters, or `…` alone for a key under 12 characters;
  - `withSavedKeys(env, settings)`, which builds the environment an adapter reads: the saved key under the provider's variable name, through `keyVariable`. The adapters keep reading keys as they do now, and no variable name appears outside this file.
- **`src/server/settings.ts`** loads, validates and saves the file. It holds the settings in memory, and saving writes through to the file, so a change applies to the next screening or trial read without a restart. It never returns a key: every response is built from a view type with no `keys` field.

### 3.4 Validation

Saving refuses:
- a provider or model the catalog doesn't admit;
- a local `baseUrl` that `src/models/config.ts`'s existing check rejects, so it stays on this machine;
- a cap below $0.05 or above $5.00;
- a key that's empty, over 500 characters, or contains whitespace.

The refusal says which field and why, and never echoes a key.

## 4. Routes

All are under `/api/settings`. Every one that changes something requires both of these:
- `Content-Type: application/json`;
- an `Origin` header equal to the app's own origin (`http://127.0.0.1:<port>` or `http://localhost:<port>`).

Otherwise it gets **403**. A page on another site can't send that request without a CORS preflight, which this server never answers, and a missing `Origin` is refused too.

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET /api/settings` | — | The view (§4.1) |
| `PUT /api/settings` | `{ choice?, local?, caps? }` | The view |
| `PUT /api/settings/keys/:provider` | `{ key }` | The view (with `keySaved: true` and the hint) |
| `DELETE /api/settings/keys/:provider` | — | The view |
| `POST /api/settings/test` | `{ provider, model }` | `{ ok: true, usd, servedModel }`, or `{ ok: false, problem }` with the problem redacted |
| `GET /api/settings/local-models` | — | `{ reachable, models: string[] }` from oMLX's `/v1/models`, using the saved or environment key |

### 4.1 The view

```ts
{
  mode: "live" | "scripted";            // scripted in --fake
  choice: { provider, model };
  providers: Array<{
    provider: "anthropic" | "openai" | "xai";
    keySaved: boolean; keyHint: string | null;
    models: Array<{ model; inputPerMillion; outputPerMillion; tested: string | null; cheapest: boolean }>;
  }>;
  local: { baseUrl; model; keySaved; keyHint };
  caps: { screeningUsd; trialUsd };
  estimates: Record<string, { screeningUsd: number; trialUsd: number }>;  // by "provider:model", §6
}
```

### 4.2 Testing the connection

`POST /api/settings/test` makes **one agent `ask` call**, the same made-up criterion `models:smoke` uses, through the chosen provider and model.
- It runs inside a budget of 1 call and $0.02, with the key from the saved settings, or from the body's provider if that key is saved.
- It answers whether the reply has the shape the agent accepts.
- Its spend is logged like any other (§6.3).
- The button says "Test (one call, under 1¢)".
- In `--fake`, a scripted reply comes back with `usd: 0` and no call.

## 5. Building models in the app

### 5.1 One factory, in `src/models/factory.ts`

`createAppAdapter(choice, settings, options)` takes the current choice and settings, and a fresh `BudgetPool` for each use.
- **For oMLX,** it returns `createLocalAdapter` with the saved `baseUrl`, `model` and key layered over the environment.
- **For a hosted provider,** it returns `createAdapter`'s result: always budgeted, with the key from `withSavedKeys`, and `thinking` off for the agent as today.
- **It refuses** a provider with no key, and a model the catalog doesn't admit.

### 5.2 Per screening and per trial read

- **The server takes functions, not a single adapter.**
  - `ConversationService` gains `agentFor(): ModelAdapter` in place of `adapter`.
  - Trials gains `parserFor(): ModelAdapter` in place of `parser`.
- Each call builds a new adapter with its own `BudgetPool`, capped at `caps.screeningUsd` with 200 calls, or `caps.trialUsd` with 4 calls. A screening's adapter is kept in memory for that conversation, so its pool holds across its turns.
- In fake mode, `scripts/app.ts` passes functions returning the scripted adapters, as now.

### 5.3 A screening keeps its model

- **The model is recorded at the start.** A conversation's saved record gains `model: "<provider>:<model>"`.
- **Resuming checks it.** A conversation resumed on a different choice refuses to continue, with the reason as the composer's notice: "This screening started on Anthropic · claude-haiku-4-5. Choose it in Settings to continue." Nothing is lost, and switching back continues it.
- **The same applies after a restart.** A restart loses the in-memory pool, so a resumed screening starts a new pool, and its cap counts from there. The ledger keeps the true total.

### 5.4 When the cap is reached

- A `BudgetStop` (`isBudgetStop`) from the agent is turned into a notice, the way a model-down error is: "This screening reached its $0.50 limit. What's recorded so far is kept. Raise the limit in Settings to continue."
- From a trial read, the trial is marked "Couldn't add", with the same reason.

### 5.5 The boundary test

`tests/boundary.test.ts`'s "the running application stays local" becomes **"the running application reaches a hosted provider only through Settings"**:
- the app's files (the same list as today) never name `createAdapter`, as now;
- they may name `createAppAdapter`, and only `scripts/app.ts` and `src/server/settings.ts` do;
- `createAppAdapter`'s hosted branch always passes a `budget`, checked by a unit test that builds one with a fake fetch;
- the browser test's server command stays `--fake`, as now.

The test's comment says what changed, when, and on whose decision.

## 6. Cost

### 6.1 What a screening and a trial read cost

Estimates from the project's own dry runs, with nothing sent (2026-10):

| Cheapest model | One screening (78 calls, `NCT00077350-v1`, the longest example) | One trial read (the five labelled, averaged) |
| --- | --- | --- |
| `anthropic:claude-haiku-4-5` | about $0.29 | about $0.03 |
| `openai:gpt-6-luna` | about $0.029 | about $0.003 |
| `xai:grok-4.3` | about $0.33 | about $0.018 |

These overestimate on purpose. Anthropic's smoke run found the token estimate 1.38–1.43× too high, and `CHARS_PER_TOKEN` stays at 3.0 because it's shared by three providers and only one is measured.

### 6.2 Defaults

- **$0.50 a screening and $0.25 a trial read** cover every cheapest model with room to spare.
- **A pricier model's estimate is shown beside it** in Settings, from the same calculation. `claude-sonnet-5`'s screening is about $0.58, over the default cap, so choosing it shows: "One screening is estimated at about $0.58, more than your $0.50 limit."
- **The estimates are computed when the server starts,** from `evals/screening-estimate.ts`'s agent workload for `NCT00077350-v1` and `evals/estimate.ts`'s parser workload, through `estimate()`. They aren't hand-written numbers.

### 6.3 Shown and logged

- **The screening shows what it has cost so far** beside the question count: "$0.04 so far · limit $0.50". It's hosted only, from the conversation's pool.
- **`local/spend.jsonl` gets one line per screening and per trial read when it ends,** and one per connection test, in `evals/results/spend.jsonl`'s shape, with `script: "app"`. It's gitignored. The committed ledger stays the eval's.

## 7. Saying where answers go

| Where | With a hosted choice |
| --- | --- |
| Header badge | `Anthropic · claude-haiku-4-5` (today `Local model · …`) |
| Above the composer | "Your answers are sent to Anthropic. Use made-up answers only." (today "Use made-up answers only. This is a test system.") |
| Screening header | "Unmeasured: the agent was measured on the local model only." |
| Trials card for a trial read by a hosted model | "Read by Anthropic · claude-haiku-4-5", beside the existing unmeasured note |
| Coordinator review, notes | A new `HOSTED_NOTE`: "Made with Anthropic · claude-haiku-4-5. The agent was measured on the local model only." It's added when the result's run names a hosted adapter. |

- The provider's display names are "Anthropic", "OpenAI" and "xAI", in one table in `src/web/logic.ts`.
- `HOSTED_NOTE` goes through `tests/web/review.test.ts`'s verdict-word check unedited, which it passes.

## 8. The Settings screen

- **A fourth nav item, Settings, after Reviews.** Route `#/settings`.
- **Section "Model"**, top to bottom:
  1. **Radio cards:** Local model · Anthropic · OpenAI · xAI. Each shows "Key saved (…abcd)" or "No key".
  2. **For a hosted provider:**
     - the model, as a select of its admitted models with price per million tokens, an estimated cost of a screening, and "Not yet tested against the live API" where it applies;
     - the key, as a password field that's never prefilled, with "Save key" and, when one is saved, "Remove key";
     - Test.
  3. **For the local model:**
     - the address;
     - the model, as a select from `/local-models` when reachable, otherwise a text field;
     - the key;
     - Test.
  4. **"Use this model"**, which saves the choice.
- **Section "Limits":** the two caps, as dollar inputs with the estimates beside them.
- **A plain note at the top:** "Keys are kept on this computer in `local/settings.json`, which isn't part of the repository. A hosted provider receives everything typed in a screening, so use made-up answers only."
- **In fake mode,** a banner explains that settings can be saved but the scripted agent answers, and Test is scripted.
- **Light, dark and 390 px**, like every page. The design follows the page's existing cards and buttons, with no new colours.

## 9. Docs and rules

- **Product intent:** an amendment paragraph after 0013's, with the old line struck: hosted providers on a person's choice.
- **CLAUDE.md:**
  - the "No live network calls" constraint rewritten;
  - "Model access" says the app builds through `createAppAdapter`;
  - "Paid runs are dry by default" says it applies to scripts, and the app is capped per screening;
  - the network exceptions list notes that the app may reach the three hosts through Settings;
  - the layout gains `local/`.
- **REVIEW.md pass 3:** "No live network dependency at runtime" names the Settings path as the one model exception.
- **README "Run it" becomes three paths:**
  - no model (`--fake`);
  - **a hosted model: Settings, paste a key, about $0.03–0.33 a screening on the cheapest models**;
  - a local model.

  "With a hosted model (Anthropic, OpenAI or xAI)" for the eval scripts moves to `docs/models-and-cost.md`. The README's line "whatever a person types there stays on the machine" changes to say it does unless a hosted provider is chosen.
- **`docs/models-and-cost.md`:** the app's caps, ledger and estimates, and which models are tested.
- **Roadmap:** a 0017 row and "Carried forward".

## 10. Tests

- **Unit, `tests/models/`:**
  - `keyHint`;
  - `withSavedKeys` (the key under the provider's variable, nothing else changed);
  - `createAppAdapter` (oMLX local, hosted budgeted, refuses no key and unadmitted models);
  - the `smokeTested` consistency with `spend.jsonl`.
- **Unit, `tests/server/`:**
  - settings load, save and validation;
  - file mode 0600;
  - no response body ever contains a saved key, checked across every route with a sentinel key;
  - 403 without the right `Origin` or `Content-Type`;
  - a screening refusing to resume on another model;
  - a budget stop turned into a notice;
  - the per-screening pool holding across turns.

  All of these use fake fetches and fake adapters.
- **Unit, `tests/web/`:** provider display names, the composer and badge words, and `HOSTED_NOTE` in the review notes.
- **Boundary:** as in §5.5.
- **Browser, new case 11, in fake mode:**
  - open Settings and choose Anthropic;
  - save the test value `test-key-00000000`, see "Key saved (…0000)", and find that the full value appears in no response body;
  - Test, which is scripted ok;
  - remove the key;
  - check that the choice survives a reload.

  `npm run test:e2e` goes from ten cases to eleven.
- **Nothing reaches a provider.** No test uses a real key or the network.

## 11. Gate 2

After §§3–8 work in fake mode and every test passes, and before §9's docs claim it:
- The owner runs `npm run app`, opens Settings, pastes their Anthropic key, tests, adds NCT05854498 and screens a few answers on `claude-haiku-4-5`.
- **Expected cost:** under $0.10 in all, being one test call, one trial read and about ten calls.
- **Claude's part:** reading what the owner reports and `local/spend.jsonl`'s totals, which the owner pastes.
- **The answer decides:** whether the README's quick start says "paste a key and screen", and whether Anthropic's agent behaves well enough to offer without a caveat beyond "unmeasured".

## 12. Files

| Change | Files |
| --- | --- |
| Models | `src/models/{keys,factory,catalog,omlx,index}.ts` |
| Server | `src/server/{settings,app,conversations,trials,types}.ts` |
| Page | `src/web/{App,SettingsPage,TrialsPage,ParticipantPane,api,logic,review}.tsx/ts`, `src/web/styles.css` |
| Launcher | `scripts/app.ts`, and `scripts/app/` where fake mode's scripted test lives |
| Tests | `tests/models/*`, `tests/server/*`, `tests/web/*`, `tests/boundary.test.ts`, `e2e/settings.spec.ts` |
| Rules and docs | `work/0000-product/intent.md`, `CLAUDE.md`, `REVIEW.md`, `README.md`, `docs/{models-and-cost,running}.md`, `.gitignore`, `work/ROADMAP.md` |
