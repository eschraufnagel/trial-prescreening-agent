# plan: 0017 hosted providers in the app

**Intent:** `work/0017-hosted-providers/intent.md` (accepted 2026-10, `df70385`) · **Spec:** `work/0017-hosted-providers/spec.md` (`85d161d`)
**Branch:** `0017-hosted-providers`, from `main` at `41d0015`. Gate 1 for Anthropic is committed (`1772a32`). PR into `main`.

---

## Context

Most people who open the repository can't run the real agent: it needs oMLX on an Apple-silicon Mac with about 40 GB free. The hosted adapters exist (0008), but the running app is barred from them by rule and by `tests/boundary.test.ts`. The owner decided (2026-10) that a person may pick a hosted provider in a Settings screen and paste a key, with these choices:
- keys remembered on this machine;
- both roles (the agent, and reading added trials);
- all three providers offered, with OpenAI and xAI marked untested (2026-10).

This plan builds spec §§2–10.

**Nothing in this plan spends money, except gate 2**, which the owner runs with their own key (estimated under $0.10). Claude never enters, reads or handles a live key. Every test uses fake fetches, fake adapters and the sentinel test value `test-key-00000000`. No dependency is added.

**Baseline**, from `npm test` on `1772a32`: 75 files, 1121 passed and 8 expected fail (1129). `npm run test:e2e`: 10 passed, 3 skipped.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. Settings and models, no page** | 1–5 | — | `curl` against `npm run app -- --fake` saves settings, never returns a key, refuses a foreign `Origin` and runs a scripted connection test. `npm test` covers the factory, the store, the routes and the boundary |
| **B. The page** | 6–7 | **Gate 2** | Settings in the app. The badge, composer, screening and review say where answers go. `test:e2e` 11/11 in fake mode |
| **C. Rules and docs** | 8–9 | PR | Product intent, CLAUDE.md, REVIEW.md, README, docs and roadmap say what's true after gate 2 |

**Gate 2: is "paste a key and screen" true? (spec §11)**

- **What's decided.**
  - Whether the README's new quick start may say it works.
  - Whether Anthropic's agent behaves well enough to offer with no caveat beyond "unmeasured".
- **What it costs to be wrong.** Stage C rewrites the constraint and the README around this path. Claiming it untested would put a broken first step in front of every newcomer, and that's the one thing this slice exists to fix.
- **Why only the owner can do it.** It needs a live key and spends money.
- **What the owner does.**
  1. Runs `npm run app`.
  2. In Settings, chooses Anthropic, pastes their key, presses Test, then "Use this model".
  3. Adds NCT05854498, then screens about five answers on `claude-haiku-4-5`.
  4. Pastes what the page showed and `local/spend.jsonl`'s lines (no key is in them).
- **Expected cost:** under $0.10. Claude restates the estimate first.
- **The answer can be no.** If the agent misbehaves on Haiku, stage C ships with Anthropic marked experimental, or the quick start is held back, and the docs say what was seen. Prompts aren't changed in this slice (intent: absent on purpose).

Stage A has no gate: everything in it is deterministic and offline, and stage B builds on it in the same PR.

### Steps

- Each step is one commit, made through `npm run check && git commit`.
- `npm run test:e2e` runs at the end of steps 5, 6 and 7, because they touch `src/server/`, `scripts/app.ts`, `src/web/` or `playwright.config.ts`.
- No commit carries a Co-Authored-By trailer (CLAUDE.md).
- No test mocks a module or stubs a global (`isolate: false`).

**Stage A: settings and models, no page**

1. **Commit this plan** as `work/0017-hosted-providers/plan.md`.

2. **What a model is tested on, and the shared check call.**
   - **`src/models/catalog.ts`.** `CatalogEntry` gains `smokeTested: string | null`. It's `"2026-10"` for `claude-haiku-4-5` and `null` for the rest. The header comment gains a sentence on what it means.
   - **`tests/models/catalog.test.ts`.** For every entry with a date, `evals/results/spend.jsonl` must have a `models:smoke` line with that `spec` on that date (UTC). The test also catches an entry dated without a run.
   - **`src/screening/check.ts`** (new). `CHECK_ASK_CONTEXT`, the made-up criterion and study now in `scripts/models-smoke.ts`, moved so the server can use them. `scripts/models-smoke.ts` imports them instead, and its `PROMPTS` and workload don't change. `src/screening/` stays free of `src/plain/` (boundary).

