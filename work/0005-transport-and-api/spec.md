# spec: 0005 transport and API

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0005-transport-and-api/intent.md`

---

## 1. Summary

A browser page on `127.0.0.1` where a person plays the participant against the real screening agent, with a tester panel beside it showing what the agent has recorded. The page talks to a local Fastify API. The agent is reached through a `MessageTransport`, and `ScreeningSession` is used unchanged. There is a fake mode with a scripted agent, and one command that builds and runs everything. The agent, prompts, parser, graders and every committed result stay as they are, so 0004's numbers still describe the agent this page runs.

## 2. Decisions taken before this spec

| # | Decision | Consequence here |
| --- | --- | --- |
| D1 | Plain language is its own slice, 0006, after this one and before the coordinator pane | Criteria are shown in protocol wording, and only through one component (§7.3). The roadmap is renumbered in this PR (§13) |
| D2 | Something to try at the end of the first stage | The design below is built thinnest-first. The plan's first stage delivers the whole path from browser to model, and a gate follows it (§11) |
| D3 | The application receives its criteria from outside `src/` | A launcher under `scripts/` loads labels or cached parses through `evals/screening-input.ts` and passes them to the server (§8). `src/` still imports nothing from `evals/` |

The intent's seven open questions are answered here:

| Intent question | Answer | Section |
| --- | --- | --- |
| 1. Transport shape; how the browser learns a reply is ready | One transport routes many conversations. Messages are accepted at once and processed in the background. The page polls once a second | §4, §5 |
| 2. Length cap; a second message during a turn | Participant messages are capped at 1,600 characters. A message sent while the agent is working is refused, and the draft is kept | §4.3 |
| 3. Shape of the network exception | Two new exceptions, each in named files: the server may listen, on loopback only; browser code may `fetch()` relative paths only | §9.1 |
| 4. Testing the UI within budget | API through Fastify `inject`, page logic as pure functions, no DOM tests and no DOM dependency. Collection time is measured first | §10 |
| 5. Model down versus code broken | `isConnectionFailure` moves from `evals/` to `src/models/`. The server reports it as "model unavailable". The adapter is not widened | §5.3 |
| 6. Where conversations are saved | `chats/`, in the format `screening:chat` already writes, plus one field | §5.4 |
| 7. What the tester panel shows at the end | The same per-criterion list as during the conversation, in document order, with no totals | §7.2 |

## 3. How a message travels

```
browser                                   server (127.0.0.1)
────────────────────────────────          ────────────────────────────────────────────
ParticipantPane ─ transport/web/client ──▶ transport/web/routes ─▶ WebTransport
   (polls every 1 s while working)                                   │  inbound
                                                                     ▼
                                          ConversationService ── ScreeningSession ── ModelAdapter
                                             │   ▲                  (unchanged)       (Omlx or fake)
                                             ▼   │ outbound
                                          ConversationStore (chats/*.json, written every turn)
TesterPanel ───── web/api ────────────────▶ server/routes (inspection: studies, criteria, progress)
```

Two paths reach the server, and they are kept apart on purpose. The **participant pane** reaches the conversation only through the transport, so it sees what a participant would see: messages and whether they were delivered. The **tester panel** reads the conversation's state directly through an inspection route that no participant channel would ever have. If both went through one endpoint, the transport boundary would exist only on paper.

## 4. `MessageTransport`

### 4.1 The interface

In `src/transport/types.ts`:

```ts
/** A participant message, as the transport received it. */
interface InboundMessage {
  conversationId: string;
  text: string;
}

/** Where a conversation stands, from the participant's side. */
type ChannelStatus =
  | "idle"           // waiting for the participant
  | "working"        // a message was accepted; the agent is on it
  | "unavailable"    // the last message was not processed: the model could not be reached
  | "failed"         // the last message was not processed: anything else
  | "done";          // the closing message has been sent

interface MessageTransport {
  /** Registers the one handler for inbound messages. The transport calls it at most once at a time per conversation. */
  onMessage(handler: (message: InboundMessage) => void): void;
  /** Delivers an agent message to the participant. */
  deliver(conversationId: string, text: string): void;
  /** Tells the participant's side what the agent is doing. */
  setStatus(conversationId: string, status: ChannelStatus, detail?: string): void;
}
```

The conversation service (§5) holds a `MessageTransport` and nothing more specific. It never learns whether messages come from a browser, a test or anything else.

### 4.2 Implementations

- **`MemoryTransport`** (`src/transport/memory.ts`): `send(conversationId, text)` pushes an inbound message, and `delivered` and `statuses` record what came back. It is used in tests, and it proves the service works without HTTP.
- **`WebTransport`** (`src/transport/web/`): an outbox per conversation plus Fastify routes (§6.2) registered as a plugin. `client.ts` in the same folder is the browser half: `send(text)`, and `poll(after)` returning new messages and the status. The page imports only that client for messaging.

### 4.3 Short-message rules

These are enforced by the transport. The service and the session never see a message that breaks them.

| Rule | Behaviour | Why |
| --- | --- | --- |
| Free text, trimmed | Empty or whitespace-only is refused (400) | Nothing to read |
| At most 1,600 characters | Longer is refused (400), and the page shows a counter | Ten SMS segments. It also bounds the read prompt and model time. The agent's own messages are not capped: 0004 already counts turns over 320 characters as a discipline metric, and truncating them would change the agent |
| One message per turn | A message sent while the status is `working` is refused (409). The page disables sending and keeps the draft | See below |
| Nothing after `done` | Refused (409) | The session would throw anyway |
| Retry | After `unavailable` or `failed`, the participant can resend the unprocessed message as it was, or edit it first | The session is atomic, so the same message can be received again |

**Why a second message is refused rather than queued or merged.** Evidence in this project is tied to a turn: a finding cites a participant message, which answered a particular question. Suppose a message written *before* the agent's next question were queued. It would be read as the answer to that question, which the person never saw, and that corrupts exactly what 0004's evidence check protects. Merging the late message into the current turn would mean throwing away a turn already in progress and re-running it, about 18 more seconds, to handle an edge case. A real SMS channel cannot refuse a message, so this is a known departure from short-message behaviour. The README says so, and says that merge-and-rerun is the design a real channel would need.

## 5. The conversation service

`src/server/conversations.ts`. It owns the running conversations, and it is the only code that calls `ScreeningSession`.

### 5.1 A turn

```
transport.onMessage(m)
  status = working              ← transport.setStatus
  store.savePending(m.text)     ← a restart mid-turn loses nothing (§5.4)
  reply = session.receive(m.text)          (≈ 18 s on the local model)
  store.save(state, result?)    ← pending cleared
  transport.deliver(reply.text)
  status = reply.kind === "done" ? done : idle
```

Starting a conversation takes the same path, with `session.start()` in place of `receive`. The opening and first question need a model call too, so the page shows the working state from the very first message.

The service runs a turn in the background and returns at once. It never runs two turns of one conversation at the same time. The transport's 409 already prevents that, and the service asserts it too, because a second concurrent `receive()` on one session would silently fork its state.

### 5.2 Several conversations

The service holds each conversation in memory once it is used, keyed by id. It loads a saved one from the store on first use. Several conversations can be open at once, but only one person is expected. Model calls from two tabs simply queue at oMLX. The service needs no concurrency beyond the one-turn-per-conversation rule.

### 5.3 Failures

| Error | Status | Detail shown |
| --- | --- | --- |
| `isConnectionFailure(error)` | `unavailable` | "The model isn't responding. Check that oMLX is running (http://127.0.0.1:8000/health), then send again." |
| Any other `ModelError` or `ScreeningError` | `failed` | The error's first problem line |
| Anything else | `failed` | "Something went wrong on the server." The full error goes to the server log |

`isConnectionFailure` moves unchanged from `evals/screening-runner.ts` to `src/models/errors.ts` and is exported from the models barrel. The runner imports it from there. This is the whole of this slice's change to `src/models/`: it moves the knowledge of what a connection failure looks like into the one module that produces it. The adapter's surface is not widened, and nothing here calls `/health`. The page tells the person to check it, which is what `screening:chat` already does.

`OmlxAdapter`'s request timeout is 20 minutes. A model that hangs, rather than refusing the connection, leaves the page in `working` for that long. The page shows how many seconds have passed while it waits (§7.1), so a hang is visible. The timeout itself is not changed here: it belongs to the adapter, and 0003 raised it for a reason.

### 5.4 Saving

`ConversationStore` (`src/server/store.ts`) writes one file per conversation to `chats/`, the gitignored directory `screening:chat` already uses. The format is the one `chat.ts` writes, with one field added:

```jsonc
{
  "vignetteId": "web NCT04316364",   // "chat …" from the terminal, "web …" from the page
  "source": "labels",                // or "parse"
  "state": { /* ScreeningState */ },
  "result": { /* ScreeningResult, once done */ },
  "pending": { "text": "…", "status": "working" }   // new; absent when no message is unprocessed
}
```

- **The id is the filename stem**, `<nctId>-<timestamp>`, the same as `chat.ts` makes. An id that is not a plain filename stem (`/^NCT\d{8}-\d{8}T\d{6}$/`) is refused before it touches the filesystem. Two conversations started in the same second would share a stem, so the store waits for the next second rather than overwrite. That is simpler than widening the id format that terminal chats already use.
- **It is written after every change**: when a message is accepted, and when a turn completes or fails. When the server starts, a file whose `pending.status` is `working` is loaded as `failed` with "The server restarted before this message was processed", so the participant can send it again.
- **`screening:show --html` renders a browser conversation with no new code.** `toView` ignores `pending`. `vignetteId` gives the title.
- **Terminal chats show up in the page's list and can be continued there**, because the format is shared. A terminal chat whose model differs from the running one is still opened. The run metadata comes from the adapter that finishes it.
- Writes use write-to-temporary-then-rename, so a crash mid-write cannot leave a half-written file.

## 6. The API

Fastify, in `src/server/`. JSON only. All routes are under `/api`. Everything else serves the built page (§8.2).

### 6.1 Inspection routes (tester panel and start page)

| Route | Returns |
| --- | --- |
| `GET /api/info` | `{ mode: "local-model" \| "scripted", model: ModelDescriptor, source: "labels" \| "parse" }`, shown in the page's header |
| `GET /api/studies` | `[{ nctId, briefTitle, criteria: number }]` for the studies the launcher passed in |
| `GET /api/conversations` | Saved conversations: `[{ id, nctId, source, turns, done, updatedAt }]`, newest first |
| `POST /api/conversations` `{ nctId }` | `201 { id }`, and the opening turn starts in the background |
| `GET /api/conversations/:id` | `{ id, study, source, criteria: ScreeningCriterion[], progress: Progress[], done, calls }` |

### 6.2 Transport routes (participant pane)

Registered by `WebTransport`, and only by it:

| Route | Does |
| --- | --- |
| `POST /api/conversations/:id/messages` `{ text }` | `202 { seq }`, or 400 / 409 under §4.3 |
| `GET /api/conversations/:id/messages?after=<seq>` | `{ messages: [{ seq, from: "agent" \| "participant", text }], status, detail? }`. `after` lets a poll return only what is new. A reload asks with `after=-1` and gets everything |
| `POST /api/conversations/:id/retry` `{ text? }` | Resends the unprocessed message, or the edited text if given. 409 unless the status is `unavailable` or `failed` |

Messages are derived from the saved transcript, plus the pending message if there is one. The opening and first question arrive as the single message `start()` returns, as they do in the terminal.

### 6.3 Rules every route follows

- **No verdict anywhere.** No response has a field or value that combines findings. A test walks every route's response from a finished conversation and fails on any key matching `/eligib|verdict|disposition|qualif/i`, the same pattern 0004 applies to the result.
- **Only requests to this server.** A request whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>` is refused (421). That blocks DNS rebinding, a web page elsewhere in the same browser reaching the API through a name that resolves to loopback. It costs one hook. A mutating request whose `Origin` header is present and is not the server's own is also refused.
- **Logs carry no message text.** Fastify logs method, route and status, never bodies. A test sends a message containing a marker string and asserts it does not appear in the captured log output.

## 7. The page

React, in `src/web/`, built by Vite. Three views, chosen from the URL hash (`#/`, `#/c/<id>`), so no router is needed.

### 7.1 Start page and participant pane

- **Header on every view:** the mode and model from `/api/info`. Fake mode shows a banner: "Scripted agent: not the real model."
- **Start page:** the studies with a Start button, and saved conversations with Continue or View.
- **Participant pane:** the conversation as message bubbles. Under the input box, always visible: *"Use made-up answers only. This is a test system."* The participant's own message shows *sent*, and then either the agent's reply follows or the message is marked *not processed* with the detail and a **Send again** button. While the status is `working`, a waiting indicator shows seconds elapsed ("Thinking… 12 s"), and sending is disabled with the draft kept. When the conversation is `done`, the input is replaced by a note that the conversation is finished, with the command that renders it (`npm run screening:show -- chats/<id>.json --html`).

### 7.2 Tester panel

Beside the conversation, headed *"Tester view: what the agent has recorded. A participant would not see this, and it is not the coordinator's review."*

- One row per criterion, in document order, the same order the agent works in. Each row has the id, polarity, type, the criterion text (§7.3), the status in 0004's display words (`holds`, `does not hold`, `unresolved`, `needs chart review`, `not raised`, plus `open` while it is unasked), the reason, `reported` where present, times asked, and each evidence quote with its turn number.
- The row for the question currently awaiting a reply is highlighted, and a row whose status changed on the last turn is marked. That is how a tester sees an out-of-order answer settle a criterion that was never asked.
- **At the end it stays the same list.** There are no totals, no grouping by outcome and no summary line. Counts of "holds" and "does not hold" invite reading the list as a score, and polarity is not applied here (0004 §5). The coordinator's grouped view is 0007's.
- It refreshes from `GET /api/conversations/:id` whenever the participant pane sees a new message or a status change, not on a timer of its own.

### 7.3 The criterion seam

Every criterion text on the page, in the tester panel and anywhere else, is rendered by one component, `CriterionText`, given a `ScreeningCriterion`. In this slice it renders `text`. Slice 0006 adds the plain-language line inside it. A test fails if any other component renders `criterion.text` itself.

### 7.4 Page logic

The page's decisions live in plain functions in `src/web/logic.ts`, tested in Node with no DOM. Those decisions are what to show for a status, when sending is allowed, how a poll result merges into what is on screen, and which rows changed. Components only lay out what those functions return. This is what lets §10 test the page without a browser.

## 8. Running it

### 8.1 The command

```
npm run app                       labels, local model, http://127.0.0.1:5005
npm run app -- --source parse     the cached parses instead
npm run app -- --fake             scripted agent, no oMLX needed
npm run app -- --port 5010
```

`npm run app` runs `vite build`, then `scripts/app.ts`. The launcher:

1. Loads the five labelled studies with `fromLabels` (default), or the cached parses with `fromParse` and 0003's `cacheKey()`. A study without a cached parse is left out, with a line saying so.
2. Builds the adapter: `new OmlxAdapter({ thinking: false })`, as in 0004. With `--fake`, the scripted adapter (§8.3). Without `OMLX_API_KEY`, it says so and suggests `--fake`.
3. Calls `startServer({ studies, source, adapter, chatsDir, port })` from `src/server/`, and prints the URL.

The host is not an option. `startServer` binds to the constant `127.0.0.1`.

### 8.2 Serving the page

`vite build` writes to `dist/web/`, which is gitignored under `dist/`. When the server starts, it reads that directory's file list once and serves exactly those files, with `index.html` for any other non-`/api` path. It never builds a filesystem path from a request, so no path can escape the directory. This is about twenty lines, and it replaces `@fastify/static`. No dev server or hot reload: rebuilding takes seconds, and one process on one port is simpler to run and to explain.

### 8.3 Fake mode

`FakeModelAdapter` gains an optional responder, passed in its existing options argument, `new FakeModelAdapter([], { respond: (request) => ScriptedResponse })`, and used when the script array is empty. Existing uses do not change.

The scripted agent in `scripts/app/scripted-agent.ts` is one such responder:

- **ask:** returns `{ "message": "(scripted) Is this true for you: <criterion text>? Answer yes, no, or not sure." }`, quoting the ask prompt's `CRITERION (…):` line. The ask prompt carries no criterion id, so the question quotes the text instead.
- **read:** takes the id from the prompt's `THE QUESTION WAS ABOUT:` line. It returns `holds` when the message starts with "yes", `does-not-hold` when it starts with "no", `unknown` for "not sure" or "don't know", and `unclear` otherwise. The quote is the first word, as typed, so it always locates.

It lives under `scripts/` because it reads the screening prompts' format, which neither `src/models/` nor the application should know. A test drives a full session with it and asserts the conversation terminates and every raisable criterion is reached. If the prompt format changes, that test breaks. Fake mode is for trying the page and for UI work when oMLX is down. It measures nothing, and the banner says so.

## 9. Boundaries, asserted by tests

### 9.1 Network: two new exceptions, each narrow

`tests/boundary.test.ts` today admits one exception: `fetch()` to loopback from `src/models/`. This slice adds two, in the same per-file style, each with a test showing it would fail if broken:

| Exception | Allowed in | Only this | Test that it fires |
| --- | --- | --- | --- |
| Listening | `src/server/start.ts` alone | Importing `fastify` and calling `listen`, with `host` the constant `LOOPBACK_HOST = "127.0.0.1"` | A synthetic `listen({ host: "0.0.0.0" })` and a synthetic import of `fastify` from `src/screening/` both fail |
| Browser requests | `src/transport/web/client.ts` and `src/web/api.ts` | `fetch()` whose first argument is a string or template literal beginning with `/` | A synthetic `fetch("http://…")`, `fetch(url)` with a variable, and a `fetch` in `src/web/App.tsx` each fail |

Route registration (`src/server/app.ts`, `src/transport/web/routes.ts`) receives a Fastify instance and does not open a socket, so it needs no exception. `fastify` is added to the network patterns, so importing it anywhere else fails.

The walker learns two things: `.tsx` files (a `.js` specifier resolves to `.ts`, then `.tsx`, as Vite resolves it), and the `src/web/` entry `main.tsx`. Otherwise the whole page would sit outside the check. The "walks a real graph" test gains assertions that `src/server/start.ts`, `src/transport/web/client.ts` and `src/web/main.tsx` are all reached.

### 9.2 Transport

- `src/screening/` imports nothing from `src/transport/` or `src/server/`. It does not know a transport exists.
- `src/server/conversations.ts` imports only types from `src/transport/`: it holds a `MessageTransport`, never a concrete one.
- Only `src/server/app.ts`, the composition root, constructs `WebTransport`.
- Only `src/transport/web/routes.ts` registers the message routes. A test lists the app's routes through Fastify's `printRoutes` and checks where the message routes came from.

### 9.3 Unchanged, and still asserted

`src/` imports nothing from `evals/` (D3 depends on it). Nothing outside `src/models/` uses `OmlxAdapter` as a value: the launcher in `scripts/` constructs it, and `src/server/` receives a `ModelAdapter`.

## 10. Testing

`tests/` stays deterministic, with no socket and no browser. Every model is a `FakeModelAdapter`.

**Budget.** `npm test` took 1.00 s at the start of this slice and 0.95 s on a later run. Collection is not the critical path: `tests/criteria/normalize.test.ts` alone takes about 540 ms, because its corpus round-trip calls `expect` once per character index, and the other files run in parallel beside it. New tests stay off that path, and every Fastify-importing test goes in one file, so Fastify's import cost is paid once. If the suite still cannot stay under a second, the plan says what it costs, and the PR says so. The budget is not quietly raised.

| Area | Tested with |
| --- | --- |
| **Transparency** | One scripted conversation driven three ways gives identical `ScreeningState` and `ScreeningResult` (apart from timestamps): `ScreeningSession` directly, the service over `MemoryTransport`, and the full app through `inject`. This is the test that says the page runs 0004's agent |
| Short-message rules | Empty, 1,601 characters, a message while `working`, a message after `done`, retry only after a failure, and an edited retry |
| Failures | A scripted connection failure gives `unavailable` and a scripted malformed response gives `failed`. Either way the state is unchanged, and a retry then succeeds and matches an uninterrupted run |
| Saving | Written on accept and on completion. A restart with a `working` pending message comes back `failed`. A terminal-chat file loads. `toView` renders a saved web conversation. A bad id is refused before touching the filesystem |
| One turn at a time | A second message while a turn is in flight is refused by the transport, and the service's own guard throws if called directly |
| API | Every route's happy path and its 400, 404, 409 and 421 cases. No verdict-shaped key in any response. No message text in the logs |
| Serving | A built file is served, an unknown path gets `index.html`, and `/api/unknown` gets 404, not the page |
| Page logic | `logic.ts`: send allowed per status, poll merge (duplicates, reload with `after=-1`), changed-row detection, the working indicator's text |
| Criterion seam | No component other than `CriterionText` reads `criterion.text` |
| Scripted agent | A full session terminates and reaches every raisable criterion |
| Boundaries | §9, including a test proving each new exception fires |

What the real model says in the page is not tested here. It is the same agent that 0004 measured.

## 11. What the plan must gate

1. **After the first stage: the interaction, tried by hand.** At that point the thin path works: the page, the transport, the API and the real agent on the local model, plus fake mode. You play a few turns of one study in the browser. The questions are whether an 18-second reply is tolerable with the waiting indicator, whether refusing a second message feels wrong in practice, whether the tester panel makes clear what the agent recorded, and whether the layout leaves room for a coordinator pane beside it. It guards the rest of the slice: saving, failures, retry and most of the tests are built around this interaction's shape, and changing the shape afterwards means redoing them. It is also where the toolchain (React, Vite, Fastify, the two tsconfigs, one port) is accepted or not before the next three slices inherit it. None of the questions is clinical.

No other gate is needed. The remaining stages end in things you can try (reload mid-conversation, stop oMLX mid-turn), and the plan should say how to try each one. But nothing after the first stage spends a resource or sets something a later slice builds on that Gate 1 has not already settled. The plan may argue otherwise.

## 12. Out of scope

- Plain language (0006).
- No change to `src/screening/`, `src/criteria/`, `src/trials/`, the prompts, the simulator, the graders, the label sets, the vignettes or any committed result. The PR diff shows no change under `src/screening/`, and review pass 1 checks that. It is not made a permanent test, because the next agent slice is meant to change it.
- `src/models/` changes by exactly two things: `isConnectionFailure` moves in, and `FakeModelAdapter` gains the optional responder.
- No coordinator review pane, no polarity applied, no grouped handoff (0007).
- No DOM testing library, no component library, no router, no state library, no CSS framework, no `@fastify/static`, and no WebSocket or server-sent events.
- No authentication, HTTPS, multiple users or deployment.
- No simulated participant in the browser.

## 13. Documentation and renumbering

**New dependencies**, each justified in the plan: `fastify`, `react` and `react-dom` at runtime; `vite`, `@vitejs/plugin-react`, `@types/react` and `@types/react-dom` for development. Versions are pinned exactly, as the existing dev dependencies are.

**TypeScript.** The page needs the DOM library and JSX, and the rest of the codebase must not get them. `tsconfig.json` excludes `src/web/`. A new `tsconfig.web.json` covers `src/web/` and the browser client `src/transport/web/client.ts`. `npm run typecheck` runs both.

**README:** a "Try it" section with `npm run app`, `--fake`, and `--source parse`. It covers what the tester panel is and is not, the made-up-answers rule, the ~18-second reply and why, and the refused-second-message departure from SMS (§4.3).

**CLAUDE.md:** `npm run app` joins the command table. The line "There is no command to run the application" is replaced. The layout block gains `src/server/` and `src/transport/` as built.

**ROADMAP:** 0005 is marked done. The slices are renumbered: **0006 plain language**, **0007 coordinator review pane**, **0008 model comparison**. Product open question 1 moves to 0007. A note records the renumbering, and says the documents for 0001 to 0004 keep the numbers they were written with. The agent's overconfidence fixes get a row as an unnumbered, unplaced slice, so they are not lost. "Carried forward from 0005" records what this slice found.

**Renumbered references**, updated in this PR: every comment and document outside `work/0001`–`work/0004` that names 0006 or 0007 by number (about fifteen, in `src/`, `tests/`, `scripts/show-conversation.ts`, `README.md`, `CLAUDE.md` and `evals/cases/VIGNETTES.md`). Committed files under `evals/results/` are not edited.
