# plan: 0005 transport and API

**Intent:** `work/0005-transport-and-api/intent.md` · **Spec:** `work/0005-transport-and-api/spec.md`
**Branch:** `0005-transport-and-api` (from `main` at `dcd9f3a`; intent `609d295`, spec `5d23442`)

This file becomes `work/0005-transport-and-api/plan.md`, committed on its own before any code.

---

## Context

The agent from 0004 can only be reached from a terminal. This slice puts it behind a `MessageTransport`, a local Fastify API and a React page. On the page, a person plays the participant, and a tester panel beside the conversation shows what the agent recorded. The agent itself does not change. The design is settled in the spec: a background turn, with the page polling (§4, §5); a second message during a turn is refused (§4.3); conversations are saved in `chats/` in `screening:chat`'s format (§5.4); two narrow network exceptions (§9.1); a scripted fake mode (§8.3); criteria come in through a launcher under `scripts/` (D3). Plain language is 0006 (D1).

**What is scarce is the owner's attention at the right moment, not model time.** The owner wants to try things early (D2). So Stage A builds the whole path from browser to model, thin, and stops at a gate where the owner uses it. Nothing in this slice needs clinical judgment.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can try at the end |
| --- | --- | --- | --- |
| **A. The thin path** | 1–8 | **Gate 1** | `npm run app -- --fake`, then `npm run app`: talk to the real agent in the browser, with the tester panel filling in |
| **B. Survives real use** | 9–12 | no gate | Reload mid-conversation; restart the server mid-reply; stop oMLX mid-turn and press Send again; continue a terminal chat in the browser |
| **C. Renumbering, documentation, PR** | 13–15 | PR | README "Try it" section, followed cold |

**Gate 1: is this the interaction, and the toolchain, to build the rest on?**
The owner runs `npm run app -- --fake` (instant, scripted) and then `npm run app` (the real agent on oMLX), and plays at least five turns of NCT04316364 in the browser. Step 8 records the measured seconds per reply beside the gate. They decide:
1. **The wait.** Is about 7.5 s per reply (measured below; the intent estimated 18 s) tolerable with "Thinking… N s" showing? If not, what changes: for example, a fixed acknowledgement ("Got it, one moment") delivered as soon as a message arrives. That would be a transport-level message, never model-written.
2. **The refused second message.** Try sending while it is thinking. Does keeping the draft and disabling Send feel acceptable, or does it need the merge-and-rerun design (spec §4.3) now?
3. **The tester panel.** Can they tell, from the panel alone, what the agent recorded for each answer and which words it rested on, including an answer volunteered out of order?
4. **Layout and toolchain.** Is there visible room for the coordinator pane (0007) beside or after the conversation? And one command, one port, rebuild on each start, no hot reload: acceptable for the next three slices?

**Measured for the gate (step 8, 2026-09).** Real agent on `Qwen3.6-35B-A3B-MLX-8bit` via oMLX, reasoning off, NCT04316364 from labels, through the API. The opening took 12.4 s. Five replies took 7.6, 8.1, 6.6, 6.8 and 8.4 s, **mean 7.5 s**. That is well under the 18 s the intent estimated from 0004's eval run, where the simulated participant and fidelity check were sharing the machine. A sixth reply, typed in the browser, showed "Thinking… 3 s", the message marked *sent*, and Send disabled with the next draft kept, until the reply arrived about 8 s later.

**Passed 2026-09.** The owner tried the page and said it works great. No changes were asked for on any of the four questions, so the interaction goes forward as built: a background turn with the elapsed-time indicator, a second message refused with the draft kept, the tester panel as it is, and the toolchain as it is. Stage B builds on that shape.

*Why it guards the next stage:* Stage B builds saving, recovery from a restart, failure and retry handling, request guards and most of the tests around this interaction's shape. Changing that shape afterwards means rebuilding all of it. The toolchain (React, Vite, Fastify, two tsconfigs, a hand-written static server) is inherited by 0006–0008, and after this point switching costs a slice. If the wait or the refusal is wrong, a test cannot say so; only a person using the page can.

