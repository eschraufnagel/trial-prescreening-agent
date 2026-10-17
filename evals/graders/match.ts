import type { Criterion } from "../../src/criteria/types.js";
import type { LabelledCriterion, LabelSet, NotCriterion } from "../cases/types.js";

/**
 * Decides which extracted criteria correspond to which labels.
 *
 * The harness's most consequential internal decision. Too loose and recall is
 * flattered; too strict and the parser is punished for splitting a sentence
 * differently than the annotation guide did — a real and legitimate
 * disagreement, since one protocol sentence routinely carries several
 * requirements.
 *
 * Neither the rule nor this module knows anything about any particular study.
 * It compares spans and words.
 *
 * ## Why two signals rather than one
 *
 * Span overlap alone cannot separate several criteria drawn from one sentence:
 * they occupy the same or nested spans and would be interchangeable. Text
 * similarity alone would happily match a criterion to a similarly worded one
 * elsewhere in the block — protocols repeat phrasing constantly. Together, the
 * span says roughly where, and the words say which one.
 *
 * ## Why the constants are here and versioned
 *
 * Changing a weight or the floor changes every number this project has ever
 * reported, so a result records `MATCHER_VERSION` alongside the model
 * settings. Moving these is a deliberate act with a diff, not a tuning knob to
 * reach for when a score disappoints.
 */

/** Bump when the weights, the floor, or the algorithm change. */
export const MATCHER_VERSION = "2";

/** Weight on where the criterion is in the source. */
const SPAN_WEIGHT = 0.6;
/** Weight on what the criterion says. */
const TEXT_WEIGHT = 0.4;

/**
 * Below this, a pair is not the same criterion.
 *
 * Set by reading pairs rather than by tuning: a genuine match that differs
 * only in phrasing and boundary scores well above it, while two different
 * criteria in the same sentence score below. Pairs rejected by this floor are
 * reported, so a floor in the wrong place is visible rather than silent.
 */
const MATCH_FLOOR = 0.3;

/**
 * Fraction of a prediction's span that must fall inside a `notCriteria`
 * passage before it counts as a criterion invented out of narrative.
 */
const NARRATIVE_OVERLAP = 0.5;

/**
 * How much of a label's span must sit inside a prediction for that prediction
 * to be said to cover it.
 *
 * Containment, not IoU. IoU punishes a size mismatch, and a merged criterion
 * is precisely a size mismatch: on NCT00077350 one prediction covered a
 * 1213-character bullet holding two 43-character labels, and IoU of 0.06 made
 * a correct capture look like a miss.
 */
const COVERAGE_CONTAINMENT = 0.8;

/**
 * How much of a label's wording must survive into the covering prediction.
 *
 * Low on purpose: a merged criterion states several requirements in fewer
 * words than the labels use between them, so most of a label's phrasing is
 * legitimately absent. It exists to veto the degenerate case — a parser
 * returning one criterion spanning the whole block would contain every label
 * but mention none of them.
 *
 * It is a weak guard, and coverage recall is gameable on its own. That is why
 * strict recall is always reported beside it: coverage near 1.0 with strict
 * recall near zero is a parser emitting one criterion per protocol, and the
 * pair of numbers says so immediately.
 */
const COVERAGE_TOKEN_RECALL = 0.1;

/**
 * Words carrying no information about which criterion this is.
 *
 * Deliberately short. Every word removed makes two different criteria look
 * more alike, so this covers only protocol boilerplate that appears in
 * essentially every sentence. Clinical terms are never removed.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "must",
  "not",
  "of",
  "on",
  "or",
  "patient",
  "patients",
  "prior",
  "study",
  "subject",
  "subjects",
  "that",
  "the",
  "this",
  "to",
  "were",
  "which",
  "who",
  "will",
  "with",
  "within",
]);

export interface MatchedPair {
  label: LabelledCriterion;
  prediction: Criterion;
  score: number;
  spanIou: number;
  textF1: number;
}

/** A pair that overlapped but scored below the floor. Diagnostics, not a match. */
export interface RejectedPair {
  label: LabelledCriterion;
  prediction: Criterion;
  score: number;
}

export interface NarrativeFalsePositive {
  prediction: Criterion;
  notCriterion: NotCriterion;
}

export interface MatchResult {
  matched: MatchedPair[];
  /** Labels no prediction claimed. Recall failures — the number that matters. */
  missed: LabelledCriterion[];
  /** Predictions matching no label. */
  extra: Criterion[];
  /**
   * Extras landing in text a reader explicitly ruled out.
   *
   * The distinction nothing in slice 0002 could produce: a criterion invented
   * out of procedural narrative, as against one the annotation guide merely
   * worded differently.
   */
  narrative: NarrativeFalsePositive[];
  /** Near misses, for reading when the floor is in question. */
  rejected: RejectedPair[];
  /**
   * Labels captured inside a prediction that was matched to something else, or
   * to nothing.
   *
   * On NCT00077350 every one of the five strict misses turned out to sit
   * inside a criterion the parser did return — it had bundled two requirements
   * where the annotation guide says two criteria. Strict recall counted those
   * as content the parser never found, which was simply untrue. These are
   * reported separately so the granularity failure stays visible instead of
   * being hidden inside recall, since slice 0004 asks one question at a time
   * and a bundled criterion is a real problem for it.
   */
  merged: MergedLabel[];
}

export interface MergedLabel {
  label: LabelledCriterion;
  prediction: Criterion;
  containment: number;
  tokenRecall: number;
}

