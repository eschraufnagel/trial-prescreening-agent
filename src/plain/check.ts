import type { Quantity } from "./extract.js";
import {
  conditionalVerdicts,
  namedTerms,
  negations,
  quantities,
  scopeGroups,
  verdictNegations,
  verdictWords,
} from "./extract.js";

/**
 * Whether a plain-language rendering may be shown beside its criterion (spec
 * §5.2). It compares the two as text and reports every difference it can see,
 * each as a line a person can read at a glance.
 *
 * It does not judge meaning, and it cannot see everything: a dropped clause
 * with nothing it extracts, an "and" turned into an "or", or a wrong
 * explanation all pass. Those are named as known gaps in
 * `tests/plain/check.test.ts`, and they are what the reading gate is for.
 */

export type ProblemCategory =
  | "empty"
  | "quantity"
  | "direction"
  | "anchor"
  | "negation"
  | "named-term"
  | "scope"
  | "verdict";

export interface Problem {
  category: ProblemCategory;
  line: string;
}

export interface CheckResult {
  pass: boolean;
  problems: Problem[];
}

export function checkPlain(criterion: string, plain: string | null): CheckResult {
  if (plain === null || plain.trim().length === 0) {
    return { pass: false, problems: [{ category: "empty", line: "no rendering" }] };
  }
  const problems = [
    ...compareQuantities(quantities(criterion), quantities(plain)),
    ...compareNegations(criterion, plain),
    ...compareNamedTerms(criterion, plain),
    ...compareScope(criterion, plain),
    ...compareVerdict(criterion, plain),
  ];
  return { pass: problems.length === 0, problems };
}

/** Rules 1–3: every quantity both ways, then each shared one's direction and anchor. */
function compareQuantities(original: Quantity[], rendered: Quantity[]): Problem[] {
  const problems: Problem[] = [];
  const unmatched = [...rendered];
  for (const o of original) {
    const i = unmatched.findIndex((r) => r.key === o.key);
    const r = unmatched[i];
    if (r === undefined) {
      problems.push({ category: "quantity", line: `missing: ${o.surface}` });
      continue;
    }
    unmatched.splice(i, 1);
    if (o.direction !== r.direction) {
      problems.push({
        category: "direction",
        line:
          o.direction === null
            ? `direction added to ${o.surface}`
            : r.direction === null
              ? `direction dropped from ${o.direction} ${o.surface}`
              : `direction: ${o.direction} ${o.surface} became ${r.direction} ${r.surface}`,
      });
    }
    if (o.duration && o.anchor !== r.anchor) {
      problems.push({
        category: "anchor",
        line:
          o.anchor === null
            ? `anchor added to ${o.surface}`
            : r.anchor === null
              ? `anchor dropped from ${o.surface} ${o.anchor}`
              : `anchor: ${o.surface} ${o.anchor} became ${r.anchor}`,
      });
    }
  }
  for (const r of unmatched) {
    problems.push({ category: "quantity", line: `added: ${r.surface}` });
  }
  return problems;
}

/**
 * Rule 4: the same number of negations. A count, since code cannot pair them
 * with clauses. When the rendering has no verdict word, the protocol's
 * negations that belong to a verdict ("are not eligible") are not counted: the
 * statement form drops the verdict, and its negation with it. When it keeps a
 * verdict word, everything counts, so "not eligible" cannot become "eligible".
 */
function compareNegations(criterion: string, plain: string): Problem[] {
  const dropsVerdict = verdictWords(plain).length === 0;
  const o = negations(criterion).length - (dropsVerdict ? verdictNegations(criterion).length : 0);
  const r = negations(plain).length;
  return o === r
    ? []
    : [{ category: "negation", line: `negations: ${o} in the protocol, ${r} in the plain` }];
}

/** Rule 5: every named term both ways. */
function compareNamedTerms(criterion: string, plain: string): Problem[] {
  const o = namedTerms(criterion);
  const r = namedTerms(plain);
  return [
    ...o.filter((t) => !r.includes(t)).map((t) => `missing: ${t}`),
    ...r.filter((t) => !o.includes(t)).map((t) => `added: ${t}`),
  ].map((line) => ({ category: "named-term" as const, line }));
}

/** Rule 6: every scope word the criterion has. One way: an addition is for the reader. */
function compareScope(criterion: string, plain: string): Problem[] {
  const r = scopeGroups(plain);
  return scopeGroups(criterion)
    .filter((g) => !r.includes(g))
    .map((g) => ({ category: "scope" as const, line: `missing: ${g}` }));
}

/**
 * Rule 7: no word about taking part unless the criterion uses one of the same
 * family; and a verdict the criterion puts a condition on ("eligible if…")
 * must be kept, since without it a permission reads as a requirement.
 */
function compareVerdict(criterion: string, plain: string): Problem[] {
  const families = new Set(verdictWords(criterion).map((v) => v.family));
  const kept = new Set(verdictWords(plain).map((v) => v.family));
  return [
    ...verdictWords(plain)
      .filter((v) => !families.has(v.family))
      .map((v) => `verdict word: ${v.word}`),
    ...conditionalVerdicts(criterion)
      .filter((v) => !kept.has(v.family))
      .map((v) => `verdict with a condition dropped: ${v.word} ${v.condition}`),
  ].map((line) => ({ category: "verdict" as const, line }));
}

const CATEGORY_WORDS: Partial<Record<ProblemCategory, string>> = {
  quantity: "number",
  "named-term": "term",
  scope: "scope word",
};

/**
 * A problem as a person reads it, on the page and in a retry prompt:
 * "number missing: 100,000/mm^3", "scope word missing: active". Lines that
 * already say what they are about ("direction: …", "negations: …") stand as
 * they are.
 */
export function describeProblem(problem: Problem): string {
  const word = CATEGORY_WORDS[problem.category];
  return word === undefined ? problem.line : `${word} ${problem.line}`;
}
