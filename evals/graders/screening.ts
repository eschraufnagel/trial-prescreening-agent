import type { Criterion, ParsedCriteria } from "../../src/criteria/types.js";
import type { Finding, FindingStatus, Turn } from "../../src/screening/types.js";
import type { ExpectedOutcome, LabelSet, Vignette } from "../cases/types.js";
import { matchCriteria } from "./match.js";

/**
 * Grades a screening conversation against its vignette (spec §8).
 *
 * The headline is **confidently wrong**: of the determinations the agent
 * committed to, how many a coordinator could not trust. It is never reported
 * without **abstention** beside it, because an agent that commits to nothing
 * scores zero wrong and is useless. Each number alone can be gamed; the pair
 * cannot. The same reasoning kept 0003's coverage recall beside strict recall.
 *
 * Only `patient` criteria are scored this way, since only they can end in a
 * determination. What the agent heard about `clinical` criteria is reported as
 * agreement, not accuracy: it made no determination there to be wrong about.
 */

/**
 * Changes whenever a rule here changes, so a moved number is attributable.
 * v4 (slice 0009) narrows `VERDICT_PATTERN` and changes nothing else.
 */
export const SCREENING_GRADER_VERSION = "4";

/**
 * Grader v3's verdict pattern. Kept because 0004's committed run counted its
 * hits with it, and v4 is checked against it: v4 may only match less.
 */
export const VERDICT_PATTERN_V3 =
  /\b(eligib\w*|ineligib\w*|qualif(y|ies|ied)|disqualif\w*|(not )?a (good |suitable )?candidate)\b/i;

/**
 * Agent phrasing that reads as an eligibility verdict. The agent never decides
 * eligibility and must not sound as though it has. Matched against the agent's
 * own turns; any hit is counted and shown, because one is too many.
 *
 * v3's words, except where one is followed by "for" and something other than
 * the study: the criteria themselves say "a candidate for surgical resection"
 * and "eligibility for an R0 resection", and the agent quoting them is asking,
 * not deciding. Most of v3's hits in 0004's run were that. "Eligible for
 * this study" still counts, and so does the agent's own "to help us check
 * eligibility". Used only for the discipline count, never for a
 * score.
 */
