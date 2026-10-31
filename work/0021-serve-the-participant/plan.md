# plan: 0021 serve the participant

**Author:** the repository owner
**Status:** In progress
**Date:** 2026-10
**Spec:** [spec.md](spec.md)

## Context

Spec 0021 gives the read call a `request` field and code that acts on it. An explanation keeps the criterion open, records nothing from that reply for it, and re-asks it in a respond-then-ask turn. A study question is answered from fixed facts. A stop request gets fixed text. Everything else in the agent stays.

**Written without plan mode.** The owner approved the recommendations and asked for the work to go ahead while they were away (2026-10). CLAUDE.md asks for plan mode, so this plan was written directly from a reading of the code and is committed before any code, as the process requires.

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What's decided |
| --- | --- | --- | --- |
| **1. The agent and the page** | 1–4 | none | All deterministic, pinned by tests and `test:e2e`. Nothing downstream is spent until stage 2 |
| **2. Dev re-run** | 5 | **Gate 2** | Did answering get worse, and are there false requests? (spec §6) |
| **3. Write-up** | 6–7 | **Gate 1** | Does the agent serve the person? (spec §7). The owner's, before the PR |

**Gate order differs from spec §10, deliberately.** The spec put Gate 1 before the dev re-run, to guard the run. The owner is away, and the run is about 80 minutes of local model time that would otherwise sit idle. So it runs first, and Gate 1 comes before the PR. If Gate 1 changes a prompt, the dev run is repeated and both are committed. The cost of being wrong is 80 minutes of local model time, not money.

**Gate 2** decides whether the README's screening numbers still describe this agent, or whether the scored run is needed. It's delegable. Claude records a recommendation here, and the owner can overrule it.

**Gate 1** is the owner's alone. Its value is a reader who didn't write the prompts. The PR isn't opened until it's answered.

### Steps

1. **Types and the read call's request.** `RequestKind`, `ParticipantRequest`, `Turn.request` and `Turn.responds`, `Progress.responses` and `Finding.responses` (optional), `IgnoredReading.why` gaining `"asked-to-explain"`, and `rejectedRequests` (optional) in `types.ts`. `readRead` returns `{ readings, request }` and is lenient about the request (spec §3.1). `read()`'s callers are updated. Tests: spec §4 items 8 and 9.
2. **Requests module, session flow, prompts and fixed text.**
   - `src/screening/requests.ts` holds `MAX_RESPONSES` and the planning of what a request does: which readings to set aside, and whether to respond.
   - `session.ts`: `receive` locates the request, sets aside P's readings for explain and why, records the request on the reply turn, and either responds or advances.
   - `#advance` takes an optional request for the next ask.
   - `stop` builds `STOP_TEMPLATE` plus P's last question, with no model call.
   - `prompts.ts`: the ask prompt's REQUEST block and `STUDY FACTS`, the system prompts' changes, `PROMPT_LAYOUT` 6.
   - `templates.ts`: `STOP_TEMPLATE` and `studyFacts()`.
   - `finalize` carries `responses`.
   - Tests: spec §4 items 1 to 7, 10 and 11.
3. **The page and the review.**
   - `questionCount` in `ParticipantPane.tsx` and the count in `ConversationView.tsx` skip `responds` turns.
   - `src/web/review.ts` gains a typed record of request labels, and the transcript entry gains `request`.
   - The review's transcript view shows the label.
   - If the tester panel lists ignored readings, it gets words for the new reason.
   - Test: spec §4 item 12. `tests/web/review.test.ts` unchanged.
4. **Fake mode and the browser test.**
   - `scripted-agent.ts` reads `[explain] …` as a request and answers a REQUEST prompt.
   - Its test covers both.
   - 0005's identical-state test gets an `[explain]` reply, if it's scripted through the fake agent.
   - `e2e/conversation.spec.ts` case 8.
   - `npm run test:e2e` runs green.
5. **Dev re-run.** `npm run eval:screening -- --dev`, local model, about 80 minutes, in the background. Commit the run under `evals/results/screening/dev/`. `npm run screening:compare` against 0009's final dev run, `evals/results/screening/dev/11-2c46ada9a1d5.json`, which has the current prompt version, `2c46ada9a1d5`, the same as the scored run `02-2c46ada9a1d5.json`. Count the located requests in the run. Record the result and the recommendation under "Gate record".
6. **Product intent and docs.**
   - The product intent's line on the participant (spec §8).
   - `docs/screening-agent.md` and `docs/coordinator-review.md`.
   - One sentence in the README.
   - The roadmap row.
   - CLAUDE.md's `--fake` and `test:e2e` lines.
7. **Review passes** from `REVIEW.md`. Fixes are committed, and the record goes below.

Every step is one commit through `npm run check && git commit`. **Steps 1 and 2 landed as one commit:** the read call's new return shape and its only caller, the session, change together, so step 1 alone wouldn't pass typecheck. Steps 3 and 4 also run `npm run test:e2e`.

## Files that change (against `main`)

- **The agent:** `src/screening/types.ts`, `calls.ts`, `prompts.ts`, `session.ts`, `templates.ts`, `apply.ts` (`finalize` only), the new `requests.ts`, and `index.ts` if it re-exports.
- **The page:** `src/web/review.ts`, `ParticipantPane.tsx`, `ConversationView.tsx`, and the review's transcript component.
- **Fake mode:** `scripts/app/scripted-agent.ts`.
- **Tests:** `tests/screening/*.test.ts`, `tests/scripts/scripted-agent.test.ts`, `tests/web/*`, and the transport test if needed.
- **Browser test:** `e2e/conversation.spec.ts`.
- **Results:** `evals/results/screening/dev/` (the run).
- **Docs and process:** `work/0000-product/intent.md`, `docs/screening-agent.md`, `docs/coordinator-review.md`, `README.md`, `work/ROADMAP.md` and `CLAUDE.md`.

## Risks

- **False `explain` on "not sure".** It costs a repeated question and drops an `unknown` reading for one turn. Watched by the dev run's request count (Gate 2).
- **The local model ignores `request`,** so the field is always null. Then the slice's code is correct, but the agent never helps. Only Gate 1 sees it, because no vignette asks.
- **Explanations drift into the person's case or into advice.** The prompt forbids it, and `VERDICT_PATTERN` catches eligibility words only. Gate 1 reads it.
- **Saved chats from before the slice:** fields are optional, and a restore test pins it.

## Verification

- `npm run check` on every commit.
- `npm run test:e2e` on steps 3 and 4, with the passing count recorded.
- The dev run's compare and request count, under Gate 2.
- The owner's play, under Gate 1.

## Gate record

*Filled in as the gates are reached.*

## Review passes

*Filled in at step 7.*
