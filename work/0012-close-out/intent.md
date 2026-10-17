# intent: 0012 close-out

**Author:** the repository owner
**Status:** Decisions answered (owner, 2026-09: the recommendations, including decision 4's product claim and CI as not doing)
**Date:** 2026-09
**Scope:** One slice. Make the repository readable by anyone who opens it, technical or not, and have it show two things: the product (AI inside a prescreening flow a patient would use) and how it was built (an AI-native SDLC, with the verification loop agents use to check their own work). Then close the roadmap. No change to the agent, the parser or any measurement, and no model runs.

---

## Problem

**The README is written for the person who built it.** It's about 480 lines. It opens with a paragraph listing slice numbers and goes straight into loaders, parsers and pooled recall. Everything true is in there, but someone arriving from a link, technical or not, has to read a long way before they learn what this is for, what using it looks like, or how it was made. The people looking will include engineers, product and clinical-operations people, and people who have never seen a clinical trial protocol.

**Two things the repository does well are invisible from the top.**

1. **The product.** An AI agent holds a short prescreening conversation with someone considering a lung-cancer trial, in plain language. It checks what they say against the trial's actual eligibility criteria, and hands a coordinator a review that says what the person's words establish and what still needs the chart. The coordinator decides. None of that is visible without running the app, and there are no pictures.
2. **The way it was built.** Every change went through the AI-native SDLC: an intent, a spec, a plan made in plan mode, stages separated by human gates, then a PR after review passes. At every step, the agent doing the work checked it by running things: typecheck, lint and tests before every commit, a browser test for page changes, evals for model behavior. The product intent calls the process "the secondary artifact", and promised a README account of where it was adapted for a solo project. No slice has written it.

**An honest limit on the product story.** This PoC doesn't find a trial for a patient. The patient picks one of twelve real lung-cancer studies, and the agent checks whether they might fit it. Matching a patient across many trials isn't built. The showcase can present finding a trial as where this could go, labelled as not built. It mustn't imply it exists.

**What the roadmap's brief asked for still stands:** open question 1 up to date, and the roadmap closed. Open question 1 was already restated with 0009's numbers, and 0011 adds one sentence.

## Proposed outcome

**A README in two layers.**

- **The top, for everyone**, in plain language, about two screens:
  - **What this is**, in three sentences: who it helps, what it does, and what it isn't (not for real patients, and the coordinator decides).
  - **See it work:** two or three screenshots, of the conversation, the tester panel and the coordinator review, each with a one-line caption. A diagram of the product flow: patient, agent, the trial's criteria, coordinator.
  - **What it found**, in plain words. How often the agent was confidently wrong, and how that fell. How much of a screening a conversation can settle at all. Why it helps a coordinator rather than replacing one. Each figure links to its detail below.
  - **How it was built:** a diagram of the AI-native SDLC loop, with the verification loop drawn in, and a short plain account of each step, linking to the playbook (https://claude.com/blog/the-ai-native-sdlc-playbook). Then where the loop was adapted for one person and a model, and what went wrong as well as what worked.
- **The rest, for engineers:** the existing technical sections, reordered under a clear heading, lightly edited, with no number changed.

**Two diagrams, as Mermaid in the README.** GitHub draws them from text in the file, so they're easy to view, version with the code and need no image tooling.

1. **The product flow:**
   - a trial's eligibility text is parsed into criteria;
   - the agent asks the participant in plain language;
   - it records what their words establish, abstains when unsure, and sends the rest to chart review;
   - the coordinator reads the review and decides.
2. **The SDLC:**
   - intent, spec, then a plan made in plan mode;
   - stages of implementation, each ending at a human gate where one is needed;
   - review passes, then the PR, merge and roadmap.

   Inside implementation, drawn as its own loop, is the **verification loop**: write, run `npm run check` (typecheck, lint, tests) and commit only if it passes; run the browser test for a page change, and the evals for a model change. On a failure, fix the code, not the test.

**Screenshots taken by the existing browser tooling.** Playwright already drives the page in `--fake` mode with a scripted agent and no model. A small screenshot script, run by a person like the fetch script and never part of `npm test`, can make deterministic PNGs of the three views from made-up answers. They're committed under `docs/images/`.

**The roadmap closed**, as in the first draft:
- every row marked Done, Held or Not doing, with a reason;
- every open carried-forward item given a disposition;
- open question 1 marked answered as far as a PoC can.

## Absent on purpose

- **No change to the agent, parser, grader, review or any number.** Screenshots come from fake mode. No model is called, and nothing is spent.
- **No claim that isn't built.** Finding a trial across studies, real patients and anything production appear only as clearly labelled future directions, or as what this is not.
- **No rewrite of earlier slices' documents.** The product intent isn't edited.
- **No new dependency.** Mermaid is rendered by GitHub; Playwright is already here.

## Constraints

- **Plain language on top.** No slice numbers, no metric names without a gloss, no jargon a patient wouldn't know. Clinical terms are explained once. The two-layer split exists so engineers lose nothing.
- **Honest.** Every figure on top is one the README already reports below, linked to it, with its main caveat in the same sentence: model-read not person-read, one run, Claude-authored ground truth. Where the process went wrong goes on top too: 0011's over-measurement and stop, and its held-back studies seen before the freeze.
- **No PHI, and no real patient words**, in screenshots or anywhere. The screenshot script types made-up answers.
- **The page isn't changed.** If screenshots need a hook the page doesn't have, the script works around it, or the need is raised, not quietly added.
- **No tool attribution**, as CLAUDE.md says. Describing the process as AI-native, and naming Claude as the model and the author of labels and vignettes, is content, not attribution.

## Decisions

1. **README structure: two layers in one file.** Recommend a plain top section for everyone, then "For engineers" with today's technical sections. The alternative, a short README pointing at `docs/`, splits the numbers from the claims and breaks CLAUDE.md's rule that README numbers trace to runs.
2. **Diagrams: Mermaid.** It renders on GitHub, lives in the README as text and is reviewable in a diff. The alternative, drawn images, looks more polished but can't be diffed and goes stale silently.
3. **Screenshots: yes, from fake mode, made by a script.** Recommend `scripts/screenshots.ts`, run with `npm run screenshots` beside `test:e2e`, using the pinned Chromium, a scripted conversation of made-up answers, and a fixed viewport. The PNGs are committed. Not part of `npm test`. The alternative, no pictures, leaves the product invisible to anyone who won't clone and run it.
4. **The product story's boundary.** Recommend: "helps a person check whether they might fit a trial they're considering, and hands a coordinator the answers", plus one labelled "where this could go" line on matching across trials, which isn't built. **This is your call.** It's the product claim a non-technical reader will remember.
5. **The playbook, and where it bent for one person.** The section links the post and uses its stages as the diagram's steps. It then lists the adaptations, each with a pointer to the plan behind it:
   - gates delegated and recorded;
   - Claude-authored ground truth;
   - readers that are models;
   - review passes by the author;
   - bars fixed before runs and moved in the open;
   - mistakes kept;
   - 0011's stop.

   The post's wording is checked before the spec. It couldn't be fetched while this was written.
6. **Roadmap dispositions,** unchanged from the first draft:
   - the held comparison stays **Held**;
   - simulator fidelity, more labels and the plain-language follow-ups become **Not doing**;
   - the "later slice" items become **Not doing**, as known limitations;
   - CI becomes **Not doing** (your call; one author, and `npm run check` gates every commit).
7. **Spec and plan:** keep both, short. One stage for the screenshots script, one for the README and roadmap.

## Gates

- **Before the PR: does the top of the README say what the owner would say, to the people they.ll send it to?** That covers the product claim, the plain-language findings, the SDLC account and the screenshots. What it costs to be wrong: it's the first thing anyone reads. **Needs the owner.** About fifteen minutes, on the rendered page on GitHub, where the diagrams draw.
- **Nothing else.** The screenshot script is checked by running it twice and diffing the images. The rest is consistency, which the review passes check.

## Open questions for the spec

1. The exact outline of the top layer, and each figure it quotes with its link.
2. The two diagrams' nodes and edges.
3. The screenshot script: which made-up conversation, which views, the viewport, and where the images go.
4. The playbook's stage names, checked against the post.
5. The full list of roadmap dispositions.
