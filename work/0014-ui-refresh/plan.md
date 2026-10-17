# plan: 0014 UI refresh

**Intent:** `work/0014-ui-refresh/intent.md` · **Spec:** `work/0014-ui-refresh/spec.md`
**Branch:** `0014-ui-refresh`, from `0013-trials-by-link` (PR #18, itself on #17) at `d0de4d9`; intent and spec `9b8fcab`. Rebased onto `main` as #17 and #18 merge.
**Mockups:** https://claude.ai/artifact/Uht1U7kkVxYb1mMKmcJXER (the owner's pick, 2026-10)

---

## Context

With 0013 the app became something a person clones and fills with their own trials, but the page still reads like an internal test tool. The name is "Prescreening test page". The start page mixes trials, conversations and the eval run. The Trials page is grey text rows. Project jargon is everywhere, and there's no way to see what the AI read from a trial before screening.

The owner asked for a design and usability update and picked option A of the mockups. This slice builds that design into the existing React page in plain CSS:

- a header with **Trials · Screenings · Reviews**;
- trial cards;
- a new trial checklist screen;
- separate Screenings and Reviews pages;
- a cleaner conversation, with the tester panel folded away;
- a first-run panel.

**Nothing here calls a model or the network,** adds a dependency or changes the agent, the parser or a measurement. The one server change is a read-only route for a trial's checklist.

**Baseline**, from `npm run check` on `9b8fcab`: 1058 passed and 8 expected fail (1066). `npm run test:e2e`: 10 passed, about 15 s.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. The page, rebuilt** | 1–5 | **Gate** | `npm run app -- --fake` (and `npm run app` on your own trials) showing the five screens of the mockups |
| **B. Checked and written up** | 6–8 | PR | Browser specs moved to the new pages, screenshots (four), README, docs and roadmap, review passes |

**Gate: does the built page match what was picked?** *(Passed 2026-10: "Everything looks great", after the two changes recorded as steps 5b and 5c.)* The owner uses the running app beside the mockups. Stage B rewrites every browser spec's navigation and retakes the README's pictures against the page, so a change after stage B pays for that work twice. The answer can be "change X first". No clinical judgment is needed.

Stage A has no earlier gate. Its pieces are pure functions with tests, one read-only route with tests, and markup. Between steps the browser test is expected to fail on navigation, and step 6 restores it. The plan says so, so no reviewer mistakes a red e2e mid-stage for a loosened spec.

### Steps

Each step is one commit, through `npm run check && git commit`. No Co-Authored-By trailer. No test mocks a module or stubs a global.

**Stage A: the page, rebuilt**

1. **Commit this plan** as `work/0014-ui-refresh/plan.md`.

2. **The checklist route and `byType` (spec §6).**
   - **`src/server/types.ts`:** `ServedStudy.criteriaText?: string` (display only), `TrialRow.byType: Record<CriterionType, number> | null`, and a `TrialDetail` type `{ row, criteria, plain, criteriaText }`.
   - **`src/server/trials.ts`:**
     - `pinnedRows` and `rows()` fill `byType` with a small helper, `countByType(criteria)`. It's null when there's no parse.
     - `#serveIfParsed` sets `criteriaText` from the stored trial.
     - Add `detail(nctId): TrialDetail | undefined`. It looks in the library's records, then in the served pinned studies, and returns `criteria: []` for an added trial with no parse. A small function `pinnedDetail(studies, nctId)` serves the no-library case.
   - **`src/server/app.ts`:** `GET /api/trials/:nctId`. `NCT_ID` is checked first, and an unknown ID gets 404. It works with or without `trials` configured.
   - **`scripts/app.ts`:** `loadStudies` fills `criteriaText: getTrial(id).eligibility.criteriaText` for pinned studies.
   - **Tests:**
     - `tests/server/trials.test.ts`: `byType` on an added row (3 patient), and `detail()` for added, pinned and unknown IDs.
     - `tests/server/app.test.ts`: the route's 200 for pinned and added, 404 for unknown and malformed, and `byType` in `GET /api/trials`. Exact-row expectations gain `byType`.

3. **Routes and the page's words (spec §2, §3, §4).** `src/web/logic.ts`, pure, with tests in `tests/web/logic.test.ts`:
   - `Route` and `routeFrom` as spec §2, plus `trialHash`. `routeFrom("")` and anything unknown go to `{ page: "trials" }`. **The existing expectations of `{ page: "start" }` change to `{ page: "trials" }`.** That's a renamed home, not a loosened test, and Pass 4 records it.
   - `badgeWords(row)` for spec §3's list.
   - `typeTag(type)`: "Person answers", "Records", "For the study site" or "Definition".
   - `settleWords(byType)`: "6 the person can answer · 10 need medical records", adding " · 2 for the study site" when there are any. Null when there are no counts.
   - `questionCount(view)`: the agent's messages, which the page labels "Question N" until the conversation is done.
   - The screen's fixed words, kept here so the specs import them (0013's pattern):
     - `ADDED_NOTE`, `NO_TRIALS` and `NO_TRIALS_HERE` updated to the mockups' wording;
     - new `FIRST_RUN_HEADING` ("Add your first trial"), `EXAMPLES_NOTE` and `CHECKLIST_NOTE`;
     - `PINNED_WORDS` becomes `"Built-in example"`.
   - `src/web/api.ts`: `getTrialDetail(nctId)`, a relative fetch; `Info` is unchanged.

