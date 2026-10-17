# spec: 0014 UI refresh

**Status:** Draft, from `intent.md`
**Date:** 2026-10

What the page becomes. The mockups are the visual reference: https://claude.ai/artifact/Uht1U7kkVxYb1mMKmcJXER. The order of work is in `plan.md`.

---

## 1. Frame

- **Header** (`App.tsx`), on every view:
  - the wordmark "Trial Prescreening", which links to `#/`;
  - the nav, **Trials** (`#/`), **Screenings** (`#/screenings`) and **Reviews** (`#/reviews`), with the current one marked by `aria-current="page"`;
  - a model pill: "Local model · <model>", or "Scripted agent · no model" in fake mode.
- **Banner:** fake mode's banner stays.
- **Layout:** pages sit in a centred column at most 1120 px wide. At phone width the nav wraps.

## 2. Routes (`src/web/logic.ts`)

```ts
type Route =
  | { page: "trials" }                 // "#/", "", "#/trials"
  | { page: "trial"; nctId: string }   // "#/t/NCT\d{8}"
  | { page: "screenings" }             // "#/screenings"
  | { page: "reviews" }                // "#/reviews"
  | { page: "conversation"; id: string }
  | { page: "review"; id: string };
```

Anything unrecognised goes to `trials`. `reviewHash` is unchanged, and `trialHash(nctId)` is added.

## 3. Trials (`TrialsPage.tsx`, rewritten)

- **The add form:** a label, an input and an **Add trial** button, with one line of help.
- **One card per added trial** under "Your trials". With `--examples`, the built-in ones follow in their own section, "Built-in examples", with one line saying they're the project's test trials and can't be removed. Each card shows:
  - the status badge;
  - the NCT ID, linked to `https://clinicaltrials.gov/study/<ID>` with `rel="noreferrer" target="_blank"` (the browser opens it; the app fetches nothing);
  - the title and the condition chips;
  - one line on who can settle the rules (from `byType`, §6);
  - the dropped-rules warning (`droppedWords`), and any problem.
- **Actions:**
  - Ready trials: **Start screening** (starts a conversation and goes to it) and **See the checklist** (`#/t/<ID>`).
  - Added trials, when not busy: Refresh, and Remove…, which turns into an inline "Remove NCT…? Remove · Cancel".
  - A busy card shows the spinner and running time (0013).
- **Badge words** (`badgeWords` in `logic.ts`):
  - fetching: "Fetching"
  - parsing: "Reading the rules"
  - ready: "Ready · N criteria"
  - failed with no parse: "Couldn't add"
  - failed with a parse: "Ready · N criteria", plus the problem underneath
  - built in: "Built-in example"
- **With no added trials** (built-in examples or not), the first-run panel takes the place of "Your trials": heading "Add your first trial", the form, and the three steps (Add, Read, Screen) in plain words. Below it, a line about `--examples`.

## 4. A trial's checklist (`TrialPage.tsx`, new)

- **Data:** `GET /api/trials/:nctId` (§6).
- **Layout:**
  - a back link to Trials;
  - the badge, the ClinicalTrials.gov link, the title and the chips;
  - **Start screening**, if the trial is ready;
  - the note "Read from the trial's published rules by the AI, not checked by a person. The AI asks about the rules a person can answer and leaves the rest for their medical records.";
  - three counts: rules read, the person can answer, and need records. Protocol and definitional criteria count only in the first;
  - two sections, "Who can join" (inclusion) and "Who can't join" (exclusion), in protocol order. Each row is `CriterionText` (audience `coordinator`) beside its tag from `typeTag`: "Person answers", "Records", "For the study site" or "Definition";
  - the dropped-rules warning, if there is one;
  - a `<details>` fold-out holding the published eligibility text, preformatted.
- **A pinned trial** shows its plain-language versions through `CriterionText`, as in the review.

## 5. Screenings and Reviews (`ScreeningsPage.tsx`, `ReviewsPage.tsx`, new; `StartPage.tsx` removed)

