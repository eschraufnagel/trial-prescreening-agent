# intent: 0013 trials by link

**Author:** the repository owner
**Status:** The owner's decisions of 2026-10 (decisions 1 to 3). The rest are Claude's recommendations, taken under decision 3 and open to argument at the gate
**Date:** 2026-10
**Scope:** One short slice. A person adds any oncology trial to the app by its ClinicalTrials.gov link or NCT ID, and screens against it. The twelve pinned trials, their labels and every committed measurement stay as they are.

---

## Problem

**The app only screens the trials it was measured on.** The parser reads any protocol's eligibility text, and the agent screens from whatever criteria it's given, but the app serves the five labelled lung cancer trials and nothing else. The loader refuses any study not pinned in `src/trials/corpus.ts`, and nothing in the app can fetch one. The owner's aim was always a screener for oncology trials in general. The pinned corpus served the eval harness, and from outside it reads as the product being built around twelve trials.

**What it takes is mostly plumbing.** Fetching and trimming a study exist (`scripts/fetch-trials.ts`, `src/trials/trim.ts`). Parsing exists (`parseCriteria`). Screening from a parse exists (`npm run app -- --source parse`), and the coordinator review already says when criteria came from the parser. What's missing is a way to name a trial, somewhere to keep it, and the app serving it.

## Proposed outcome

- **A Trials screen** in the app. It lists every trial the app serves. It takes a ClinicalTrials.gov link or an NCT ID and adds that trial, and it refreshes or removes an added one. The pinned trials are listed read-only, as the measured set.
- **Adding a trial** fetches the study from ClinicalTrials.gov, trims it as the fetch script does, and parses its eligibility text with the local model. That takes about four minutes, so each row shows fetching, parsing, ready or failed. When it's ready, the start page offers it like any other study.
- **An added trial says it's unmeasured.** The start page and the Trials screen mark it as parsed and not checked against labels, and the coordinator review shows the existing parser note on every conversation made from it.
- **Added trials are kept on this machine**, in a gitignored directory, like `chats/`. They're there after a restart.

## Absent on purpose

- **No new measurement.** The parser was graded on five labelled lung cancer trials. Added trials aren't labelled, and no eval runs on them. The app says so instead.
- **No change to the agent, the parser, the labels or any committed result.**
- **No plain-language versions for added trials.** They're display only, and 0006 made them from labels.
- **No search.** A person finds a trial on ClinicalTrials.gov and brings its link. Matching a patient across trials is still not built.
- **No check that a trial is oncology.** Other conditions are out of scope, but nothing refuses one. The screen shows each trial's conditions.

## Constraints

- **The one runtime network call.** The server may fetch `https://clinicaltrials.gov/api/v2/studies/{NCT ID}`, from one named file, only when a person clicks Add or Refresh. Nothing fetches in the background or at startup. `tests/boundary.test.ts` pins it like the model hosts, and CLAUDE.md, REVIEW.md and the product intent are amended in the same change.
- **Local model only.** Parsing in the app goes through `createLocalAdapter`, like everything else the app runs.
- **Fake mode stays offline.** `npm run app -- --fake` and the browser test reach neither the registry nor a model. Adding a trial there reads a committed study response and makes a scripted parse.
- **No PHI.** A full registry response carries real coordinators' names and phone numbers. Trimming drops them before anything is stored, as it does now.

## Decisions

1. **Any oncology trial, added from a screen in the app** (owner). Not a command a person runs.
2. **A narrow runtime network exception for ClinicalTrials.gov** (owner). Shaped as under Constraints.
3. **A short slice** (owner): brief intent, spec and plan, one gate, one PR.
4. **Where the fetch lives: `src/trials/registry.ts`.** It sits beside trimming, the fetch script uses it instead of its own copy, and it's the one file the exception names. The roadmap suggested `src/server/`; the trials module is where the code it shares already is.
5. **Storage: one JSON file per added trial in `added-trials/`,** gitignored, with `--trials-dir` for the browser test. Each holds the trimmed study, its parse once there is one, and its state.
6. **Refresh refetches, and reparses only if the eligibility text changed.** Until a new parse is ready, the old one stays served. A conversation already held keeps the criteria it ran with, because they're saved in its own state.
7. **Remove takes a trial off the start page.** Conversations made from it stay listed and reviewable. A pinned trial can't be removed, and a trial already listed can't be added twice.
8. **Which pinned trials are offered: unchanged,** the five labelled ones. One of the seven unlabelled pinned trials can be added by link like any other.
9. **The review: no change.** Its existing parser note already says the criteria came from the parser and may be missing or mis-typed. The start page and the Trials screen carry the "not checked against labels" mark.

## Gates

- **One, after the feature works end to end in fake mode and before the browser test and docs: the owner adds two or three real oncology trials of their choosing on the local model and screens against one.** It decides whether parses of trials the parser has never seen are usable enough to offer behind a button, and so what the README and docs claim. Getting it wrong costs either a claim the app doesn't earn or a feature shipped without its limitation stated. No clinical judgment is needed: the question is whether the agent's questions make sense and the parse finished. Claude adds the same trials first and reports each parse's counts and any failure, so the owner's part is the screening.

## Open questions for the spec

1. Which link forms are accepted, and the exact refusals.
2. The record format, its states, and what a restart does to one mid-parse.
3. The routes, and how the page learns a parse has finished.
4. The fake-mode study and scripted parser.
5. The exact amendments to CLAUDE.md, REVIEW.md and the product intent.
