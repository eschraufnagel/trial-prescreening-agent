# spec: 0016 polish

**Intent:** [intent.md](intent.md)
**Date:** 2026-10

What this slice changes, settled from the intent's open questions. The plan says in what order and in which files.

---

## 1. The README

The README keeps its sections and its length. It changes in five places.

1. **Under the title, before the bold summary, two static badges:** licence (MIT) and Node (≥ 24). They're plain images from shields.io with no build behind them. There's no test badge, since there's no CI (intent: absent on purpose).
2. **Directly after the proof-of-concept note, the demo** (§3): `docs/images/demo.gif`, with alt text describing it in one sentence, and a single caption line saying it's the real local model with made-up answers, shortened where the AI is thinking.
3. **"See it" keeps four stills, in this order**, each from §2:
   1. `trials.png`: Trials with a real oncology trial added and read by the local model, and the built-in examples below it.
   2. `screening.png`: a screening in progress with the real agent, the tester panel open. This replaces `tester.png`, which is deleted.
   3. `review.png`: the coordinator review, top.
   4. `transcript.png`: the conversation in the review. It's the same committed conversation (`eval NCT00077350-v2-labels`), so its caption about the missed correction at turn 6 stays true. Its turn number is checked against the new image.
4. **"How it was built":** the count of changes becomes the number of slice folders under `work/` other than `0000-product`, counted at the last commit (sixteen, with this one). "merged as one pull request" becomes "landed as one reviewed change", because the public repository won't carry this one's pull requests (intent, decision 6). "over 1,000 tests" is checked against `npm test`'s count at the last commit, and kept or corrected.
5. **Nothing else.** No findings, no names, and no wording about anyone's work beyond "one developer working with Claude", which is there now.

## 2. Capture

### 2.1 Where it runs

- **One spec captures everything:** `e2e/capture.spec.ts`. It replaces `e2e/screenshots.spec.ts`, which is deleted. `npm run screenshots` runs it.
- **It runs against a real app the person has already started**, not one the test starts:

  ```
  npm run app -- --examples --port 5035 --chats-dir <tmp> --trials-dir <tmp>
  ```

  The address comes from `CAPTURE_URL`, default `http://127.0.0.1:5035`. Before anything else, the spec checks that the page's badge says `Local model`, and stops with a message if it says `Scripted agent`. Fake mode can't make the README's images.
- **A config of its own:** `playwright.capture.config.ts`, with no `webServer`, one worker, Chromium, and timeouts long enough for the model: 5 minutes for the parse, 60 seconds a reply. `npm run test:e2e` never sees the capture spec. Its default config already only matches `e2e/*.spec.ts` minus what it skips, and the capture spec is skipped unless `CAPTURE=1`, the same guard the screenshot spec uses today.
- **Viewport 1280×800, light mode, device scale factor 1.** The demo is recorded at the same size.

### 2.2 The trial

**NCT05854498**, the short gate trial from 0013. It parsed cleanly there in about 30 seconds and lost nothing, so the Trials image shows a card that's ready, not one with a warning. It's an oncology trial from the public registry, so there's no patient data in it. If its parse comes back with anything rejected or unread on the day, the card shows it as the page does, and the image keeps it. Polish doesn't hide a limitation.

### 2.3 The made-up answers

- **The live screening is on NCT04316364**, a built-in example with hand labels, as the tester image is today.
- **Answers come from a fixed table** in the capture spec, so they're written before the run, committed, and contain nothing real. Each entry is a pattern matched against the agent's latest question and the answer to type:

  | Question mentions | Answer |
  | --- | --- |
  | biopsy, confirmed, diagnosed, stage | "Yes, a biopsy last spring confirmed stage II non-small cell lung cancer." |
  | surgery, resect, surgeon | "My surgeon said it can be removed, and I'm scheduled to meet them next month." |
  | ECOG, daily activities, performance | "I'm up and about all day and still working part time." |
  | chemotherapy, radiation, treatment | "No, I haven't had any treatment for it yet." |
  | pregnan | "No." |
  | anything else | "I'm not sure, I'd have to check." |

  The first matching row wins. The answers describe one consistent made-up person.
- **Three exchanges, then the screenshot**, with the tester panel's rules shown. The agent's words are whatever the model said, and they aren't edited.

### 2.4 The stills

| File | What the spec does |
| --- | --- |
| `trials.png` | Opens Trials, pastes `https://clinicaltrials.gov/study/NCT05854498`, clicks Add trial, waits for "Ready", screenshots |
| `screening.png` | Screenings → Start on NCT04316364, shows the rules, answers three questions from §2.3, screenshots |
| `review.png` | Reviews → the example for `eval NCT00077350-v2-labels` → screenshots the top |
| `transcript.png` | Scrolls that review to "The conversation", screenshots |

The capture spec removes the trial it added at the end, so a re-run starts from the same empty state.

### 2.5 Keeping images, not regenerating them

