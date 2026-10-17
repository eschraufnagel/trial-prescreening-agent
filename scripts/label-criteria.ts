/**
 * Emits a labelling skeleton for one study, for a person to fill in.
 *
 *   npm run label:criteria -- NCT04316364
 *
 * ## Why this tool cannot see the parser
 *
 * It splits the protocol text into passages and puts every one of them in
 * `notCriteria` with an empty reason. Labelling is the act of promoting
 * passages into `criteria`, splitting a compound passage into several, and
 * writing down why each remaining one is not a criterion.
 *
 * It imports nothing from `src/criteria/parse.ts` and nothing from
 * `src/models/`. A skeleton pre-filled from a parse would make the labels
 * agree with the parser by construction, and every number the harness then
 * produced would be circular — the harness would be measuring whether the
 * parser agrees with itself. `tests/boundary.test.ts` asserts this rather than
 * trusting the comment.
 *
 * Splitting is deterministic and deliberately naive. It is a starting point
 * for a reader, not an opinion about where criteria begin: getting that right
 * is the parser's job and the thing being measured.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { criteriaTextSha } from "../evals/cases/load.js";
import type { LabelSet, NotCriterion } from "../evals/cases/types.js";
// Imported from the module directly, not through `src/criteria/index.js`:
// the barrel re-exports `parseCriteria`, which would pull the parser and the
// model adapter into this tool's import graph. `tests/boundary.test.ts`
// catches that, and caught it here.
import { normalize, toSourceSpan } from "../src/criteria/normalize.js";
import { getTrial } from "../src/trials/index.js";

const LABEL_DIR = fileURLToPath(new URL("../evals/cases/labels", import.meta.url));

/**
 * Below this a passage is punctuation or a stray fragment, not a requirement.
 *
 * Deliberately low. An earlier value of 25 silently dropped
 * `Hemoglobin \>= 9 g/L` from NCT00077350 — a real criterion, short because
 * lab thresholds are terse. A labeller working from the skeleton would never
 * have seen it, the label set would have omitted it, and the parser would have
 * been charged a false positive for finding it correctly. A skeleton that
 * hides criteria corrupts the measurement in the parser's disfavour.
 */
const MIN_PASSAGE_CHARS = 8;

function main(): void {
  const args = process.argv.slice(2);
  const nctId = args.find((arg) => /^NCT\d+$/i.test(arg))?.toUpperCase();

  if (nctId === undefined) {
    console.error("Usage: npm run label:criteria -- <NCT ID>");
    process.exitCode = 1;
    return;
  }

  const path = join(LABEL_DIR, `${nctId}.json`);

  // Never overwrite. The file is hours of human work by the second run.
  if (existsSync(path)) {
    console.error(`${path} already exists. Delete it deliberately if you mean to start over.`);
    process.exitCode = 1;
    return;
  }

  const trial = getTrial(nctId);
  const passages = splitPassages(trial.eligibility.criteriaText);

  const skeleton: LabelSet = {
    nctId,
    // The month only, as every committed record is dated (`monthStamp` in
    // src/models/, which this tool may not import).
    labelledAt: new Date().toISOString().slice(0, 7),
    criteriaTextSha: criteriaTextSha(trial.eligibility.criteriaText),
    criteria: [],
    notCriteria: passages,
  };

  mkdirSync(LABEL_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(skeleton, null, 2)}\n`, "utf8");

  console.log(`Wrote ${path}`);
  console.log(`  ${passages.length} passages, all in notCriteria with no reason written.`);
  console.log(`  ${trial.eligibility.criteriaText.length} characters of source.`);
  console.log("");
  console.log("To label: move a passage into `criteria` with an id, polarity and type.");
  console.log("Split a passage that carries several requirements into one entry each.");
  console.log("Whatever stays in `notCriteria` needs a `why`, or the harness will refuse it.");
}

/**
 * Splits normalized text into candidate passages, mapping each back to the
 * original so labels index the same coordinates the parser's spans use.
 *
 * Line breaks first, since most protocols put one criterion per line; then
 * sentence ends, for the blocks that have no line structure at all. Numbered
 * list markers are kept with their text rather than split off.
 */
export function splitPassages(criteriaText: string): NotCriterion[] {
  const normalized = normalize(criteriaText);
  const out: NotCriterion[] = [];

  let cursor = 0;
  for (const line of normalized.text.split("\n")) {
    const start = cursor;
    cursor += line.length + 1;

    // Headings are what the length filter used to catch. Match them directly
    // instead — but a trailing colon alone is not enough. In NCT04385368 three
    // real exclusion criteria end in a colon because they introduce their own
    // exceptions ("8. Active or prior documented autoimmune or inflammatory
    // disorders (including ...):"), and dropping them hid three requirements
    // from the labeller in the one study with a known parser failure.
    //
    // The discriminator is the list marker: a heading has none, a numbered or
    // bulleted criterion does.
    const trimmed = line.trim();
    const isHeading = trimmed.endsWith(":") && !hasListMarker(trimmed);
    if (trimmed.length < MIN_PASSAGE_CHARS || isHeading) {
      continue;
    }

    for (const [from, to] of sentenceRanges(line)) {
      if (to - from < MIN_PASSAGE_CHARS) {
        continue;
      }
      const span = toSourceSpan(normalized, start + from, start + to);
      if (span !== undefined) {
        out.push({ quote: span.text, start: span.start, end: span.end, why: "" });
      }
    }
  }

  return out;
}

/**
 * Sentence boundaries within one line, trimmed of surrounding whitespace.
 *
 * A period followed by a space and a capital. Deliberately crude: abbreviations
 * and decimals ("1.5 x ULN", "Stage IIIA. Patients") will sometimes split
 * wrongly, and a reader fixes those while labelling. Being clever here would
 * mean writing a criterion splitter, which is the thing under measurement.
 */
function sentenceRanges(line: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = 0;

  for (const match of line.matchAll(/\.\s+(?=[A-Z])/g)) {
    const end = match.index + 1;
    ranges.push(trimRange(line, start, end));
    start = match.index + match[0].length;
  }

  ranges.push(trimRange(line, start, line.length));
  return ranges.filter(([from, to]) => to > from);
}

/** Whether a line opens with the kind of marker a list item carries. */
function hasListMarker(line: string): boolean {
  return LIST_MARKER.test(line);
}

const LIST_MARKER = /^(?:[*\-•]|\d{1,2}\.|[a-z]\.)\s+/;

/**
 * Trims whitespace, and a leading list marker where one is present.
 *
 * Dropping the `* ` or `1. ` keeps a label's span over the criterion's words
 * rather than over the punctuation the protocol used to lay them out, which is
 * how the parser quotes them too. Purely cosmetic alignment: it says nothing
 * about where a criterion begins, which is the judgment under measurement.
 */
function trimRange(line: string, from: number, to: number): [number, number] {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(line[start] ?? "")) {
    start += 1;
  }
  while (end > start && /\s/.test(line[end - 1] ?? "")) {
    end -= 1;
  }

  const marker = LIST_MARKER.exec(line.slice(start, end));
  if (marker !== null) {
    start += marker[0].length;
  }

  return [start, end];
}

if (import.meta.main) {
  main();
}
