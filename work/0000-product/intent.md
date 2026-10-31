# intent: trial-prescreening-agent

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** Product-level. Every subsequent `work/NNNN-*/intent.md` describes one change to what this defines.

---

## Problem

Clinical research coordinators spend a large share of their week on prescreening conversations, and most of those conversations end in "not eligible." The work is high-volume, repetitive, and structurally low-yield, but it cannot be skipped: someone has to establish whether a prospective participant clears the protocol's criteria before anything else happens.

Two things make it worse than it needs to be.

First, eligibility criteria are unstructured prose. ClinicalTrials.gov, the canonical public registry, returns a study's inclusion and exclusion criteria as a single free-text block. There is no structured representation to reason against, so every site builds its own mental or spreadsheet version of the same protocol. Nothing downstream can automate against criteria that only exist as paragraphs.

Second, most of the prescreening conversation is answerable by the patient. Age, prior treatment history, current medications, willingness to travel: none of that requires chart review. It requires someone to ask, wait, and write down the answer. That is the part consuming coordinator hours, and it is the part least dependent on clinical judgment.

The published evidence that this is addressable is thin but real. The NIH's TrialGPT work (Jin et al., *Nature Communications* 2024) reported a 42.6% reduction in screening time in a user study, with criterion-level matching accuracy of 87.3% against expert performance of 88.7% to 90.0%. That is a research result on a frontier model, not a product, and it is the reference point this project measures itself against rather than a claim it inherits.

The open question this project exists to explore is not whether an LLM can hold a prescreening conversation. It plainly can. The question is whether the output can be made trustworthy enough for a coordinator to act on, and what it takes to demonstrate that.

## Proposed outcome

A local, runnable proof of concept with three parts:

1. **A criteria parser** that converts a trial's free-text eligibility block into structured criteria objects, each categorized and marked by whether a patient could answer it themselves.
2. **A screening agent** that conducts a multi-turn conversation driven by those criteria and produces a per-criterion determination with the evidence that supported it, including an explicit "cannot determine" state.
3. **An eval harness** that measures both, with results reported in the README.

The eval harness is the primary artifact. The agent exists to give the harness something to measure. A conversational demo with no measurement layer is not the thing being built here.

The secondary artifact is the development process itself. The repository follows the AI-Native SDLC playbook: every change begins with a committed `intent.md`, proceeds through `spec.md` and `plan.md`, and lands as a single reviewed PR. The git history is intended to be legible as a demonstration of that loop, and the README will document where the playbook was adapted for a solo project and why.

Done looks like: a coordinator-facing review pane showing a completed screening with per-criterion determinations, a README reporting what the harness measured including where the system fails, and a `work/` directory whose commit history shows the loop running seven times.

## Affected users and systems

**Primary user: the research coordinator.** Receives a completed prescreening as a reviewable summary rather than conducting it. Sees every determination with its supporting evidence and can see which criteria the system could not resolve. The coordinator is the decision-maker in this design; the system produces a recommendation, never a disposition.

**Secondary participant: the prospective trial participant.** The person the conversation serves. Interacts through a short-message conversation. Simulated in this project; no real person is contacted at any point. When they ask what something means, why it is asked or what happens next, the agent responds before moving on, and an answer given before they understood the question isn't recorded. *(Rewritten in slice 0021. It said only that the participant is secondary and simulated, and nothing measured whether they were helped.)*

**Systems touched:**
- ClinicalTrials.gov API v2, read-only, used once to build a frozen local corpus of oncology trials. No live dependency at runtime.
- A local model runtime, accessed through a swappable adapter so that a frontier model can be substituted without touching calling code.
- A local web application providing the conversation thread and the coordinator review pane.

**Systems deliberately not touched:** no EHR, no CTMS, no site systems, no SMS or telecom infrastructure, no cloud deployment, no patient-facing production surface of any kind.

## Constraints

These scope the project to a proof of concept and are binding.