3. **Keys, local config and the app's factory (spec §3.3, §5.1).**
   - **`src/models/keys.ts`:**
     - `keyHint(key)` returns `…` plus the last four characters, or `…` alone for a key under 12 characters;
     - `withSavedKeys(env, keys)` returns a copy of `env` with each saved hosted key under `keyVariable(provider)`, and nothing else.
   - **`src/models/config.ts`.** `withLocalSettings(env, local)` layers a saved `baseUrl`, `model` and key over `OMLX_BASE_URL`, `OMLX_MODEL` and `OMLX_API_KEY`. Those names already live in this file.
   - **`src/models/factory.ts`.** `createAppAdapter(choice, saved, { budget, pool?, env?, fetchImpl?, thinking? })`:
     - **For oMLX,** it returns `createLocalAdapter(parseModelSpec("omlx"), { env: withLocalSettings(…), thinking })`.
     - **For a hosted provider,** it refuses with no saved key: `ModelError` "No key saved for Anthropic. Add one in Settings." Otherwise it returns `createAdapter(spec, { budget, pool, env: withSavedKeys(…) })`, which already refuses an unadmitted model and always wraps in `BudgetedAdapter`.
     - The header comment becomes three functions, saying which file may call which.
   - **`src/models/omlx.ts`.** `listLocalModels(env, fetchImpl?)` fetches `GET {baseUrl}/models` and returns `{ reachable, models }`. That's loopback only, through the existing `readOmlxConfig` check, and it's the existing exception.
   - **Exports** go through `src/models/index.ts`.
   - **Tests:**
     - `tests/models/keys.test.ts`: `keyHint`, and `withSavedKeys` doesn't touch other variables.
     - `tests/models/factory.test.ts`: oMLX gets the saved settings, a hosted provider is budgeted (`instanceof BudgetedAdapter` via `spentBy`), and no-key and unadmitted models are refused.
     - `tests/models/omlx.test.ts`: `listLocalModels` with a fake fetch, reachable and not.

4. **The settings store and ledger (spec §3, §6.3).** `src/server/settings.ts` (new):
   - **`type ProviderChoice = "omlx" | Provider`, `interface Choice { provider; model }`,** and `choiceKey(choice)`, which gives `"omlx"` for local (any local model) or `"anthropic:claude-haiku-4-5"`.
   - **`class SettingsStore`:**
     - **`constructor(dir)`** reads `local/settings.json` if present, validates (spec §3.4) and keeps it in memory.
     - **`current()`** gives the choice, falling back to `{ provider: "omlx", model: env OMLX_MODEL or DEFAULT_MODEL }`.
     - **`caps()`** gives the saved caps or the defaults ($0.50 and $0.25).
     - **`view(estimates, mode)`** builds spec §4.1. Its type has no `keys` field, by construction.
     - **`update(patch)`, `saveKey(provider, key)` and `removeKey(provider)`** validate, then write the directory 0700 and the file 0600, through `settings.json.tmp` and `renameSync`.
     - **`keysForFactory()`** is internal, used only by `createAppAdapter`'s callers in this file and `scripts/app.ts`.
   - **`appendSpend(dir, line)`** writes one JSON line to `local/spend.jsonl`, in `evals/results/spend.jsonl`'s shape, with `script: "app"`.
   - **`.gitignore`** gains `local/` under a comment like `chats/`'s.
   - **`tests/server/settings.test.ts`:**
     - round trip;
     - modes 0700 and 0600, read with `statSync`;
     - every refusal in §3.4;
     - a sentinel key never appears in `JSON.stringify(view(...))`;
     - a missing file means the local defaults;
     - a corrupt file is reported, not silently reset.

     It uses a temporary directory under `os.tmpdir()`.

