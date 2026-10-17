import type { MatchResult } from "./match.js";

/**
 * Turns a match into the numbers this project reports.
 *
 * Recall is primary. A missed criterion is a question never asked of a
 * patient, and the screening agent cannot notice the absence of something it
 * was never given — whereas a spurious criterion surfaces in front of a
 * coordinator, who can dismiss it. The two failures are not symmetric and the
 * reporting should not pretend they are.
 *
 * Rates over an empty denominator are null rather than 0 or 1. A study with no
 * labels has no recall, and folding that into a mean as zero would report a
 * failure that did not happen.
 */

export interface StudyMetrics {
  nctId: string;
  labels: number;
  predictions: number;
  matched: number;
  /**
   * **Primary.** (matched + merged) ÷ labels.
   *
   * Asks whether the parser's output told a coordinator about this
   * requirement, which is what a reader assumes "recall" means. A requirement
   * bundled into a neighbouring criterion was still captured.
   */
  coverageRecall: number | null;
  /**
   * matched ÷ labels, requiring the criterion to be its own object.
   *
   * Reported beside coverage always, never alone and never omitted. Coverage
   * on its own is gameable — one criterion per protocol would score near 1.0 —
   * and the pair makes that immediately visible.
   */
  strictRecall: number | null;
  /**
   * merged ÷ labels: requirements captured only inside a bundled criterion.
   *
   * The granularity failure, kept out of recall so it cannot hide there.
   * Slice 0004 asks one question at a time, so a bundled criterion is a real
   * problem even though the content is present.
   */
  mergeRate: number | null;
  merged: number;
  /** matched ÷ predictions. Reported, not optimized. */
  precision: number | null;
  /** Of matched pairs, the fraction agreeing on `type`. */
  typeAccuracy: number | null;
  /** Of matched pairs, the fraction agreeing on `polarity`. */
  polarityAccuracy: number | null;
  /** Extras landing in text a reader explicitly ruled out. */
  narrativeFalsePositives: number;
  /** Pairs that overlapped but fell under the floor. Calibration signal. */
  nearMisses: number;
}

export interface PooledMetrics extends Omit<StudyMetrics, "nctId"> {
  studies: number;
}

export function scoreStudy(nctId: string, match: MatchResult): StudyMetrics {
  const labels = match.matched.length + match.merged.length + match.missed.length;
  const predictions = match.matched.length + match.extra.length;
  const matched = match.matched.length;

  const sameType = match.matched.filter((pair) => pair.label.type === pair.prediction.type).length;
  const samePolarity = match.matched.filter(
    (pair) => pair.label.polarity === pair.prediction.polarity,
  ).length;

  return {
    nctId,
    labels,
    predictions,
    matched,
    merged: match.merged.length,
    coverageRecall: ratio(matched + match.merged.length, labels),
    strictRecall: ratio(matched, labels),
    mergeRate: ratio(match.merged.length, labels),
    precision: ratio(matched, predictions),
    typeAccuracy: ratio(sameType, matched),
    polarityAccuracy: ratio(samePolarity, matched),
    narrativeFalsePositives: match.narrative.length,
    nearMisses: match.rejected.length,
  };
}

/**
 * Pooled over criteria, not averaged over studies.
 *
 * A mean of per-study rates lets a study with four criteria weigh as much as
 * one with sixty. Pooling answers the question actually being asked: of every
 * criterion a reader found, what share did the parser find.
 */
export function poolMetrics(studies: readonly StudyMetrics[]): PooledMetrics {
  const sum = (pick: (study: StudyMetrics) => number): number =>
    studies.reduce((total, study) => total + pick(study), 0);

  const labels = sum((study) => study.labels);
  const predictions = sum((study) => study.predictions);
  const matched = sum((study) => study.matched);
  const merged = sum((study) => study.merged);

  // Reconstructed from rate × denominator, since a pooled accuracy needs the
  // agreeing counts rather than the per-study rates.
  const sameType = sum((study) => round(study.typeAccuracy, study.matched));
  const samePolarity = sum((study) => round(study.polarityAccuracy, study.matched));

  return {
    studies: studies.length,
    labels,
    predictions,
    matched,
    merged,
    coverageRecall: ratio(matched + merged, labels),
    strictRecall: ratio(matched, labels),
    mergeRate: ratio(merged, labels),
    precision: ratio(matched, predictions),
    typeAccuracy: ratio(sameType, matched),
    polarityAccuracy: ratio(samePolarity, matched),
    narrativeFalsePositives: sum((study) => study.narrativeFalsePositives),
    nearMisses: sum((study) => study.nearMisses),
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function round(rate: number | null, denominator: number): number {
  return rate === null ? 0 : Math.round(rate * denominator);
}

/** Two decimal places, or "n/a" where a rate has no denominator. */
export function formatRate(rate: number | null): string {
  return rate === null ? "n/a" : rate.toFixed(2);
}