4. **The frame, Trials, the checklist, Screenings and Reviews (spec §1, §3, §4, §5).**
   - **`src/web/App.tsx`:**
     - the header: wordmark, nav with `aria-current` (from the route), and the model pill (`info.mode`, `info.model.model`);
     - the banner unchanged;
     - routes for `trials`, `trial`, `screenings`, `reviews`, `conversation` and `review`.
   - **`src/web/TrialsPage.tsx`, rewritten as spec §3:**
     - cards, the inline remove confirmation, the first-run panel, and the "Built-in examples" section;
     - **Start screening** calls `startConversation` and goes to `#/c/<id>`;
     - the busy spinner and polling stay as 0013 left them.
   - **`src/web/TrialPage.tsx` (new), spec §4:**
     - `getTrialDetail`, counts from `byType`, the inclusion and exclusion sections in protocol order;
     - each row is `<CriterionText audience="coordinator">` with a `typeTag` badge;
     - the `<details>` fold-out holds a `<pre>` of `criteriaText`.
   - **`src/web/ScreeningsPage.tsx` and `src/web/ReviewsPage.tsx` (new), spec §5.** They split today's `StartPage.tsx`, which is deleted, and reuse `getStudies` and `listConversations`.
   - **`src/web/styles.css`, spec §8:**
     - new tokens, with their dark values beside the existing ones;
     - header, nav, pill, card, badge (neutral, accent, ok, warn, down), chip, button variants (`button`, `.secondary`, `.quiet`), add form, hero, checklist rows, and the review container width;
     - the old `.start`, `.list` and `.lede` rules go, once nothing uses them (grep before deleting).
   - **Accessibility as drawn in the mockups:** real buttons and links, labelled inputs, 44 px targets, and text contrast at least 4.5:1 in both themes.

