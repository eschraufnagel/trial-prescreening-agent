# spec: 0010 browser end-to-end tests

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0010-browser-e2e-tests/intent.md`

---

## 1. Summary

The coordinator review reads a committed file per eval run instead of the gitignored conversation cache, so `npm test` and the page work from a fresh clone. The scripted agent learns three replies, `[down]`, `[slow]` and `n/a`, so fake mode reaches every state the page has. `npm run test:e2e` runs Playwright against `npm run app -- --fake` on its own port with an empty conversation directory, and drives nine cases in Chromium. After a gate that breaks the page on purpose and watches each case fail, CLAUDE.md and REVIEW.md make the browser run part of every page change. No model, no change to the agent, the grader or the review's rules.

## 2. Decisions taken before this spec

The owner accepted the intent's five recommendations in 2026-09 ("Go"), and its one gate as proposed.

| # | Decision | Consequence here |
| --- | --- | --- |
| D1 | `@playwright/test`, Chromium downloaded once by `npx playwright install chromium` | §5.1 |
| D2 | `npm run test:e2e` against `npm run app -- --fake`, own port, own conversation directory, specs in `e2e/`, no model asserted | §4, §5.2, §6.2 |
| D3 | The roadmap's cases, plus the start page, row order and a reload | §5.4 |
| D4 | One committed review file per served or scored run, written from the cache by a command | §3 |
| D5 | CLAUDE.md and REVIEW.md name `test:e2e` and when it runs | §7 |
| Gate | Mutation pass and run time, then the owner's go-ahead before §7's rule is written | §8 |

The intent's seven open questions:

| Intent question | Answer | Section |
| --- | --- | --- |
| 1. The review file's shape, name, command; does the runner write it | `evals/results/screening/review/<run file>`, written by `npm run review:export`. The runner doesn't write it. A test fails if a named run has none | §3 |
| 2. Trim `READING_RUN`'s file | No. `review:score --groups` reads all fifteen labels conversations, and a trimmed file is a second format | §3.1 |
| 3. The fake delay | `delayMs` on a scripted response, in `src/models/fake.ts` | §4.2 |
| 4. Which study, which eval-run conversation | NCT04316364 for live conversations (23 replies to finish, the fewest). `eval NCT00077350-v2-labels` for 0009's words: L18 clinical, reported doesn't-apply; L20 patient, closed doesn't-apply | §5.4 |
| 5. How a spec waits | On what a person would see, through Playwright's retrying assertions. No fixed sleeps | §5.3 |
| 6. Playwright's output | Everything under `e2e/.out/`, gitignored and outside Biome. Traces are never committed | §5.2 |
| 7. The README | A "Checking the page" section, and the fake replies in the app section | §7.3 |

## 3. The review's data

### 3.1 The file

`evals/results/screening/review/<run file name>`, for example `review/02-2c46ada9a1d5.json`. Two exist after this slice: `EVAL_RUN`'s (0009) and `READING_RUN`'s (0004). Each is whole, every conversation its run graded, in the run file's order.

```
{
  "runFile": "<the run file's name>",
  "promptVersion": "<the run's promptVersion>",
  "conversations": [
    { "id": "eval <vignetteId>-<source>", "nctId": "...", "source": "labels" | "parse",
      "criteria": [...], "result": { ... } }
  ]
}
```

- `criteria` is `state.criteria` from the conversation file. `result` is `result` as the file stores it.
- Nothing else is copied: no `vignetteId` field, and nothing from `memory`, `participant`, `timing`, `fidelityChecked` or the grades. The review's blindness (0007 spec §8.3) now holds for a committed file, and a test checks the file against `EVAL_ONLY_KEYS` (§6.1).
- Renderings aren't stored. The loader rebuilds them from `data/plain/`, as today, so a rendering fix doesn't need a re-export.
- Written as two-space JSON with a final newline, as the run files are. Biome doesn't format it: `!evals/results/screening/review` joins `biome.jsonc`'s excludes beside the conversation cache. Formatting 2 MB of JSON on every `npm run lint` buys nothing.

### 3.2 `npm run review:export -- <run file>`

`scripts/review-export.ts`, with its logic in `scripts/app/eval-run.ts` as `exportReview(dir, runFile)`:

- Reads the run file and finds each conversation file by the versions the run recorded, exactly as `loadEvalRun` does today (0009 spec §7.1).
- Keeps today's refusals, moved from load time to export time: a file that is missing, a file with no finished result, a result made with a different prompt than the run records. Each names the file.
- Deterministic: the same cache gives the same bytes.
- Writes the file. If one exists with different content, it refuses without `--force` and says the cache no longer matches what was committed. Identical content is a no-op.
- No model, no network.

### 3.3 `loadEvalRun`

`loadEvalRun(dir = SCREENING_DIR, runFile = EVAL_RUN)` keeps its signature and its return value, `FinishedConversation[]` in run order. It reads `review/<runFile>` and nothing under `conversations/`.

- It checks that the file's `runFile` is the one asked for, and that its `promptVersion` is the committed run file's. Either mismatch throws, naming both.
- A missing review file throws with the command that makes it: `npm run review:export -- <runFile>`.
- `loadReadingRun` is unchanged in meaning.
- `scripts/app.ts` still starts without a review file, with nothing to review, as it does today without the cache.

### 3.4 Keeping it true

- A test fails if `EVAL_RUN` or `READING_RUN` names a run with no committed review file (§6.1). A later slice that moves `EVAL_RUN` has to commit the file in the same change.
- CLAUDE.md says so, in the `review:export` row (§7.1).
- The screening runner doesn't write review files. Most runs are dev runs the page never serves, and a review file for each would be dead weight.

## 4. Fake mode

### 4.1 `--chats-dir <dir>`

`scripts/app.ts` gains `--chats-dir`. The default stays `chats/`. The directory is created if missing. It's the only change to `scripts/app.ts` apart from its header comment, which still says the review serves "0004's" run.

### 4.2 A delay on a scripted response

`ScriptedResponse`'s `json` and `error` kinds gain an optional `delayMs`. `FakeModelAdapter.complete` settles after that many milliseconds instead of at once. With no `delayMs`, behaviour is byte-for-byte today's. It's tested in `tests/models/fake.test.ts` with a real delay of a few tens of milliseconds. No fake timers: `isolate: false` rules out stubbing globals, and `tests/boundary.test.ts` checks it.

### 4.3 Three replies the scripted agent reads specially

In `scripts/app/scripted-agent.ts`. Each applies to the read call only, and only to a reply that starts with the marker:

| Reply starts with | The scripted agent | The page shows |
| --- | --- | --- |
| `[down]` | `{ kind: "error", message: "request failed: [down] was typed, the scripted model is unreachable" }` | The server's `MODEL_UNAVAILABLE` notice, and the message back in the box, not processed |
| `[slow]` | Reads the rest of the reply as it would without the marker, and holds the answer 2,000 ms | The waiting bubble, and sending disabled, for two seconds |
| `n/a` | Reading `does-not-apply`, quote `n/a`, `outright: true` | A patient row closed unresolved as doesn't-apply. A clinical row reported doesn't-apply |

- **`[down]`** works because `isConnectionFailure` matches a problem starting "request failed", which the fake adapter passes through as the `ModelError`'s problem. Sending again with the same text fails again. Editing the text lets the conversation go on.
- **`[slow]`** is read with the marker stripped, so `[slow] yes` holds. Its quote is the first word after the marker, which is in the message, so the evidence check still passes for the right reason.
- **`n/a`** as a first word, in any case, `n/a` only. The existing reading of `no` and `not sure` is unchanged.
- **The comment** at the top of the file lists the three. The banner in `src/web/App.tsx` becomes "Answers yes, no, n/a or not sure are read literally." The two bracketed markers are left out of the banner. They're test apparatus, and they're listed in the README.
- **Tests:** `tests/scripts/scripted-agent.test.ts` gains one case each. `[down]` rejects with a connection failure, `isConnectionFailure` is true, and the session is unchanged and can take the next reply. `[slow] yes` holds, with a response that took at least the delay. `n/a` closes a patient row `unresolved` / `does-not-apply` and reports a clinical row `does-not-apply`.

## 5. The browser test

### 5.1 The dependency and the browser

- `@playwright/test`, exact-pinned in `devDependencies` at the current release (1.63.0 when this was written).
- `npx playwright install chromium` is run once by a person, and puts the browser in Playwright's cache outside the repository. It's not a postinstall, and `allowScripts` is unchanged.
- If the browser is missing, Playwright's own error says to run the install. The README repeats it.

### 5.2 Configuration

`playwright.config.ts` at the root. `tsconfig.json` already includes `*.config.ts`. It gains `e2e/**/*.ts`.

| Setting | Value | Why |
| --- | --- | --- |
| `testDir` | `e2e` | Outside `tests/` and outside Vitest's `tests/**/*.test.ts` |
| `testMatch` | `*.spec.ts` | |
| `workers`, `fullyParallel` | 1, false | One server and one conversation directory. Parallel starts would share both |
| `retries` | 0 | A flaky browser test is a bug |
| `timeout` | 60 s per test | Finishing a conversation is 23 replies |
| `use.baseURL` | `http://127.0.0.1:5015` | |
| `use.trace` | `retain-on-failure` | A failure can be opened with `npx playwright show-trace` |
| `projects` | Chromium only | |
| `outputDir` | `e2e/.out/results` | |
| `reporter` | `list`, plus `html` to `e2e/.out/report` with `open: "never"` | |
| `webServer.command` | `rm -rf e2e/.out/chats && npm run app -- --fake --port 5015 --chats-dir e2e/.out/chats` | Always from an empty directory. Never the owner's `chats/` |
| `webServer.url` | `http://127.0.0.1:5015/api/info` | Ready when the API answers |
| `webServer.reuseExistingServer` | false | A server already on 5015 is an error, not a test target |
| `webServer.timeout` | 60 s | Includes `vite build` |

