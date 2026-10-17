import { hashPrompt } from "../criteria/prompt.js";

/**
 * The prompt that rewords one criterion in plain language.
 *
 * It carries the check's rules (spec §5.2) as instructions from the start,
 * before the check exists, so that the prompt Gate 1 reads is the prompt the
 * full run uses unless Gate 1 changes it.
 *
 * ## Why the examples come from outside the corpus
 *
 * They are hand-written, in the house style of protocols that are not among
 * the twelve, as the parser's are. An example drawn from a labelled study would
 * put part of the reading gate's material into the prompt. A test fails if any
 * example's criterion appears in a corpus study's eligibility text.
 *
 * ## Why the criterion's polarity is not given
 *
 * A model told "exclusion" tends to write a rule ("You cannot take part if…").
 * A rendering restates the statement, and the page shows polarity beside it.
 */

export const EXAMPLES: ReadonlyArray<{ criterion: string; plain: string }> = [
  {
    criterion: "Absolute lymphocyte count >= 800/mm^3 within 10 days before the first dose",
    plain:
      "A blood test within 10 days before the first dose shows an absolute lymphocyte count (a kind of white blood cell) of at least 800/mm^3.",
  },
  {
    criterion:
      "Completion of any prior immunotherapy at least 6 weeks before the first dose of study drug",
    plain:
      "Finished any prior immunotherapy (treatment that uses the immune system against cancer) at least 6 weeks before the first dose of the study drug.",
  },
  {
    criterion:
      "No history of interstitial lung disease, unless it was caused by radiation and has fully resolved",
    plain:
      "Has no history of interstitial lung disease (scarring or swelling of the lung tissue), unless it was caused by radiation and has fully gone away (resolved).",
  },
  {
    criterion: "Known hypersensitivity to cetuximab",
    plain: "Is known to be allergic to cetuximab (known hypersensitivity).",
  },
];

export const SYSTEM_PROMPT = `You reword one clinical trial eligibility criterion in plain language, for a reader with no medical training.

The rewording is shown next to the original. It helps the reader understand the original; it never replaces it. So it must say exactly the same thing in easier words.

## Rules

- Restate the same statement. Do not turn it into a rule about who can take part. "Pregnant" becomes "Is pregnant", never "Cannot be pregnant" or "You can't join if pregnant".
- Leave out the subject, or keep the original's. "Patients must have..." may become "Must have...". Never write "you" or "your".
- Never write eligible, eligibility, qualify, take part, participate, join, enroll, allowed, excluded or included unless the original uses that word.
- Keep every number as digits, exactly as written, with its unit exactly as written ("100,000/mm^3", "1.5 x 10^9/L", "4 weeks").
- Keep the direction of every comparison. ">=" becomes "at least" or "or more"; "<=" becomes "no more than" or "or less"; ">" becomes "more than"; "<" becomes "less than". "Within 4 weeks" stays "within 4 weeks".
- Keep whether a time is before or after something ("prior to" may become "before").
- Do not change when something is true. "Has" stays "Has", not "Has had". When the original has no verb, add "Has" or "Is", and say "Has had" only if the original says previous, prior or history.
- Keep every negation: not, no, without, never, none, except, unless. Keep the same number of them. A double negative stays a double negative.
- Keep every drug name, gene, biomarker, variant and abbreviation exactly as written (EGFR, T790M, PD-L1, ECOG, RECIST, pembrolizumab). Do not add abbreviations the original does not have.
- Keep these words when the original has them, because they change what is required: active, prior, previous, current, any, all, only, alone, known, suspected, confirmed, documented, symptomatic, asymptomatic, uncontrolled, untreated, stable, significant, or.
- Replace other medical words with plain ones when that helps, and put the original word in parentheses after the plain words: "confirmed by examining a tissue sample (histologically)". Explain briefly. Do not add facts, conditions or advice that are not in the original.
- An explanation must never use not, no, never, without or cannot. Say what something is, not what it is not: "(the heart pumps weakly)", not "(the heart does not pump well)". Do not explain a word that starts with un- or non-; keep it as it is.
- One to three short sentences.

## Examples

${EXAMPLES.map((e) => `Original: ${e.criterion}\n{"plain": ${JSON.stringify(e.plain)}}`).join("\n\n")}

Return JSON only: {"plain": "<the rewording>"}`;

export const RETRY_TEMPLATE =
  "Your earlier rewording did not pass a check that compares it with the original. " +
  "Write it again, fixing only what the check found.";

/** Hash of everything the rendering call is told. Recorded on every renderings file. */
export const PLAIN_PROMPT_VERSION = hashPrompt([SYSTEM_PROMPT, RETRY_TEMPLATE].join("\n---\n"));

export function buildUserPrompt(criterionText: string): string {
  return `Original: ${criterionText}`;
}

export function buildRetryPrompt(
  criterionText: string,
  earlier: string,
  problems: readonly string[],
): string {
  return [
    buildUserPrompt(criterionText),
    "",
    `Your earlier rewording: ${earlier}`,
    "",
    "The check found:",
    ...problems.map((p) => `- ${p}`),
    "",
    RETRY_TEMPLATE,
  ].join("\n");
}
