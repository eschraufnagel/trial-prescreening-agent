# intent: 0016 polish

**Author:** the repository owner
**Status:** Proceeding on the owner's go, 2026-10. The scope (real-model screenshots, an animated demo, page polish, the README and GitHub page, readiness to go public) is the owner's, chosen 2026-10, as is going public as a new repository without this one's history. The owner has installed `ffmpeg` and has oMLX running. The other decisions are Claude's recommendations
**Date:** 2026-10
**Scope:** How the project looks to someone opening the repository for the first time: the README's images, a short animated demo, wording and finish on the page, the repository's GitHub description, and a check that nothing in the history should stay private. The agent, the parser, the coordinator review's rules and every committed result stay as they are.

---

## Problem

**The README's images show the stand-in, not the AI.** All four screenshots are taken in fake mode (`e2e/screenshots.spec.ts`). Each carries the "Scripted agent · no model" badge. Two carry the yellow "Scripted agent: not the real model" banner, the screening shows messages that start with "(scripted) Is this true for you:", and the added trial is "Invented study for the page's fake mode". Someone reading the README never sees the real agent ask a question.

**The page shows the project's internal vocabulary.** In the coordinator review, a conversation from the committed eval run is headed `eval NCT00077350-v2-labels`, and its note reads "From 0009's eval run". The Reviews list has a section "From the eval run (simulated participants)". A newcomer doesn't know what 0009 is, or why a conversation has a code for a name. Rule codes such as `L3` stand alone with nothing saying what they are.

**Nothing moves above the fold.** The README opens with text and a diagram. The first image is about a screen down, and it's a still.

**The GitHub page says nothing.** The repository has no description, no topics and no preview card, so a link to it shows a generic avatar. It's also private, so nobody can see it yet. The owner will publish it as a new repository, starting from this one's files without its history. That's the owner's action, after this slice. This slice makes the files ready for it.

**Some README wording is stale.** "How it was built" says "thirteen small changes". There are now fifteen.

## Proposed outcome

- **The README opens with a short animated demo** of the real local model: a trial added, a few turns of conversation, the coordinator review opened. It loops, has no sound, and stays small enough to load quickly.
- **Every README screenshot shows the real agent**, or a conversation the real agent held in the committed eval run, with no fake-mode badge, banner or invented study in frame.
- **The page speaks plainly.** No slice numbers, run codes or "eval run" on screen. A conversation from the committed run is called an example, and says the patient was simulated from a written description. Rule codes say what they are.
- **The page looks finished**: consistent spacing, type and alignment across Trials, Screenings and Reviews, in light and dark mode, at desktop and phone widths. No new layout, and no new screens.
- **The repository has a description, topics and a preview card**, ready for when it's made public.
- **A going-public check is recorded**: what a stranger would see in the files the new repository starts from, and what the owner should decide before publishing it.

## Absent on purpose

- **No change to the agent, the parser, prompts, labels, vignettes or any committed result.** Nothing is re-measured.
- **No change to the coordinator review's rules** (0007): rows keep protocol order, groups come from status, nothing is sorted, coloured or summarised by outcome. `tests/web/review.test.ts` keeps passing unchanged.
- **No new screens or features.** Polish is wording, spacing, type and images.
- **No CI, so no build badge.** CI was declined (owner, 2026-09), and a badge that doesn't reflect a real check would mislead.
- **No hosted demo.** The project has no deployment surface, and polish doesn't add one.
- **No history rewrite, and no new repository.** The owner creates the public repository later, without this one's history. This repository stays as it is.
- **No wording that promotes anyone.** The README describes the project for a reader new to it, as now, and names no one.

## Constraints

- **No PHI.** Every answer typed during capture is made up, written in the plan before the run, and committed as the script that types it.
- **Local model only, no `--spend`.** The real-model capture uses oMLX. It costs nothing but time, and needs the owner to have oMLX running.
- **The browser test stays deterministic.** Real-model capture can't be, so it lives beside the screenshot spec, skipped by `npm run test:e2e`, the way `npm run screenshots` is today.
- **Dependencies stay small.** Turning a recording into a GIF needs a tool this machine doesn't have. A system tool installed by the owner (for example `ffmpeg`) is preferred over an npm dependency, and either is a plan-level decision.
- **The README stays short and for anyone** (0012), with findings in `docs/`.
- **Nothing outward-facing without the owner.** Setting a repository's description, topics or preview card, and publishing anything, are done or confirmed by the owner at the time.

