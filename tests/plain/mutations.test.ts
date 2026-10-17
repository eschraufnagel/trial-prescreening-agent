import { describe, expect, it } from "vitest";
import { loadLabelSets } from "../../evals/cases/load.js";
import { fromLabels } from "../../evals/screening-input.js";
import {
  namedTerms,
  negations,
  quantities,
  scopeGroups,
  verdictWords,
} from "../../src/plain/extract.js";
import type { ProblemCategory } from "../../src/plain/index.js";
import { checkPlain, displayFor, loadPlainFile } from "../../src/plain/index.js";
import { ANCHORS, NEGATIONS, SCOPE_GROUPS } from "../../src/plain/vocabulary.js";

/**
 * The check can fail (spec §10). Every committed rendering the check passes is
 * broken, one way at a time, in each way the check claims to catch, and every
 * broken version must be refused for the right reason.
 *
 * 0002's quote-location net never fired, which proved nothing about whether it
 * worked. This is the opposite: real renderings, deliberately broken. A
 * mutation that passes is a failure here, never a skip.
 */

type Mutation = {
  category: ProblemCategory;
  apply: (criterion: string, plain: string) => string | undefined;
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const word = (w: string) =>
  new RegExp(`(?<![\\w])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "i");

/** Replaces the first phrase in the list that the text has. */
function swapFirst(
  text: string,
  pairs: ReadonlyArray<readonly [string, string]>,
): string | undefined {
  for (const [from, to] of pairs) {
    const pattern = /\w/.test(from)
      ? word(from)
      : new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (pattern.test(text)) {
      return text.replace(pattern, to);
    }
  }
  return undefined;
}

/** Acronyms to swap a named term for, whichever the criterion does not already have. */
const OTHER_TERMS = ["EGFR", "ALK", "KRAS", "HER2"];

const MUTATIONS: Mutation[] = [
  {
    category: "quantity",
    apply: (_, plain) => {
      const first = quantities(plain)[0];
      // The quantity itself, never the same digits inside a code ("2" in "ICF2").
      return first === undefined
        ? undefined
        : plain.replace(new RegExp(`(?<![\\w.,^-])${escapeRegExp(first.surface)}(?![\\w])`), "");
    },
  },
  {
    category: "direction",
    apply: (_, plain) =>
      quantities(plain).some((q) => q.direction !== null)
        ? swapFirst(plain, [
            ["no more than", "at least"],
            ["at least", "at most"],
            ["within", "at least"],
            ["more than", "less than"],
            ["less than", "more than"],
            ["or more", "or less"],
            ["or older", "or younger"],
            ["or less", "or more"],
            ["≥", "≤"],
            ["≤", "≥"],
            [">=", "<="],
            ["<=", ">="],
          ])
        : undefined,
  },
  {
    category: "anchor",
    apply: (_, plain) => {
      // The anchor of a duration ("4 weeks after"), never a before or after elsewhere.
      const duration = quantities(plain).find((q) => q.anchor !== null);
      if (duration === undefined) {
        return undefined;
      }
      const words = ANCHORS.flatMap((a) => a.words).sort((a, b) => b.length - a.length);
      const pattern = new RegExp(
        `(${escapeRegExp(duration.surface)}\\s+)(${words.map(escapeRegExp).join("|")})(?![\\w])`,
        "i",
      );
      const opposite = duration.anchor === "before" ? "after" : "before";
      return pattern.test(plain) ? plain.replace(pattern, `$1${opposite}`) : undefined;
    },
  },
  {
    category: "negation",
    apply: (_, plain) => {
      const count = negations(plain).length;
      for (const n of NEGATIONS) {
        const removed = plain.replace(word(n), "");
        if (negations(removed).length === count - 1) {
          return removed;
        }
      }
      return undefined;
    },
  },
  {
    category: "named-term",
    apply: (criterion, plain) => {
      const term = namedTerms(plain)[0];
      const other = OTHER_TERMS.find((t) => !namedTerms(criterion).includes(t.toLowerCase()));
      return term === undefined || other === undefined
        ? undefined
        : plain.replace(
            new RegExp(
              `(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`,
              "i",
            ),
            other,
          );
    },
  },
  {
    category: "scope",
    apply: (criterion, plain) => {
      const kept = scopeGroups(plain);
      const group = SCOPE_GROUPS.find(
        (g) => scopeGroups(criterion).includes(g[0] as string) && kept.includes(g[0] as string),
      );
      if (group === undefined) {
        return undefined;
      }
      let out = plain;
      for (const w of group) {
        out = out.replace(new RegExp(word(w).source, "gi"), "");
      }
      return out;
    },
  },
  {
    category: "verdict",
    apply: (criterion, plain) =>
      verdictWords(criterion).some((v) => v.word === "you") ? undefined : `For you: ${plain}`,
  },
];

const cases = loadLabelSets().flatMap((labels) => {
  const file = loadPlainFile(labels.nctId);
  if (file === undefined) {
    return [];
  }
  const criteria = fromLabels(labels);
  const display = displayFor(criteria, file);
  return criteria.flatMap((c) => {
    const d = display[c.id];
    return d?.state === "shown"
      ? [{ where: `${labels.nctId} ${c.id}`, criterion: c.text, plain: d.text }]
      : [];
  });
});

describe("the check refuses committed renderings broken on purpose", () => {
  it("has renderings to break", () => {
    expect(cases.length).toBeGreaterThanOrEqual(24);
  });

  for (const mutation of MUTATIONS) {
    it(`refuses every ${mutation.category} mutation`, () => {
      let applied = 0;
      const passed: string[] = [];
      for (const { where, criterion, plain } of cases) {
        const mutated = mutation.apply(criterion, plain);
        if (mutated === undefined || mutated === plain) {
          continue;
        }
        applied += 1;
        const refusedFor = checkPlain(criterion, mutated).problems.map((p) => p.category);
        if (!refusedFor.includes(mutation.category)) {
          passed.push(`${where}: "${mutated}" gave [${refusedFor.join(", ")}]`);
        }
      }
      // A category the corpus never exercises would pass here silently.
      expect(applied).toBeGreaterThanOrEqual(1);
      expect(passed).toEqual([]);
    });
  }
});
