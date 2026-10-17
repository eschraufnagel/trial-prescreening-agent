import { buildUserPrompt, normalize, SYSTEM_PROMPT } from "../src/criteria/index.js";
import type { Workload } from "../src/models/index.js";
import { tokensFor } from "../src/models/index.js";
import type { Trial } from "../src/trials/index.js";
import { getTrial } from "../src/trials/index.js";

/**
 * The parser eval's workload, for the estimate printed before a paid run.
 *
 * Input is exact up to the characters-per-token ratio: it is the real system
 * prompt and the real user prompt for each study. Output is a guess, twice the
 * criteria text's tokens, because a parse quotes the text back and adds a
 * type and polarity to each piece. The first live run calibrates it. The
 * ceiling doesn't guess: it is `max_tokens` per call.
 */

/** `parseCriteria`'s default `maxOutputTokens`, which the eval uses. */
export const PARSER_MAX_OUTPUT_TOKENS = 16_384;

export function parserWorkload(studies: readonly string[]): Workload {
  return parserWorkloadFor(studies.map((nctId) => getTrial(nctId)));
}

/**
 * The same, for trials in hand rather than pinned ones: `parse:criteria
 * --trial-file` reads a trial the corpus doesn't hold (slice 0015).
 */
export function parserWorkloadFor(trials: readonly Trial[]): Workload {
  const prompts = trials.map((trial) => {
    const text = normalize(trial.eligibility.criteriaText).text;
    return {
      input: tokensFor(SYSTEM_PROMPT) + tokensFor(buildUserPrompt(trial, text)),
      output: 2 * tokensFor(text),
    };
  });
  return {
    expected: {
      calls: prompts.length,
      inputTokens: sum(prompts.map((p) => p.input)),
      outputTokens: sum(prompts.map((p) => p.output)),
    },
    perCallCeiling: {
      inputTokens: Math.max(0, ...prompts.map((p) => p.input)),
      outputTokens: PARSER_MAX_OUTPUT_TOKENS,
    },
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
