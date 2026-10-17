# intent: 0005 transport and API

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. A `MessageTransport` that the screening agent talks through, a local Fastify API, and a browser page where a person plays the participant against the real agent and watches what it records. No agent, prompt, parser or grader changes. Plain language moves to its own slice (decision 1).

---

## Problem

After four slices the agent can hold a prescreening conversation, but only in a terminal (`npm run screening:chat`) or as a file rendered afterwards (`screening:show --html`). The product intent's messaging surface is a local web application that models short messages, and the coordinator pane on the roadmap needs a server to exist. Neither exists yet.

The agent was built for this step. `ScreeningSession` is push-driven (`start()`, `receive(text)`), knows nothing about where messages come from, keeps its state as plain JSON, and makes every turn atomic: a failed model call leaves the conversation exactly where it was. What is missing is everything between the agent and a person: delivery, surviving a page reload or a server restart, what happens when the model goes down mid-turn, and what the person sees while they wait.

Four things make that harder than putting a text box in front of `receive()`.

**The agent is slow.** In 0004's dev run, a model call took about 9 seconds, and each reply costs two of them: one to read the answer and one to phrase the next question. That makes about 18 seconds from sending a message to seeing the next question, and roughly six and a half minutes of model time for a 21-question conversation. In a terminal that is tolerable. In a chat window, 18 seconds of nothing looks broken. The page has to make the wait visible. The transport also has to decide what happens when the person sends a second message during it, because on a phone they will.

**The model goes down.** oMLX is local and it stops. Because the session is atomic, a failed turn loses nothing and the same message can be received again. The transport and the page have to turn that into something a person can act on, such as "the model isn't responding, try again", and not a spinner that never ends or a message that quietly disappears.

**Three of the repository's boundaries meet here for the first time.**

- *Network.* The rule is that nothing under `src/` makes a network call. `tests/boundary.test.ts` admits one exception: `fetch()` to a loopback host, and only from `src/models/`. A server listens on a socket, and a browser page reaches its API with `fetch()`. The test would fail both today. That needs a second exception, argued in the plan and asserted as narrowly as the first. Loosening the test is not an option.
- *Transport.* CLAUDE.md says nothing outside `src/transport/` knows how messages are delivered, and that this boundary gets its test in the slice that introduces it. That slice is this one.
- *Measurement.* No file under `src/` may import from `evals/`, and that is asserted. But the criteria the agent has run on well are the hand labels, and they live in `evals/cases/labels/`. The application cannot load them itself.

**This is the toolchain every later slice inherits.** React, Vite and Fastify are the project's first runtime dependencies; `package.json` has only dev dependencies today. How they are wired and served, and how a UI is tested without breaking the test budget, are decisions that the plain-language slice, the coordinator pane and the model comparison all live with. The budget is already at its limit: `npm test` took 1.00 s at the start of this slice, and 0004 said the next slice to add tests should look at collection time first.

## Proposed outcome

**A `MessageTransport`** in `src/transport/`: the interface, a web implementation, and an in-memory one for tests. It wraps `ScreeningSession` and does not change it. The short-message constraints the product intent names (brief payloads, free-text replies, out-of-order answers, resumable conversations) are modelled here, since this is the only layer that knows messages are being delivered at all.

**A local API** in `src/server/`: Fastify, bound to `127.0.0.1` and nothing else. It starts a conversation for a study, takes a participant message, returns the conversation, and resumes one. Each conversation is saved after every turn to a gitignored directory, so a reload, a restart or an oMLX outage loses nothing.

**A conversation page** in `src/web/`. On one side is the conversation as a participant would see it. Beside it is a **tester panel**: every criterion and what the agent has recorded for it so far, updated after each turn. This is `/findings` from `screening:chat`, made live. The panel is labelled as a tester's view, not something a participant would see and not the coordinator pane. Criteria are shown in the protocol's words, through one component. That component is the seam decision 1 leaves for plain language.

**A command that runs it.** CLAUDE.md currently says "there is no command to run the application." This slice replaces that line. The command starts the API and the page together and prints one local URL.

**A fake mode.** The same page runs against the fake adapter with a scripted agent, labelled on screen as scripted. It exists so the page can be tried in seconds without oMLX, so deterministic tests can drive the same path the real agent takes, and so the UI can still be worked on when the model is down. The real agent is the default.

**Proof that the transport adds nothing.** A conversation driven through the API with the fake adapter must produce the same transcript, state and result as the same conversation driven through `ScreeningSession` directly. This is the test that says 0004's committed numbers still describe the agent this page runs.

