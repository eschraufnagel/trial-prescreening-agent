# spec: 0012 close-out

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0012-close-out/intent.md`

---

## 1. Summary

The README gets a plain-language top layer for everyone:
- what this is;
- screenshots and a diagram of the product;
- what it found;
- a diagram and account of the AI-native SDLC that built it, with its verification loop.

Today's technical sections follow under "For engineers", with no number changed. A skipped-by-default browser spec makes the screenshots from fake mode and the committed eval run, calling no model. The roadmap is closed. Nothing in the agent, parser, grader, review or page changes.

## 2. Decisions taken before this spec

The owner accepted the intent's recommendations in 2026-09 ("ok, sounds good"), including decision 4's product claim and CI as not doing.

| # | Decision | Here |
| --- | --- | --- |
| D1 | ~~Two layers in one README~~ Superseded at the gate (owner, 2026-09): a short README, with the technical sections moved to `docs/` | §3, §6 |
| D2 | Mermaid diagrams | §4 |
| D3 | Screenshots by a script, committed | §5 |
| D4 | "Helps a person check whether they might fit a trial they're considering, and hands a coordinator the answers"; finding a trial across studies is labelled not built | §3.1 |
| D5 | The playbook linked, its stages used, and the adaptations listed with pointers | §3.4 |
| D6 | Roadmap dispositions, CI as not doing | §7 |
| D7 | Short spec and plan | this |

**The playbook, checked** (https://claude.com/blog/the-ai-native-sdlc-playbook, read 2026-09):
- **Six stages:** Plan, Design, Build, Test, Deploy, Maintain.
- **Artifacts:** `intent.md`, `spec.md`, `plan.md`, PR records with review findings, and `CLAUDE.md`.
- **Principles quoted here:**
  - "Give Claude a feedback loop": every session checks its own work before a human sees it;
  - "Nothing is implemented without an accepted plan";
  - "Humans remain accountable for every decision that requires judgment";
  - "The loop keeps running. Human judgement stays above it."
- **Separation of duties:** agents can't approve their own work.
- **On solo developers:** the post says nothing explicit, beyond steps being modular.

## 3. The top layer

Plain language throughout. Clinical and technical terms are glossed once. No slice numbers except in links. Order:

### 3.1 What this is

Three short paragraphs:
1. **The problem, for anyone:** people considering a clinical trial are screened by a research coordinator, who asks questions the person could often answer themselves, and most turn out not to fit.
2. **What this does:** it helps a person check whether they might fit a trial they're considering. An AI agent asks the trial's eligibility questions in plain language, notes what the answers show and what they don't, and hands a coordinator a review. The coordinator decides; the agent never does.
3. **What it isn't:**
   - A local proof of concept with made-up patients only: no real patient, no messaging, not reviewed by an ethics board.
   - Twelve real lung-cancer trials.
   - **Not built:** finding a trial for someone across many studies. Here the person picks one.

### 3.2 See it work

- **Three screenshots, each with a one-line caption:**
  - the coordinator review of a conversation from the measured run;
  - the conversation as the review shows it;
  - the test page with its panel.
- **The product-flow diagram** (§4.1).
- **Three steps to try it:** `npm install`, `npm run app -- --fake`, then `npm run app` with a local model.

### 3.3 What it found

Five plain bullets. Each figure is one the README already reports below, with its link and its main caveat.

- **Mistakes fell by more than half.** Of the answers the agent treated as settled, about 1 in 7 was wrong at first (24 of 163), and about 1 in 16 after fixes (9 of 144). The fixes cost more "not sure" answers left open. These are made-up patients played by a model, so one run.
- **A conversation can't settle most of a screening.** Only 61 of the 252 requirements in the five studies measured are things a person can answer. The rest need a chart, a test, or the site.
- **Helping a coordinator is argued; replacing one is not.** A reader with only the review caught 10 of the 15 wrong answers, with 1 false alarm in 91. That reader was a model, not a person.
- **Turning a trial's text into questions is the weak link.** Reading the criteria out of the protocol, the parser now passes 120 of 183 answerable facts to the agent, up from 84. It still drops parts of the longest protocol.
- **Every number traces to a committed run**, and the labels and test patients were written by the same AI family being measured. That's the biggest caveat, and it's stated.

### 3.4 How it was built

- **One paragraph:** built with the AI-native SDLC (link), one person working with Claude, in twelve slices. Each slice is an intent, a spec, a plan, a branch and a PR, committed under `work/`, so the history shows the loop running.
- **The SDLC diagram** (§4.2).
- **The six stages as practised here**, one line each:

  | Stage | Here |
  | --- | --- |
  | Plan | `intent.md`: the problem and the decisions, each with a recommendation |
  | Design | `spec.md` |
  | Build | `plan.md`, made in plan mode and committed before any code, in stages separated by human gates |
  | Test | the verification loop, §4.2 |
  | Deploy | review passes and a PR, merged by the owner. Nothing is deployed: it's local by design |
  | Maintain | "Carried forward" in the roadmap, and "Things Claude gets wrong" in `CLAUDE.md` |

- **"The verification loop, in plain words":** before any change is saved, the AI runs the checks itself (types, style, over a thousand fast tests), and saves only if they all pass. A page change also drives the page in a real browser. A change to how the AI behaves is measured by evals, which are slower and kept apart from the tests. When a check fails, the code is fixed, never the check.
- **"Where it bent for one person and a model"**, six short bullets, each with a pointer:
  - **Gates delegated:** The owner kept the decisions that spend money or set a claim and delegated the rest. Each gate record says who decided.
  - **Separation of duties, weakened:** the review passes were run by the same AI that wrote the code. `REVIEW.md` exists to make up for that, and can't fully.
  - **AI-written ground truth:** labels, test patients and plain renderings were written by Claude. The independent checks are held.
  - **Model readers:** the blind reading of the review, and the attributions of wrong answers, were done by a model.
  - **Bars fixed before runs:** what counts as better was written down before each measured run. When a run showed noise, the bar moved in the open, by the owner (0011 Gates 1 and 1a).
  - **What went wrong, kept:**
    - mistakes recorded in `CLAUDE.md` and the plans;
    - held-back data seen too early (0011);
    - measurement that grew past what a proof of concept needed, until the owner stopped it (0011).

## 4. Diagrams

Mermaid, in the README.

### 4.1 Product flow

```
Trial protocol (public registry) → Parser (AI) → Criteria
Person ↔ Screening agent (AI): plain-language questions and answers
Screening agent → per-criterion findings:
  settled from their words / needs the chart / left open
