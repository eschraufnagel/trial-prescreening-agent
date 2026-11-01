# plan: 0021 serve the participant

**Author:** the repository owner
**Status:** Done. Both gates passed; ready for the PR
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
   - 0005's identical-state test is shared by three files through `tests/fixtures/conversation.ts`, and the store tests depend on its two replies. So instead of changing that script, `tests/server/conversations.test.ts` gains its own: a session and the service over `MemoryTransport` run a scripted explanation request and must reach identical state. HTTP carries only text, and the request logic is all in the session, so the memory path is enough.
   - `e2e/conversation.spec.ts` **case 12**. The spec said case 8, but 8 to 11 were already taken, in other spec files.
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

**Step 5, the dev re-run: done (2026-10).** It couldn't run unattended, because `OMLX_API_KEY` wasn't in Claude's shell and CLAUDE.md forbids creating `.env`. The owner ran it in their own terminal, so it isn't something Claude did. The first attempt finished four conversations, and oMLX's memory guard rejected the fifth (NCT06728852) for want of about 0.3 GB. That's a machine limit, not this change. The owner freed memory and ran it again. It reused the four and finished the fifth. The complete run is committed as `evals/results/screening/dev/12-834179395652.json`. The partial one was discarded rather than committed, so the numbering stays contiguous.

Qwen3.6-35B-A3B-MLX-8bit, 8bit, temperature 0, seed 20260921, thinking off, from labels, against `11-2c46ada9a1d5.json`:

| | before (`2c46ada9a1d5`) | after (`834179395652`) | bar |
| --- | --- | --- | --- |
| confidently wrong | 5/47 (0.11) | 3/44 (0.07) | no more than 5 + 2 |
| abstention | 1/43 (0.02) | 2/43 (0.05) | no more than 0.02 + 0.05 |
| located requests | — | 0 | every one is false |
| rejected requests | — | 0 | |

By conversation, only NCT04385368 moved on wrong findings: 4/17 became 2/15 (L63 and L65 are no longer wrong; L57 and L64 still are). The new abstention is NCT04316364's L7, left unresolved on "I am 60 years old … no longer of childbearing age". NCT06728852's L15 is wrong in both runs. These are single samples of one seeded model, so a movement of one or two is noise, not progress.

The run's vignette hash is `d598b68a512d`, and the baseline's is `aa8172ad05f2`. The vignette files haven't changed since the repository's first commit, and `main` computes `d598b68a512d` too, so the difference came before this slice, most likely with the public repository split. It doesn't come from 0021. The run file's month reads 2026-11 because the stamp is UTC and the run finished after midnight UTC on 2026-10-31.

**Gate 2: passed.** Answering didn't get worse, and no reply in five conversations was read as a request. Claude's recommendation, which the owner can overrule: the README and `docs/` keep their scored numbers from `2c46ada9a1d5`, labelled as that prompt's, and the scored set isn't re-run for this slice.

**Gate 1: passed (2026-10).** The owner played `npm run app -- --examples` on the local model, with spec §7's requests, and answered: "everything looks good." They gave no notes on the four things §7 asks them to read, so none are recorded here. This was the owner, a person who didn't write the prompts, so the gate is independent as the spec asked.

## Review passes

Run on the whole diff against `main` after step 6.

**Pass 1, plan compliance.** Every changed file is in "Files that change". Three divergences, each recorded in this plan in the commit that made it: steps 1 and 2 landed as one commit; the browser case is 12, not 8; the transparency test is a new one in `tests/server/conversations.test.ts` and doesn't change the shared fixture. Step 5 was open when this pass ran, and is done now; see "Gate record".

**Pass 2, correctness.** Re-read `receive`, `#next`, `#respond`, `#repeatAfterStop` and `#advance` against spec §3.2's table.

- Termination is pinned by a test that asks on every turn.
- A request whose words aren't in the reply changes nothing.
- Readings about other criteria still apply.
- Saved conversations without the new fields restore.
- **Found and fixed in step 3:** the review would have described a reading set aside for an explanation as "about this criterion, which isn't asked in conversation". The ignored-reading words had only two cases. It now gets its own sentence, which a test pins.
- `test:e2e`: 12 passed.

Nits:

- **The respond turn gets no FOLLOW-UP.** On a criterion's second ask, after a partial answer, `#respond` passes the request and not what was missing. The explanation is of the whole criterion. Harmless, and left as is.
- **The grader counts a respond turn as a follow-up.** Its `followUps` count, like `overLength`, includes respond turns. The dev vignettes make none, and this is noted in spec §3.7.

**Pass 3, scope and data.**

- No PHI: the quoted reply is the owner's own made-up answer.
- No new network path, no secret, no deployment surface.
- No code path decides eligibility. Fixed text and study facts pass `VERDICT_PATTERN` in a test, and respond turns are agent turns the grader already checks.
- `tests/boundary.test.ts` is unchanged and passes: `src/screening/` doesn't import `src/plain/`, and `ScreeningCriterion` keeps four fields.

**Pass 4, eval integrity.**

- No grader, threshold, vignette or case was changed. `SCREENING_GRADER_VERSION` stays.
- `tests/screening/calls.test.ts` changed only for the read call's new return shape (`value` became `value.readings`). No assertion was loosened.
- One new test's expected order was wrong as first written, and was corrected before its first commit.
- No browser spec was loosened or skipped.
- No result is reported, so there are no settings to record.

**Pass 5, documentation.**

- The README gains one plain clause.
- `docs/screening-agent.md` says the scored numbers come from 0009's prompt version and that requests aren't measured by them, and lists the limits.
- `docs/coordinator-review.md` describes the labels.
- The roadmap row says what's open.

Nit: CLAUDE.md's `test:e2e` timing is now "about 20 s". The runs here took 19 to 21 s.
