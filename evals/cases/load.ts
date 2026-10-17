import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTrial } from "../../src/trials/index.js";
import type { LabelledCriterion, LabelProvenance, LabelSet, NotCriterion } from "./types.js";
import { LabelError } from "./types.js";

/**
 * Reads hand-authored label sets and refuses anything it cannot trust.
 *
 * Validation is heavier here than for a fixture written by our own script,
 * because these files are edited by a person across several sittings. The
 * faults worth catching are the ones that stay plausible: an offset that no
 * longer matches its quote, a label written against a protocol version that
 * has since been refetched, two labels claiming the same id.
 *
 * Hand-written in the style of `src/trials/validate.ts`: every problem
 * collected before throwing, so a file with six faults takes one run to
 * diagnose.
 */
const DEFAULT_DIR = fileURLToPath(new URL("./labels", import.meta.url));

const TYPES: readonly string[] = ["patient", "clinical", "definitional", "protocol"];
const POLARITIES: readonly string[] = ["inclusion", "exclusion"];

export function criteriaTextSha(criteriaText: string): string {
  return createHash("sha256").update(criteriaText).digest("hex");
}

/** Every committed label set, in filename order. */
export function loadLabelSets(dir: string = DEFAULT_DIR): LabelSet[] {
  let names: string[];
  try {
    names = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    throw new LabelError(`Cannot read label directory ${dir}`, [
      "directory does not exist or is not readable",
    ]);
  }

  return names.map((name) => loadLabelSet(name.replace(/\.json$/, ""), dir));
}

