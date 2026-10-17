import type { Criterion, ParsedCriteria } from "../criteria/types.js";
import type { ScreeningCriterion } from "./types.js";

/**
 * The agent's criteria from a parse. Measurement uses it to screen from
 * cached parses (slice 0004), and the app uses it for a trial added by link
 * (slice 0013). It moved here from `evals/screening-input.ts` in 0013, because
 * `src/` may not import `evals/`; that file re-exports it unchanged.
 */

export interface ParseInput {
  criteria: ScreeningCriterion[];
  /**
   * Each parsed criterion object to the ordinal id the agent saw, by identity,
   * so the grader can map a finding back through 0003's matcher.
   */
  ids: Map<Criterion, string>;
}

/**
 * From a parse, with ordinal ids. The parser lets several criteria share one
 * source span, and those share a span-derived id, which the agent needs to be
 * unique.
 */
export function fromParse(parsed: ParsedCriteria): ParseInput {
  const ids = new Map<Criterion, string>();
  const criteria = parsed.criteria.map((c, i) => {
    const id = `P${i + 1}`;
    ids.set(c, id);
    return { id, polarity: c.polarity, type: c.type, text: c.text.replace(/\s+/g, " ").trim() };
  });
  return { criteria, ids };
}
