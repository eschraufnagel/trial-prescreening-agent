# spec: 0013 trials by link

**Status:** Draft, from `intent.md`
**Date:** 2026-10

What the slice builds, the shapes it adds, and what proves it. The order of work is in `plan.md`.

---

## 1. What a person sees

1. The page header gets a **Trials** link, to `#/trials`.
2. The **Trials screen** has a text box ("ClinicalTrials.gov link or NCT ID") and an **Add** button, then one row per trial:
   - **Pinned trials** (the ones the app serves at startup) come first, marked "measured set", with no actions.
   - **Added trials** follow, in the order they were added. Each shows its NCT ID, title, conditions, state and criteria count, with **Refresh** and **Remove**.
   - States read: *fetching from ClinicalTrials.gov*, *parsing on the local model (a minute or two, longer for a long protocol)*, *ready*, *failed: <reason>*.
   - While any row is fetching or parsing, the screen polls every two seconds. A busy row shows a spinner and how long it has been running, with its Refresh and Remove hidden (added after the owner's first real add).
   - Under the list, one fixed line: "Added trials are parsed by the model and not checked against labels. The parser was measured on five lung cancer trials only."
3. On the **start page**, an added trial that is ready is listed under Studies after the pinned ones, with "· parsed, not checked against labels" after its criteria count. Starting it works like any study.
4. The **coordinator review** of a conversation made from an added trial shows the existing `PARSE_NOTE`, because its source is `parse`. No review code changes.

### Added after the gate: whose trials the app shows

`npm run app` serves only the trials a person has added. The five labelled trials and the eval run's conversations are served only with `--examples`, which `--fake` implies (owner, 2026-10). With no trials, the start page and the Trials screen say how to add one.

## 2. Naming a trial (`src/trials/reference.ts`)

`readTrialReference(input: string): { nctId: string } | { problem: string }`. Pure.

- Finds every `NCT` followed by eight digits, case-insensitively, anywhere in the trimmed input, and uppercases it. That covers `NCT01234567`, `nct01234567`, `https://clinicaltrials.gov/study/NCT01234567`, `https://clinicaltrials.gov/study/NCT01234567?tab=results` and the old `https://clinicaltrials.gov/ct2/show/NCT01234567`.
- None found: *"No NCT ID found. Paste a ClinicalTrials.gov study link or an ID like NCT01234567."*
- Two or more different IDs: *"More than one NCT ID found. Add one trial at a time."*
- Only the ID is used afterwards. A link is never requested as given, so the input can't steer the server to another address.

## 3. The registry call (`src/trials/registry.ts`)

`fetchStudy(nctId: string, fetchImpl: typeof fetch = fetch): Promise<Trial>`.

- Refuses an `nctId` not matching `^NCT\d{8}$` before building a URL.
- Requests `https://clinicaltrials.gov/api/v2/studies/${nctId}?format=json` with a 30 s timeout and `accept: application/json`, which is what `scripts/fetch-trials.ts` does now.
- Returns `trimStudy(json, nctId)`. A 404 says *"ClinicalTrials.gov has no study NCT…"*; another status says *"ClinicalTrials.gov answered HTTP <status>"*; a network failure or timeout says *"Couldn't reach ClinicalTrials.gov"*. A response trimming can't read gives `TrialFixtureError`'s message.
- `scripts/fetch-trials.ts` calls `fetchStudy` instead of its own `getStudy`, keeping its corpus-specific 404 advice in its own error handling. After this, `src/trials/registry.ts` is the only file in the repository that calls `fetch()` with a non-loopback URL outside `src/models/`.

## 4. Storage (`src/server/trial-store.ts`)

One file per added trial, `<dir>/<NCT ID>.json`, written to a temporary file and renamed, like `ConversationStore`. The default directory is `added-trials/` at the repository root, gitignored. `npm run app -- --trials-dir <dir>` overrides it.

```ts
interface AddedTrialRecord {
  version: 1;
  nctId: string;
  state: "fetching" | "parsing" | "ready" | "failed";
  trial: Trial | null;          // null until the first fetch succeeds
  parsed: ParsedCriteria | null; // the parse being served, if any
  problem: string | null;       // why the last add or refresh failed
  addedAt: string;              // ISO
  updatedAt: string;            // ISO
}
```

- Filenames come from a validated NCT ID only, never from request text.
- An unreadable file, or a version that isn't 1, is skipped, as `ConversationStore` skips one.
- **A restart mid-job.** A record loaded in `fetching` or `parsing` becomes `failed`, with *"The app restarted before this finished. Refresh to try again."* If it already had a parse, that parse is still served.

## 5. The library (`src/server/trials.ts`)

`TrialLibrary`, constructed by `configureApp` when `AppOptions.trials` is given:

```ts
interface TrialsOptions {
  dir?: string;                                   // without it, added trials last as long as the process
  fetchStudy: (nctId: string) => Promise<Trial>;  // the registry, or fake mode's fixture reader
  parser: ModelAdapter;                           // the local model at the parser's defaults, or a fake
}
```

- **Add** reads the reference (§2). It refuses an ID already listed, pinned or added, with *"NCT… is already listed."* Otherwise it saves a `fetching` record and queues a job.
- **A job** fetches, saves the record as `parsing`, runs `parseCriteria(trial, parser)`, and then saves it `ready` and serves it. Jobs run one at a time, in order. A parse is minutes of local model time, and two at once only slow each other and the conversation in progress.
- **Refresh** (added trials only) queues a job for that trial. It fetches first. If `eligibility.criteriaText` is byte-identical to the stored trial's, it keeps the parse, updates the stored trial and returns to `ready` without parsing. Otherwise it parses again.
- **A failed job** sets `failed` and its reason. If the record already has a parse, that parse stays served, and the reason is prefixed *"Refresh failed; the earlier version is still offered:"*. A failure with no earlier parse serves nothing.
- **Remove** (added trials only) deletes the file and stops serving the trial. It's refused while that trial's job is running or queued, with *"Wait for NCT… to finish."* Conversations made from the trial are untouched. Their criteria are in their own saved state, so they continue and open in the review as before.
- **Serving** goes through two new `ConversationService` methods, `serve(study: ServedStudy)`, which adds or replaces, and `unserve(nctId)`. A served added trial has `source: "parse"` and `origin: "added"`, and its criteria come from `fromParse(parsed).criteria`.
- At startup, every `ready` record, and every `failed` one with a parse, is served.

`fromParse` moves from `evals/screening-input.ts` to `src/screening/from-parse.ts`, because `src/` may not import `evals/`. `evals/screening-input.ts` re-exports it, so its callers don't change.

## 6. Shapes that change

- `ServedStudy` gains three optional fields: `source?: CriteriaSource`, `origin?: "pinned" | "added"`, and `conditions?: string[]`. When absent, `source` is the app's and `origin` is `"pinned"`. `conditions` is for display only and never reaches the agent. `ConversationService.start` uses the study's source, not only the app's.
- `GET /api/studies` items gain `source` and `origin`.
- `AppOptions` gains optional `trials?: TrialsOptions`.

## 7. Routes

All under the existing guards: Host must be this server, and a non-GET request may not come from another origin.

| Route | Answers |
| --- | --- |
| `GET /api/trials` | `TrialRow[]`: pinned rows, then added rows |
| `POST /api/trials` `{ reference }` | 202 `{ nctId }`; 400 `{ error }` for an unreadable reference; 409 `{ error }` if already listed; 404 if `trials` wasn't configured |
| `POST /api/trials/:nctId/refresh` | 202; 404 for an unknown or malformed ID; 409 for a pinned trial or one with a job queued or running |
| `DELETE /api/trials/:nctId` | 204; 404 unknown; 409 pinned or busy |

```ts
interface TrialRow {
  nctId: string;
  origin: "pinned" | "added";
  briefTitle: string | null;
  conditions: string[];
  state: "fetching" | "parsing" | "ready" | "failed";  // pinned rows are always "ready"
  criteria: number | null;
  dropped: { rejected: number; unclaimed: number } | null;  // added at the gate
  problem: string | null;
}
```

*Added at the gate:* `dropped` counts what the parse left out, meaning criteria whose quote wasn't found in the source and passages no criterion claimed. When either count is above zero, the row says so in a line of its own (`droppedWords` in `src/web/logic.ts`).

Conditions come from `ServedStudy.conditions` (§6), which the launcher fills from the trial fixture for a pinned study and the library from the stored trial for an added one.

## 8. The page

- `src/web/logic.ts`: `routeFrom` knows `#/trials`.
- `src/web/TrialsPage.tsx`: the screen in §1.2. It is a new component and reads no criterion text, so the "words in one place" rule in `tests/boundary.test.ts` is untouched.
- `src/web/api.ts`: `listTrials`, `addTrial`, `refreshTrial`, `removeTrial`, each a relative-path `fetch`.
- `src/web/StartPage.tsx`: the mark after an added study's criteria count.
- `src/web/App.tsx`: the header link.

## 9. Fake mode

- **The study.** `scripts/app/registry/NCT00000000.json` is a registry-shaped response for an **invented** study. All zeros, so nobody takes it for a real study. Its title is "Invented study for the page's fake mode", and its conditions are "Non-small cell lung cancer". It has three inclusion and two exclusion criteria, with no escapes, so the scripted parse locates them. It holds only the fields `trimStudy` reads.
- **The fixture reader.** In `--fake`, `fetchStudy` reads `scripts/app/registry/<NCT ID>.json` and trims it. Any other ID fails with *"Fake mode has no network. Only NCT00000000 can be added here."* Nothing in fake mode can reach the registry.
- **The scripted parser.** `scripts/app/scripted-parser.ts` is a `FakeModelAdapter` responder. It reads the user prompt's eligibility block (`buildUserPrompt`'s layout) and emits one `patient` criterion per bullet line, with polarity taken from the most recent "Inclusion" or "Exclusion" heading, and with `delayMs: 1500`, so the page shows *parsing*. A test drives `parseCriteria` with it, so a layout change breaks a test, not the fake mode.