## Decisions

1. **Real model for the live views, the committed run for the review.**
   - The screening and the demo are captured live against oMLX, with answers written in advance. A reply takes about 7 seconds, so the demo shortens the waits rather than speeding up the typing.
   - The coordinator review and its transcript stay on a conversation from the committed eval run (0009's). Its agent words are the real agent's, and it's the run every README and `docs/` number traces to. It's served with `--examples` and no `--fake`, so no fake-mode chrome appears.
   - The transcript image keeps showing the agent missing a correction. The README says the review exists to catch mistakes like that, and polish doesn't hide it.

2. **Real-model output isn't reproducible, so its images are kept, not regenerated.** `npm run screenshots` stays deterministic for the fake-mode and committed-run views. A separate, skipped spec captures the live views, run by a person with oMLX up. Its typed answers are fixed, and its output is whatever the model said that day, committed as images.

3. **The demo is a GIF in the repository**, under 5 MB, about 15 to 25 seconds, at a width that reads on GitHub. A committed GIF plays in the README without an upload to GitHub's servers. A video would need one, and the repository would no longer hold its own images.

4. **Wording on the page changes; behaviour doesn't.** Strings change, and the browser test and unit tests that read them are updated in the same commit. A test asserting a rule (order, grouping, deletion) isn't loosened to fit new words. Fake mode keeps saying it's fake: a person running `--fake` should still be told.

5. **The preview card is a 1280×640 image committed under `docs/images/`.** GitHub has no API for the card, so the owner uploads it in the new repository's settings. Description and topics are written into the slice folder, with the `gh repo edit` command that sets them, for the owner to run on the new repository.

6. **The going-public check covers the files, not the history.** The owner will publish a new repository from this one's files, so commit authors and old commits don't travel. A first pass found no keys, no `.env` and no local paths in any commit, and the owner's name only in `LICENSE`. The check reads the tree at this slice's last commit for:
   - links that only the owner can open, such as the private design mockups linked from the roadmap and 0014;
   - links to this repository's pull requests (`work/ROADMAP.md`'s "PR #1" to "PR #22"), which the new repository won't have, and wording that points a reader at them, such as the README's "merged as one pull request";
   - every image and committed conversation, read for anything that looks like real patient data;
   - gitignored state (`chats/`, `added-trials/`, `.env`, `dist/`) absent from the tree;
   - the owner's name in `LICENSE`, which is normal for a copyright line, and anywhere else.

   It reports and recommends. Whether the new repository gets one commit or a short replayed history is the owner's call, then.

## Gates

- **One, after the page polish and the capture scripts, and before the real-model capture.** The owner looks at the polished page in fake mode, at desktop and phone width, and says whether it's the look they want.
  - **Why it's a gate.** Taste can't be tested, and the capture comes after it. Every image and the demo are taken from this page, so a change of look afterwards means capturing everything again, with oMLX running.
  - **What the owner reads.** A handful of fake-mode screenshots, light and dark, plus the list of wording changes. No clinical judgment is needed.
- **Going public is not a gate in this slice.** It's the owner's action after merging: a new repository, informed by the check in decision 6. The PR says it hasn't happened.

## Open questions for the spec

1. Which views the README shows, in what order, and whether there are still four. Whether the tester panel belongs in the README at all, or in `docs/running.md`.
2. The demo's storyboard: which trial, which made-up answers, where it cuts, and its frame rate and width.
3. How a recording becomes a GIF: `ffmpeg` installed by the owner, Playwright's video, or Playwright frames assembled some other way. Whether any of it is an npm dependency.
4. The exact wording for the eval run's conversations in Reviews and in the review header, and what a rule code is called on screen.
5. Which visual fixes count as polish. Each one is listed in the spec and checked in light, dark and at 390 px.
6. Description, topics and the card's design. The card uses the page's own type and colours, and no logos but the project's.
7. Whether the README gains anything besides the demo and the fixed count. Candidates: a one-line summary under the title, and licence and Node badges.
