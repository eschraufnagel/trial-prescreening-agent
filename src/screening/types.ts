import type { CriterionPolarity, CriterionType } from "../criteria/types.js";
import type { ModelRunMetadata } from "../models/index.js";

/**
 * The shapes of a prescreening conversation and what it hands to a coordinator.
 *
 * The screening agent is driven by code, not by the model (spec D3). The model
 * phrases one question and reads one reply; which criterion comes next, whether
 * it may be asked at all, how many times, and what a reply is allowed to
 * settle are decided here and in the modules beside this one.
 *
 * Nothing in this file can express an overall eligibility decision. That is
 * the coordinator's, and the absence is deliberate: a result with no field for
 * a verdict cannot be rendered as one.
 */

/**
 * One criterion as the agent sees it.
 *
 * Narrower than the parser's `Criterion` on purpose. The agent is fed from two
 * places — hand labels and parser output — and needs only enough to decide
 * whether to raise a criterion and how to ask about it. It never sees a source
 * span, a label's notes, or anything a vignette says.
 */
export interface ScreeningCriterion {
  /** A label id ("L7") or an ordinal assigned to a parsed criterion ("P7"). */
  id: string;
  polarity: CriterionPolarity;
  type: CriterionType;
  /** The statement the agent asks about, with registry escaping removed. */
  text: string;
}

/** What the agent needs to know about the study itself. */
export interface StudyContext {
  nctId: string;
  briefTitle: string;
}

/**
 * Where a criterion ended up.
 *
 * About the criterion's *statement*, never about eligibility. For the exclusion
 * "Pregnant", a participant who says she is not has `does-not-hold` — which is
 * good news for her, but the agent is never asked to work that out. Polarity is
 * applied for display in slice 0007, the same way answerability is derived
 * rather than stored in `src/criteria/types.ts`.
 */
export type FindingStatus =
  /** A `patient` criterion the participant's own words establish as true of them. */
  | "holds"
  /** A `patient` criterion the participant's own words establish as false. */
  | "does-not-hold"
  /** Raised, and not settled: unclear, unknown, declined, contradicted. */
  | "unresolved"
  /**
   * A `clinical` criterion. Asked about, with what the person said attached as
   * `reported`, and never settled on their word alone (spec D2).
   */
  | "chart-review"
  /** Never put to the participant: `protocol`, `definitional`, or a lab value. */
  | "not-raised";

export type FindingReason =
  | "answered"
  /** Answered some of a bundled criterion's requirements, even after a follow-up. */
  | "partial"
  | "unclear"
  | "unknown"
  | "declined"
  /**
   * The person's words put them outside the group the criterion is about,
   * such as a woman answering a criterion for men (slice 0009). Final, like
   * `unknown` and `declined`: nothing the agent could ask would settle it.
   */
  | "does-not-apply"
  | "contradicted"
  /** A determination was read, but its quote was not in what the person said. */
  | "evidence-not-found"
  /** Raisable, but the conversation ended without a reading. */
  | "no-answer"
  | "lab-value"
  | "protocol"
  | "definitional";

/** What a single reply says about a single criterion, as the read call judged it. */
export type ReadingValue =
  | "holds"
  | "does-not-hold"
  /** Covers some of the criterion's requirements; the follow-up asks about the rest. */
  | "partial"
  | "unclear"
  | "unknown"
  | "declined"
  /**
   * The criterion names a group of people, and the reply places the person
   * outside it (slice 0009). About who the criterion is for, not its
   * condition: a man saying he isn't pregnant is `does-not-hold`.
   */
  | "does-not-apply";

/** What a person said about a `clinical` criterion, pending the chart. */
export type ReportedValue = "holds" | "does-not-hold" | "partial" | "unknown" | "does-not-apply";

/**
 * The participant's words behind a finding.
 *
 * `quote` has been located in the participant's message at `turn`. Evidence
 * that did not locate is never stored here; it is recorded as a rejected
 * reading instead.
 */
export interface Evidence {
  turn: number;
  quote: string;
  reading: ReadingValue;
  /** On a `partial` reading: what the reply left unanswered. */
  missing?: string;
  /**
   * The criterion as the read call restated it, one plain statement about the
   * person that the reading judges (slice 0009). Absent on evidence recorded
   * before 0009.
   */
  statement?: string;
  /**
   * The determination the read call proposed and code held back, because it
   * said the quoted words didn't settle the statement outright. The reading
   * is then `unclear` (slice 0009).
   */
  withheld?: Withheld;
}

/** A reading code may hold back when the words behind it aren't outright. */
export type Withheld = Extract<ReadingValue, "holds" | "does-not-hold" | "does-not-apply">;

export interface Finding {
  criterionId: string;
  status: FindingStatus;
  reason: FindingReason;
  /** Present only on `chart-review`. */
  reported?: ReportedValue;
  evidence: Evidence[];
  timesAsked: number;
}

/** A finding while the conversation is still going. */
export interface Progress {
  criterionId: string;
  status: FindingStatus | "open";
  reason: FindingReason | null;
  reported?: ReportedValue;
  evidence: Evidence[];
  timesAsked: number;
}

export type TurnKind = "opening" | "question" | "closing" | "reply";

export interface Turn {
  /** Position in the transcript, from 0. */
  index: number;
  speaker: "agent" | "participant";
  kind: TurnKind;
  text: string;
  /** On a question: the criterion the code chose to raise. */
  criterionId?: string;
}

/** A reading whose quote did not occur in the message it claimed to come from. */
export interface RejectedReading {
  turn: number;
  criterionId: string;
  reading: ReadingValue;
  quote: string;
}

/** A reading for a criterion that was not open or not raisable. Counted, not applied. */
export interface IgnoredReading {
  turn: number;
  criterionId: string;
  reading: ReadingValue;
  why: "unknown-criterion" | "not-raisable" | "already-settled";
}

/**
 * Everything needed to continue a conversation, as plain JSON.
 *
 * Serializable because slice 0005 puts this behind a transport and a browser
 * tab, and because the local model goes down: a conversation that exists only
 * in memory survives neither.
 */
export interface ScreeningState {
  version: 1;
  study: StudyContext;
  criteria: ScreeningCriterion[];
  transcript: Turn[];
  progress: Progress[];
  /** The criterion whose question is awaiting a reply, or null. */
  pending: string | null;
  rejectedReadings: RejectedReading[];
  ignoredReadings: IgnoredReading[];
  /** Model calls made so far, for sizing runs. */
  calls: number;
  done: boolean;
}

/** Criterion ids grouped by where they ended up. A summary, not a decision. */
export interface Handoff {
  holds: string[];
  doesNotHold: string[];
  unresolved: string[];
  chartReview: string[];
  notRaised: string[];
}

export interface ScreeningResult {
  study: StudyContext;
  findings: Finding[];
  transcript: Turn[];
  handoff: Handoff;
  rejectedReadings: RejectedReading[];
  ignoredReadings: IgnoredReading[];
  calls: number;
  run: ModelRunMetadata;
}

/**
 * Raised when a conversation cannot continue: a model call that failed twice,
 * a state that does not restore, a reply to a finished conversation.
 *
 * Same shape as `ModelError` and `CriteriaParseError`: a context line plus
 * every problem found.
 */
export class ScreeningError extends Error {
  readonly problems: readonly string[];

  constructor(context: string, problems: readonly string[]) {
    const detail = problems.map((p) => `  - ${p}`).join("\n");
    super(`${context}:\n${detail}`);
    this.name = "ScreeningError";
    this.problems = problems;
  }
}