export function loadLabelSet(nctId: string, dir: string = DEFAULT_DIR): LabelSet {
  const path = join(dir, `${nctId}.json`);

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new LabelError(`Missing label set ${path}`, [
      `no labels for ${nctId}; run \`npm run label:criteria -- ${nctId}\` to start one`,
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new LabelError(`Malformed JSON in ${path}`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  return validateLabelSet(parsed, path, nctId);
}

export function validateLabelSet(value: unknown, source: string, expectedId?: string): LabelSet {
  const record = asRecord(value);
  if (record === undefined) {
    throw new LabelError(`Invalid label set ${source}`, ["file does not contain a JSON object"]);
  }

  const problems: string[] = [];

  const nctId = record["nctId"];
  if (typeof nctId !== "string" || nctId.length === 0) {
    problems.push("nctId is missing or not a non-empty string");
  } else if (expectedId !== undefined && nctId !== expectedId) {
    problems.push(`file is named ${expectedId} but labels ${nctId}`);
  }

  if (typeof record["labelledAt"] !== "string") {
    problems.push("labelledAt is missing or not a string");
  }

  const sha = record["criteriaTextSha"];
  if (typeof sha !== "string" || !/^[0-9a-f]{64}$/.test(sha)) {
    problems.push("criteriaTextSha is missing or not a sha-256 hex digest");
  }

  // Everything below indexes the fixture's text, so it is only checkable once
  // the study is known to exist.
  const criteriaText = readCriteriaText(typeof nctId === "string" ? nctId : "", problems);

  if (criteriaText !== undefined && typeof sha === "string") {
    const actual = criteriaTextSha(criteriaText);
    if (actual !== sha) {
      problems.push(
        `criteriaTextSha does not match the fixture: labels were written against different text. ` +
          `Expected ${actual.slice(0, 12)}…, file says ${sha.slice(0, 12)}…. ` +
          "Re-check the labels against the current protocol rather than updating the hash.",
      );
    }
  }

  const provenance = readProvenance(record["provenance"], problems);
  const criteria = readCriteria(record["criteria"], criteriaText, problems);
  const notCriteria = readNotCriteria(record["notCriteria"], criteriaText, problems);

  if (problems.length > 0) {
    throw new LabelError(`Invalid label set ${source}`, problems);
  }

  return {
    nctId: nctId as string,
    labelledAt: record["labelledAt"] as string,
    criteriaTextSha: sha as string,
    ...(provenance === undefined ? {} : { provenance }),
    criteria,
    notCriteria,
  };
}

/**
 * Optional, but validated when present: a half-filled provenance block would
 * be worse than none, since it would look like a record of something.
 */
function readProvenance(value: unknown, problems: string[]): LabelProvenance | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asRecord(value);
  if (record === undefined) {
    problems.push("provenance is not an object");
    return undefined;
  }

  const drafter = record["drafter"];
  const guide = record["guide"];
  const sawParse = record["sawParse"];
  const note = record["note"];

  if (typeof drafter !== "string" || drafter.length === 0) {
    problems.push("provenance.drafter is missing or not a non-empty string");
  }
  if (typeof guide !== "string" || guide.length === 0) {
    problems.push("provenance.guide is missing or not a non-empty string");
  }
  if (typeof sawParse !== "boolean") {
    problems.push("provenance.sawParse is missing or not a boolean");
  }
  if (note !== undefined && typeof note !== "string") {
    problems.push("provenance.note is not a string");
  }

  if (typeof drafter !== "string" || typeof guide !== "string" || typeof sawParse !== "boolean") {
    return undefined;
  }

  return { drafter, guide, sawParse, ...(typeof note === "string" ? { note } : {}) };
}

function readCriteriaText(nctId: string, problems: string[]): string | undefined {
  if (nctId.length === 0) {
    return undefined;
  }
  try {
    return getTrial(nctId).eligibility.criteriaText;
  } catch (error) {
    problems.push(`cannot read the trial fixture: ${error instanceof Error ? error.message : ""}`);
    return undefined;
  }
}

function readCriteria(
  value: unknown,
  criteriaText: string | undefined,
  problems: string[],
): LabelledCriterion[] {
  if (!Array.isArray(value)) {
    problems.push("criteria is missing or not an array");
    return [];
  }

  const out: LabelledCriterion[] = [];
  const seenIds = new Set<string>();

  value.forEach((entry, index) => {
    const record = asRecord(entry);
    if (record === undefined) {
      problems.push(`criteria[${index}] is not an object`);
      return;
    }

    const id = record["id"];
    const where = typeof id === "string" ? `criteria ${id}` : `criteria[${index}]`;

    if (typeof id !== "string" || id.length === 0) {
      problems.push(`${where}: id is missing or not a non-empty string`);
    } else if (seenIds.has(id)) {
      // Results reference labels by id; two labels sharing one would make a
      // miss and a match indistinguishable in the diagnostics.
      problems.push(`${where}: duplicate id`);
    } else {
      seenIds.add(id);
    }

    const polarity = record["polarity"];
    if (typeof polarity !== "string" || !POLARITIES.includes(polarity)) {
      problems.push(`${where}: polarity ${describe(polarity)} is not one of ${POLARITIES}`);
    }

    const type = record["type"];
    if (typeof type !== "string" || !TYPES.includes(type)) {
      problems.push(`${where}: type ${describe(type)} is not one of ${TYPES}`);
    }

    const span = readSpan(record, criteriaText, where, problems);
    const note = record["note"];
    if (note !== undefined && typeof note !== "string") {
      problems.push(`${where}: note is not a string`);
    }

    if (span !== undefined && typeof id === "string") {
      out.push({
        id,
        quote: span.quote,
        start: span.start,
        end: span.end,
        polarity: polarity as LabelledCriterion["polarity"],
        type: type as LabelledCriterion["type"],
        ...(typeof note === "string" ? { note } : {}),
      });
    }
  });

  return out;
}

function readNotCriteria(
  value: unknown,
  criteriaText: string | undefined,
  problems: string[],
): NotCriterion[] {
  if (!Array.isArray(value)) {
    problems.push("notCriteria is missing or not an array");
    return [];
  }

  const out: NotCriterion[] = [];

  value.forEach((entry, index) => {
    const record = asRecord(entry);
    if (record === undefined) {
      problems.push(`notCriteria[${index}] is not an object`);
      return;
    }

    const where = `notCriteria[${index}]`;
    const span = readSpan(record, criteriaText, where, problems);

    // An empty `why` is how a freshly generated skeleton looks, so it is not a
    // fault here. `assertLabellingComplete` is what refuses a half-done file,
    // and it is called when a label set is used to measure something.
    const why = record["why"];
    if (typeof why !== "string") {
      problems.push(`${where}: why is missing or not a string`);
    }

    if (span !== undefined && typeof why === "string") {
      out.push({ quote: span.quote, start: span.start, end: span.end, why });
    }
  });

  return out;
}

/** A span whose quote is checked against the protocol text it claims to cite. */
function readSpan(
  record: Record<string, unknown>,
  criteriaText: string | undefined,
  where: string,
  problems: string[],
): { quote: string; start: number; end: number } | undefined {
  const quote = record["quote"];
  const start = record["start"];
  const end = record["end"];

  if (typeof quote !== "string" || quote.length === 0) {
    problems.push(`${where}: quote is missing or not a non-empty string`);
    return undefined;
  }
  if (typeof start !== "number" || !Number.isInteger(start) || start < 0) {
    problems.push(`${where}: start is not a non-negative integer`);
    return undefined;
  }
  if (typeof end !== "number" || !Number.isInteger(end) || end <= start) {
    problems.push(`${where}: end is not an integer greater than start`);
    return undefined;
  }

  if (criteriaText !== undefined) {
    if (end > criteriaText.length) {
      problems.push(`${where}: end ${end} is past the end of the criteria text`);
      return undefined;
    }
    const actual = criteriaText.slice(start, end);
    if (actual !== quote) {
      // The fault that stays plausible: an offset edited without the quote, or
      // the reverse. Both still look like a label.
      problems.push(
        `${where}: quote does not match the text at ${start}-${end}. ` +
          `Text says ${JSON.stringify(truncate(actual))}, label says ${JSON.stringify(truncate(quote))}`,
      );
      return undefined;
    }
  }

  return { quote, start, end };
}

/**
 * Refuses a label set that has not been labelled yet.
 *
 * A generated skeleton is a valid file with every passage sitting in
 * `notCriteria` and no reason written. Grading against one would report
 * perfect precision and zero recall and look like a catastrophic parser
 * failure rather than an unfinished afternoon.
 */
export function assertLabellingComplete(labels: LabelSet): void {
  const problems: string[] = [];

  if (labels.criteria.length === 0) {
    problems.push("no criteria are labelled; this looks like an untouched skeleton");
  }

  const unexplained = labels.notCriteria.filter((entry) => entry.why.trim().length === 0);
  if (unexplained.length > 0) {
    problems.push(
      `${unexplained.length} passage(s) in notCriteria have no reason written, starting at ` +
        `${unexplained[0]?.start}: ${JSON.stringify(truncate(unexplained[0]?.quote ?? ""))}`,
    );
  }

  if (problems.length > 0) {
    throw new LabelError(`Label set for ${labels.nctId} is not finished`, problems);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function describe(value: unknown): string {
  return value === undefined ? "(missing)" : JSON.stringify(value);
}

function truncate(text: string, limit = 60): string {
  const flat = text.replace(/\s+/g, " ");
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}