`e2e/.out/` goes in `.gitignore` and in `biome.jsonc`'s excludes.

`package.json` gains `"test:e2e": "playwright test"`. Arguments pass through, so `npm run test:e2e -- --headed` or `-g reload` work.

### 5.3 How the specs are written

- **One file per area:** `e2e/start.spec.ts`, `e2e/conversation.spec.ts`, `e2e/review.spec.ts`.
- **Locators by role and visible text**, as a person finds things: `getByRole("button", { name: "Start" })`, `getByText(...)`. Structure only where there's no other handle: a review row by its `id` attribute (`#row-L18`), which the page already sets for its own links. No test ids are added. If a spec can't find an element any other way, the plan records it and adds an accessible name, not a test id.
- **Waiting is on what a person would see**, through `expect(...).toBeVisible()`, `toHaveText` and `toHaveCount`, which retry until their timeout. No `waitForTimeout`, no fixed sleeps.
- **Words come from the code that owns them.** Specs import them from `src/web/review.ts` (`HEADER_NOTE`, `SCRIPTED_NOTE`, `EVAL_RUN_NOTE`, `findingWords`, `reasonWords`), `src/web/logic.ts` (`STATUS_WORDS`) and `src/server/conversations.ts` (`MODEL_UNAVAILABLE`). The words are pinned by `tests/`. The browser test checks the page shows them. So a deliberate wording change doesn't mean editing a spec, and a component that stops showing a word fails.
- **Each live conversation starts fresh from the start page.** A test never depends on another test's conversation.