5. **The conversation (spec §7).**
   - **`ConversationView.tsx`:** a heading card (the trial's title from `inspection.study`, its NCT ID, and "Question N" or "Finished"), then the chat and the aside. "Open the coordinator review" becomes a primary button with the same text.
   - **`ParticipantPane.tsx`:** markup classes kept, so behaviour and locators hold; only styling changes.
   - **`TesterPanel.tsx`:**
     - wrapped in an aside with the heading "What the agent has recorded", its existing note, and a toggle button, "Show the N rules" / "Hide the rules", with `aria-expanded`;
     - folded by default, with the state read and written through `localStorage` key `prescreen.tester` inside try/catch;
     - its rows unchanged, with the same classes (`section.tester li.row`).
   - **By hand:** `npm run app -- --fake --trials-dir <scratch> --chats-dir <scratch>`, walking every screen: add NCT00000000, see the checklist, start, unfold the panel, answer to the end, open the review. Then `npm run app` with no examples for the first-run panel. Headless screenshots of each are looked at and compared to the mockups. Results go in "Records".
   - **Then the gate.** Stop for the owner.

**Stage B: checked and written up (after the gate)**

6. **The browser specs on the new pages.** Every case keeps what it checks; only how it gets there changes.
   - **`e2e/start.spec.ts`, case 1:** Screenings' "Start a screening" lists every labelled study with **Start**. Reviews' eval-run section lists `review.conversations.length` rows with **Open review**. The scripted note is still checked.
   - **`e2e/conversation.spec.ts`, cases 2–7:**
     - `start()` goes to `/#/screenings`, clicks the study's **Start**, and clicks **Show the** … **rules** before any `testerRow` check.
     - Case 7's reload expects the panel to stay unfolded, since the choice is in `localStorage`. That's an addition.
   - **`e2e/review.spec.ts`, cases 8–9:** `openReview()` goes to `/#/reviews`, finds the eval-run row, and clicks **Open review**.
   - **`e2e/trials.spec.ts`, case 10:**
     - first expects `FIRST_RUN_HEADING`, since the trials directory is emptied, and the "Built-in examples" section with a pinned card and no Remove;
     - adds by link; the card reaches `Ready · 5 criteria`;
     - **See the checklist** shows "Who can join" with the invented study's rules and the `CHECKLIST_NOTE`;
     - starts from the card, and the first question appears;
     - the refusals stay;
     - Remove… then Cancel leaves the card, and Remove… then Remove takes it away;
     - Screenings no longer lists it, and Screenings' In progress still shows its conversation.
   - **`e2e/screenshots.spec.ts`:** the new navigation, plus a fourth shot, `docs/images/trials.png`: the Trials page with NCT00000000 added and ready, and the examples below.
   - **Run** `npm run test:e2e` (10 passed) and `npm run screenshots`, and look at all four images.
   - **One mutation:** removing the tester toggle's `onClick` fails cases 2, 6 and 7. It's applied as an edit and reversed as an edit, never with `git checkout` (0013's lesson).

7. **README, docs, CLAUDE.md, roadmap.**
   - **README:** "See it" gains the Trials picture first, and the captions follow the new page names. "Run it" names Trials, Screenings and Reviews.
   - **`docs/running.md`:** "Try it" describes the three pages, the checklist and the folded tester panel. "Checking the page" updates the case list.
   - **`docs/coordinator-review.md`:** how to reach a review (Reviews).
   - **CLAUDE.md:** the `npm run app` row's page description, and the `screenshots` row (four).
   - **`work/ROADMAP.md`:** a 0014 row and section, "Where the project stands", and "Carried forward from 0014".

8. **Review passes (REVIEW.md), recorded here.** All five against `git diff 0013-trials-by-link`, then `npm run check` and `npm run test:e2e` again. "Files that change" is checked against the diff. Then stop. The PR is opened on the owner's word, saying the e2e count and the gate.

## Files that change

**New:**
- `src/web/TrialPage.tsx`, `src/web/ScreeningsPage.tsx`, `src/web/ReviewsPage.tsx`, `src/web/ScreeningRow.tsx` (step 5c)
- `docs/images/trials.png`
- `work/0014-ui-refresh/plan.md` (intent and spec already committed)

**Modified:**
- `src/server/types.ts`, `trials.ts`, `app.ts`, `index.ts`, `conversations.ts` and `store.ts` (step 5c); `scripts/app.ts`
- `src/transport/types.ts` and `ledger.ts` (step 5c: `close`)
- `src/web/ReviewPage.tsx` (step 5b)
- `src/web/App.tsx`, `TrialsPage.tsx`, `ConversationView.tsx`, `ParticipantPane.tsx` (only if markup needs a wrapper), `TesterPanel.tsx`, `api.ts`, `logic.ts`, `styles.css`
- `tests/server/trials.test.ts`, `tests/server/app.test.ts`, `tests/web/logic.test.ts`, `tests/server/store.test.ts` and `tests/transport/memory.test.ts` (step 5c)
- `e2e/start.spec.ts`, `conversation.spec.ts`, `review.spec.ts`, `trials.spec.ts`, `screenshots.spec.ts`, and `e2e/lib/rows.ts` (step 6: `openRow`)
- `docs/images/review.png`, `tester.png`, `transcript.png` (retaken)
- `README.md`, `docs/running.md`, `docs/coordinator-review.md`, `CLAUDE.md`, `work/ROADMAP.md`

**Deleted:** `src/web/StartPage.tsx`

**Not touched, checked at step 8:** `src/web/review.ts` (`ReviewPage.tsx` changed at step 5b, see Records), `src/web/CriterionText.tsx`, `src/screening/`, `src/criteria/`, `src/plain/`, `src/models/`, `src/trials/` (`src/transport/` changed at step 5c for `close`, see Records), `evals/`, `data/`, `tests/web/review.test.ts`, `tests/boundary.test.ts` and `playwright.config.ts`.

## Reused, not rebuilt

- **Criterion words:** `CriterionText`, with audience `coordinator`, for the checklist. No other component reads a criterion's words, and the boundary test keeps it that way.
- **Trial rows:** `pinnedRows`, `droppedWords`, `pendingWords` and the 0013 polling.
- **Page API:** `startConversation`, `getStudies` and `listConversations` (`src/web/api.ts`), and `reviewHash`.
- **Server checks:** the guards and `NCT_ID` (`src/trials/reference.ts`) for the new route.
- **Colours:** the existing colour variables and dark-mode block in `styles.css`.

## Risks

- **The review's styles share the page's CSS.** A container or font change could shift the review. Its tests check words and order, not looks, so the review is compared by hand at step 5 and in the retaken screenshots.
- **Browser locators.** Specs use roles and text, not test ids. New button names are taken from `logic.ts` constants wherever they're asserted.
- **`localStorage` in Playwright.** Each test gets a fresh context, so the panel starts folded in every case, as the spec steps assume.
- **Size.** The CSS rewrite is the largest piece. It's kept to the mockups' set of components, with no design-system layer.

## Verification

- `npm run check` at every commit.
- By hand at step 5, with headless screenshots compared to the mockups.
- The owner at the gate.
- `npm run test:e2e`: 10 passed at steps 6 and 8, with one mutation shown failing.
- `npm run screenshots`: four images, each looked at.
- `git diff 0013-trials-by-link` on the "not touched" paths is empty at step 8.

## Records

- **Step 3.** The commit was first blocked: the command chaining check and commit hit the tool's 2-minute limit and was killed. That wasn't a test failure. Five runs of `npx vitest run` in a row were clean, and the step was committed through `npm run check` again. Keeping `NO_TRIALS_HERE` until step 4 let step 3 pass on its own.
- **Step 4.** Looked at headlessly against the mockups in fake mode, at 1280 px (first run, parsing, trials, both checklists, Screenings, Reviews), in dark mode and at 390 px. Three fixes followed:
  - in dark mode, primary buttons used the light accent under white text, so a `--button` token now carries the button colour;
  - long titles on Reviews pushed the button under them;
  - on a phone, the banner ran edge to edge.
  - The inline remove confirmation has no `role="group"`: Biome's `useSemanticElements` asked for a fieldset, and the plain row reads fine.
- **Step 5.** A whole conversation was driven headlessly in fake mode on NCT04316364:
  - the heading card read "Question 4" after three answers;
  - the panel opened on "Show the 24 rules" and showed today's rows;
  - the finished conversation's card offered "Open the coordinator review", and the review opened with its groups and words as before;
  - Reviews then listed the finished conversation with "View conversation" and "Open review".
  - The chat panel's height was cut by the heading card's height, so the answer box stays on screen.
  - The tester note's "in this slice" became "Rules the AI read from a trial have no plain-language versions."
- **Step 5b, the owner's request at the gate (2026-10).** The owner found the coordinator review to be "a lot of information" and asked for "a quick summary and ultimate suggestion".
  - **The suggestion part was raised as a conflict with 0007's rule:** the review never combines criteria, and `tests/web/review.test.ts` enforces that. Claude gave the reasons: about 1 rule in 5 is settled from the person's words, the confidently-wrong rate, and the row-by-row reading the review was tested on. It offered three options: make the review scannable, add a suggestion as its own slice that changes the rule, or both. **The owner chose to make it scannable.** No suggestion was built.
  - **`ReviewPage.tsx`:**
    - the group chips became "What's left for you": each group's count, heading and fixed "what" line. That's still one count per group, never a total or a verdict.
    - Each group is a `<details>`, and the first with rows starts open.
    - Each row is a `<details>` whose summary is its id, polarity, finding words and `CriterionText`. Folded, CSS hides the plain-language block and clips the protocol words to one line.
    - The why line, times asked, exchanges and readings moved into `RowDetail`, shown when the row opens.
    - `Jump` opens any folded group or row on its way to a target, so the transcript's "Shown with L7" links still land.
  - **Class names stay fixed strings**, so the boundary test's "styles rows by group only" still passes. `review.ts` and `review.test.ts` are untouched.
  - **Stage B's browser specs** open a row before asserting its "Why:" line (cases 6 and 9). `rowsByGroup` reads hidden rows as before.
  - Looked at headlessly on `eval NCT00077350-v2-labels`, folded and with one row open.
- **Step 5c, the owner's second request at the gate (2026-10): deleting screenings, and names.**
  - **Delete (built).** The owner asked whether the coordinator can remove screenings in progress and finished reviews. Claude recommended yes, for the person's own conversations only:
    - with an inline confirmation;
    - refused while the agent is replying;
    - never for eval-run conversations, which are read-only like the built-in trials.
  - **What delete touches:**
    - `MessageTransport` gains `close(id)`, which `ChannelLedger` implements by forgetting the channel. That's a visible change to the transport interface, made in `src/transport/` as its boundary requires.
    - `ConversationStore.remove`.
    - `ConversationService.remove` → `removed | unknown | read-only | busy`.
    - `DELETE /api/conversations/:id` → 204, 404, or 409 with the reason.
    - `ScreeningRow.tsx` (new), with Delete… on Screenings' In progress and Reviews' Finished.
  - **Names (declined).** The owner asked whether a person should give their name when starting. Claude advised against it under the no-PHI rule: a name box invites real names next to health answers, saved to disk. **The owner agreed to a readable label instead.** `screeningLabel` names a screening by its trial and its start time, read from the id's UTC stamp and shown in local time ("… · today 8:58 AM"). `ConversationSummary` gains the trial's `title`, so the label outlives a removed trial.
  - **Tests:**
    - the ledger's `close`;
    - the service's four outcomes, including that a restart doesn't bring a deleted one back;
    - the route, including a foreign `Origin` getting 403;
    - `screeningLabel`.
    - One exact expectation in `tests/server/store.test.ts` gained the new `title` field, an addition rather than a loosening.
  - Looked at headlessly: the confirmation on Reviews, the label on Screenings, and the file gone from the chats directory after Delete.
- **Step 6.**
  - **Specs moved, coverage kept:**
    - case 1 reads Screenings, then Reviews, and now also checks the eval run's rows show no Delete;
    - cases 2–7 start from Screenings and open the tester panel, and case 7 also checks the panel stays open across a reload;
    - cases 8–9 open from Reviews;
    - cases 6 and 9 open the folded row (`openRow` in `e2e/lib/rows.ts`) before reading its "Why:" line;
    - case 10 now runs: first run, add, checklist, Screenings' mark, start from the card, the refusals, Remove with Cancel then Remove, then deleting its screening by its readable label.
  - **A type error, caught by `npm run check` before commit.** `openRow` first used DOM types, which the Node tsconfig lacks; the same note 0010 recorded. It now clicks closed summaries through locators. (`tsc | head` hid the exit code once; the check's exit code was the gate.)
  - `npm run test:e2e`: 10 passed and 3 skipped (the screenshot specs), in 16.2–16.4 s.
  - **Mutation:** removing the tester toggle's `onClick` failed cases 2, 6 and 7 and nothing else. It was reversed by the opposite edit, and `git diff` on the file was empty afterwards.
  - `npm run screenshots`: `trials.png` is new, and `review.png`, `transcript.png` and `tester.png` were retaken. All four were looked at.
- **After step 8, from the owner ("I'm not seeing any delete button").** The owner's running app had the buttons: a headless look at its Screenings page found four. But "Delete…", like "Remove…" on trial cards, was styled as quiet grey text and didn't read as a button. Both are now outlined buttons in the down colour (`button.destructive`), quieter than the action beside them. Button names are unchanged, so the specs needed no change: `npm run check` passed, and `npm run test:e2e` gave 10 passed. `trials.png` was retaken and looked at.

## Gate record

## Review passes

Run 2026-10 at step 8, against `git diff 0013-trials-by-link`, by Claude (the author). They aren't independent.

**Pass 1, plan compliance.**
- **Every changed file is in "Files that change".** Several were added there at this pass, all from the gate's changes and each in Records:
  - step 5b: `ReviewPage.tsx`;
  - step 5c: the transport's `close`, the store, the service, `ScreeningRow.tsx` and their tests;
  - step 6: `e2e/lib/rows.ts`.
- `ParticipantPane.tsx` didn't need changing.
- **The "not touched" paths are empty in the diff:** `src/web/review.ts`, `CriterionText.tsx`, `src/screening`, `src/criteria`, `src/plain`, `src/models`, `src/trials`, `evals`, `data`, `tests/web/review.test.ts`, `tests/boundary.test.ts` and `playwright.config.ts`.
- **No dependency was added.** Scope grew at the gate at the owner's request (steps 5b and 5c), recorded in the intent, spec and plan.

**Pass 2, correctness.**
- **No Important findings.**
- **Delete:**
  - a turn in flight → busy;
  - an eval-run id → read-only;
  - a restart doesn't bring a deleted one back;
  - a deleted conversation's page shows "No conversation … on this server" because its channel is closed;
  - the store builds a path only from an id that passes `CONVERSATION_ID`.
- **`screeningLabel`** reads the id's UTC stamp and falls back to the name alone.
- **The checklist route** checks `NCT_ID` before any lookup.
- `npm run test:e2e`: 10 passed, 3 skipped.
- **Nit, accepted:** the conversation heading's "Question N" counts the agent's messages, so it includes the opening and is one ahead of the questions answered. It's labelled "Question", which matches the question on screen.
- **Nit, accepted:** `/api/info.examples` is no longer read by the page. It's kept for the CLI's own output and tests.

**Pass 3, scope and data discipline.**
- **No PHI.** A person's name was considered and declined. Labels are the trial's title and a time.
- No new network call: the checklist and delete routes are on the existing server under the existing Host and Origin guards, and a foreign `Origin` on DELETE gets 403 by test.
- **No determination path.** An overall suggestion was asked for and not built. The review still never combines criteria (`tests/web/review.test.ts` untouched and passing; boundary rule "styles rows by group only" passing).

**Pass 4, eval integrity.**
- No grader, label, vignette, threshold or committed result changed.
- **Test expectations that changed:**
  - `routeFrom`'s home is now `trials` instead of `start`, a renamed page;
  - exact trial rows gained `byType`, and one exact conversation summary gained `title`. Both are additions.
- **Browser specs:** every case kept and moved to the new pages. Assertions were added (no Delete on the eval run, the panel remembered across a reload, the checklist, Cancel, the readable label), not removed. A mutation of the tester toggle failed cases 2, 6 and 7.

**Pass 5, documentation.**
- **The README stays short and reports no findings.** It names the three pages, and its four screenshots follow them.
- **`docs/running.md`** describes the pages, the checklist, deleting and why there are no names, and lists the ten cases.
- **`docs/coordinator-review.md`** describes "What's left for you", the folding, and the declined suggestion.
- **CLAUDE.md** has the `npm run app` and `screenshots` rows.
- **The roadmap** has the 0014 row, section and "Carried forward from 0014".

**Final proofs:** `npm run check` exits 0 (1070 passed, 8 expected fail). `npm run test:e2e`: 10 passed. No model was called, nothing used `--spend`, and `.env` is untouched.