**Boundary tests.** A new one for the transport, and the network exception widened deliberately, with a test that fails if it grows further. The measurement boundary stays exactly as it is (decision 3).

**A short README section.** How to run it, what the tester panel shows, and the rule that answers are made up.

**Absent on purpose:**

- **Plain language.** It gets its own slice, 0006 (decision 1).
- **No agent, prompt, simulator, parser or grader changes.** `PROMPT_VERSION` stays what it was in 0004's committed results, and that can be checked. The overconfidence findings (6 missed self-corrections, 4 exclusions read backwards, and so on) belong to the agent, and fixing them needs a slice that re-runs the same vignettes afterwards. Doing it here would change the agent in the same slice that changes how it is reached.
- **No coordinator review pane.** The tester panel is a live view of progress, not the handoff. It does not summarise, apply polarity or group the result for a decision. That is the pane's job, in what becomes 0007.
- **No simulated participant in the browser.** Watching a vignette play itself out would be useful, but the simulator lives in `evals/`. Wiring it into the page is a different feature.
- **No authentication, multiple users, HTTPS or anything deployable.** One person, one machine, loopback only.
- **No new eval.** Nothing the model does changes, so there is nothing new to measure. Everything new in this slice is deterministic and belongs in `tests/`.

## Affected users and systems

**Me, trying it.** In this slice the page is built for one person: me, playing a participant with made-up answers, the same role I have in `screening:chat`. The questions this slice asks me are about the product and the engineering. Does it read like a conversation? Is the wait tolerable? Does the tester panel make it clear what the agent recorded, and why? Is the toolchain one the next three slices can live with? None of them need clinical judgment, and no gate should be written that does.

**The prospective participant.** Still simulated. Here that means a person typing invented answers. The page says so where the typing happens.

**The coordinator.** Not served yet. The page's layout has to leave room for the review pane beside or after the conversation without being rebuilt.

**`ScreeningSession` and `src/screening/`.** Used as they are. If the transport needs something the session does not expose, that is a finding. It gets written down and argued, and it is not a quiet edit.

**The model adapter, `src/models/`.** Used with `thinking: false`, as in 0004. The page has to tell "the model is down" apart from "the code is broken". That may need a health check through the adapter, which would widen its surface. The spec decides whether it does.

**`tests/boundary.test.ts`.** Changed on purpose, for the network exception and the new transport boundary.

**CLAUDE.md, README and the roadmap.** The command table gains the run command. The roadmap is renumbered (decision 1).

**Not touched:** `data/trials/`, `src/trials/`, `src/criteria/`, `src/screening/`, `evals/cases/`, and every committed result.

## Constraints

- **No final eligibility decision on any code path.** No API response and no part of the page combines findings into anything that reads as eligible or ineligible. The tester panel shows each criterion's finding in 0004's vocabulary, which describes the statement and not the person. A test checks this.
- **Loopback only.** The server binds to `127.0.0.1`, and a test fails if it can bind anywhere else. The browser code calls its own origin and nothing else.
- **No real contact path.** Nothing is sent anywhere. There is no email, SMS or notification of any kind. The "transport" is a browser tab on the same machine.
- **No PHI.** The page says, where the person types, that answers must be made up. Saved conversations go to a gitignored directory, as `chats/` does. Server logs do not record message text.
- **The same agent as 0004.** Same `ScreeningSession`, same criteria sources, same adapter settings, same `PROMPT_VERSION`. The transparency test above holds this in place.
- **Nothing outside `src/models/` calls a model, and nothing outside `src/transport/` knows how messages are delivered.** Both are asserted by tests.
- **No network under `src/`, except where the boundary test explicitly allows it.** The exceptions are named, narrow, and each has a test showing it would catch a violation.
- **Dependencies stay small.** Each new one is named in the plan with the reason it is needed. The expected set is Fastify, React, React DOM, Vite and Vite's React plugin, plus their types. No component library, state library, router or CSS framework.
- **`tests/` stays deterministic and fast.** No browser runs in `npm test`. The plan deals with collection time before it adds tests, as 0004 asked.
- **TypeScript strict, Node 24, Biome, Vitest**, as elsewhere.

## Decisions