### 5.4 The cases

Live conversations use NCT04316364: 23 raisable criteria, L1 first, clinical.

**`start.spec.ts`**

1. **The start page.** The five labelled studies each have a Start button. "From the eval run" lists as many conversations as `EVAL_RUN`'s review file holds (read by the spec, not a literal 30). The scripted-agent banner shows.

**`conversation.spec.ts`**

2. **The tester panel follows the conversation.** Start NCT04316364. The first question arrives, and L1's row is tagged "asked, awaiting reply". Answer `yes`. L1's status reads `STATUS_WORDS["chart-review"]`, since L1 is clinical, with "person reported: holds". The awaiting tag moves to the next raisable row.
3. **Finish and open the review.** Answer `yes` until "This conversation is finished" shows. Open the coordinator review from the link. It shows `HEADER_NOTE` and `SCRIPTED_NOTE`, and within each group the rows' criterion numbers ascend. Labelled ids are line numbers, so ascending is protocol order.
4. **Model down.** Start a conversation and send `[down] yes`. The page shows `MODEL_UNAVAILABLE`, the message is marked "not processed", and the button reads "Send again" with `[down] yes` back in the box. Replace it with `yes` and send. The notice goes, and the next question arrives.
5. **Busy.** Open the same conversation in a second tab (B) and let it load. In the first tab (A), send `[slow] yes`. A shows the waiting bubble with the button disabled. Text typed into A meanwhile is still in the box when the answer arrives. In B, whose view is behind, type `no` and send. B shows "The agent is still working on your last message. Your draft is kept." and `no` is still in B's box.
6. **0009's words, live.** Start NCT04316364. Answer `n/a` to L1 (clinical, inclusion), `yes` to L2 through L6, `n/a` to L7 (the first patient criterion, inclusion), and `yes` to the end. In the tester panel, L1 shows "person reported: does-not-apply" and L7 "reason: does-not-apply". In the review, L1's finding reads `findingWords("inclusion", { status: "chart-review", reported: "does-not-apply" })`, and L7 reads "Why: " + `reasonWords("does-not-apply")`.
7. **A reload comes back.** Answer two questions, then reload. The same conversation shows with its messages, the composer is ready, and the tester panel shows the two answered rows as they were.

