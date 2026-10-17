# intent: 0017 hosted providers in the app

**Author:** the repository owner
**Status:** Accepted by the owner, 2026-10 ("sounds good"). The direction and three decisions are the owner's (2026-10): the running app may call a hosted provider when a person picks one, keys are remembered on this machine, and both roles (the screening agent and reading an added trial's rules) can use it. The rest are Claude's recommendations
**Date:** 2026-10
**Scope:** A Settings screen in the app, where a person picks the model behind the agent (the local model, Anthropic, OpenAI or xAI), enters a key, tests it and starts. The constraint that kept the running app on this machine changes, on purpose and in the open. The agent's prompts, the parser's prompt, the labels and every committed result stay as they are.

---

## Problem

**Most people who open the repository can't run the real agent.** It needs oMLX on an Apple-silicon Mac with about 40 GB of memory free, serving one particular model. Without that there's fake mode, which shows the page but not the AI. Making the repository public (0016) puts that gap in front of everyone who reads it.

**The hosted adapters exist, and the app is barred from them.** Slice 0008 built Anthropic, OpenAI and xAI adapters behind `src/models/`, with a catalog of admitted models and prices, and a budget wrapper that caps calls and dollars. The app can't use them, by rule:
- CLAUDE.md: "The running application (`npm run app`, the server, `screening:chat`) calls no model off this machine."
- `tests/boundary.test.ts` keeps the app on `createLocalAdapter`, which refuses any provider but oMLX.
- The README promises: "whatever a person types there stays on the machine."

**Configuring a model means editing a file.** Today a person copies `.env.example` to `.env`, types `OMLX_API_KEY` and maybe `OMLX_BASE_URL` and `OMLX_MODEL`, and finds out about a mistake from an error in the terminal.

**None of the hosted adapters has ever made a live call.** There's no `evals/results/spend.jsonl`. 0008 proved them against recorded responses, and the owner hasn't run `models:smoke`. The app would be their first real use.

## Proposed outcome

- **Settings, a fourth screen**, where a person:
  - picks a provider: the local model, Anthropic, OpenAI or xAI;
  - picks a model from that provider's admitted models in `src/models/catalog.ts`, with the cheapest preselected and its price shown;
  - enters a key (for the local model, the address too);
  - tests the connection;
  - saves.
- **The choice applies to both roles:** the screening agent, and reading an added trial's rules.
- **Keys are remembered on this machine** in a gitignored file, held by the server and never sent back to the page.
- **The page says where answers go.** While a hosted provider is chosen, the header badge names it, and the screening says, beside "use made-up answers", that answers are sent to that provider.
- **Spend is capped and shown.** Each screening and each trial read has a dollar cap. The page shows what a screening has cost so far.
- **What's unmeasured is labelled.** A screening or a trial read by a hosted model is marked as unmeasured, the way added trials are.
- **The README's "Run it" gains the quick path:** `npm install`, `npm run app`, open Settings, paste a key.
- **The constraint changes everywhere it's written:** the product intent, CLAUDE.md, REVIEW.md's pass 3, the README and the boundary test.

## Absent on purpose

- **No measurement of hosted agents.** The held comparison slice still owns that, on the owner's word. No eval runs here.
- **No prompt changes.** The agent and parser prompts were tuned on the local model. A hosted model gets them as they are.
- **No hosted model for anything but the two roles.** The plain-language renderer, the eval participant and fidelity roles, and `screening:chat` stay as they are. Hosted runs from scripts still need `--spend`.
- **No new providers or models.** Only what `src/models/catalog.ts` admits.
- **No accounts, logins or sharing.** One person, one machine, as before.
- **No hosting.** The app still listens on `127.0.0.1` only.
- **Fake mode doesn't move into Settings.** It stays a flag for the browser test and for trying the page with no model at all.

## Constraints

- **No PHI, and now said louder.** With a hosted provider, what a person types leaves the machine. The made-up-answers warning becomes a statement of where answers go.
- **Keys never in the repository, the page's storage or a log.** The key file is gitignored, readable only by its owner (mode 0600), and never echoed back in a response, an error or the server's output. The existing redaction in `src/models/redact.ts` covers errors.
- **Key names stay in one place.** `tests/boundary.test.ts`'s rule that key variables are named only in `src/models/keys.ts` stays. The saved-key reader lives there too.
- **The boundary changes visibly, not away.** The app may build a hosted adapter only through one named path, from the saved settings, always inside the budget wrapper. The test pins that path, and still forbids the app reaching a provider any other way.
- **Claude never enters, reads or handles a live key, and never spends.** Live calls in this slice are made by the owner, with the owner's key, at the gate. Claude's tests use recorded responses and fake fetches only.
- **`npm test` and `npm run test:e2e` stay offline and free.** The browser test drives Settings in fake mode, where saving goes to `e2e/.out/` and the connection test is scripted.
- **Dependencies stay as they are.** None is added.