A real model's words change from run to run, so the images aren't checked by any test. They're committed as captured. Re-running `npm run screenshots` gives new images that tell the same story, and a person decides whether to commit them. CLAUDE.md's `npm run screenshots` row is rewritten to say this, and that it needs oMLX and a running app.

## 3. The demo

### 3.1 Storyboard

About 20 seconds, recorded once with Playwright's video recording in the capture spec:

1. **Trials, empty** (1 s held). The paste box.
2. **NCT05854498 pasted and added.** The card goes from fetching to reading. The wait is cut to under a second, with a caption frame "Reading the trial's rules… (about 30 s, shortened)". Then the card shows Ready.
3. **The added trial's checklist** (what the AI read), then **Screenings → Start** on NCT04316364. The agent's greeting and first question arrive. *(Amended after the first recording: the storyboard screened the added trial, but NCT05854498 is a colorectal cancer trial and §2.3's answers are one made-up lung cancer patient's. Its first question, "To confirm, are you 18 years of age or older?", drew the lung biopsy answer. The answers weren't changed. The demo screens the trial they were written for.)*
4. **Two exchanges** using §2.3's answers. Each reply wait is cut to about half a second.
5. **Reviews → the committed example → the review top**, with a slow scroll through the first group, and one row opened to show the person's words.
6. **Hold** on the review (2 s), then loop.

The live screening in step 3 isn't finished, and it's on a built-in trial, which a caption says. The review in step 5 is the committed example, and the caption says so: a full screening runs to dozens of questions, which is longer than a demo.

### 3.2 Cutting and encoding

- **The spec writes a cut list beside the video:** `[{ "from": s, "to": s, "speed": n }]`, from timestamps taken around each wait. Waits get a high speed, actions play at 1×.
- **`scripts/make-demo.ts` turns the video and the cut list into the GIF** with `ffmpeg`, run through `child_process`. It uses a trim and `setpts` per segment, concatenation, `fps=12`, width 960, and a two-pass palette (`palettegen` with `stats_mode=diff`, then `paletteuse` with `dither=bayer`). It's run as `npm run demo`, and it fails with an install hint if `ffmpeg` isn't on the path.
- **No npm dependency is added.** `ffmpeg` is a system tool the owner installed. The README's "Run it" doesn't mention it. `docs/running.md` does, under making the images.
- **Budget: under 5 MB.** If the first encode is larger, the script lowers the frame rate to 10, then the width to 800, and reports what it used. It never drops below 800 wide.
- **Caption frames** ("Reading the trial's rules… shortened") are drawn by the page, not by `ffmpeg`. The capture spec injects a small fixed overlay element during the recording only. That avoids a font dependency in `ffmpeg`. The overlay is test code in `e2e/`, not in `src/web/`.
- **The raw video and the cut list are gitignored** under `e2e/.out/`. Only `docs/images/demo.gif` is committed.

## 4. Wording on the page

Each change is a string, with the tests that read it updated in the same commit (intent, decision 4).

| Where | Now | After |
| --- | --- | --- |
| `src/web/index.html` `<title>` | Prescreening test page | Trial Prescreening |
| `EVAL_RUN_NOTE` (`src/web/review.ts`) | From 0009's eval run. The participant was simulated by the model from a written vignette. | An example from the project's test run. The patient was played by an AI from a written description, not by a person. |
| Reviews section heading (`ReviewsPage.tsx`) | From the eval run (simulated participants) | Examples (simulated patients) |
| Example row and review header | `eval NCT00077350-v2-labels · 54 turns` | `Simulated patient 2 · rules checked by hand · 54 messages` |
| A person's own screening row | `<id> · 12 turns` | `<id> · 12 messages` |
| Transcript line label | `3 · Agent · asked about L3` | `3 · Agent · asked about rule L3` |
| Transcript link line | `Shown with L1, L2` | `Shown with rules L1, L2` (`rule L4` for one) |

- **The example label** comes from a new pure function, `exampleLabel(id)` in `src/web/logic.ts`, with unit tests. It reads `eval <NCT>-v<n>-<labels|parse>`. `labels` reads "rules checked by hand" and `parse` reads "rules read by the AI". An id it can't read is shown as is, never thrown on.
- **The review header** shows the example label where it shows the raw id now, for eval-run conversations only. The raw id stays in the page as the `title` attribute of that line, so it can still be copied.
- **Rule codes keep their form** (`L3`, and whatever ids parsed criteria have). Each row's code gets `title="Rule L3, in the protocol's order"`. The codes are anchors, test selectors and the key the coordinator review's rule test flips findings by, so renaming them is out of proportion for polish.
- **Fake mode's own wording doesn't change**, including the banner, the badge, "(scripted)" and the invented study. Fake mode is still for the browser test and for running without a model.

## 5. Finish on the page

A closed list. Each item is checked by eye at 1280 and 390 px, light and dark, and listed at the gate. Anything else found at the gate is added only on the owner's word.

1. **Favicon.** The header's flask, as an inline SVG data URI in `index.html`, in the accent colour. It's one `<link rel="icon">`, with no file and no request.
2. **Examples grouped by trial on Reviews.** Today 30 rows repeat five long titles. After the change, each trial's title is a small heading over its examples, with rows labelled by §4's example label only. Order within a trial is v1, v2, v3, labels before parse, matching the run's own order. This is display grouping by trial, never by outcome, so 0007's rule is untouched.
3. **The Reviews "Finished" empty state** sits in a quiet card instead of a bare line. It reuses the `card` class the rows use. The Trials page has no empty-state card to copy, since its first-run panel is a `hero` (amended in the plan's step 1).
4. **The review header's two notes** (the record-not-a-decision note and the example note) sit as one block with a divider, not two separate grey boxes.

Nothing on the coordinator review's rows, groups or counts changes. `tests/web/review.test.ts` passes unchanged, and the plan proves it by not editing it.

## 6. The GitHub page

Written into `work/0016-polish/github.md` for the owner to apply to the new repository.

- **Description** (under 350 characters): "A local proof of concept: an AI holds a clinical trial's first eligibility conversation and hands a coordinator a reviewable record of what the person said. Runs on a local model with made-up patients, and is measured by its own eval harness."
- **Topics:** `clinical-trials`, `llm`, `ai-agents`, `evals`, `local-llm`, `mlx`, `typescript`, `react`, `healthcare`.
- **The command:** `gh repo edit <owner>/<repo> --description "…" --add-topic …`, written out in full.
- **Preview card:** `docs/images/social-card.png`, 1280×640. It's made by the capture spec from `e2e/capture/social-card.html`, a static page using the app's stylesheet tokens. It shows the project name, the summary line and a cropped real screenshot (`review.png`), and no logo but the flask. The file says where to upload it (Settings → General → Social preview).

## 7. The going-public check

Written to `work/0016-polish/going-public.md`, from the tree at the slice's last code commit. For each item it records what was looked for, how (the command), and what was found.

1. Secrets: `.env` absent, and no key-shaped strings (the patterns 0008's tests use) in any tracked file.
2. Personal data: the owner's name and email in tracked files, and local paths (`/Users/`).
3. Patient data: every committed conversation and vignette is synthetic. Read by sampling, plus a search for dates of birth, phone numbers and email addresses.
4. Links only the owner can open: `claude.ai/artifact` links, and links to this repository's pull requests and issues.
5. Gitignored state absent from the tree: `chats/`, `added-trials/`, `dist/`, `e2e/.out/`, `evals/results/screening/conversations/`.
6. Size: the largest tracked files, and the total, so the new repository's first push is known.

It ends with recommendations, each the owner's to take or leave. It changes nothing outside the slice folder.

## 8. Tests and checks

- **Unit:** `exampleLabel` for each form (`labels`, `parse`, v1 to v3) and an unreadable id.
- **Browser test:** the cases that read changed strings are updated, and `npm run test:e2e` still runs ten cases and passes ten. None is added or removed. The capture spec is listed as skipped.
- **Boundary:** `scripts/make-demo.ts` spawns `ffmpeg` and makes no network call. `e2e/` and `scripts/` aren't under `src/`, so the network and model boundary tests don't change.
- **`npm run check` before every commit,** as always.
- **Not tested:** the images, the demo and the card. They're judged by eye, at the gate for the page and in the PR for the images.

## 9. Gate

As the intent says: after §4 and §5 are committed and the capture spec exists, and before the capture is run against the real model. The owner sees fake-mode screenshots of Trials, Screenings, Reviews and a review, at 1280 px light, 1280 px dark and 390 px, plus §4's table. The owner says go, or names what to change.

## 10. Files

| Change | Files |
| --- | --- |
| Wording and finish | `src/web/index.html`, `src/web/review.ts`, `src/web/logic.ts`, `src/web/ReviewsPage.tsx`, `src/web/ReviewPage.tsx`, `src/web/ScreeningRow.tsx`, `src/web/styles.css` |
| Tests | `tests/web/logic.test.ts` (or wherever `logic.ts` is tested), the e2e specs that read changed strings |
| Capture | `e2e/capture.spec.ts`, `e2e/capture/social-card.html`, `playwright.capture.config.ts`, `scripts/make-demo.ts`, `package.json` (`screenshots`, `demo`); `e2e/screenshots.spec.ts` deleted |
| Images | `docs/images/demo.gif`, `trials.png`, `screening.png`, `review.png`, `transcript.png`, `social-card.png`; `tester.png` deleted |
| Words | `README.md`, `docs/running.md`, `CLAUDE.md` (the `screenshots` row, a `demo` row), `work/ROADMAP.md` |
| Slice | `work/0016-polish/plan.md`, `github.md`, `going-public.md` |
