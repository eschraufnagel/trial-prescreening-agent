import type { CriterionPolarity, CriterionType, RejectedCriterion } from "./types.js";
import { CriteriaParseError } from "./types.js";

/**
 * Reads what the model returned, treating all of it as untrusted.
 *
 * Model output is not a fixture written by our own script. It can be the wrong
 * shape, carry a type nobody defined, invent a field, or quote text that does
 * not appear in the source. Hand-written in the style of
 * `src/trials/validate.ts`: every problem collected, nothing coerced to a
 * default, and the offending value kept so a bad parse can be diagnosed
 * without rerunning the model.
 *
 * An unknown `type` rejects the criterion rather than falling back to
 * something plausible. A criterion silently relabelled `clinical` because the
 * model said `lab` is worse than one openly thrown out: 0004 would ask nobody
 * about it and no one would know why.
 */

const TYPES: readonly string[] = ["patient", "clinical", "definitional", "protocol"];
const POLARITIES: readonly string[] = ["inclusion", "exclusion"];

/** One criterion as the model returned it, after shape checking. */
export interface RawCriterion {
  /** Verbatim text from the source, which `locate.ts` must be able to find. */
  quote: string;
  /** The criterion as one testable statement. */
  text: string;
  polarity: CriterionPolarity;
  type: CriterionType;
  appliesTo: string | null;
  confidence: number | null;
}

export interface EnvelopeReadResult {
  valid: RawCriterion[];
  rejected: RejectedCriterion[];
}

/**
 * Pulls the criteria array out of the model's response.
 *
 * Throws when the envelope itself is unreadable, because that is a failure of
 * the whole parse rather than of one criterion. Individual bad entries are
 * returned as rejections: one hallucinated quote does not invalidate the other
 * thirty-nine.
 */
export function readCriteriaEnvelope(content: unknown, context: string): EnvelopeReadResult {
  const record = asRecord(content);
  if (record === undefined) {
    throw new CriteriaParseError(context, ["model response is not a JSON object"]);
  }

  const criteria = record["criteria"];
  if (!Array.isArray(criteria)) {
    throw new CriteriaParseError(context, [
      `model response has no "criteria" array (keys: ${Object.keys(record).join(", ") || "none"})`,
    ]);
  }

  const valid: RawCriterion[] = [];
  const rejected: RejectedCriterion[] = [];

  for (const entry of criteria) {
    const result = readCriterion(entry);
    if ("problems" in result) {
      rejected.push({
        reason: result.problems.join("; "),
        quote: readQuoteForReport(entry),
        raw: entry,
      });
      continue;
    }
    valid.push(result.criterion);
  }

  return { valid, rejected };
}

type CriterionResult = { criterion: RawCriterion } | { problems: string[] };

function readCriterion(entry: unknown): CriterionResult {
  const record = asRecord(entry);
  if (record === undefined) {
    return { problems: ["criterion is not an object"] };
  }

  const problems: string[] = [];

  const quote = record["quote"];
  if (typeof quote !== "string" || quote.trim().length === 0) {
    problems.push("quote is missing or not a non-empty string");
  }

  const text = record["text"];
  if (typeof text !== "string" || text.trim().length === 0) {
    problems.push("text is missing or not a non-empty string");
  }

  const polarity = record["polarity"];
  if (typeof polarity !== "string" || !POLARITIES.includes(polarity)) {
    problems.push(`polarity ${describe(polarity)} is not one of ${POLARITIES.join(", ")}`);
  }

  const type = record["type"];
  if (typeof type !== "string" || !TYPES.includes(type)) {
    problems.push(`type ${describe(type)} is not one of ${TYPES.join(", ")}`);
  }

  const confidence = readConfidence(record["confidence"], problems);
  const appliesTo = readAppliesTo(record["appliesTo"], problems);

  if (problems.length > 0) {
    return { problems };
  }

  return {
    criterion: {
      quote: quote as string,
      text: (text as string).trim(),
      polarity: polarity as CriterionPolarity,
      type: type as CriterionType,
      appliesTo,
      confidence,
    },
  };
}

/**
 * Absent confidence is null, not a default.
 *
 * A number stood in for a missing one would be a claim the model never made,
 * and it would be indistinguishable from one it did make — the same reasoning
 * that makes `seed` and `healthyVolunteers` nullable elsewhere here. A value
 * outside 0-1 is a fault rather than something to clamp: clamping hides a
 * model that has misunderstood the field.
 */
function readConfidence(value: unknown, problems: string[]): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    problems.push(`confidence ${describe(value)} is not a number`);
    return null;
  }
  if (value < 0 || value > 1) {
    problems.push(`confidence ${value} is outside 0-1`);
    return null;
  }
  return value;
}

function readAppliesTo(value: unknown, problems: string[]): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    problems.push(`appliesTo ${describe(value)} is not a string`);
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Best effort at naming the offending criterion in a rejection report. */
function readQuoteForReport(entry: unknown): string | null {
  const quote = asRecord(entry)?.["quote"];
  return typeof quote === "string" && quote.length > 0 ? quote : null;
}

function describe(value: unknown): string {
  if (value === undefined) {
    return "(missing)";
  }
  return typeof value === "string" ? `"${value}"` : String(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