- **Local only.** Runs on a single developer machine. No hosting, no cloud services, nothing to operate.
- **Synthetic data only.** No PHI exists in the repository or in any runtime path. Patient cases are hand-authored or generated.
- **No real patient contact.** The messaging surface is a web application that models short-message constraints (brief payloads, free-text replies, out-of-order answers, resumable conversations). No SMS, no Twilio, no carrier integration.
- **Not IRB-reviewed and not production-capable.** Recruitment and prescreening language in a real system is an IRB-approved artifact that cannot be freely generated. This project does not simulate that approval and is not suitable for use with real participants.
- **Coordinator-in-the-loop by design.** The agent produces a recommendation and hands off. It does not make an eligibility determination, and it abstains rather than guesses when a criterion cannot be resolved.
- ~~**Scoped to oncology, single condition.** Non-small cell lung cancer.~~ **Scoped to oncology, measured on one condition** (amended in 0013). Non-small cell lung cancer is what everything is measured on. Oncology criteria are harder than most (performance status, prior lines of therapy, biomarker status, washout windows, RECIST measurability) and this is a deliberate choice, accepted knowing it forecloses reuse of the n2c2 diabetes-labeled cohort.
- ~~**Frozen trial corpus.** A small set of real published protocols, committed as fixtures. Breadth is not the point.~~ **Frozen measured corpus** (amended in 0013). A small set of real published protocols, committed as fixtures, is what the evals measure against. Breadth is not the point of the measurement.
- ~~**Cost ceiling.** Local model is the default. Frontier model calls are confined to the comparison slice and release-gating evals.~~ **Cost ceiling** (amended in 0017). The local model is the default. A hosted model is used only when someone chooses it: in the eval scripts with `--spend`, or in the app's Settings with a key saved there, each screening and trial read capped in dollars.
- **Built in slices.** One `intent.md`, `spec.md`, `plan.md`, branch, and PR per slice. No single change spans the whole system.

**Amended in 0013 (2026-10, owner).** The aim was always a screener for any oncology trial, and the pinned corpus served the measurement. From slice 0013, a person adds any trial to the app by its ClinicalTrials.gov link. The app fetches it from the registry at that moment, which is the one runtime network call, and parses it with the local model. An added trial is unmeasured, and the app says so. Other conditions stay out of scope, though nothing refuses one. The struck lines above are the original wording.

**Amended in 0017 (2026-10, owner).** Most people who open the repository can't run the local model, so the app's Settings screen lets a person choose Anthropic, OpenAI or xAI and save a key on their own machine. With one chosen, what a person types in a screening, and the rules of a trial they add, are sent to that provider. The page says so wherever it matters, and a result made that way is marked unmeasured, because every reported number is the local model's. The local model stays the default, the keys never leave the machine except to their own provider, and nothing is hosted. The struck line above is the original wording.

**Explicitly out of scope:** production deployment, SMS delivery, IRB submission, BAA, A2P registration, 21 CFR Part 11 records, GDPR, multi-condition support, autonomous outreach, patient acquisition of any kind.

## Open questions

1. **Augmentation or replacement.** This document argues augmentation, and the review pane assumes it. The stronger commercial claim is that AI replaces prescreening headcount outright. Whether this project makes that argument, and on what evidence, is unresolved. It probably cannot be settled by a PoC, but the framing should be chosen deliberately rather than by default.

2. **Criteria schema.** The working schema splits inclusion and exclusion, categorizes each criterion, and marks patient-answerability. Whether patient-answerability is a model output or derived deterministically from category is open, as is whether the schema needs a type field distinguishing genuine patient criteria from protocol constraints and definitional clauses that appear in the same text block.

3. **Primary eval metric.** Accuracy against a hand-authored golden set requires building that set. Self-consistency across repeated runs requires no ground truth and may be the more useful measure of trustworthiness. Possibly both. This determines the scope of slice 0003.

4. **Local model.** Not yet pinned. Candidate is a quantized 30B-class model via MLX on Apple Silicon. Pinned in slice 0002 with model, quantization, temperature, and seed recorded, since the comparison slice depends on it.

5. **Corpus size.** Enough trials to vary criteria style, few enough to review by hand. Likely 10 to 20.

6. **Golden set source.** Hand-authored patient vignettes tied to specific criteria, versus generated cases, versus both.
