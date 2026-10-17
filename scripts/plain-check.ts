/**
 * Prints each labelled criterion beside its plain-language rendering and what
 * the check says about it, then the numbers the README reports (0006 spec §6).
 *
 *   npm run plain:check                  every labelled study
 *   npm run plain:check -- NCT04316364   one study
 *   npm run plain:check -- --reading     the list the reading gate reads (spec §8)
 *
 * Deterministic and uses no model: it reads the committed renderings and runs
 * the check as it is now. The same files and the same check always give the
 * same numbers, which is what makes a figure in the README traceable.
 */
import { loadLabelSet, loadLabelSets } from "../evals/cases/load.js";
import { fromLabels } from "../evals/screening-input.js";
import type {
  CriterionWords,
  PlainDisplay,
  PlainFile,
  ProblemCategory,
} from "../src/plain/index.js";
import { checkPlain, displayFor, loadPlainFile } from "../src/plain/index.js";

/** The study the reading gate reads whole: never shown at Gate 1 (spec §8). */
export const READING_STUDY = "NCT00077350";

export interface CheckedRow {
  id: string;
  protocol: string;
  display: PlainDisplay;
  /** What the check says about the first attempt now: what a retry would be told. */
  firstAttempt: ProblemCategory[];
  /** What it says about the last attempt: why a rendering is not shown. */
  lastAttempt: ProblemCategory[];
}

export interface Summary {
  criteria: number;
  firstTry: number;
  afterRetry: number;
  notShown: number;
  /** Categories the check finds in first attempts it refuses. */
  refusedFirst: Partial<Record<ProblemCategory, number>>;
  /** Categories in the renderings that are not shown at all. */
  refusedFinal: Partial<Record<ProblemCategory, number>>;
  /** Median and longest length in characters, shown renderings against their criteria. */
  length: {
    plainMedian: number;
    plainLongest: number;
    protocolMedian: number;
    protocolLongest: number;
  };
}

export function checkRows(
  criteria: readonly CriterionWords[],
  file: PlainFile | undefined,
): CheckedRow[] {
  const display = displayFor(criteria, file);
  const byId = new Map((file?.renderings ?? []).map((r) => [r.criterionId, r]));
  return criteria.map((c) => {
    const attempts = byId.get(c.id)?.attempts ?? [];
    const categories = (plain: string | null | undefined) =>
      plain === undefined ? [] : checkPlain(c.text, plain).problems.map((p) => p.category);
    return {
      id: c.id,
      protocol: c.text,
      display: display[c.id] ?? { state: "missing" },
      firstAttempt: categories(attempts[0]?.plain),
      lastAttempt: categories(attempts.at(-1)?.plain),
    };
  });
}

export function summarize(rows: readonly CheckedRow[]): Summary {
  const shown = rows.filter((r) => r.display.state === "shown");
  const count = (list: readonly CheckedRow[], which: "firstAttempt" | "lastAttempt") => {
    const out: Partial<Record<ProblemCategory, number>> = {};
    for (const row of list) {
      for (const category of new Set(row[which])) {
        out[category] = (out[category] ?? 0) + 1;
      }
    }
    return out;
  };
  const lengths = (texts: string[]) => {
    const sorted = texts.map((t) => t.length).sort((a, b) => a - b);
    return { median: sorted[Math.floor(sorted.length / 2)] ?? 0, longest: sorted.at(-1) ?? 0 };
  };
  const plain = lengths(shown.map((r) => (r.display.state === "shown" ? r.display.text : "")));
  const protocol = lengths(shown.map((r) => r.protocol));
  return {
    criteria: rows.length,
    firstTry: shown.filter((r) => r.display.state === "shown" && r.display.attempt === 1).length,
    afterRetry: shown.filter((r) => r.display.state === "shown" && r.display.attempt === 2).length,
    notShown: rows.length - shown.length,
    refusedFirst: count(
      rows.filter((r) => r.firstAttempt.length > 0),
      "firstAttempt",
    ),
    refusedFinal: count(
      rows.filter((r) => r.display.state !== "shown"),
      "lastAttempt",
    ),
    length: {
      plainMedian: plain.median,
      plainLongest: plain.longest,
      protocolMedian: protocol.median,
      protocolLongest: protocol.longest,
    },
  };
}

export interface ReadingItem {
  nctId: string;
  id: string;
  why: "study" | "retry";
}

/** All of the reading study, then every rendering elsewhere that passed only on retry. */
export function readingList(
  studies: ReadonlyArray<{ nctId: string; rows: CheckedRow[] }>,
): ReadingItem[] {
  const out: ReadingItem[] = [];
  for (const { nctId, rows } of studies) {
    for (const row of rows) {
      const retried = row.display.state === "shown" && row.display.attempt === 2;
      if (nctId === READING_STUDY) {
        out.push({ nctId, id: row.id, why: retried ? "retry" : "study" });
      } else if (retried) {
        out.push({ nctId, id: row.id, why: "retry" });
      }
    }
  }
  return out;
}

function formatSummary(label: string, s: Summary): string {
  const categories = (c: Partial<Record<ProblemCategory, number>>) =>
    Object.entries(c)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ") || "none";
  return [
    `${label}: ${s.criteria} criteria`,
    `  shown on the first try  ${s.firstTry}`,
    `  shown after the retry   ${s.afterRetry}`,
    `  not shown               ${s.notShown}`,
    `  first attempts refused for: ${categories(s.refusedFirst)}`,
    `  not shown for: ${categories(s.refusedFinal)}`,
    `  length (chars), shown: plain median ${s.length.plainMedian}, longest ${s.length.plainLongest}; protocol median ${s.length.protocolMedian}, longest ${s.length.protocolLongest}`,
  ].join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const ids = args.filter((a) => /^NCT\d{8}$/i.test(a)).map((a) => a.toUpperCase());
  const labelSets = ids.length === 0 ? loadLabelSets() : ids.map((id) => loadLabelSet(id));
  const studies = labelSets.map((labels) => {
    const file = loadPlainFile(labels.nctId);
    return {
      nctId: labels.nctId,
      promptVersion: file?.run.promptVersion ?? "none",
      rows: checkRows(fromLabels(labels), file),
    };
  });

  if (args.includes("--reading")) {
    for (const item of readingList(studies)) {
      console.log(`${item.nctId}  ${item.id.padEnd(4)}  ${item.why}`);
    }
    return;
  }

  for (const { nctId, promptVersion, rows } of studies) {
    console.log(`\n=== ${nctId} (prompt ${promptVersion})\n`);
    for (const row of rows) {
      const d = row.display;
      const verdict =
        d.state === "shown"
          ? d.attempt === 1
            ? "shown"
            : "shown after retry"
          : d.state === "failed"
            ? `not shown: ${d.problems.join("; ")}`
            : `not shown: ${d.state}`;
      console.log(`${row.id}  ${verdict}`);
      console.log(`  protocol: ${row.protocol}`);
      if (d.state === "shown") {
        console.log(`  plain:    ${d.text}`);
      }
    }
    console.log(`\n${formatSummary(nctId, summarize(rows))}`);
  }
  if (studies.length > 1) {
    console.log(`\n${formatSummary("All studies", summarize(studies.flatMap((s) => s.rows)))}`);
  }
}

if (import.meta.main) {
  main();
}