**`review.spec.ts`**

8. **An eval-run conversation.** From the start page, open `eval NCT00077350-v2-labels`'s review. It shows `EVAL_RUN_NOTE`, and rows ascend within each group.
9. **0009's words from the eval run.** In the same review, `#row-L18` (clinical, exclusion) shows `findingWords` for a chart-review row reported doesn't-apply, and `#row-L20` (patient, exclusion) shows "Why: " + `reasonWords("does-not-apply")`.

Nothing here asserts a colour, a layout or a screenshot.

## 6. Tests in `tests/`

### 6.1 The review data

In `tests/scripts/app-eval-run.test.ts`, and a new `tests/scripts/review-export.test.ts`:

- `exportReview` over a one-conversation run in a temp directory: today's refusals (missing, unfinished, wrong prompt), now at export. The temp-directory helper moves here from the loader's test.
- `exportReview` is deterministic, and refuses to overwrite different content without `--force`.
- `EVAL_RUN` and `READING_RUN` each have a committed review file.
- Neither committed file contains a key in `EVAL_ONLY_KEYS`, at any depth.
- `loadEvalRun` over a temp directory refuses a review file whose `runFile` or `promptVersion` doesn't match.
- The loader's existing tests (fifteen from each source, renderings for labelled criteria only, nothing from the vignette or grade) pass unchanged, now reading the committed file.

### 6.2 The browser test's boundary

In `tests/boundary.test.ts`, one test: `playwright.config.ts`'s `webServer.command` contains `npm run app` and `--fake`, and no model flag (`--agent`, `--model`, `--spend`). It's read as text, and nothing imports Playwright into `npm test`. It is the check that `test:e2e` can't reach a model.

### 6.3 The whole suite from a clean clone

Not a test in `tests/`. It's a proof the plan runs and records: `git clone` of the branch into a temporary directory, with `node_modules` linked, and `npm test` passes. Today it fails 5 files. It's rerun before the PR.

`npm test` stays near a second. Two committed files replace sixty cache reads, so it shouldn't get slower, and the plan records the before and after.

## 7. Documentation

### 7.1 CLAUDE.md

Written after the gate (§8), and only if it passes.

- **"Verifying your work":**
  - `npm run test:e2e`: drives the built page in Chromium against `npm run app -- --fake` on port 5015, with an empty conversation directory. Deterministic, no model, about N seconds (measured). Not part of `npm test`.
  - One-time `npx playwright install chromium`.
  - `npm run review:export -- <run file>`, with the rule that a run named by `EVAL_RUN` or `READING_RUN` commits its review file in the same change.
  - The `npm run app` row notes `--chats-dir` and the scripted agent's three replies.