1. **Plain language gets its own slice, 0006. It comes straight after this one and before the coordinator pane.**

   *Why not in 0005.* A plain-language rendering is a new model output, which means a new place for a model to be wrong. So far, every model output in this project has shipped with a check designed alongside it: the parser with 0003's harness, the agent with 0004's vignettes. The minimum check here, that the plain version does not change what the criterion requires, is design work of its own. Some of it can be mechanical. Every number, unit, comparison direction, time window, negation and named drug or biomarker in the original should still be in the rendering, and code can check that. What is left has to become a reading gate that asks whether something is *missing*, never whether it is *medically equivalent*, because nobody here can answer the second question. That is a slice's worth of work. Its gate is also a different kind of question from this slice's gates, which are about interaction and toolchain. Putting both in one PR weakens both, and a failure in either would hold up the other.

   *Why nothing is lost by waiting one slice.* Participants never see a criterion. They see the agent's questions, and the ask prompt already phrases those for a patient. In this slice, the criteria are only shown in the tester panel, to me. The place where plain language really matters is the coordinator pane, which is why 0006 comes before it: building the pane on protocol wording and then retrofitting it would waste work.

   *Why after 0005 and not first.* The rendering needs to be read where it will be used. In 0006, the gate becomes reading plain language beside protocol wording in the tester panel, which is how I will actually meet it. The alternative is a page generated by a script and thrown away a slice later. Plain language changes only what is displayed. The agent keeps asking from the protocol's words, so 0004's numbers stay valid. Whether the agent should ask from the plain version is 0006's question, and it would come with a re-run.

   *The cost.* For one more slice, the tester panel shows protocol wording. This slice limits that cost by sending every display of a criterion through one component, so 0006 can add a line to it and does not have to restructure the page.

   *Renumbering.* The coordinator pane becomes 0007 and the model comparison becomes 0008. About fifteen comments in `src/`, `tests/`, CLAUDE.md, README and `evals/cases/VIGNETTES.md` name those slices by number. They are updated in this slice's PR, along with the roadmap. The documents for 0001 to 0004 keep the numbers they were written with, because they are records, and the roadmap notes the change. Committed results are not edited.

2. **There is something to try at the end of the first stage, not only at the end of the slice.**

   The build order starts with the thinnest path that works end to end: one page, one study, the real agent on the local model, through the real transport and the real API. Text goes in and text comes out, without persistence or careful error handling yet. Fake mode ships in the same stage, so trying it does not depend on oMLX being up. At the end of that first stage I can open a browser and talk to the agent.

   The gate after that stage asks questions that only trying it can answer. Is an 18-second reply tolerable with a visible waiting state? Or does the interaction need to change before persistence, error handling and tests are built around its current shape? One example of a change is acknowledging a message the moment it arrives. The later stages spend their effort on whatever shape passes this gate, which is why this gate comes first.

   Each later stage also ends with something to look at: reload the page mid-conversation and carry on; stop oMLX mid-turn and watch what the page says; watch the tester panel fill in. The plan should give every stage a line saying what to open and what to do.

3. **The application receives its criteria from outside `src/`.** `src/` may not import from `evals/`, and the hand labels live there. So the command that runs the app, a script under `scripts/`, loads labels by default, or cached parses on request, through the existing `evals/screening-input.ts`, and passes them to the server. The server only knows that it has been given studies and their criteria. This leaves the measurement boundary exactly where 0004 put it, and makes "labels or parses" a launch option. That is the same pair 0004's results compare. The cost is that the app can screen only the five labelled studies, plus any study with a cached parse. For a proof of concept that is enough, and the page says which source it is using.

## Open questions for the spec

1. **The shape of `MessageTransport`.** Does one transport wrap one session, or route messages to many? How does the browser learn that a reply is ready, given that replies take 18 seconds or more? The options are a request held open, polling, or server-sent events. A WebSocket is already one of the boundary test's network patterns.
2. **Short-message behaviour.** Is there a length cap on either side? What happens to a second participant message sent while the agent is still working: is it queued, merged with the first, or refused?
3. **The exact shape of the network exception.** Where the test draws the line between a server listening on loopback and a page calling its own origin, and how each is shown to fail when violated.
4. **Testing the UI within the budget.** The API can be tested through Fastify's `inject` with no socket. The question is whether any DOM-level test is worth its dependency, or whether the page stays thin enough that the API tests cover what matters.
5. **Telling "model down" apart from "code broken".** Is that a health check added to the adapter, or the server mapping a `ModelError` to "model unavailable" with the `/health` hint?
6. **Where conversations are saved, and in what shape.** Reusing `chats/` and its format would let `screening:show --html` render a browser conversation with no new code.
7. **What the tester panel shows when a conversation ends.** It should give the same grouping `/findings` gives, and stop short of becoming the review pane.
