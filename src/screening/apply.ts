import { raisability } from "./agenda.js";
import { locateEvidence } from "./evidence.js";
import type {
  Evidence,
  Finding,
  IgnoredReading,
  Progress,
  ReadingValue,
  RejectedReading,
  ReportedValue,
  ScreeningCriterion,
  Withheld,
} from "./types.js";

/**
 * Turns what the read call said about a reply into findings (spec §5).
 *
 * This is where the design's guarantees live. The model reports readings; code
 * decides what each reading is allowed to do. In particular:
 *
 * - A reading whose quote is not in the message is rejected, whatever it says.
 * - A `clinical` criterion never becomes `holds` or `does-not-hold`, whatever
 *   the model returns. The patient's word goes into `reported`, and the finding
 *   is `chart-review` (spec D2).
 * - A later answer that contradicts a settled one unsettles it. The agent does
 *   not pick a side; the coordinator sees both quotes.
 * - A determination the read call itself says the words don't settle outright
 *   is held back as `unclear` (slice 0009). The model proposes; code decides
 *   what an answer it called tentative is allowed to do.
 */

export interface Reading {
  criterionId: string;
  reading: ReadingValue;
  quote: string;
  /** On `partial`: what the reply left unanswered. */
  missing?: string;
  /** The criterion restated as one plain statement about the person (slice 0009). */
  statement?: string;
  /**
   * Whether the quoted words, read literally, settle the statement with no
   * hedge and no judgment about what a term covers (slice 0009). `false`
   * holds a determination back; absent changes nothing.
   */
  outright?: boolean;
}

export interface ApplyInput {
  criteria: readonly ScreeningCriterion[];
  progress: readonly Progress[];
  /** Transcript index of the participant message the readings are about. */
  turn: number;
  message: string;
}

export interface ApplyOutput {
  progress: Progress[];
  rejected: RejectedReading[];
  ignored: IgnoredReading[];
}

const DETERMINATE: readonly ReadingValue[] = ["holds", "does-not-hold"];

/** Readings that close a criterion on the person's word, and so need it outright. */
const WITHHOLDABLE: readonly Withheld[] = ["holds", "does-not-hold", "does-not-apply"];

/** The reading as applied: a determination not said outright becomes `unclear`. */
export function asApplied(r: Pick<Reading, "reading" | "outright">): {
  reading: ReadingValue;
  withheld?: Withheld;
} {
  if (r.outright === false && (WITHHOLDABLE as readonly ReadingValue[]).includes(r.reading)) {
    return { reading: "unclear", withheld: r.reading as Withheld };
  }
  return { reading: r.reading };
}

export function applyReadings(input: ApplyInput, readings: readonly Reading[]): ApplyOutput {
  const progress = input.progress.map((p) => ({ ...p, evidence: [...p.evidence] }));
  const byId = new Map(progress.map((p) => [p.criterionId, p]));
  const criteria = new Map(input.criteria.map((c) => [c.id, c]));
  const rejected: RejectedReading[] = [];
  const ignored: IgnoredReading[] = [];

  for (const proposed of readings) {
    const { reading, withheld } = asApplied(proposed);
    const r = { ...proposed, reading };
    const criterion = criteria.get(r.criterionId);
    const p = byId.get(r.criterionId);
    const base = { turn: input.turn, criterionId: r.criterionId, reading: r.reading };

    if (criterion === undefined || p === undefined) {
      ignored.push({ ...base, why: "unknown-criterion" });
      continue;
    }
    const raise = raisability(criterion);
    if (!raise.raise) {
      ignored.push({ ...base, why: "not-raisable" });
      continue;
    }

    // Rule 1: evidence must be in the message just received.
    if (locateEvidence(input.message, r.quote) === undefined) {
      rejected.push({ ...base, quote: r.quote });
      continue;
    }
    const evidence: Evidence = {
      turn: input.turn,
      quote: r.quote,
      reading: r.reading,
      ...(r.reading === "partial" && r.missing !== undefined ? { missing: r.missing } : {}),
      ...(r.statement === undefined ? {} : { statement: r.statement }),
      ...(withheld === undefined ? {} : { withheld }),
    };

    const outcome =
      raise.as === "patient" ? applyPatient(p, r.reading) : applyClinical(p, r.reading);
    if (outcome === "ignored") {
      ignored.push({ ...base, why: "already-settled" });
      continue;
    }
    p.evidence.push(evidence);
  }

  return { progress, rejected, ignored };
}