- **The PR checklist** ("Run `npm test`, `npm run typecheck` and `npm run lint` before opening a PR") gains: `npm run test:e2e` too, when a change touches `src/web/`, `src/server/`, `src/transport/`, `scripts/app.ts`, `scripts/app/`, `vite.config.ts`, `tsconfig.web.json`, `EVAL_RUN`, `READING_RUN` or `evals/results/screening/review/`. The PR description says it ran and how many passed.
- **"`tests/` and `evals/` are different things"** gains `e2e/`: deterministic, but needs a browser and a built page. It runs on demand, never in `npm test`, and no model.
- **"Where things live"** gains `e2e/` and `evals/results/screening/review/`.
- **One line:** nothing under `tests/` reads a gitignored file, so `npm test` passes from a fresh clone.

### 7.2 REVIEW.md

- **Pass 2, Correctness,** gains: "If the change touches the page's paths (CLAUDE.md lists them), did `npm run test:e2e` run, and did it pass? A page change with no browser run, or a failing one, is Important."
- **Pass 4, Eval integrity,** gains: "Browser specs are held like tests. A spec loosened, skipped or deleted in the change it would have caught is Important."

### 7.3 README

- **The app section** lists `n/a`, `[slow]` and `[down]`, and `--chats-dir`.
- **A new "Checking the page" section:** what `test:e2e` covers (§5.4), what it doesn't (layout, local-model mode, parse mode), the one-time install, its measured run time, and that the gate's mutation pass showed each case fails when its behaviour breaks.
- **Wherever the README says the review needs the local cache**, it now says the review reads a committed file.

### 7.4 ROADMAP

- 0010 marked done.
- The two 0009 carried-forward items (the gitignored cache, and no browser test or loop) resolved.
- A new carried-forward item: `--source parse` serves nothing from a fresh clone, because the parse cache is gitignored. It goes to 0011.
- A "Carried forward from 0010" list.

## 8. What the plan must gate

**One gate, before §7.1 and §7.2 are written: is this check worth what every later page change pays for it?**

The plan presents:

- **The measured run time** of `npm run test:e2e`, three runs, and that all three passed. A flake in three is reported, not retried away.
- **A failure's output:** the list reporter's lines and the path to its trace.
- **The mutation pass.** For each case, one deliberate break in the page, the run showing the case fail, and the break reverted. None is committed:

| Case | Break |
| --- | --- |
| 1 | `StartPage` drops the eval-run list |
| 2 | `TesterPanel` stops showing "asked, awaiting reply" |
| 3 | The review link on a finished conversation is removed |
| 4 | `ParticipantPane` stops showing `composer.detail` |
| 5 | The send button's `disabled` ignores `canSubmit` |
| 5 | The refusal notice isn't shown |
| 6, 9 | `Row` in `ReviewPage.tsx` drops its "Why:" line |
| 3, 8 | `ReviewPage` renders each group's rows reversed |
| 7 | `App` starts on the start page whatever the hash |

A break that no case catches is a finding. Either a spec is added or changed, and the pass repeated, or the plan records why it's accepted.

**What it costs to be wrong:** a rule every later slice obeys for a check that catches nothing, or one too slow or flaky for anyone to run. The mutation pass is delegated to Claude. The go-ahead is the owner's, and it can say no: then the specs, the review files and fake mode stay, and §7.1 and §7.2 wait.

No other gate. §3's data is proved by §6's tests and the clean-clone run, and nothing downstream spends on it.

## 9. Out of scope

- A model of any kind, and any change to `src/screening/`, the grader, vignettes, labels or committed runs.
- Parse mode from a fresh clone (0011), local-model mode in a browser, visual regression, accessibility audits, Firefox and WebKit, CI.
- Showing `statement` or `withheld` in the review.
- Any change to the review's groups, words or order. §4.3's banner line is the only change to the page's text.
