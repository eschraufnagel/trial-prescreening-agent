/**
 * Prints vignettes as reading sheets, with warnings about the facts most likely
 * to be wrong.
 *
 *   npm run vignettes:check                 every vignette
 *   npm run vignettes:check -- NCT04316364  one study
 *   npm run vignettes:check -- --warnings   warnings only
 *
 * This is the tool for Gate 1. The question at that gate is whether each
 * expected outcome follows from reading a fact next to its criterion, and that
 * is only answerable if the two are printed next to each other. The warnings
 * point a reader at the facts where the answer is most likely to be no.
 *
 * It reads vignettes and labels and nothing else. It never reaches the agent or
 * a model: a reading sheet shaped by the agent's prompts would be checking the
 * vignettes against the thing they are meant to test.
 */

import { loadLabelSet } from "../evals/cases/load.js";
import type {
  LabelledCriterion,
  LabelSet,
  Vignette,
  VignetteBehavior,
} from "../evals/cases/types.js";
import { loadVignettes } from "../evals/cases/vignettes.js";
import { normalize } from "../src/criteria/normalize.js";

const BEHAVIORS: readonly VignetteBehavior[] = [
  "cooperative",
  "vague",
  "volunteers",
  "contradicts",
  "declines",
];

/**
 * Words too common to show that a fact is about its criterion. Kept short on
 * purpose: this is a nudge toward the facts worth re-reading, not a matcher.
 */
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "any",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "not",
  "who",
  "that",
  "this",
  "from",
  "than",
  "must",
  "been",
  "will",
  "may",
  "other",
  "prior",
  "patients",
  "patient",
  "subjects",
  "history",
  "known",
  "yes",
  "no",
  "i'm",
  "i've",
  "don't",
  "you",
  "your",
  "they",
  "them",
  "about",
  "just",
  "never",
  "ever",
  "all",
  "but",
  "can",
  "did",
  "does",
]);

export interface Warning {
  vignette: string;
  label?: string;
  message: string;
}

/** Lowercased content words, compared on a five-letter prefix so "allergic" meets "allergy". */
export function contentStems(text: string): Set<string> {
  const stems = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z][a-z']+/g) ?? []) {
    if (word.length < 3 || STOPWORDS.has(word)) {
      continue;
    }
    stems.add(word.slice(0, 5));
  }
  return stems;
}

/**
 * Whether a fact visibly speaks to its criterion: a shared content word, or a
 * number on both sides (the compare-a-number form in VIGNETTES.md Rule 2).
 */
export function sharesContent(criterion: string, says: string): boolean {
  if (/\d/.test(criterion) && /\d/.test(says)) {
    return true;
  }
  const a = contentStems(criterion);
  for (const stem of contentStems(says)) {
    if (a.has(stem)) {
      return true;
    }
  }
  return false;
}

export function vignetteWarnings(vignette: Vignette, labels: LabelSet): Warning[] {
  const warnings: Warning[] = [];
  const byId = new Map(labels.criteria.map((l) => [l.id, l]));

  for (const fact of vignette.facts) {
    const label = byId.get(fact.label);
    if (label === undefined) {
      continue;
    }
    // Only facts graded as a determination. A `defer`, vague or ungraded fact
    // is supposed to need interpretation; warning on it would bury the facts
    // where a determination rests on words that do not visibly match.
    const graded =
      fact.expected === "holds" ||
      fact.expected === "does-not-hold" ||
      fact.reported === "holds" ||
      fact.reported === "does-not-hold";
    if (!graded) {
      continue;
    }
    for (const said of [fact.says, fact.laterSays]) {
      if (typeof said === "string" && !sharesContent(normalize(label.quote).text, said)) {
        warnings.push({
          vignette: vignette.id,
          label: fact.label,
          message: `shares no word with its criterion: ${JSON.stringify(said)}`,
        });
      }
    }
  }

  const testsAbstention = vignette.facts.some(
    (f) =>
      f.declines === true ||
      f.laterSays !== undefined ||
      f.expected === "defer" ||
      f.expected === "unresolved",
  );
  if (!testsAbstention) {
    warnings.push({
      vignette: vignette.id,
      message: "no defer, decline, contradiction or unresolved fact: this only tests cooperation",
    });
  }

  return warnings;
}

/** Warnings about the scored set as a whole. */
export function setWarnings(vignettes: readonly Vignette[]): Warning[] {
  const scored = vignettes.filter((v) => !v.dev);
  const warnings: Warning[] = [];

  for (const behavior of BEHAVIORS) {
    const count = scored.filter((v) => v.behavior === behavior).length;
    if (count < 2) {
      warnings.push({
        vignette: "(set)",
        message: `behavior ${behavior} is primary in ${count} vignette(s); the guide asks for at least 2`,
      });
    }
  }

  return warnings;
}