5. **The server and launcher (spec §4, §5.2–5.5, §7 info).**
   - **`src/server/models.ts`** (new), **`ConversationModel implements ModelAdapter`.** One per conversation, made from a choice key:
     - **`complete()`** first checks `store` for the current choice key. If it differs, it throws `ModelError("Cannot continue", ["This screening started on Anthropic · claude-haiku-4-5. Choose it in Settings to continue."])`.
     - **On its first call, it builds its inner adapter** with `createAppAdapter`, under `{ maxCalls: 200, maxUsd: caps.screeningUsd }` and its own `BudgetPool`.
     - **A budget stop** (`isBudgetStop`) is rethrown as a `ModelError` with spec §5.4's words.
     - **`descriptor`** delegates to the inner adapter, building it if needed. **`spent()`** is `spentBy(inner)`.
     - **`AgentSource`** is the interface the service sees: `{ current(): string; forConversation(key: string): ModelAdapter }`. The fake source returns the scripted adapter, with current `"scripted"`.
   - **`src/server/conversations.ts`:**
     - `adapter` is replaced by `agent: AgentSource`;
     - `start()` records `model: agent.current()` on the live conversation and its saved record (`SavedConversation.model?: string` in `src/server/types.ts`);
     - `#restore` uses `record.model ?? "omlx"`, so conversations saved before this slice ran on the local model;
     - sessions get `agent.forConversation(key)`;
     - when a conversation finishes or is deleted, `spent()` is passed to `onSpend` (an option) if non-zero.

     The existing `#describe` already turns a `ModelError` into a failed status with its first problem as the notice, so refusal and budget stop need no new path.
   - **`ConversationInspection`** gains `spent: { usd: number; capUsd: number } | null`, null for local and scripted.
   - **`src/server/trials.ts`.** `parser: ModelAdapter` is replaced by `parserFor: () => ModelAdapter`, a fresh adapter per read under `{ maxCalls: 4, maxUsd: caps.trialUsd }`. `TrialRow` gains `readBy: { adapter: string; model: string } | null` from the record's `parsed.run`. The parse's spend goes through `onSpend`.
   - **`src/server/app.ts`.**
     - `AppOptions.adapter` is replaced by `agent: AgentSource` and `settings: SettingsRoutesOptions` (store, estimates, mode, the connection tester, the local-models lister, `onSpend`).
     - `/api/info` gains `hosted: { provider, model } | null` and `ready: boolean` (a key exists for the choice: saved, or `OMLX_API_KEY` in the environment for local), computed per request.
     - The settings routes (spec §4) go in a `registerSettingsRoutes`.
     - A `requireOwnOrigin` preHandler on every PUT, POST and DELETE under `/api/settings` checks `Content-Type` and that `Origin` names an allowed host. It reuses `LOCAL_NAMES` and the port from the existing `Host` check, and sends 403 `{ error: "wrong-origin" }`.
     - `POST /test` calls `ask(adapter, CHECK_ASK_CONTEXT)` from `src/screening/calls.ts` on a `createAppAdapter` with budget `{ maxCalls: 1, maxUsd: 0.02 }`. It returns the shape check and spend, and errors pass through `src/models/redact.ts`.
   - **`scripts/app.ts`:**
     - `--settings-dir <dir>`, default `local/`;
     - `makeAdapter` and `makeTrials` return an `AgentSource` and a `parserFor`, built from a `SettingsStore` when live, or the scripted ones in `--fake`, where Test is a scripted ok with `usd: 0`;
     - the estimates per admitted model (spec §6.1) are computed at start from `evals/screening-estimate.ts` and `evals/estimate.ts` through `estimate()`, and passed in, since the server may not import `evals/`;
     - startup no longer exits when `OMLX_API_KEY` is missing in live mode. The page starts and Trials says "Set up a model in Settings".
   - **`playwright.config.ts`.** The server command gains `--settings-dir e2e/.out/settings`, emptied like the others. The boundary test's `runsScriptedAgentOnly` still passes, since the flag names no model.
   - **`tests/boundary.test.ts`** (spec §5.5):
     - the describe is renamed, with a dated comment naming the owner's decision;
     - "never names the factory that builds frontier adapters" stays;
     - a new test: `createAppAdapter` is named only in `scripts/app.ts` and `src/server/{settings,models,app}.ts`, from the app's file list;
     - its "would catch it" pair: a file naming it outside those files fails.
   - **Tests in `tests/server/`:**
     - **`app.test.ts`:** every settings route by `inject`; 403 for a missing or foreign `Origin` and for a non-JSON body; the sentinel key absent from every response body across a save, get, test and remove sequence; `/api/info`'s `ready` and `hosted`.
     - **`conversations.test.ts`:** a conversation saves its model; a resume on another choice fails with the message and keeps the pending text; a budget stop becomes the cap notice; the pool holds across turns, so the second turn sees the first's spend.
     - **`trials.test.ts`:** `parserFor` is called per read, and `readBy` is filled.
   - **Then** `npm run test:e2e` must pass 10/10 unchanged, which shows the page still works on the new server shape.
   - **As built (step 5):**
     - **`createAppAdapter` is named in one app file only, `src/server/models.ts`,** not four. The agent, the trial reader and the connection test are all built there, through `settingsAgent`, `settingsParser` and `testConnection`, and `scripts/app.ts` only wires them. The boundary test pins that one file.
     - **`AgentSource` gained `spending()` and `release()`,** so the service can read and log a screening's spend without knowing adapters. `fixedAgent(adapter)` wraps the scripted agent, and every existing server test passes `agent: fixedAgent(...)` where it passed `adapter`.
     - **The connection test's budget is 2 calls, not 1,** because `ask` retries once on output it can't read. It's still $0.02.
     - **The per-model estimates live in `scripts/app/estimates.ts`** (new): `appEstimates()` prices the agent on `NCT00077350-v1` and the parser on the five labelled trials, averaged.
     - **The 403s say `wrong-origin` or `json-only`,** checked in a route-level `onRequest`, before Fastify parses the body. A non-JSON body would otherwise be a 415.
     - **New `tests/server/models.test.ts`:** the agent's key, the pool across turns, release logging once, refusal on another model, the cap's words, the local model free, the service refusing a switched screening end to end, the reader per read, and the connection test redacting a key the provider echoes. `TrialRow` gained `readBy`, so the two tests that pin a row's exact shape list it.
     - **By hand in fake mode on 5045:** a foreign and a missing `Origin` both 403; saving answers "…0000"; the file is `-rw-------` in a `drwx------` directory; the estimates read $0.29 (Haiku), $0.58 (Sonnet), $0.029 (gpt-6-luna) and $0.33 (grok-4.3) a screening.