- **Screenings:**
  - "Start a screening": a card per study from `/api/studies` with its title, NCT ID, criteria count, the added mark, and **Start**.
  - "In progress": the person's own unfinished conversations, each with **Continue**.
  - With no studies, the first-run line links to Trials.
- **Reviews:**
  - "Finished": the person's own finished conversations, each with **Open review** and **View conversation**.
  - With `--examples`, "From the eval run (simulated participants)": each eval-run conversation with **Open review**.
  - Nothing finished: one line says so.
- **Each conversation row** shows its trial's title when the trial is still served (looked up in `/api/studies`), and its NCT ID always.

## 6. Server additions

- **`TrialRow.byType`:** `Record<CriterionType, number> | null`, counted from the served criteria. Null while there's no parse.
- **`GET /api/trials/:nctId`** returns:

  ```ts
  { row: TrialRow, criteria: ScreeningCriterion[], plain: Record<string, PlainDisplay>, criteriaText: string | null }
  ```

  - 404 for an unknown or malformed ID.
  - An added trial with no parse yet returns `criteria: []`.
  - Read only. No other route changes.
- **`ServedStudy` gains optional `criteriaText`,** display only. The launcher fills it from the fixture for a pinned study, and the library from the stored trial.

## 7. A conversation (`ConversationView.tsx`, `ParticipantPane.tsx`, `TesterPanel.tsx`)

- **A heading card:** the trial's title, its NCT ID and "Question N", where N counts the agent's question turns in the transcript.
- **The chat:** restyled bubbles (agent left, person right) and a composer with the made-up-answers line. Its behaviour is unchanged: the waiting text, refusals, Send again and the model-down notice.
- **The tester panel:** an aside headed "What the agent has recorded", with its existing note and a toggle button, "Show the N rules" / "Hide the rules" (`aria-expanded`).
  - It's folded by default.
  - The choice is kept in `localStorage` under `prescreen.tester` (try/catch; it works without storage).
  - Unfolded, it shows today's rows unchanged, with the same class names, so the browser test's locators hold.
- **Finished:** the review link reads "Open the coordinator review" as before, now as a primary button.

## 7b. The coordinator review, made scannable (added at the gate)

The owner asked for a summary and an overall suggestion. The suggestion is not built, since it would break 0007's rule against combining criteria. Instead:

- **"What's left for you":** one count per group, with each group's existing heading and line.
- **Folding:** groups and rows fold. The first group with rows starts open. A folded row is one line: id, polarity, finding words and the protocol words clipped. Opening it shows the plain-language version, why, times asked and the conversation.
- **Jumps:** a jump from the transcript opens what it lands on.

## 8. Styles (`styles.css`)

- **Tokens:** the existing `:root` colour variables stay, with dark mode. Added: `--accent-soft`, `--ok-bg`, `--ok`, `--chip`, and `--radius` at 14px.
- **Replaced:** the start, list and tester-panel rules.
- **Added:** header, nav, card, badge, chip, button variant (primary, secondary, quiet), form, hero, checklist and spinner rules.
- **Review rules:** the `review-*` rules stay as they are, apart from the shared container width and the header they inherit.

## 9. Proof

- **`npm test`:**
  - `routeFrom` for every route in §2, and `trialHash`;
  - `badgeWords`, `typeTag` and the who-can-settle line;
  - `GET /api/trials/:nctId` through `app.inject` (pinned, added, unknown, malformed);
  - `byType` in rows;
  - the boundary tests unchanged and passing. The checklist reads criterion words only through `CriterionText`.
- **`npm run test:e2e`:** every case kept, its steps moved to the new pages:
  - case 1 reads Screenings and Reviews;
  - cases 2–7 start from Screenings and unfold the tester panel first;
  - cases 8–9 open the eval run from Reviews;
  - case 10 first sees the first-run panel, since the server starts with an emptied trials directory, then adds by link, sees the card, opens the checklist, screens, and removes with the confirm.
- **`npm run screenshots`:** the existing three, and a fourth, `docs/images/trials.png`.
- **The gate** (intent).
