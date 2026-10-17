import type { ModelRunMetadata } from "../models/index.js";

/**
 * The structured form of a trial's eligibility block.
 *
 * Slice 0001 stored `criteriaText` verbatim and interpreted none of it. This is
 * the unit everything downstream needs: 0003 scores criteria, 0004 decides
 * which ones to raise with a patient, 0007 cites one in a determination.
 */

/**
 * What kind of statement a criterion is. The model's judgment, one per
 * criterion, and the schema's load-bearing field.
 *
 * An eligibility block is not a list of questions for a patient. It mixes
 * things a person knows about themselves, things only a chart or an assay
 * knows, clauses that define a term used elsewhere, and instructions addressed
 * to the site. Flattening those together produces a screening agent that asks
 * someone whether their tumour tissue is adequate for central testing.
 */
export type CriterionType =
  /** The patient can answer from their own knowledge: age, prior lines, travel. */
  | "patient"
  /** Requires a chart, a lab value, or an assay result: ECOG, PD-L1, creatinine. */
  | "clinical"
  /** Scopes a term used elsewhere. Asserts nothing about a person. */
  | "definitional"
  /** Addressed to the site or investigator, not to the participant. */
  | "protocol";

export type CriterionPolarity = "inclusion" | "exclusion";

/** Where a criterion came from, in the coordinates of the original text. */
export interface SourceSpan {
  /** Inclusive offset into the trial's verbatim `criteriaText`. */
  start: number;
  /** Exclusive. */
  end: number;
  /** Exactly `criteriaText.slice(start, end)`. Kept for display and adjudication. */
  text: string;
}

export interface Criterion {
  /**
   * Stable across runs for the same sentence: `${nctId}:${start}-${end}`.
   *
   * Derived from the source span rather than from an ordinal, so that two
   * parses of the same block agree on the id of a criterion they both found
   * even if one of them found an extra criterion earlier in the text. It does
   * not survive a criterion being split differently between runs, which is a
   * real case 0003 has to handle rather than one this id pretends away.
   */
  id: string;
  polarity: CriterionPolarity;
  type: CriterionType;
  /** The criterion as one testable statement, as the model rendered it. */
  text: string;
  source: SourceSpan;
  /**
   * The part of the study this applies to, verbatim from the source —
   * "Phase I portion", "Arm A" — or absent when it applies unconditionally.
   *
   * Carried as text rather than as structure because one study in twelve needs
   * it, and a representation invented for one study will be wrong for the
   * second.
   */
  appliesTo?: string;
  /**
   * The model's stated confidence, or null when it did not give one.
   *
   * Null rather than a default, for the same reason `seed` and
   * `healthyVolunteers` are nullable elsewhere in this project: "the model was
   * unsure" and "the model said nothing" are different facts.
   */
  confidence: number | null;
  /**
   * Present, as true, when the quote was found only after allowing whitespace
   * to differ from the source: the model retyped the text rather than copying
   * it. Kept since slice 0011; `locateQuote` always knew, and nothing recorded it.
   */
  loose?: true;
  /**
   * Present when the model quoted a heading joined to this item, and `source`
   * is then the item alone (slice 0015). Like `loose`, it records how the quote
   * was found, not what the criterion says: the agent never sees it, and the
   * model's `text` already carries the heading's meaning.
   */
  heading?: SourceSpan;
}

/** A criterion the model produced that did not survive validation. */
export interface RejectedCriterion {
  reason: string;
  /** The quote the model claimed, when it gave one worth reporting. */
  quote: string | null;
  /** What the model actually returned, for diagnosis. */
  raw: unknown;
}

export interface ParsedCriteria {
  nctId: string;
  criteria: Criterion[];
  /**
   * Criteria that were returned and thrown out, with the reason.
   *
   * Reported rather than silently dropped: a parse that rejects nine of forty
   * should look bad, not merely short.
   */
  rejected: RejectedCriterion[];
  /**
   * Stretches of the source that no criterion claimed.
   *
   * The parser's own account of what it did not understand, and the cheapest
   * available signal that the model dropped the back half of a long block.
   * Not an error — data for a human reading the parse, and for 0003.
   */
  unclaimed: SourceSpan[];
  /**
   * `normalizeVersion` is which normalization the model was shown (slice
   * 0011). Absent on parses made before it, which means "1".
   */
  run: ModelRunMetadata & { normalizeVersion?: string };
}

/**
 * Answerability is derived, never stored.
 *
 * A function rather than a field so it cannot drift out of sync with `type`,
 * and so it cannot be serialized into an eval result as though it were an
 * independent fact about the criterion. When 0004 disagrees with this mapping,
 * this is the one place that changes.
 */
export function isPatientAnswerable(criterion: Criterion): boolean {
  return criterion.type === "patient";
}

/**
 * Raised when a parse cannot be trusted as a whole: the response was
 * truncated, the envelope was unreadable, or nothing valid came back.
 *
 * Individual bad criteria are not this. They are collected in
 * `ParsedCriteria.rejected`, because one hallucinated quote does not invalidate
 * the other thirty-nine.
 */
export class CriteriaParseError extends Error {
  readonly problems: readonly string[];

  constructor(context: string, problems: readonly string[]) {
    const detail = problems.map((p) => `  - ${p}`).join("\n");
    super(`${context}:\n${detail}`);
    this.name = "CriteriaParseError";
    this.problems = problems;
  }
}