**Stage B: the page**

6. **Settings (spec §8).**
   - **`src/web/SettingsPage.tsx`** (new): spec §8's layout.
     - Radio cards built from `view.providers` plus Local. A model `<select>` shows price, estimate, "Not yet tested against the live API" and the over-cap warning.
     - The key field is `type="password"`, `autoComplete="off"`, never prefilled, and cleared after saving.
     - Test, then "Use this model", then Limits.
     - The fake-mode banner appears when `view.mode === "scripted"`.
   - **`src/web/api.ts`:** `getSettings`, `updateSettings`, `saveKey`, `removeKey`, `testConnection` and `localModels`, all JSON. The browser sets `Origin` itself on POST, PUT and DELETE.
   - **`src/web/logic.ts`:**
     - `Route` gains `{ page: "settings" }` (`#/settings`), and `navOf` handles it;
     - `PROVIDER_NAMES` (Anthropic, OpenAI, xAI, Local model);
     - `modelLine(info)` gives the badge text;
     - `overCap(estimate, cap)`;
     - pure functions, unit-tested in `tests/web/logic.test.ts`.
   - **`src/web/App.tsx`:** the Settings nav item and the route.
   - **`src/web/styles.css`:** radio cards reuse `.card` and `.row-card`, with no new colours.
   - **`e2e/settings.spec.ts`** (case 11, spec §10):
     - choose Anthropic;
     - save `test-key-00000000` and see "Key saved (…0000)";
     - Test, which is scripted ok;
     - remove the key;
     - the choice survives a reload;
     - `page.on("response")` collects every `/api/` body, and none contains the sentinel.
   - **Then** `test:e2e` gives 11 passed.
   - **As built (step 6):**
     - **Provider display names come from the server** (`PROVIDER_NAMES` in `src/models/catalog.ts`, sent in the view and in `/api/info`), so the page holds no copy.
     - **The helpers in `logic.ts`** are `modelLine`, `hostedHint`, `dollars` and `overCap`, plus the fixed words `NOT_TESTED`, `UNMEASURED_HOSTED`, `SETTINGS_NOTE` and `SCRIPTED_SETTINGS`.
     - **Case 11 finds the key field by its textbox role,** because "Key" is also in each provider card's "No key".
     - **The first full run took 11 minutes, and case 5 timed out.** That case's second tab must send during the scripted two-second `[slow]` wait. Cases 5 and 11 then passed on their own (2.9 s), and the full suite passed 11/11 in 18 s on the next run. It's recorded as load on the machine, not a regression: case 5 touches nothing this slice changed except the service's `agent` option, which `fixedAgent` makes the same adapter as before.

