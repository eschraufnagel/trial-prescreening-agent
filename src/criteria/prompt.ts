import { createHash } from "node:crypto";
import type { Trial } from "../trials/index.js";
import { NORMALIZE_VERSION } from "./normalize.js";

/**
 * The prompt that turns an eligibility block into structured criteria.
 *
 * Versioned by content hash and recorded on every parse. A result compared
 * across slices is meaningless if the prompt changed underneath it, and the
 * prompt is the input most likely to be edited without anyone thinking of it
 * as a change to the experiment.
 *
 * ## Why the type definitions carry their boundary cases
 *
 * The four types are easy to state and hard to apply, and the corpus contains
 * the exact cases that separate them. NCT04316364 requires adequate tissue for
 * central PD-L1 testing without requiring any particular result — logistics
 * wearing biomarker vocabulary, and `protocol` rather than `clinical`. Stating
 * the rule alone leaves the model to guess; stating the rule with the case it
 * decides does not.
 *
 * ## Why the examples come from outside the corpus
 *
 * The prompt has boundary cases and short illustrations, and no few-shot
 * block. Any example has to come from outside the twelve protocols: if one were
 * drawn from the corpus, the parser would have seen part of its own test set,
 * and the eval would be measuring recall of the prompt rather than parsing.
 * Until slice 0011 the alternation example quoted NCT03433469's own words
 * ("exon 19 deletion, T790M, or L858R"). It was replaced with an invented one,
 * and `npm run eval:compare -- --overlap` lists any five-word run the prompt
 * shares with a protocol. The replacement has to keep the example's point, one
 * test with several acceptable answers: a first replacement joining two
 * different findings with "or" made the model bundle every "or" list (0011's
 * dev v1).
 *
 * ## Why `patient` and `clinical` are told apart by the kind of fact
 *
 * Until slice 0011 they were told apart by who could answer: `clinical` if it
 * "requires a chart", `patient` if the participant "could answer". Most prior
 * treatments satisfy both, and the model took the chart's side, typing 22 of
 * them `clinical`. The labels had followed an unwritten rule instead: what was
 * done to or by the person is `patient`, a condition is `clinical`. The rule is
 * now written in `evals/cases/ANNOTATION.md` Rule 3, and here.
 */