export const VERDICT_PATTERN =
  /\b(eligib\w*|ineligib\w*|qualif(y|ies|ied)|disqualif\w*|(not )?a (good |suitable )?candidate)\b(?!\s+for\s+(?!(?:[\w'-]+\s+){0,3}(?:study|trial|research)\b))/i;

/** Two SMS segments. A question longer than this is not a short message. */
export const MAX_QUESTION_LENGTH = 320;

const DETERMINATIONS: readonly FindingStatus[] = ["holds", "does-not-hold"];

export type Outcome =
  /** A determination matching a settleable expectation. */
  | "correct"
  /** A determination against the vignette, or on a fact that settles nothing. */
  | "confidently-wrong"
  /** No determination where one was available. */
  | "abstained"
  /** No determination where none was available. */
  | "correct-abstention"
  /** Rests on a participant turn flagged as unfaithful. Excluded, counted. */
  | "simulator-affected";

export interface LabelOutcome {
  label: string;
  expected: ExpectedOutcome;
  status: FindingStatus;
  outcome: Outcome;
  /** The participant's words behind the finding, for reading at Gate 3. */
  evidence: string[];
}

export interface ScreeningScore {
  /** Determinations made, excluding simulator-affected ones. */
  determinations: number;
  confidentlyWrong: number;
  /** Labels whose expected outcome was `holds` or `does-not-hold`. */
  answerable: number;
  abstained: number;
  /** Labels whose expected outcome was `unresolved` or `defer`. */
  abstainable: number;
  correctAbstentions: number;
  simulatorAffected: number;
  /** confidentlyWrong ÷ determinations. Null when nothing was determined. */
  confidentlyWrongRate: number | null;
  /** abstained ÷ answerable. */
  abstentionRate: number | null;
  /** correctAbstentions ÷ abstainable. */
  correctAbstentionRate: number | null;
}

export interface ReportedAgreement {
  /** Clinical facts with a gradeable `reported`. */
  graded: number;
  agreed: number;
  disagreements: Array<{ label: string; expected: string; heard: string }>;
}

export interface Discipline {
  agentQuestions: number;
  participantReplies: number;
  /** Agent questions containing more than one question mark. */
  multiQuestion: number;
  overLength: number;
  verdictLanguage: Array<{ turn: number; text: string }>;
  /**
   * Second asks of a criterion: whether the agent digs deeper at all. Counted
   * from the transcript, where every question names the criterion code chose.
   */
  followUps: number;
}

export interface ConversationGrade {
  score: ScreeningScore;
  outcomes: LabelOutcome[];
  reported: ReportedAgreement;
  discipline: Discipline;
}

/**
 * Participant turns flagged as unfaithful, each with the facts that reply cited.
 *
 * A flagged reply can still carry faithful answers. At Gate 2 one reply
 * invented "fully active" while also stating three cited facts correctly, and
 * excluding everything in it threw away three good findings. So a finding is
 * simulator-affected only when its evidence comes from a flagged reply that
 * did not cite the fact for that criterion (approved at Gate 2; grader v3).
 */
export type FlaggedTurns = ReadonlyMap<number, ReadonlySet<string>>;

/** Grades one finding against one expectation. */
export function gradeOne(
  expected: ExpectedOutcome,
  finding: Pick<Finding, "criterionId" | "status" | "evidence"> | undefined,
  flaggedTurns: FlaggedTurns,
): Outcome {
  const status = finding?.status ?? "not-raised";
  const affected = finding?.evidence.some((e) => {
    const cited = flaggedTurns.get(e.turn);
    return cited !== undefined && !cited.has(finding.criterionId);
  });
  if (affected === true) {
    return "simulator-affected";
  }

  const settleable = expected === "holds" || expected === "does-not-hold";
  if (DETERMINATIONS.includes(status)) {
    return settleable && status === expected ? "correct" : "confidently-wrong";
  }
  return settleable ? "abstained" : "correct-abstention";
}

function fromCounts(
  counts: Omit<ScreeningScore, "confidentlyWrongRate" | "abstentionRate" | "correctAbstentionRate">,
): ScreeningScore {
  return {
    ...counts,
    confidentlyWrongRate: rate(counts.confidentlyWrong, counts.determinations),
    abstentionRate: rate(counts.abstained, counts.answerable),
    correctAbstentionRate: rate(counts.correctAbstentions, counts.abstainable),
  };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** Scores a set of label outcomes, using each label's expectation. */
export function scoreOutcomes(outcomes: readonly LabelOutcome[]): ScreeningScore {
  const live = outcomes.filter((o) => o.outcome !== "simulator-affected");
  const settleable = (o: LabelOutcome) => o.expected === "holds" || o.expected === "does-not-hold";

  return fromCounts({
    determinations: live.filter((o) => DETERMINATIONS.includes(o.status)).length,
    confidentlyWrong: live.filter((o) => o.outcome === "confidently-wrong").length,
    answerable: live.filter(settleable).length,
    abstained: live.filter((o) => o.outcome === "abstained").length,
    abstainable: live.filter((o) => !settleable(o)).length,
    correctAbstentions: live.filter((o) => o.outcome === "correct-abstention").length,
    simulatorAffected: outcomes.length - live.length,
  });
}

/**
 * Grades a conversation screened from labels, where finding ids are label ids.
 */
export function gradeConversation(
  findings: readonly Finding[],
  transcript: readonly Turn[],
  vignette: Vignette,
  flaggedTurns: FlaggedTurns,
): ConversationGrade {
  const byId = new Map(findings.map((f) => [f.criterionId, f]));

  const outcomes: LabelOutcome[] = [];
  const reported: ReportedAgreement = { graded: 0, agreed: 0, disagreements: [] };

  for (const fact of vignette.facts) {
    const finding = byId.get(fact.label);

    if (fact.expected !== undefined) {
      outcomes.push({
        label: fact.label,
        expected: fact.expected,
        status: finding?.status ?? "not-raised",
        outcome: gradeOne(fact.expected, finding, flaggedTurns),
        evidence: finding?.evidence.map((e) => e.quote) ?? [],
      });
    }

    if (fact.reported !== undefined) {
      reported.graded += 1;
      const heard = finding?.reported ?? "(not captured)";
      if (heard === fact.reported) {
        reported.agreed += 1;
      } else {
        reported.disagreements.push({ label: fact.label, expected: fact.reported, heard });
      }
    }
  }

  return {
    score: scoreOutcomes(outcomes),
    outcomes,
    reported,
    discipline: countDiscipline(transcript),
  };
}

/** Counted from the transcript alone; no model and no vignette. */
export function countDiscipline(transcript: readonly Turn[]): Discipline {
  const questions = transcript.filter((t) => t.speaker === "agent" && t.kind === "question");

  return {
    agentQuestions: questions.length,
    participantReplies: transcript.filter((t) => t.speaker === "participant").length,
    multiQuestion: questions.filter((t) => (t.text.match(/\?/g) ?? []).length > 1).length,
    overLength: questions.filter((t) => t.text.length > MAX_QUESTION_LENGTH).length,
    verdictLanguage: transcript
      .filter((t) => t.speaker === "agent" && VERDICT_PATTERN.test(t.text))
      .map((t) => ({ turn: t.index, text: t.text })),
    followUps: questions.filter((t, i) =>
      questions
        .slice(0, i)
        .some((q) => q.criterionId !== undefined && q.criterionId === t.criterionId),
    ).length,
  };
}

export type ParseCategory = "scored" | "mis-typed" | "bundled" | "missed-upstream";

export interface ParseLabelEntry {
  label: string;
  category: ParseCategory;
  /** The parsed criterion's ordinal id, when there is one. */
  parsedId?: string;
  parsedType?: string;
  /** What the agent did with it, when it was raised at all. */
  status?: FindingStatus;
}

export interface ParseRunGrade {
  categories: Record<ParseCategory, number>;
  entries: ParseLabelEntry[];
  /** Graded as in the labels run, over `scored` labels only. */
  scored: ConversationGrade;
}

/** Where one `patient` label landed in a parse, before any conversation. */
export interface ParseLabelPlacement {
  label: string;
  category: ParseCategory;
  /** The parsed criterion it matched or was bundled into, when there is one. */
  prediction?: Criterion;
}

/**
 * Places each `patient` fact of a vignette in exactly one category, using
 * 0003's matcher, unchanged (spec §8.3).
 *
 * Needs no conversation: the category follows from the parse, the labels and
 * the vignette alone. So a parse's reach can be known before a screening run
 * is spent on it (slice 0011, spec §3.6). `gradeParseRun` builds on this.
 */
export function parseCategories(
  parsed: ParsedCriteria,
  labels: LabelSet,
  vignette: Vignette,
): { placements: ParseLabelPlacement[]; categories: Record<ParseCategory, number> } {
  const match = matchCriteria(parsed.criteria, labels);
  const byLabel = new Map<string, { prediction: Criterion; kind: "matched" | "merged" }>();
  for (const pair of match.matched) {
    byLabel.set(pair.label.id, { prediction: pair.prediction, kind: "matched" });
  }
  for (const merged of match.merged) {
    if (!byLabel.has(merged.label.id)) {
      byLabel.set(merged.label.id, { prediction: merged.prediction, kind: "merged" });
    }
  }

  const typeOf = new Map(labels.criteria.map((l) => [l.id, l.type]));
  const placements: ParseLabelPlacement[] = [];

  for (const fact of vignette.facts) {
    if (typeOf.get(fact.label) !== "patient") {
      continue;
    }
    const hit = byLabel.get(fact.label);
    if (hit === undefined) {
      placements.push({ label: fact.label, category: "missed-upstream" });
      continue;
    }
    const category: ParseCategory =
      hit.kind === "merged"
        ? "bundled"
        : hit.prediction.type === "patient"
          ? "scored"
          : "mis-typed";
    placements.push({ label: fact.label, category, prediction: hit.prediction });
  }

  const categories: Record<ParseCategory, number> = {
    scored: 0,
    "mis-typed": 0,
    bundled: 0,
    "missed-upstream": 0,
  };
  for (const placement of placements) {
    categories[placement.category] += 1;
  }

  return { placements, categories };
}

/**
 * Grades a conversation screened from a parse (spec §8.3).
 *
 * Parsed criteria do not line up one-to-one with labels, so each `patient`
 * label is first placed in exactly one category by `parseCategories`. Only
 * `scored` labels are graded for accuracy; the other three are where the
 * parser's known faults land in a conversation, and are reported as counts
 * rather than folded into the agent's number.
 *
 * `parsedIds` maps each parsed criterion object to the ordinal id the agent
 * saw, by identity — the matcher returns the same objects it was given.
 */
export function gradeParseRun(
  parsed: ParsedCriteria,
  parsedIds: ReadonlyMap<Criterion, string>,
  labels: LabelSet,
  findings: readonly Finding[],
  transcript: readonly Turn[],
  vignette: Vignette,
  flaggedTurns: FlaggedTurns,
): ParseRunGrade {
  const { placements, categories } = parseCategories(parsed, labels, vignette);
  const findingById = new Map(findings.map((f) => [f.criterionId, f]));
  const entries: ParseLabelEntry[] = [];
  const scoredFindings: Finding[] = [];

  for (const { label, category, prediction } of placements) {
    if (prediction === undefined) {
      entries.push({ label, category });
      continue;
    }

    const parsedId = parsedIds.get(prediction);
    const finding = parsedId === undefined ? undefined : findingById.get(parsedId);

    entries.push({
      label,
      category,
      ...(parsedId === undefined ? {} : { parsedId }),
      parsedType: prediction.type,
      ...(finding === undefined ? {} : { status: finding.status }),
    });

    if (category === "scored" && finding !== undefined) {
      // Re-keyed to the label, so the labels-run grader applies unchanged.
      scoredFindings.push({ ...finding, criterionId: label });
    }
  }

  const scoredLabels = new Set(entries.filter((e) => e.category === "scored").map((e) => e.label));
  const scoredVignette: Vignette = {
    ...vignette,
    facts: vignette.facts.filter((f) => scoredLabels.has(f.label)),
  };

  return {
    categories,
    entries,
    scored: gradeConversation(scoredFindings, transcript, scoredVignette, flaggedTurns),
  };
}

/** Sums scores across conversations and recomputes the rates. */
export function poolScores(scores: readonly ScreeningScore[]): ScreeningScore {
  const sum = (key: keyof ScreeningScore) =>
    scores.reduce((total, s) => total + ((s[key] as number | null) ?? 0), 0);

  return fromCounts({
    determinations: sum("determinations"),
    confidentlyWrong: sum("confidentlyWrong"),
    answerable: sum("answerable"),
    abstained: sum("abstained"),
    abstainable: sum("abstainable"),
    correctAbstentions: sum("correctAbstentions"),
    simulatorAffected: sum("simulatorAffected"),
  });
}