7. **Saying where answers go (spec §7).**
   - **`App.tsx` badge:** `modelLine(info)`.
   - **`ParticipantPane.tsx`:** the hint is `hostedHint(info)`, "Your answers are sent to Anthropic. Use made-up answers only." when hosted. The question count's line gains "$0.04 so far · limit $0.50" from the inspection's `spent`.
   - **The screening header (`ConversationView.tsx`)** gets the unmeasured line when hosted.
   - **`TrialsPage.tsx`:**
     - a ready card read by a hosted adapter shows "Read by Anthropic · claude-haiku-4-5";
     - the first-run hero shows "Set up a model in **Settings**" when `info.ready` is false;
     - a parse that stopped at its cap shows the cap's words through the existing `problem`.
   - **`src/web/review.ts`:** `HOSTED_NOTE(provider, model)` is added to the notes when `result.run.adapter` is a hosted adapter's name. The names to read are checked against the adapters' descriptors, so the plan's first act here is to read what `AnthropicAdapter.descriptor.adapter` is.
   - **Tests:** `tests/web/logic.test.ts` for `modelLine`, `hostedHint` and `overCap`. `tests/web/review.test.ts` stays **unedited**, and its verdict-word walk covers the new note. A new `tests/web/hosted-note.test.ts` checks the note appears only for a hosted run.
   - **Then** `test:e2e` gives 11/11, and Claude looks at Settings and a screening in fake mode at 1280 light, 1280 dark and 390.
   - **As built (step 7):**
     - **The screening's words come from the inspection, not `/api/info`.** `ConversationInspection` gained `hosted`, from the conversation's own model key through `hostedOf`, so a screening says where *its* answers go even after Settings changes.
     - **`TrialRow.readBy` carries `hosted`,** the provider's name or null, so the card needs no provider table.
     - **The first-run panel's words were wrong for a hosted model,** and were fixed with it: "That's the only time it goes online" and "The local model reads its rules" are now "The app fetches the trial from ClinicalTrials.gov" and "The model chosen in Settings reads its rules". The add form's "The app goes online only to fetch it" is now "The app fetches it from ClinicalTrials.gov".
     - **Found by looking:**
       - in dark mode an unchosen radio drew white, like a chosen one (fixed with `color-scheme` on the radio);
       - at 390 px the fourth nav item wrapped onto its own line (fixed with tighter nav padding under 480 px);
       - the fake-mode line used `.banner`, which is the header's, and now uses `.note.warn`.
     - **The new note is a function, `hostedNote(name, model)`,** and is tested in `tests/web/hosted-note.test.ts`. `tests/web/review.test.ts` is unedited, and its verdict-word walk passes with it.

**→ Gate 2.**

**Stage C: rules and docs (spec §9)**

8. **The constraint, everywhere it's written.**
   - **`work/0000-product/intent.md`:** an amendment paragraph after 0013's, with the old line struck.
   - **`CLAUDE.md`:** the network constraint, "Model access", "Paid runs" (scripts) and the exceptions list (the app may reach the three hosts through Settings); `local/` in the layout; a Settings row in the commands table; `--settings-dir` under `npm run app`.
   - **`REVIEW.md` pass 3.**
   - **`README.md`:** "Run it" as three paths, with the hosted path first-class and its estimated cost per screening; the "stays on the machine" sentence corrected. Gate 2's answer decides the wording.
   - **`docs/models-and-cost.md`:** the app's caps, the ledger, the estimates table and which models are tested. The eval-script section moves here from the README.
   - **`docs/running.md`:** Settings, `local/`, and `--settings-dir`.

9. **Roadmap, review passes, PR.**
   - `work/ROADMAP.md`: a 0017 row and section, and "Carried forward from 0017". That includes the OpenAI and xAI smoke runs, `CHARS_PER_TOKEN` at 1.4× high for Anthropic, the hosted agent unmeasured with the held comparison as what would measure it, and anything gate 2 shows.
   - REVIEW.md's passes are recorded in Records.
   - The PR states the gates, `test:e2e`'s count, that Claude handled no key and spent nothing, and gate 2's cost.