export function matchCriteria(predictions: readonly Criterion[], labels: LabelSet): MatchResult {
  const candidates: RejectedPair[] = [];

  for (const label of labels.criteria) {
    for (const prediction of predictions) {
      if (overlap(label, prediction.source) === 0) {
        continue;
      }
      candidates.push({ label, prediction, score: score(label, prediction).score });
    }
  }

  // Best first, so a strong pair claims its partners before a weaker one can.
  // Ties broken by source position to keep the result stable across runs.
  candidates.sort((a, b) => b.score - a.score || a.label.start - b.label.start);

  const matched: MatchedPair[] = [];
  const rejected: RejectedPair[] = [];
  const usedLabels = new Set<string>();
  const usedPredictions = new Set<string>();

  for (const candidate of candidates) {
    if (usedLabels.has(candidate.label.id) || usedPredictions.has(candidate.prediction.id)) {
      continue;
    }
    if (candidate.score < MATCH_FLOOR) {
      rejected.push(candidate);
      continue;
    }

    const parts = score(candidate.label, candidate.prediction);
    usedLabels.add(candidate.label.id);
    usedPredictions.add(candidate.prediction.id);
    matched.push({ label: candidate.label, prediction: candidate.prediction, ...parts });
  }

  const missed = labels.criteria.filter((label) => !usedLabels.has(label.id));
  const extra = predictions.filter((prediction) => !usedPredictions.has(prediction.id));

  return {
    matched: matched.sort((a, b) => a.label.start - b.label.start),
    missed: missed.filter((label) => findCover(label, predictions) === undefined),
    extra,
    narrative: findNarrative(extra, labels.notCriteria),
    rejected,
    merged: missed
      .map((label) => findCover(label, predictions))
      .filter((entry): entry is MergedLabel => entry !== undefined),
  };
}

/**
 * The prediction that swallowed this label, if one did.
 *
 * Asymmetric by design: the question is how much of the *label* the prediction
 * contains, not how similar the two spans are.
 */
function findCover(
  label: LabelledCriterion,
  predictions: readonly Criterion[],
): MergedLabel | undefined {
  const width = label.end - label.start;
  if (width === 0) {
    return undefined;
  }

  let best: MergedLabel | undefined;

  for (const prediction of predictions) {
    const containment = overlap(label, prediction.source) / width;
    if (containment < COVERAGE_CONTAINMENT) {
      continue;
    }

    const tokenRecall = recallOfTokens(tokenize(label.quote), tokenize(prediction.text));
    if (tokenRecall < COVERAGE_TOKEN_RECALL) {
      continue;
    }

    if (best === undefined || tokenRecall > best.tokenRecall) {
      best = { label, prediction, containment, tokenRecall };
    }
  }

  return best;
}

/** Fraction of the label's content words appearing in the prediction. */
function recallOfTokens(labelTokens: string[], predictionTokens: string[]): number {
  if (labelTokens.length === 0) {
    return 0;
  }
  const available = new Set(predictionTokens);
  const found = labelTokens.filter((token) => available.has(token)).length;
  return found / labelTokens.length;
}

function score(
  label: LabelledCriterion,
  prediction: Criterion,
): { score: number; spanIou: number; textF1: number } {
  const spanIou = iou(label, prediction.source);
  // The label's source words against the model's restatement. Comparing source
  // to source would only repeat what the span already says.
  const textF1 = f1(tokenize(label.quote), tokenize(prediction.text));

  return { score: SPAN_WEIGHT * spanIou + TEXT_WEIGHT * textF1, spanIou, textF1 };
}

interface Span {
  start: number;
  end: number;
}

function overlap(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

function iou(a: Span, b: Span): number {
  const intersection = overlap(a, b);
  const union = a.end - a.start + (b.end - b.start) - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Content words, lowercased, with registry escaping and punctuation removed.
 *
 * `\>= 1500/mm3` and `>= 1500/mm3` are the same requirement written by
 * different hands, and a label quotes the raw text while a model restates it.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\\/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

/** F1 over token multisets, so a repeated word cannot inflate the overlap. */
function f1(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (const token of a) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  let shared = 0;
  for (const token of b) {
    const remaining = counts.get(token) ?? 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(token, remaining - 1);
    }
  }

  if (shared === 0) {
    return 0;
  }

  const precision = shared / b.length;
  const recall = shared / a.length;
  return (2 * precision * recall) / (precision + recall);
}

function findNarrative(
  extra: readonly Criterion[],
  notCriteria: readonly NotCriterion[],
): NarrativeFalsePositive[] {
  const out: NarrativeFalsePositive[] = [];

  for (const prediction of extra) {
    const width = prediction.source.end - prediction.source.start;
    if (width === 0) {
      continue;
    }

    // Best overlapping passage, so a prediction straddling two is attributed
    // to the one it mostly sits in rather than to whichever comes first.
    let best: NotCriterion | undefined;
    let bestOverlap = 0;
    for (const passage of notCriteria) {
      const shared = overlap(passage, prediction.source);
      if (shared > bestOverlap) {
        best = passage;
        bestOverlap = shared;
      }
    }

    if (best !== undefined && bestOverlap / width >= NARRATIVE_OVERLAP) {
      out.push({ prediction, notCriterion: best });
    }
  }

  return out;
}

/** Exposed so results can record what the numbers were produced with. */
export const MATCHER_SETTINGS = {
  version: MATCHER_VERSION,
  spanWeight: SPAN_WEIGHT,
  textWeight: TEXT_WEIGHT,
  floor: MATCH_FLOOR,
  narrativeOverlap: NARRATIVE_OVERLAP,
} as const;
