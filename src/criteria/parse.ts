import { type ModelAdapter, monthStamp } from "../models/index.js";
import type { Trial } from "../trials/index.js";
import { locateQuote } from "./locate.js";
import type { NormalizedText } from "./normalize.js";
import { NORMALIZE_VERSION, normalize } from "./normalize.js";
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt.js";
import type { Criterion, ParsedCriteria, RejectedCriterion, SourceSpan } from "./types.js";
import { CriteriaParseError } from "./types.js";
import type { RawCriterion } from "./validate.js";
import { readCriteriaEnvelope } from "./validate.js";

/**
 * Turns a trial's eligibility block into structured criteria.
 *
 * One model call per trial. The largest block in the corpus is 16KB, roughly
 * 4k tokens, so every study fits in context comfortably — and chunking would
 * cut clauses off from the context that makes them interpretable, since a
 * sub-item under "Dose escalation subjects:" means nothing on its own. The
 * cost of that choice lands on output length rather than input length, which
 * is why truncation is handled explicitly below instead of hoped away.
 *
 * The adapter is passed in rather than constructed here, so that tests supply
 * a fake and slice 0008 supplies a frontier model without touching this file.
 */

/**
 * Forty criteria, each carrying a verbatim quote, is a great deal of output.
 *
 * Set from measurement rather than guesswork: 8192 truncated NCT00743379
 * (14KB, 60 criteria across four cohorts), and 16384 completed it with room
 * left. Truncation remains a hard failure, so a block that outgrows even this
 * is reported rather than silently shortened.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

/**
 * How much unclaimed source counts as worth reporting, measured in
 * non-whitespace characters. Below this, a gap is a heading or a stray colon.
 */
const UNCLAIMED_THRESHOLD = 80;

export interface ParseOptions {
  maxOutputTokens?: number;
}

export async function parseCriteria(
  trial: Trial,
  adapter: ModelAdapter,
  options: ParseOptions = {},
): Promise<ParsedCriteria> {
  const normalized = normalize(trial.eligibility.criteriaText);
  const context = `Cannot parse criteria for ${trial.nctId}`;

  const response = await adapter.complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(trial, normalized.text),
    responseFormat: "json",
    maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  });

  // Truncation is a failed parse, never a short one. A cut-off response drops
  // the exclusion criteria at the end of every long block, and a parse that
  // returned them as "all there was" would be measured by 0003 as model
  // quality rather than as the output-budget problem it is.
  if (response.finishReason === "length") {
    throw new CriteriaParseError(context, [
      `model output was truncated at ${response.usage.outputTokens} tokens`,
      `recovered ${countRecoverable(response.content)} criteria before the cut`,
      "raise maxOutputTokens, or split the block — do not treat this as a parse",
    ]);
  }

  const { valid, rejected } = readCriteriaEnvelope(response.content, context);
  const located = locateAll(valid, normalized, trial.nctId);
  const criteria = located.criteria;
  const allRejected = [...rejected, ...located.rejected];

  // Nothing usable is a failed parse too. An empty result would otherwise look
  // like a trial with no eligibility criteria, which no trial has.
  if (criteria.length === 0) {
    throw new CriteriaParseError(context, [
      "no criterion survived validation",
      `${allRejected.length} were returned and rejected`,
      ...allRejected.slice(0, 3).map((entry) => `e.g. ${entry.reason}`),
    ]);
  }

  return {
    nctId: trial.nctId,
    criteria,
    rejected: allRejected,
    unclaimed: findUnclaimed(trial.eligibility.criteriaText, criteria),
    run: {
      ...adapter.descriptor,
      promptVersion: PROMPT_VERSION,
      normalizeVersion: NORMALIZE_VERSION,
      timestamp: monthStamp(),
    },
  };
}

/**
 * Resolves each quote to a span, in document order.
 *
 * The cursor advances past each match so that a criterion quoted twice in one
 * block resolves to the occurrence that follows the previous one, rather than
 * every mention collapsing onto the first.
 */