---

## Files

| Change | Files |
| --- | --- |
| Gate 1 (before the plan, `1772a32`) | `tests/fixtures/models/anthropic/{ask-ok,read-ok}.json`, `evals/results/spend.jsonl`, `tests/models/fixtures.ts` |
| Models | `src/models/{catalog,keys,config,factory,omlx,index}.ts` |
| Screening | `src/screening/check.ts` (new); `scripts/models-smoke.ts` imports it |
| Server | `src/server/{settings,models}.ts` (new), `src/server/{app,conversations,trials,types,store,index}.ts` |
| Page | `src/web/SettingsPage.tsx` (new), `src/web/{App,ParticipantPane,ConversationView,TrialsPage}.tsx`, `src/web/{api,logic,review}.ts`, `src/web/styles.css`; `e2e/settings.spec.ts` (new) |
| Launcher | `scripts/app.ts`, `scripts/app/estimates.ts` (new), `playwright.config.ts`, `.gitignore` |
| Tests | `tests/models/{catalog,keys,factory,omlx,config}.test.ts`, `tests/server/{settings,models,app,conversations,trials,store}.test.ts`, `tests/web/{logic,hosted-note}.test.ts` (new: hosted-note), `tests/boundary.test.ts`, `e2e/settings.spec.ts` |
| Rules and docs | `work/0000-product/intent.md`, `CLAUDE.md`, `REVIEW.md`, `README.md`, `docs/{models-and-cost,running}.md`, `work/ROADMAP.md`, `work/0017-hosted-providers/plan.md` |

Reused, not rewritten:
- `createAdapter`, `BudgetedAdapter`, `BudgetPool`, `isBudgetStop` and `spentBy`;
- `keyVariable` and `readKey`;
- `readOmlxConfig` and its loopback check;
- `estimate()`, `evals/screening-estimate.ts` and `evals/estimate.ts`;
- `ask` from `src/screening/calls.ts`;
- `redact.ts`;
- the existing `Host` check's `LOCAL_NAMES`;
- `#describe`'s error-to-notice path;
- `.card` and `.row-card`.

## Risks

- **A hosted agent might not follow the prompts' JSON shape as reliably.** The adapters already strip fences, and the smoke run passed. Gate 2 is where it shows. Prompts don't change here.
- **The `Origin` check might refuse the page itself** (for example `localhost` against `127.0.0.1`). Both names are allowed, and the port must match, which unit tests pin.
- **A restart resets a screening's pool,** so a resumed screening's cap restarts. That's spec §5.3: the ledger has the truth, and the doc says so.
- **Untested providers could fail at their first live call.** Settings says "Not yet tested", Test is that first call (capped at $0.02), and the error comes back redacted.
- **A key could leak through an error message.** Errors from providers go through `redact.ts`, and the sentinel test covers every route, including Test's failure path with a fake fetch that echoes its headers.

## Verification

- `npm run check` exits 0 at every commit. `tests/web/review.test.ts` is unedited. `tests/boundary.test.ts` changes only as step 5 says.
- `npm run test:e2e`: 10/10 after step 5, then 11/11 after steps 6 and 7, all in fake mode.
- **By hand, in fake mode:** the Settings flow, plus `curl -X PUT` with a foreign `Origin`, which should get 403.
- **Gate 2:** the owner's live screening on Haiku.
- **`git grep` for the sentinel and for `sk-ant`:** nothing outside tests.

## Records

- **A hosted key comes only from Settings** (step 3, spec §3.2 amended): a key in `.env` is never used by the app for a hosted provider.
- **Before gate 2:** no key-shaped value is in the tree. `git grep` with the key-shape pattern from `tests/models/fixtures.test.ts` matches only that pattern and the test that proves it. The string `sk-ant` also appears in two 0008 documents that describe the same check. The sentinel `test-key-00000000` appears only in tests and slice documents. `npm test`: 1165 passed and 8 expected fail. `npm run test:e2e`: 11 passed, 3 skipped.

### Gate 2 (2026-10, the owner, with their own key)