→ Coordinator review → Coordinator decides
```

A note on the diagram: the AI never decides eligibility.

### 4.2 The SDLC with its verification loop

```
Plan (intent.md) → Design (spec.md) → Build (plan.md in plan mode) →
  [stage: write → verify → commit]* → human gate → next stage →
Review passes → PR → the owner merges → Maintain (roadmap, CLAUDE.md) → next Plan
Verify = npm run check (types, lint, tests); + test:e2e for the page; + evals for model behaviour.
Fail → fix the code, not the test → verify again.
```

The verification loop is drawn as its own cycle inside Build/Test. Human gates are drawn above the loop, as the post puts it.

## 5. Screenshots

- **`e2e/screenshots.spec.ts`.** It runs under the existing `playwright.config.ts`, the same fake server on port 5015. It skips unless `SCREENSHOTS=1`, so `npm run test:e2e` lists it as skipped and neither config nor boundary test changes.
- **`npm run screenshots`** is `SCREENSHOTS=1 playwright test e2e/screenshots.spec.ts`.
- **Views, at a 1280×800 viewport:**
  - `docs/images/review.png`: the coordinator review of eval conversation `NCT00077350-v2-labels`, top of the page;
  - `docs/images/transcript.png`: the same review scrolled to its transcript, showing the real agent's questions from 0009's run and a simulated participant's replies;
  - `docs/images/tester.png`: a fake-mode conversation a few answers in, with the tester panel. It shows the scripted stand-in, and the caption says so.
- **Checked by running twice.** Byte-identical images are wanted. If anything time-varying differs, it's masked or the view changed, and the spec says which.
- **The images are looked at before committing.** No real person's words, made-up answers only.

## 6. The engineers' layer

*Superseded at the gate.* The owner, reading the two-layer README (590 lines): "That is the longest README.md file that I've ever seen. No one will read that." The technical sections moved, unchanged, into `docs/`: `running.md` (with the corpus), `parser.md`, `screening-agent.md`, `plain-language.md`, `coordinator-review.md`, `models-and-cost.md` and `limitations.md`. The README (100 lines) keeps what it does, the product diagram, the screenshots, what it found, how it was built, how to try it and an index of the docs. The stage table and two of the six adaptation bullets were cut for length. What follows is the section as first specified.

Today's sections, after an "For engineers" heading, in this order:
1. Try it
2. Checking the page
3. The criteria parser
4. What the harness measures
5. The screening agent
6. Plain language
7. The coordinator review
8. Model providers and cost
9. The corpus
10. Known limitations
11. Not for real use

"What exists so far" is folded into the top. Only headings and the order change, plus these edits:
- the "Augmentation or replacement" section gains one sentence on 0011;
- limitations the roadmap now closes are re-worded as closed.

**Every number stays as it is.** The review checks this with a diff of numbers.

## 7. The roadmap closed

- **The table:**
  - 0012 is **Done**, with its PR;
  - the held comparison stays **Held**;
  - simulator fidelity, more labels, plain-language follow-ups and CI are **Not doing**, each with the intent's reason.
- **"Where the project stands"** is rewritten as closed.
- **Open questions:** question 1 is answered as far as a PoC can.
- **Carried-forward items:** every "a later agent slice", "a later review slice", "a later parser slice" or "a later run" is marked **Not doing**, with "known limitation in the README". Held items stay held. "Carried forward from 0012" is short, since there's nothing after it but the held row.

## 8. The gate

Before the PR, the owner reads the top layer rendered on GitHub, from the pushed branch: does it say what they'd say, to the people they'll send it to? Diagrams, screenshots, claims.

## 9. Out of scope

- Any change to `src/`, the page, the prompts, the grader, the labels or the vignettes.
- Model runs, paid APIs and `.env`.
- New dependencies.
- CI.