function locateAll(
  raw: RawCriterion[],
  normalized: NormalizedText,
  nctId: string,
): { criteria: Criterion[]; rejected: RejectedCriterion[] } {
  const criteria: Criterion[] = [];
  const rejected: RejectedCriterion[] = [];
  /** How many criteria have already been drawn from each span. */
  const perSpan = new Map<string, number>();
  /** Span plus statement, to tell a real restatement from a legitimate split. */
  const seenStatements = new Set<string>();
  let cursor = 0;

  for (const entry of raw) {
    const found = locateQuote(normalized, entry.quote, cursor);

    if (found === undefined) {
      rejected.push({
        reason: "quote does not appear in the source text",
        quote: entry.quote,
        raw: entry,
      });
      continue;
    }

    const spanId = `${nctId}:${found.span.start}-${found.span.end}`;
    const statement = `${spanId}::${entry.text.trim().toLowerCase()}`;

    // Only an actual restatement is a duplicate. One sentence routinely holds
    // several requirements — "18 years or older with confirmed diagnosis of a
    // solid tumor and no more than 2 prior systemic therapies" is three — and
    // the prompt asks for those to be split. Rejecting them for sharing a span
    // would throw away real criteria to satisfy a bookkeeping rule.
    if (seenStatements.has(statement)) {
      rejected.push({
        reason: `restates a criterion already taken from this span (${spanId})`,
        quote: entry.quote,
        raw: entry,
      });
      continue;
    }

    seenStatements.add(statement);

    // Ids stay unique by counting within the span rather than across the
    // trial, so a criterion keeps the same id whatever else the run found.
    const ordinal = perSpan.get(spanId) ?? 0;
    perSpan.set(spanId, ordinal + 1);
    const id = ordinal === 0 ? spanId : `${spanId}#${ordinal + 1}`;

    cursor = found.nextFrom;
    criteria.push({
      id,
      polarity: entry.polarity,
      type: entry.type,
      text: entry.text,
      source: found.span,
      confidence: entry.confidence,
      ...(entry.appliesTo === null ? {} : { appliesTo: entry.appliesTo }),
      ...(found.loose ? { loose: true as const } : {}),
      ...(found.heading === undefined ? {} : { heading: found.heading }),
    });
  }

  return { criteria, rejected };
}

/**
 * Stretches of source no criterion claimed.
 *
 * The parser's own account of what it did not understand, and the cheapest
 * signal available that the model quietly stopped halfway down a long block.
 * Not an error: headings and section labels legitimately go unclaimed, which
 * is what the threshold is for.
 */
function findUnclaimed(original: string, criteria: Criterion[]): SourceSpan[] {
  // A heading quoted with its item was read, so it isn't left behind (0015).
  const claimed = criteria
    .flatMap((criterion) =>
      criterion.heading === undefined ? [criterion.source] : [criterion.source, criterion.heading],
    )
    .sort((a, b) => a.start - b.start);

  const gaps: SourceSpan[] = [];
  let cursor = 0;

  for (const span of claimed) {
    if (span.start > cursor) {
      addGap(gaps, original, cursor, span.start);
    }
    cursor = Math.max(cursor, span.end);
  }

  if (cursor < original.length) {
    addGap(gaps, original, cursor, original.length);
  }

  return gaps;
}

function addGap(gaps: SourceSpan[], original: string, start: number, end: number): void {
  const text = original.slice(start, end);

  if (text.replace(/\s/g, "").length >= UNCLAIMED_THRESHOLD) {
    gaps.push({ start, end, text });
  }
}

/**
 * Best effort at how much survived a truncated response, for the error
 * message. The JSON is broken by definition, so this counts what it can see
 * rather than parsing it.
 */
function countRecoverable(content: unknown): number {
  if (typeof content === "object" && content !== null && "criteria" in content) {
    const criteria = (content as { criteria: unknown }).criteria;
    if (Array.isArray(criteria)) {
      return criteria.length;
    }
  }
  return 0;
}
