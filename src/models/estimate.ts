import type { CatalogEntry } from "./catalog.js";
import { PRICES_AS_OF } from "./catalog.js";

/**
 * What a paid run would cost, before anything is sent.
 *
 * Offline and without a key. Two figures:
 *
 * - **Expected**, from a workload built out of the prompts the run would
 *   send. A guess, calibrated by the first live call, and printed as one.
 * - **Ceiling**, which is a bound, not a guess: the call cap limits calls,
 *   `max_tokens` limits output, and every admitted model runs with reasoning
 *   off, so there are no hidden thinking tokens. What it can't bound is a
 *   prompt bigger than the largest one built, and the spend stop catches that.
 *
 * Prompt caching is not counted. On today's prompts it saves nothing on
 * Haiku 4.5, and an estimate that assumed a saving would be the wrong way to
 * be wrong.
 */

/**
 * Characters per token for turning prompt text into tokens. Claude's
 * tokenizer runs nearer 3.5 on English, so 3.0 overestimates on purpose.
 * Checked by the smoke script, which prints the real ratio.
 */
export const CHARS_PER_TOKEN = 3.0;

export function tokensFor(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface Workload {
  /** The run as expected to go. */
  expected: { calls: number; inputTokens: number; outputTokens: number };
  /** The most any one call can take: the largest prompt built, and `max_tokens`. */
  perCallCeiling: { inputTokens: number; outputTokens: number };
}

export interface Estimate {
  expected: { calls: number; inputTokens: number; outputTokens: number; usd: number };
  ceiling: { calls: number; inputTokens: number; outputTokens: number; usd: number };
}

export function estimate(
  entry: CatalogEntry,
  workload: Workload,
  options: { maxCalls: number; batch: boolean },
): Estimate {
  const multiplier = options.batch ? (entry.batch ?? 1) : 1;
  const usd = (input: number, output: number) =>
    ((input * entry.price.input + output * entry.price.output) / 1_000_000) * multiplier;

  const e = workload.expected;
  const calls = options.maxCalls;
  const ceilingIn = calls * workload.perCallCeiling.inputTokens;
  const ceilingOut = calls * workload.perCallCeiling.outputTokens;

  return {
    expected: { ...e, usd: usd(e.inputTokens, e.outputTokens) },
    ceiling: {
      calls,
      inputTokens: ceilingIn,
      outputTokens: ceilingOut,
      usd: usd(ceilingIn, ceilingOut),
    },
  };
}

/** Dollars as a person reads them: cents, or tenths of a cent when it's that small. */
export function formatUsd(usd: number): string {
  return usd < 0.1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}

export interface EstimateLabel {
  role: string;
  spec: string;
  scope: string;
  maxUsd: number;
  batch: boolean;
  spentSoFar: { usd: number; lines: number };
}

/** The estimate as printed before any paid run. */
export function formatEstimate(label: EstimateLabel, e: Estimate): string {
  const tokens = (n: number) => n.toLocaleString("en-US");
  return [
    `${label.role} on ${label.spec}${label.batch ? " (batch, half price)" : ""}: ${label.scope}`,
    `  expected  ${e.expected.calls} calls, ${tokens(e.expected.inputTokens)} input and ` +
      `${tokens(e.expected.outputTokens)} output tokens, about ${formatUsd(e.expected.usd)}`,
    `  at most   ${formatUsd(Math.min(e.ceiling.usd, label.maxUsd))}: ${e.ceiling.calls} calls (the cap) ` +
      `at the largest prompt and full output would be ${formatUsd(e.ceiling.usd)}, and the run ` +
      `stops at ${formatUsd(label.maxUsd)} (--max-usd)`,
    `  prices as of ${PRICES_AS_OF}; spent so far on this project ${formatUsd(label.spentSoFar.usd)} ` +
      `over ${label.spentSoFar.lines} paid run(s)`,
  ].join("\n");
}