export function renderSheet(vignette: Vignette, labels: LabelSet): string {
  const lines = [
    `━━ ${vignette.id}${vignette.dev ? " (dev, never scored)" : ""} — ${vignette.behavior}`,
    `   ${vignette.persona}`,
    "",
  ];
  const facts = new Map(vignette.facts.map((f) => [f.label, f]));

  for (const label of labels.criteria) {
    const fact = facts.get(label.id);
    if (fact === undefined && label.type !== "patient") {
      continue;
    }
    lines.push(`${label.id.padEnd(4)} ${label.type} · ${label.polarity}`);
    lines.push(`     criterion  ${criterionText(label)}`);
    if (fact === undefined) {
      lines.push("     (no fact)");
    } else {
      lines.push(
        `     says       ${fact.declines === true ? "(declines)" : JSON.stringify(fact.says)}`,
      );
      if (fact.laterSays !== undefined) {
        lines.push(`     later      ${JSON.stringify(fact.laterSays)}`);
      }
      if (fact.expected !== undefined) {
        lines.push(`     expected   ${fact.expected}`);
      }
      if (fact.reported !== undefined) {
        lines.push(`     reported   ${fact.reported}`);
      } else if (fact.expected === undefined) {
        lines.push("     (not graded: shapes the conversation only)");
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function criterionText(label: LabelledCriterion): string {
  return normalize(label.quote).text.replace(/\s+/g, " ").trim();
}

/** How many words in a row a dev fact may share with a scored one before it is flagged. */
export const BORROWED_RUN = 5;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

function runsOf(text: string, n: number): Set<string> {
  const w = words(text);
  const runs = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) {
    runs.add(w.slice(i, i + n).join(" "));
  }
  return runs;
}

/**
 * Dev facts that borrow wording from scored ones (0009 spec §5.2).
 *
 * Dev vignettes are what the agent's prompts are tuned on. A dev fact that
 * repeats a scored fact's words tunes the agent to the test set by another
 * route. This finds exact runs of `BORROWED_RUN` words, case and punctuation
 * aside. It cannot find a paraphrase; a reader does that.
 */
export function borrowedWording(
  dev: readonly Vignette[],
  scored: readonly Vignette[],
  n = BORROWED_RUN,
): Warning[] {
  const scoredRuns = new Map<string, string>();
  for (const v of scored) {
    for (const f of v.facts) {
      for (const said of [f.says, f.laterSays]) {
        if (typeof said === "string") {
          for (const run of runsOf(said, n)) {
            scoredRuns.set(run, `${v.id} ${f.label}`);
          }
        }
      }
    }
  }
  const warnings: Warning[] = [];
  for (const v of dev) {
    for (const f of v.facts) {
      for (const said of [f.says, f.laterSays]) {
        if (typeof said !== "string") {
          continue;
        }
        const shared = [...runsOf(said, n)].find((run) => scoredRuns.has(run));
        if (shared !== undefined) {
          warnings.push({
            vignette: v.id,
            label: f.label,
            message: `borrows "${shared}" from scored ${scoredRuns.get(shared)}`,
          });
        }
      }
    }
  }
  return warnings;
}

function main(): void {
  const args = process.argv.slice(2);
  const study = args.find((a) => /^NCT\d+$/i.test(a))?.toUpperCase();
  const warningsOnly = args.includes("--warnings");

  const vignettes = loadVignettes().filter((v) => study === undefined || v.nctId === study);
  if (vignettes.length === 0) {
    console.log(study === undefined ? "No vignettes yet." : `No vignettes for ${study}.`);
    return;
  }

  const warnings: Warning[] = [];
  for (const vignette of vignettes) {
    const labels = loadLabelSet(vignette.nctId);
    if (!warningsOnly) {
      console.log(renderSheet(vignette, labels));
    }
    warnings.push(...vignetteWarnings(vignette, labels));
  }
  if (study === undefined) {
    warnings.push(...setWarnings(vignettes));
  }
  warnings.push(
    ...borrowedWording(
      vignettes.filter((v) => v.dev),
      loadVignettes().filter((v) => !v.dev),
    ),
  );

  console.log(`${vignettes.length} vignette(s), ${warnings.length} warning(s)`);
  for (const w of warnings) {
    console.log(`  ${w.vignette}${w.label === undefined ? "" : ` ${w.label}`}: ${w.message}`);
  }
}

if (import.meta.main) {
  main();
}