## 10. The network exception, made exact

- **`tests/boundary.test.ts`:**
  - `src/trials/registry.ts` may call `fetch()`, and the only host it may name is `clinicaltrials.gov`.
  - Every other file outside `src/models/` stays under the absolute rule.
  - The existing "known offender" test moves from the fetch script to `registry.ts`.
  - New tests prove that a second host in `registry.ts` and a `fetch()` in another `src/trials/` file are each caught.
- **CLAUDE.md:**
  - The runtime-network constraint names the exception.
  - "four exceptions" becomes five, the fifth being `fetch()` to `clinicaltrials.gov` in `src/trials/registry.ts`, on Add or Refresh.
  - The commands table adds `--trials-dir` to `npm run app` and mentions the Trials screen.
  - The layout adds `added-trials/`.
  - The browser-test trigger list adds `src/trials/registry.ts`.
- **REVIEW.md, Pass 3:** the runtime-network bullet names the exception.
- **`work/0000-product/intent.md`:** a dated "Amended in 0013" note under Constraints. It changes "single condition" to "oncology; measured on NSCLC", and says the frozen corpus is the measured set, with trials added by link unmeasured. The original lines stay, struck through, so the history reads.

## 11. Proof

- **`npm test`** (all deterministic, temp directories only):
  - reference reading;
  - `fetchStudy` with an injected fetch;
  - the store round trip and restart handling;
  - the library's add, duplicate, fetch failure, parse failure, refresh unchanged and changed, failed refresh keeping the old parse, remove, refusal while busy, and startup serving;
  - the routes through `app.inject`;
  - the scripted parser through `parseCriteria`;
  - `--trials-dir`;
  - `routeFrom`;
  - the boundary tests in §10.
- **`npm run test:e2e`**: a new `e2e/trials.spec.ts`. It adds NCT00000000 by link and sees *parsing*, then *ready*. The start page then lists it with its mark. A conversation started from it asks its first question. It's removed and leaves the start page. Adding `NCT99999999` fails with fake mode's reason, and adding a pinned trial is refused. Playwright's server command empties `e2e/.out/trials` and passes `--trials-dir` to it.
- **The gate**, on the local model (intent, Gates).
- **`npm run screenshots`** re-run, since the header changes in every view.