/** Rule 2 and rule 4 for a `patient` criterion. Mutates `p`. */
function applyPatient(p: Progress, reading: ReadingValue): "applied" | "ignored" {
  if (p.status === "open") {
    switch (reading) {
      case "holds":
      case "does-not-hold":
        p.status = reading;
        p.reason = "answered";
        return "applied";
      case "partial":
      case "unclear":
        // Stays open for its follow-up; the reason is what it closes with if
        // the follow-up does not settle it.
        p.reason = reading;
        return "applied";
      case "unknown":
      case "declined":
      case "does-not-apply":
        p.status = "unresolved";
        p.reason = reading;
        return "applied";
    }
  }

  if (p.status === "holds" || p.status === "does-not-hold") {
    // Agreement adds a second piece of evidence. Anything else unsettles it:
    // the read call reports an answered criterion only when the reply changes
    // it, and it is shown what was recorded (slice 0009). So "big tablets are a
    // struggle" after "I can swallow tablets" qualifies the answer, and the
    // coordinator sees both quotes rather than the first alone. Before 0009 a
    // vaguer reading was ignored, when the read call couldn't see the answer.
    if (reading === p.status) {
      return "applied";
    }
    p.status = "unresolved";
    p.reason = "contradicted";
    return "applied";
  }

  // Unresolved is final. A person who said "I don't know" and later remembers
  // is a real case this does not handle; recorded rather than hidden.
  return "ignored";
}

/** Rule 3 for a `clinical` criterion: never a determination. Mutates `p`. */
function applyClinical(p: Progress, reading: ReadingValue): "applied" | "ignored" {
  if (p.status === "open") {
    switch (reading) {
      case "holds":
      case "does-not-hold":
      case "unknown":
        p.status = "chart-review";
        p.reason = reading === "unknown" ? "unknown" : "answered";
        p.reported = reading;
        return "applied";
      case "does-not-apply":
        p.status = "chart-review";
        p.reason = "does-not-apply";
        p.reported = "does-not-apply";
        return "applied";
      case "declined":
        p.status = "chart-review";
        p.reason = "declined";
        delete p.reported;
        return "applied";
      case "partial":
        // Open for a follow-up that asks about the missing part. If it never
        // comes, the coordinator still sees what was said.
        p.reason = "partial";
        p.reported = "partial";
        return "applied";
      case "unclear":
        p.reason = "unclear";
        return "applied";
    }
  }

  if (p.status === "chart-review") {
    const prior = p.reported;
    const disagrees = DETERMINATE.includes(reading) || reading === "does-not-apply";
    if (disagrees && (prior === "holds" || prior === "does-not-hold")) {
      if (reading === prior) {
        return "applied";
      }
      p.reason = "contradicted";
      delete p.reported;
      return "applied";
    }
    return "ignored";
  }

  return "ignored";
}

/**
 * Closes the conversation's findings. Every criterion still open becomes
 * `unresolved` (patient) or `chart-review` (clinical), with the reason it was
 * left open, or `evidence-not-found` if the only readings for it were rejected,
 * or `no-answer`.
 */
export function finalize(
  criteria: readonly ScreeningCriterion[],
  progress: readonly Progress[],
  rejected: readonly RejectedReading[],
): Finding[] {
  const types = new Map(criteria.map((c) => [c.id, raisability(c)]));

  return progress.map((p) => {
    const common = {
      criterionId: p.criterionId,
      evidence: p.evidence,
      timesAsked: p.timesAsked,
    };
    if (p.status !== "open") {
      return {
        ...common,
        status: p.status,
        reason: p.reason ?? "no-answer",
        ...(p.reported === undefined ? {} : { reported: p.reported }),
      };
    }

    const reason =
      p.reason ??
      (rejected.some((r) => r.criterionId === p.criterionId) ? "evidence-not-found" : "no-answer");
    const r = types.get(p.criterionId);
    if (r?.raise === true && r.as === "clinical") {
      const reported: ReportedValue | undefined = p.reported;
      return {
        ...common,
        status: "chart-review",
        reason,
        ...(reported === undefined ? {} : { reported }),
      };
    }
    return { ...common, status: "unresolved", reason };
  });
}