## Decisions

1. **The constraint, rewritten.** Old: "The running application … calls no model off this machine." New: "The running application calls a model off this machine only when a person has chosen a hosted provider in Settings and saved a key for it. The local model is the default." The product intent gets an amendment paragraph, like 0013's, with the original wording kept and struck through.

2. **Keys are remembered in a gitignored file.**
   - **Where:** one file at the repository root that `.gitignore` already covers, through its `*.local` rule: `settings.local`. It holds JSON, and the spec settles the name. A `--settings-file` flag points the browser test at `e2e/.out/`.
   - **Who reads it:** only the server, through `src/models/keys.ts`.
   - **What a response can say about a key:** that one is saved, and its last four characters, so a person can tell keys apart.
   - **Precedence:** the saved settings win in the app. `.env` keeps working for the scripts, and for the app when nothing is saved, so nobody's current setup breaks.

3. **Both roles, one choice.** The agent and the trial reader use the same provider and model. Two choices is more to explain and more to get wrong, and nothing in the product needs them to differ. Built-in examples keep their committed criteria, so only added trials are read by the chosen model.

4. **The cost cap is per screening and per trial read**, built on `BudgetPool` and `BudgetedAdapter`.
   - **Default:** $0.50 a screening and $0.25 a trial read, adjustable in Settings. These are placeholders until the spec puts an estimate beside them, made with `src/models/estimate.ts` for the cheapest model per provider.
   - **When the cap is reached:** the screening stops the way a model-down screening does, with what's recorded so far kept, and the page says why.
   - **The ledger:** what the app spends is appended to a gitignored local ledger, not to `evals/results/spend.jsonl`. That file is committed, and its numbers are the eval's.

5. **Testing the connection makes one small call,** the cheapest a provider allows: a few tokens, a fraction of a cent. The page says so on the button. A test that only checked the key's shape would pass keys that don't work.

6. **The page says where answers go, every time it matters.**
   - **Header badge:** "Anthropic · claude-haiku-4-5", not "Local model".
   - **Above the composer:** "Your answers are sent to Anthropic. Use made-up answers only."
   - **Results:** a review records which provider and model made it. It does already, through the run's adapter and model fields, and the review header shows it for a hosted run.

7. **Hosted results are unmeasured, and say so,** in the same words added trials use.

8. **A key-setting request is checked.** The server is on loopback, but a web page open in the same browser can still send a request to `127.0.0.1`. Settings routes accept JSON only, and refuse a request whose `Origin` isn't the app's own. That's the one piece of hardening here, because a key spends the owner's money. REVIEW.md otherwise leaves security out of scope.

## Gates

- **Gate 1: before any live call, the owner runs the smoke test.**
  - **What's decided:** whether the adapters work against the real APIs.
  - **What the owner runs:** `npm run models:smoke -- anthropic --spend` (capped at $0.05), and the same for any other provider they'll offer.
  - **Why it's a gate:** the adapters have never made a live call. If one is broken, finding out through the app means debugging a request format behind a Settings screen, with spend on every try.
  - **When:** it comes first, so it can run before any code changes.
- **Gate 2: after Settings works end to end in fake mode, before the docs claim it works.**
  - **What's decided:** whether "paste a key and screen" is true for a newcomer.
  - **What the owner does:** pastes their own key in Settings, adds a short trial and screens a few answers on the cheapest model. Claude reports the expected cost first.
  - **Why it's a gate:** it's the owner's money and the owner's key, and the README's new quick start depends on the answer.
  - **The answer can be no.** If a hosted model handles the agent's prompts badly, the slice ships with the provider marked experimental, or without it, and the docs say what was seen.

## Open questions for the spec

1. The settings file's name and shape, and how the server reloads it without a restart.
2. The routes: read settings (no key), save, test connection, and clear a key.
3. Where the app's adapter is built from settings, and exactly what the boundary test pins.
4. The estimated cost of one screening and one trial read per provider at the cheapest model, which sets decision 4's defaults.
5. How `oMLX` settings appear: address, model list from the server's `/v1/models`, and key.
6. The Settings screen's layout, and how the first-run Trials screen points a newcomer to it when no model is reachable.
7. What the browser test covers, in fake mode, without a model or a key.
8. The README's new quick start, and what moves to `docs/models-and-cost.md`.