No gate after Stage B. Its steps end in things to try, but none of them spends a resource or sets something a later slice depends on that Gate 1 has not already settled (spec §11).

### Steps

Each step is one commit, and `npm test`, `npm run typecheck` and `npm run lint` pass at every commit.

**Stage A: the thin path**

1. **Reconcile the spec with the repository, and record the test baseline.** In `spec.md`:
   - §8.3: the responder goes in `FakeModelAdapter`'s existing options argument, `new FakeModelAdapter([], { respond })`. The constructor already takes `(script, options)`.
   - §8.3: the scripted question quotes the criterion text rather than naming its id, because the ask prompt carries no id (`buildAskPrompt`, `src/screening/prompts.ts`).
   - §9.1: the walker resolves a `.js` specifier to `.ts`, then `.tsx`. The page imports with `.js` specifiers, which Vite resolves.
   - §10 "Budget": the baseline, measured before any change, is 0.95–1.00 s wall time. The critical path is not collection. It is `tests/criteria/normalize.test.ts` at about 540 ms: its corpus round-trip loops call `expect` once per character index. Other files run in parallel beside it. New tests stay off that path, and Fastify tests go in one file.

2. **Toolchain and dependencies.**
   - `package.json`: `dependencies` `fastify@5.12.5`, `react@19.3.0`, `react-dom@19.3.0`; `devDependencies` `vite@7.3.6`, `@vitejs/plugin-react@5.2.0`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`. These are the latest versions at planning, pinned exactly like the existing dev dependencies. If they turn out incompatible with each other or with Node 24, step back to the newest set that works and record it in the change table. Each one is justified in the PR: Fastify (spec's stack; `inject` makes the API testable with no socket); React and React DOM (spec's stack); Vite and its React plugin (bundling TSX for the browser); types.
   - Scripts: `"app": "vite build && node --env-file-if-exists=.env --import tsx scripts/app.ts"`. `typecheck` becomes `tsc --noEmit && tsc --noEmit -p tsconfig.web.json`.
   - `vite.config.ts` at the root: `root: "src/web"`, `build.outDir: "../../dist/web"`, `emptyOutDir: true`, the React plugin.
   - `tsconfig.json`: `exclude: ["src/web"]`. New `tsconfig.web.json`: `lib: ["ES2023", "DOM"]`, `jsx: "react-jsx"`, `moduleResolution: "Bundler"`, the same strict flags, `include: ["src/web/**/*", "src/transport/web/client.ts"]`.
   - `biome.jsonc`: add `!dist`. `dist/` is already gitignored.
   - `src/web/index.html` and a placeholder `src/web/main.tsx` that renders "Loading", so `vite build` and both typechecks are exercised from this commit on.

3. **`src/models/`: two additions only (spec §5.3, §8.3).**
   - New `src/models/errors.ts` with `isConnectionFailure(error)`, moved verbatim from `evals/screening-runner.ts:496` and exported from `src/models/index.ts`. `evals/screening-runner.ts` imports it from there. Behaviour is unchanged, and the existing runner tests still pass.
   - `FakeModelAdapter`: an optional `respond?: (request) => ScriptedResponse` in `FakeModelOptions`, used only when the script array is empty. Running dry without a responder still rejects, as now.
   - Tests in `tests/models/fake.test.ts`: the responder is used after the script is exhausted, and never before it. Also add `tests/models/errors.test.ts`.

4. **`src/transport/`: interface, rules, memory implementation (spec §4).**
   - `types.ts`: `InboundMessage`, `ChannelStatus`, `MessageTransport`.
   - `rules.ts`: `MAX_MESSAGE_CHARS = 1600` with its reasoning, and `checkInbound(text, status)` returning `ok`, or a refusal with an HTTP-shaped code (`400 empty`, `400 too-long`, `409 working`, `409 done`).
   - `memory.ts`: `MemoryTransport`, whose `send()` applies `checkInbound`.
   - `index.ts`.
   - Tests: `tests/transport/rules.test.ts` and `tests/transport/memory.test.ts`.

5. **`src/server/conversations.ts`: the conversation service (spec §5.1–5.3), in memory only.**
   - `ConversationService({ studies, source, adapter, transport })`, with `start(nctId) → id`, `inspect(id)`, and `settled(id): Promise<void>` for tests.
   - A turn runs in the background as spec §5.1 describes. There is a per-conversation `busy` guard that throws if a turn is already in flight. Errors are mapped to `unavailable` or `failed` with spec §5.3's detail text, using `isConnectionFailure`.
   - `retry(id, text?)`: only after a failure, re-receives the unprocessed message, or the edited text if given.
   - Ids: `<nctId>-<yyyymmddThhmmss>`, the same as `scripts/chat.ts:60`. If a stem collides with an existing one, wait until the next second. Saving to disk comes in step 9. Here the service keeps conversations in a `Map`.
   - Tests (`tests/server/conversations.test.ts`, no Fastify import):
     - **the transparency test**, part 1: one scripted conversation run through `ScreeningSession` directly and through the service over `MemoryTransport` gives equal state and result, excluding `result.run.timestamp`;
     - the busy guard;
     - a connection failure gives `unavailable`, and a malformed response gives `failed`, with state unchanged;
     - retry succeeds and matches an uninterrupted run;
     - an edited retry.

6. **`WebTransport`, the API, and serving (spec §4.2, §6, §8.2), with the listen and client network exceptions.**
   - `src/transport/web/transport.ts` (`WebTransport`: outbox, seq, status), `src/transport/web/routes.ts` (a Fastify plugin with the three message routes in spec §6.2), and `src/transport/web/client.ts` (browser half: `send`, `poll(after)`, `retry`, all relative `fetch`).
   - `src/server/app.ts`: `buildApp({ studies, source, adapter, chatsDir?, webDir? })`. This is the composition root. It constructs `WebTransport` and the service, registers the transport routes and the inspection routes in spec §6.1, and serves the static files in `webDir`: it reads the file list once, serves exactly those files, gives `index.html` for other non-`/api` paths, and returns 404 JSON for unknown `/api` paths.
   - `src/server/start.ts`: `LOOPBACK_HOST = "127.0.0.1"`, and `startServer(options & { port })`, which calls `buildApp` and then `listen({ host: LOOPBACK_HOST, port })`.
   - `src/server/index.ts`.
   - `tests/boundary.test.ts`: `fastify` joins `NETWORK_PATTERNS`. Two per-file exceptions are added, as spec §9.1 lays out: listening only in `src/server/start.ts`, with `listen(` taking `host: LOOPBACK_HOST`; relative-literal `fetch` only in `src/transport/web/client.ts` and `src/web/api.ts`. Each has a synthetic-source proof that it fires. `app.ts` and `routes.ts` receive a Fastify instance as a type only (`import type`), so the `fastify` pattern does not match them. `start.ts` alone imports the value. The "walks a real graph" test asserts that `server/start.ts` and `transport/web/client.ts` are reached.
   - Tests: `tests/server/app.test.ts`. **This is the only file that imports Fastify.** It uses `inject`:
     - the transparency test, part 2: the same scripted conversation through HTTP gives an equal state;
     - every route's happy path, plus 400, 404 and 409;
     - static serving: a known file, an unknown path getting the page, and `/api/unknown` getting 404.

7. **The page (spec §7).**
   - `src/web/`: `main.tsx`, `App.tsx` (hash routes `#/` and `#/c/<id>`, and a header from `/api/info` with the scripted banner), `StartPage.tsx`, `ParticipantPane.tsx`, `TesterPanel.tsx`, `CriterionText.tsx`, `api.ts` (inspection client, relative `fetch`), `logic.ts` (pure, with no React or DOM imports, so the main tsconfig can typecheck the tests that import it), and `styles.css` (plain CSS, a two-column layout that stacks on a narrow window, with room reserved for the coordinator pane).
   - Polling runs once a second while the status is `working`, and on focus otherwise. The tester panel refetches when a poll brings anything new.
   - Tests: `tests/web/logic.test.ts` covers send-allowed per status, poll merge (duplicates, and a reload with `after=-1`), changed-row detection, and the text of the elapsed indicator.
   - Boundary: the walker also discovers `src/web/main.tsx`, and resolves `.tsx`. It asserts `main.tsx` is reached, and that a synthetic `fetch` in `App.tsx` fails.

8. **The launcher and the scripted agent (spec §8), then a real run for the gate.**
   - `scripts/app.ts`: `--source labels|parse`, `--fake`, `--port` (default 5005).
     - Labels come through `fromLabels(loadLabelSet(id))` for the five label sets; parses through `fromParse` and `cacheKey()` from `evals/runner.ts`, skipping and naming any study with no cached parse.
     - The adapter is `new OmlxAdapter({ thinking: false })`. A missing `OMLX_API_KEY` prints the fix and suggests `--fake`.
     - It prints the URL and the mode.
   - `scripts/app/scripted-agent.ts`: the responder from spec §8.3. The ask prompt carries no criterion id. So the scripted question quotes the prompt's `CRITERION (…):` line: "(scripted) Is this true for you: <criterion text>? Answer yes, no, or not sure." Read takes the id from `THE QUESTION WAS ABOUT:` (`src/screening/prompts.ts:138`). Spec §8.3 is corrected in step 1 to match.
   - Test: `tests/scripts/scripted-agent.test.ts` drives a full `ScreeningSession` with it, and asserts termination and that every raisable criterion was asked.
   - Then run it for real: `npm run app -- --fake`, then `npm run app` with oMLX healthy. Record seconds per reply for five turns of NCT04316364 in the change table, so Gate 1 has the number.

→ **Gate 1**

**Stage B: survives real use**

9. **Saving to disk (spec §5.4).**
   - `src/server/store.ts`: `ConversationStore(chatsDir)`, with `list()`, `load(id)` and `save(record)`. It checks ids against `/^NCT\d{8}-\d{8}T\d{6}$/` before any path is built. Writes go to a temporary file and are then renamed. `vignetteId: "web <nctId>"` and `pending` are added.
   - The service saves when a message is accepted and when a turn completes or fails, and loads on first use. At startup, a record left `working` becomes `failed`, with "The server restarted before this message was processed".
   - `/api/conversations` lists from the store, so terminal chats appear too.
   - Tests:
     - save on accept and on completion;
     - restart recovery;
     - a `scripts/chat.ts`-format file loads and continues;
     - `toView` from `scripts/show-conversation.ts` renders a saved web conversation;
     - a bad id is refused;
     - the collision wait.
   - *Try:* reload mid-conversation; stop the server during "Thinking…", restart it, and press Send again.

10. **Failure and retry in the page.**
    - The "not processed" state with its detail and **Send again** (editable).
    - Model-down wording that includes the `/health` URL.
    - The done state, with the `screening:show` command.
    - `logic.ts` gains the matching functions and tests.
    - *Try:* stop oMLX mid-turn, read the message, start oMLX, and send again.

11. **Request guards (spec §6.3).**
    - A `Host` check (421 unless `127.0.0.1:<port>` or `localhost:<port>`, with the port taken from the server's own address once it is listening; `inject` tests pass the host explicitly).
    - An `Origin` check on mutating routes.
    - The logger configured to record method, URL and status, never bodies.
    - Tests, added to `tests/server/app.test.ts`:
      - 421 for a foreign host;
      - 403 for a foreign origin;
      - a marker string sent in a message does not appear in the captured log stream;
      - **no verdict**: walk every route's JSON from a finished scripted conversation and fail on keys matching `/eligib|verdict|disposition|qualif/i`.

12. **The transport boundary and the criterion seam (spec §9.2, §7.3).** In `tests/boundary.test.ts`:
    - `src/screening/` imports nothing from `src/transport/` or `src/server/`;
    - `src/server/conversations.ts` imports only types from `src/transport/`;
    - `WebTransport` is constructed only in `src/server/app.ts`;
    - no `src/web/*.tsx` other than `CriterionText.tsx` contains `.text` read off a criterion (a source check for `criterion.text` and `c.text` patterns, with a proof that it fires).

    In `tests/server/app.test.ts`, the message routes' registration is traced to the transport plugin.

    - *Try:* nothing new to see. This step makes the boundaries hold without relying on discipline.

**Stage C: renumbering, documentation, PR**

13. **Renumber the later slices** to 0006 plain language, 0007 coordinator review pane and 0008 model comparison, in every file outside `work/0001`–`work/0004` and `evals/results/` that names them. From the grep at planning:
    - `src/screening/types.ts:46`, `src/models/{types,omlx,fake}.ts`, `src/criteria/{types,parse,normalize}.ts`;
    - `tests/boundary.test.ts:27,348`, `tests/models/fake.test.ts`;
    - `scripts/show-conversation.ts:9`;
    - `README.md:180`, `CLAUDE.md:65`, `evals/cases/VIGNETTES.md:23`.

    Re-grep before committing. The work is changing comments only, and each is read in context, because "0006" in a comment means the coordinator pane and becomes 0007.

14. **Documentation.**
    - README "Try it" (spec §13).
    - CLAUDE.md: `npm run app` in the command table, replacing "There is no command to run the application"; `src/server/` and `src/transport/` in the layout.
    - ROADMAP:
      - 0005 done, and the new slice rows;
      - product open question 1 moved to 0007;
      - the renumbering note;
      - an unplaced row for the agent's overconfidence fixes;
      - "Carried forward from 0005".

15. **Reconcile `plan.md`** (fill in the change table and "Files that change" as built), confirm `git diff main -- src/screening` is the one step-13 comment and `PROMPT_VERSION` is still `c5778afe9cbd`, run the five `REVIEW.md` passes, and open the PR. The PR body lists the new dependencies with their reasons, says how Gate 1 went, and carries no tool attribution.

---

## What changed during implementation

Every divergence from this plan is recorded here in the commit that makes it.

| Change | Why |
| --- | --- |
| Vite 7.3.6 and `@vitejs/plugin-react` 5.2.0, not Vite 8.3.0 and plugin 6.1.1 (step 2) | `vitest@3.2.7` requires `vite` 5–7, and plugin 6 requires Vite 8. Moving to Vite 8 would mean upgrading Vitest, which is outside this slice. `npm audit` reports two moderate advisories in development tools only: Vitest's mocker, which was already present, and esbuild's dev server on Windows, which this project never runs. Neither is in the runtime dependencies |
| `src/transport/ledger.ts` added: `ChannelLedger`, the bookkeeping both transports share (messages, status, the rules). `MemoryTransport` and `WebTransport` extend it. `MessageTransport` gains `open(id, history, status)` so a conversation loaded from disk can be put back on the channel. The ledger sets `working` itself when it accepts a message (step 4) | Without a shared ledger the two transports would duplicate the rules, and the transparency test would compare two implementations of the same bookkeeping instead of one. Setting `working` at acceptance, not in the service's handler, makes the one-message-per-turn rule hold however quickly a second message follows. Both found by the step-4 tests |
| `MessageTransport` gains `onRetry(handler)`; the ledger's `retry(id, text?)` replaces the service's `retry()`. The service gains `state(id)`. Two starts in one second take the next free second instead of waiting for it (step 5) | When the *opening* fails there is no participant message to send again, so "try again" has to be a signal of its own. The transport carries it; the service decides whether it means the opening or the last message. `state(id)` is what the transparency test compares, and what step 9 saves. Taking the next free second keeps `start()` synchronous, with the same result |
| Shared test fixture `tests/fixtures/conversation.ts` | One scripted conversation driven three ways (directly, over the memory transport, over HTTP) has to be the same script, or the transparency test proves nothing |
| **Test budget:** Vitest runs in worker threads (`pool: "threads"` in `vitest.config.ts`), and `normalize.test.ts`'s "indices never go backwards" loop collects violations and asserts once. An extra commit between steps 5 and 6. The plan's diagnosis was wrong: `normalize.test.ts` was the slowest file, but after step 5 the suite was 1.05–1.15 s, and cutting that file's run from ~850 ms to ~330 ms of test time left the wall time at 1.05 s. Process startup and transform were the floor | Measured: forks 1.00–1.05 s, threads 0.71–0.75 s, vmThreads 0.42–0.46 s. vmThreads was rejected because it runs each file in a separate VM context, where `instanceof` against built-ins can fail, and these tests rely on `toBeInstanceOf`. The normalize change checks the same property with one assertion instead of about 40,000 |
| `configureApp(app, options)` takes a Fastify instance instead of `buildApp` creating one, and takes a `mode` for the header. The client's requests share a `json()` body helper, but each `fetch` names its own path literal (step 6) | The boundary test allows `fastify` as a value import only in `start.ts`, so the composition root has to be handed the instance. `start.ts` and the tests each create one. A shared `post(path)` helper would have passed the path to `fetch` as a variable, which the relative-literal rule rightly rejects |
| Two page bugs found by using the page in step 8, fixed before commit: participant bubbles stretched to the pane's height, because the bubble class `participant` also matched the pane's `.participant` rule (bubbles are now `from-agent` and `from-participant`); and a message typed while the previous send was in flight was wiped, because the box was cleared when the request returned. It is now cleared on submit, and a refused message is put back | Neither is reachable from `logic.ts` tests: one is CSS, and the other is the order of React state updates around an `await`. Both were found in the first minute of use, which is the argument for Gate 1 being hands-on |
| Saved conversations are loaded when the server starts, not on first use. The store has `list()` and `save()`, not `load(id)`. `channelHistory()` rebuilds the channel from a transcript (step 9) | The participant's channel has to know a conversation before its first poll arrives, or the poll gets a 404. `chats/` holds a handful of files, so reading them all at startup costs nothing. Restoring is where a message left `working` becomes `failed` with `RESTARTED`, and it is never retried silently. Checked by hand on the real model: the server was killed 1.5 s into a turn, restarted, and the message came back not processed; sending it again carried on |
| After a failed *opening*, the button reads **Try again** and works with an empty box (`canSubmit`, `submitLabel` in `logic.ts`). The model-down notice names the default health URL, `http://127.0.0.1:8000/health`, whatever `OMLX_BASE_URL` says (step 10) | Without this, a conversation whose opening failed could never be retried from the page, because Send needs text and there was no message to resend. Found by writing the step. Checked by hand with the server pointed at a loopback port nothing listens on, which produces the adapter's real connection failure without stopping oMLX. The fixed URL is right for the pinned setup; deriving it would mean the server knowing the adapter's configuration, which only `src/models/` knows |
| `AppOptions` takes `port`, and the guards compare `Host` and `Origin` against it. `StartOptions` is `AppOptions`. A missing `Origin` is allowed (step 11) | The port is known when the app is configured, before it listens, so there is no need to read it back from the socket. Tests use port 80, which is what `inject` sends by default. Only a browser can be made to send a request on someone's behalf, and browsers always send `Origin` on a POST, so refusing a *missing* one would block curl and tests and protect nothing |
| That only the transport registers the message routes is asserted in `tests/boundary.test.ts`: only `routes.ts` and the browser client name `/messages` or `/retry`. It is not traced through Fastify's `printRoutes` in `app.test.ts` (step 12) | A source check covers every file in one assertion, and it catches the route path appearing anywhere else, not only in a registered route. `printRoutes` shows what is registered, not which file registered it |
| `git diff main -- src/screening` is not empty: step 13 renumbers one comment in `src/screening/types.ts`. The check becomes "that comment only, and `PROMPT_VERSION` unchanged at `c5778afe9cbd`" (step 13) | The plan contradicted itself: step 13 lists that line, and step 15 required no diff. The property that matters is that the agent is unchanged. A comment cannot change it, and `PROMPT_VERSION` hashes everything that can |
| **Two bugs found in review (step 15), each fixed test-first:** (1) after a failed *opening*, typed text was sent as a reply to a conversation that had not started, which failed again with no way out. The transport now refuses a message while the opening is unprocessed (409 `not-started`), and the page's Try again sends no text. (2) A save that failed after the agent answered was reported as a failed turn, which would have offered the same message to be taken twice. Saves now log and never throw | Both found reading the diff for REVIEW.md pass 2. The failing tests were committed first (`bb0a962`, and the save test) and left untouched. For (1), one older transport test opened an `idle` channel with no agent message, which the service never produces. Rather than edit it, the rule was narrowed to the failure case the bug is about |
| A poll returns the whole message list, not only messages after a `seq`, and each participant message carries `state` (`pending`, `processed`, `unprocessed`) (spec §6.2) | A resent message replaces the unprocessed one, which an `after` cursor cannot express. Conversations are under about 100 messages over loopback, so the full list costs nothing. The page's merge becomes a replacement, with nothing to get wrong |
| `tsconfig.web.json` has `DOM.Iterable` and `types: ["node"]`, and includes `client.ts`. `tests/boundary.test.ts` gains "the page is browser code": no file under `src/web/` imports a `node:` module or reads `process` (step 7) | The page imports the server's response types (`ConversationInspection`, `ChannelView`) so they cannot drift. Those files reach Node-only modules by type (the models barrel uses `NodeJS.ProcessEnv`), and without Node's types the web typecheck fails. Duplicating the types in the page was the alternative, and duplicated types drift. The test replaces what `types: []` would have enforced |
| `src/web/ConversationView.tsx` added: the conversation and tester panel side by side, polling and refetching | Neither pane should own the other's data. The view holds the poll loop and hands each pane what it shows |

---

## Files that change

As built. Where this differs from the plan as approved, the change table above says why.

**New:**
- `src/transport/{types,rules,ledger,memory,index}.ts`, `src/transport/web/{transport,routes,client}.ts`
- `src/server/{types,conversations,store,app,start,index}.ts`
- `src/web/{index.html,main.tsx,App.tsx,StartPage.tsx,ConversationView.tsx,ParticipantPane.tsx,TesterPanel.tsx,CriterionText.tsx,api.ts,logic.ts,styles.css}`
- `src/models/errors.ts`
- `scripts/app.ts`, `scripts/app/scripted-agent.ts`
- `vite.config.ts`, `tsconfig.web.json`
- `tests/transport/{rules,memory}.test.ts`, `tests/server/{conversations,store,app}.test.ts`, `tests/web/logic.test.ts`, `tests/models/errors.test.ts`, `tests/scripts/scripted-agent.test.ts`, `tests/fixtures/conversation.ts`

**Modified:**
- `package.json`, `package-lock.json`, `tsconfig.json`, `biome.jsonc`, `vitest.config.ts` (the `threads` pool)
- `src/models/{fake,index}.ts` (the responder, and the export)
- `evals/screening-runner.ts` (imports `isConnectionFailure`; nothing else)
- `tests/boundary.test.ts`, `tests/models/fake.test.ts`, `tests/criteria/normalize.test.ts` (one loop asserts once; the same property)
- Step-13 renumbering, comments only: `src/criteria/{types,parse,normalize}.ts`, `src/models/{types,omlx,fake}.ts`, `src/screening/types.ts`, `scripts/show-conversation.ts`, `evals/cases/VIGNETTES.md`
- `README.md`, `CLAUDE.md`, `work/ROADMAP.md`, `work/0005-transport-and-api/{spec,plan}.md`

**Untouched:** `src/screening/` except one renumbered comment (`PROMPT_VERSION` still `c5778afe9cbd`), `src/trials/`, `data/`, `evals/cases/` except the `VIGNETTES.md` comment, and every committed result.

---

## Reused rather than rebuilt

- `ScreeningSession` (`start`, `receive`, `state`, `fromState`) and its atomic turns, from `src/screening/session.ts`. Its `AgentReply` is what `deliver` sends.
- `fromLabels`, `fromParse` and `studyContext` from `evals/screening-input.ts`; `loadLabelSet` from `evals/cases/load.ts`; `cacheKey` from `evals/runner.ts`. All are used only by the launcher.
- `OmlxAdapter({ thinking: false })`, `FakeModelAdapter` and `ModelError` from `src/models/`. `isConnectionFailure` is moved, not rewritten.
- The `chats/` file format and id scheme from `scripts/chat.ts`; `toView` and `STATUS_LABEL` wording from `scripts/show-conversation.ts`. The tester panel uses the same display words, copied into `logic.ts`, since `src/` cannot import `scripts/`.
- The verdict-key regex from 0004's session test, and the per-file exception style and synthetic "proves it fires" tests from `tests/boundary.test.ts`.

---

## Toolchain constraints

- `exactOptionalPropertyTypes` (use a conditional spread, never `field: undefined`), `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and ESM `.js` specifiers, in the web tsconfig too.
- `logic.ts` and `client.ts` must typecheck under both configs, so they import no DOM or React types.
- `tests/` has no socket (`inject` only) and no browser. It stays under a second wall time, with Fastify imported by exactly one test file. If the suite crosses one second, the first lever is `normalize.test.ts`'s per-index `expect` loop: collect the violations and assert once, which checks the same property. That is recorded in the change table. The budget is never quietly raised.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| The pinned toolchain versions disagree (Vite with the plugin and Vitest, React 19 types, Node 24) | Step 2 builds and typechecks a placeholder page before any real code depends on it. The resolved versions go in the change table |
| The web tsconfig drags in Node types, or the main one drags in DOM through a shared import | Shared files (`logic.ts`, `client.ts`, `src/transport/types.ts`) import only types and neither environment. Both typechecks run on every commit |
| The boundary test's new `fetch` rule is too loose (a variable argument) or too tight (a template literal) | The rule accepts only a string or template literal whose first character is `/`. Synthetic proofs cover a variable, an absolute URL and a relative template |
| A poll and a reply race, and the page shows a message twice or skips one | Messages carry a monotonic `seq`. Merging is keyed by `seq` and tested in `logic.test.ts`, including a reload |
| A turn hangs for the adapter's 20-minute timeout | The elapsed counter makes it visible. The README says to reload and check `/health`. The timeout is not changed (spec §5.3) |
| A terminal chat and the page write the same file at once | One person, one machine. Documented, not engineered around |
| oMLX is down when Gate 1 is due | The gate starts with `--fake`. The real-model part waits for `/health` to report healthy; the code is not suspected first |
| Fastify import pushes `npm test` over a second | One Fastify test file; the lever named under toolchain constraints |

---

## Proof

- `npm test`, `npm run typecheck` (both configs) and `npm run lint` clean at every commit. `npm test` stays under a second, with the measured number in the PR.
- **Transparency:** one scripted conversation gives identical state and result directly, through `MemoryTransport`, and through HTTP. So 0004's numbers describe the agent the page runs. `git diff main -- src/screening` is one renumbered comment, and `PROMPT_VERSION` is `c5778afe9cbd`, as in 0004's committed results.
- Boundaries, each with a proof that it fires: listening only on loopback in one file; browser `fetch` only relative, in two files; `fastify` imported only by `start.ts`; the transport rules in spec §9.2; the criterion seam; no `src/` import of `evals/`.
- No verdict-shaped key in any API response; no message text in logs; a foreign `Host` or `Origin` is refused.
- Gate 1: the owner uses the page against the real model, with seconds per reply recorded.
- Stage B's "try" lines done by hand before the PR: reload, restart mid-reply, oMLX stopped mid-turn, a terminal chat continued in the browser.