- **Ran:** Settings → Anthropic → key saved → Test → "Use this model" → added NCT05854498 → a screening with three made-up answers.
- **Spent:** $0.0005 for the test (349 in, 32 out) and $0.0076 for the read (1 call, 1,751 in, 1,172 out), both on `claude-haiku-4-5-20251001`. The screening's 7 calls, about $0.01 more, weren't logged (see below).
- **What the hosted model did:** read 12 criteria, with 0 rejected and 0 unread. It asked one plain question a turn, about age, daily activity (ECOG, reworded), spread or unresectable disease, and mismatch repair. It asked on after a "no" to a core inclusion, as designed, since the coordinator decides.
- **Found:** a screening's spend was logged only when it finished or was deleted, so stopping the app lost it. Logging the running total after each turn would have counted it twice, so the fix logs each turn's new spend. A failing test is committed first.
- **Answer: go** (owner, 2026-10). The README presents "paste a key and screen" as the quick start, with the existing "unmeasured" label and no further caveat.

### Review passes (step 9, REVIEW.md)

- **Pass 1, plan compliance: one Nit, fixed.** All 58 changed files are in the Files table, now that gate 1's three, committed before the plan, are listed. Every divergence is written in where it happened (steps 3, 5, 6 and 7, spec §3.2 and §3.1's ledger):
  - one file names `createAppAdapter`;
  - `AgentSource` gained `spending` and `release`;
  - the test budget is 2 calls;
  - the screening's words come from the inspection;
  - the first-run words were corrected;
  - a hosted key comes only from Settings;
  - spend is logged per turn.
- **Pass 2, correctness: one Nit, fixed.** A conversation saved in fake mode records `model: "fixed"`. Reopened in live mode, the refusal named "the local model". It now names the scripted stand-in, and a test pins the wording. Otherwise:
  - the gate-2 bug (spend lost mid-screening) got its failing test first (`6f748b1`), then its fix (`b7f2bcb`), with the test unedited;
  - `npm run test:e2e` gave 11 passed and 3 skipped after the last change to `src/server/`, `src/web/` and `e2e/`.
- **Pass 3, scope and data: clean.**
  - The only new runtime calls are to the provider chosen in Settings, through `createAppAdapter` in `src/server/models.ts`, always budgeted, and pinned by the boundary test.
  - A hosted key comes only from `local/settings.json` (0600, gitignored) and never appears in a response, which is tested with a sentinel across every route and in the browser.
  - Provider errors are redacted by the adapters, and again in `testConnection`. The server logs only errors that aren't the model's.
  - No key-shaped value is in the tree. No hosting was added.
  - Claude entered, read and handled no live key, and spent nothing. Both live calls were the owner's: gate 1 at $0.002 and gate 2 at about $0.02.
- **Pass 4, eval integrity: clean.**
  - No prompt, label, grader or committed result changed, and `tests/web/review.test.ts` is unedited.
  - Three tests that pinned exact shapes changed with the shapes: two `TrialRow`s gained `readBy`, and the logic fixture gained `spent` and `hosted`. Each adds a field and loosens nothing.
  - The Anthropic fixtures became real recordings at gate 1, and the helper that reads them stopped choking on a fenced reply without calling the code under test.
  - The `smokeTested` dates are held to the committed ledger by a test.
- **Pass 5, documentation: clean.**
  - The README's "Run it" leads with Settings and a key, and states the cost, what's sent and what's untested.
  - "Seventeen small changes" matches the `work/` folders.
  - CLAUDE.md, REVIEW.md and the product intent say the same thing about the constraint.
  - `docs/models-and-cost.md` has the estimates table, the caps, the ledger and which models are tested.
  - Limitations carried forward are in the roadmap.

### After the PR opened (owner, 2026-10)

- **A Settings screenshot for the README's quick start,** `docs/images/settings.png`. It's taken by a new `settings` test in `e2e/capture.spec.ts`: Anthropic chosen, no key saved, nothing tested, so no key appears and nothing is spent.
- **Found while adding it:** the capture command had no `--settings-dir`. With a hosted model chosen in the owner's own `local/`, `npm run screenshots` would have run its screening on that model, spending money, and could have shown the key's last four characters. The command now names an empty settings folder everywhere it's written: the capture config, the capture spec's stop message, `docs/running.md` and CLAUDE.md. The stop message also covers a hosted model.
- **Taken** against `npm run app` on 5035 with an empty settings folder, which was still empty afterwards. One test, 0.3 s, no model call.