export const SYSTEM_PROMPT = `You convert clinical trial eligibility criteria into structured data.

You are given the eligibility section of a real trial protocol. Split it into individual criteria and classify each one. Reply with JSON only.

## Output shape

{"criteria": [
  {
    "quote": "text copied EXACTLY from the input, character for character",
    "text": "the criterion as one self-contained testable statement",
    "polarity": "inclusion" | "exclusion",
    "type": "patient" | "clinical" | "definitional" | "protocol",
    "appliesTo": "the study arm or phase this is limited to, or null",
    "confidence": 0.0 to 1.0
  }
]}

## The quote field

Copy it from the input. Do not fix spelling, expand abbreviations, reflow lines, or tidy punctuation. The quote is checked against the source text; a quote that does not appear there is discarded along with its criterion. Quote the smallest span that contains the whole criterion.

## The four types

- "patient" — who the participant is, what they have done or had done to them, and what they will agree to: age, treatments and medications received or taken now, surgery, radiation, transfusions, vaccines, taking part in other studies, allergic reactions to drugs, pregnancy, breastfeeding, smoking, ability to travel, willingness to consent. These are "patient" even when a medical record would also show them.

- "clinical" — a condition, diagnosis, symptom, test result, measurement or clinician's assessment: ECOG performance status, creatinine clearance, ejection fraction, PD-L1 expression level, histological confirmation, measurable disease by RECIST, a past stroke, asthma. These are "clinical" even when the participant may know them.

- "definitional" — the sentence defines or scopes a term used by other criteria. It asserts nothing about a person and nobody can be screened against it. "For the purposes of this study, a line of therapy is defined as..."

- "protocol" — addressed to the site or the investigator rather than to the participant. Requirements about tissue availability for central testing, site documentation, IRB approval, registration procedures.

Boundary cases that matter:

- A requirement that adequate tissue be available for central testing, with no required result, is "protocol". It is a logistical requirement, not a fact about the patient's disease.
- A requirement that a biomarker test show a particular result is "clinical", even when the patient happens to know the result.
- A sentence that only defines a term used elsewhere is "definitional", even when it mentions patients.
- "Ability to understand and sign informed consent" is "patient".
- A criterion joining a condition with its treatment (a condition that was treated, or one kept under control by a medicine) is "clinical": the condition decides.

## Splitting

- One criterion per testable requirement. A sentence joining two independent requirements with "and" becomes two criteria; an alternation ("blood group A, B, or AB") is one criterion, because it is one test with several acceptable answers.
- Headings such as "Inclusion Criteria:" are not criteria. Skip them.
- The input may be a bulleted list, a numbered list, or unbroken prose with no list markers at all. Find the criteria by meaning, not by punctuation.
- Sub-items sometimes run inline with their parent with no line break. Treat each as its own criterion.
- Where criteria are grouped under a study arm or phase ("Phase I portion", "Arm A"), set "appliesTo" to that label for every criterion in the group. Otherwise set it to null.
- Do not invent criteria, and do not omit ones you find hard to classify. Give a low confidence instead.

## A worked example

The block below is invented and comes from no real protocol. It shows how things done to or by the participant differ from conditions and tests.

Input:
Participants are ineligible if any of the following apply:
(a) took an experimental medicine in the past two months
(b) is presently in another interventional trial
(c) had an allergic reaction to a penicillin antibiotic
(d) has been diagnosed with chronic kidney disease
(e) hemoglobin under 10 g/dL
(f) the clinic must freeze one serum aliquot ahead of dosing

Output:
{"criteria": [
  {"quote": "took an experimental medicine in the past two months", "text": "The participant took an experimental medicine in the past two months", "polarity": "exclusion", "type": "patient", "appliesTo": null, "confidence": 0.9},
  {"quote": "is presently in another interventional trial", "text": "The participant is presently in another interventional trial", "polarity": "exclusion", "type": "patient", "appliesTo": null, "confidence": 0.9},
  {"quote": "had an allergic reaction to a penicillin antibiotic", "text": "The participant had an allergic reaction to a penicillin antibiotic", "polarity": "exclusion", "type": "patient", "appliesTo": null, "confidence": 0.9},
  {"quote": "has been diagnosed with chronic kidney disease", "text": "The participant has chronic kidney disease", "polarity": "exclusion", "type": "clinical", "appliesTo": null, "confidence": 0.9},
  {"quote": "hemoglobin under 10 g/dL", "text": "Hemoglobin is under 10 g/dL", "polarity": "exclusion", "type": "clinical", "appliesTo": null, "confidence": 0.9},
  {"quote": "the clinic must freeze one serum aliquot ahead of dosing", "text": "The clinic freezes one serum aliquot before dosing", "polarity": "inclusion", "type": "protocol", "appliesTo": null, "confidence": 0.8}
]}`;

/** Hash of the system prompt, recorded on every parse. */
export const PROMPT_VERSION = hashPrompt(SYSTEM_PROMPT);

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}

/**
 * Names everything that decides what the parser's model is shown and how it
 * answers: the prompt, the normalization and the reasoning mode (slice 0011).
 *
 * Parses are cached, and screening conversations made from them are keyed, by
 * this. A part is added only when it differs from what 0003 ran with, so the
 * parses made before it keep the names they already have.
 */
export function parseIdentity(parser: { thinking?: "off" }): string {
  return [
    PROMPT_VERSION,
    ...(NORMALIZE_VERSION === "1" ? [] : [`n${NORMALIZE_VERSION}`]),
    ...(parser.thinking === "off" ? ["thinking-off"] : []),
  ].join("-");
}

/**
 * The per-trial message.
 *
 * Carries the registry's own condition and phase alongside the block, because
 * NCT00106626 is a solid-tumour basket whose NSCLC relevance has to be read
 * out of the criteria themselves, and a parser given no context would have to
 * infer what "the study" is from the criteria it is trying to split.
 */
export function buildUserPrompt(trial: Trial, criteriaText: string): string {
  return [
    `Trial: ${trial.nctId}`,
    `Title: ${trial.briefTitle}`,
    `Phase: ${trial.phases.join(", ") || "not stated"}`,
    `Conditions: ${trial.conditions.join("; ") || "not stated"}`,
    "",
    "Eligibility criteria:",
    "",
    criteriaText,
  ].join("\n");
}
