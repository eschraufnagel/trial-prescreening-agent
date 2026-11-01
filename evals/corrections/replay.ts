import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { initialProgress } from "../../src/screening/agenda.js";
import { applyReadings, finalize, type Reading, unsettled } from "../../src/screening/apply.js";
import type { ReadContext } from "../../src/screening/prompts.js";
import { readable } from "../../src/screening/readable.js";
import type {
  Evidence,
  Finding,
  Progress,
  RejectedReading,
  ScreeningCriterion,
  ScreeningResult,
  ScreeningState,
  Turn,
} from "../../src/screening/types.js";

/**
 * The read replay (slice 0022, spec §5): the read call's exact input at a past
 * turn of a committed conversation, rebuilt with no model, and what a fresh
 * read of that turn would do to it.
 *
 * Progress before a turn is rebuilt from evidence alone. Evidence is exactly
 * what was applied: a reading that was rejected, ignored or set aside changed
 * nothing and left no evidence. So applying each earlier turn's evidence, in
 * turn order, through the same `applyReadings` reproduces progress. A test
 * holds that at every conversation's last turn.
 */

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const CASES_FILE = join(ROOT, "evals/cases/corrections.json");

export type Shape = "settled" | "unrecorded" | "held-back";

export interface CorrectionCase {
  conversation: string;
  turn: number;
  criterionId: string;
  shape: Shape;
  laterSays: string;
}

interface ConversationRef {
  id: string;
  kind: "review" | "state";
  file: string;
  /** For a review file: the conversation's id within it. */
  conversation?: string;
}

export interface CasesFile {
  conversations: ConversationRef[];
  cases: CorrectionCase[];
}

/** A finished conversation, as much of it as the rebuild needs. */
export interface Recorded {
  id: string;
  criteria: ScreeningCriterion[];
  transcript: Turn[];
  /** Every criterion's evidence, as committed. */
  evidence: Map<string, Evidence[]>;
  /** The committed outcome, for checking the rebuild: findings, or a state's final progress closed by `finalize`. */
  findings: Finding[];
  rejected: RejectedReading[];
}

export function loadCases(file = CASES_FILE): CasesFile {
  return JSON.parse(readFileSync(file, "utf8")) as CasesFile;
}

export function loadRecorded(ref: ConversationRef, root = ROOT): Recorded {
  const json = JSON.parse(readFileSync(join(root, ref.file), "utf8")) as unknown;
  if (ref.kind === "state") {
    const state = (json as { state: ScreeningState }).state;
    return {
      id: ref.id,
      criteria: state.criteria,
      transcript: state.transcript,
      evidence: evidenceOf(state.progress),
      findings: finalize(state.criteria, state.progress, state.rejectedReadings),
      rejected: state.rejectedReadings,
    };
  }
  const review = json as {
    conversations: { id: string; criteria: ScreeningCriterion[]; result: ScreeningResult }[];
  };
  const found = review.conversations.find((c) => c.id === ref.conversation);
  if (found === undefined) {
    throw new Error(`${ref.file} has no conversation ${String(ref.conversation)}`);
  }
  return {
    id: ref.id,
    criteria: found.criteria,
    transcript: found.result.transcript,
    evidence: evidenceOf(found.result.findings),
    findings: found.result.findings,
    rejected: found.result.rejectedReadings,
  };
}

function evidenceOf(rows: readonly { criterionId: string; evidence: Evidence[] }[]) {
  return new Map(rows.map((r) => [r.criterionId, r.evidence]));
}

/** Progress as it stood when the reply at `turn` arrived, before it was read. */
export function progressAt(recorded: Recorded, turn: number): Progress[] {
  const byTurn = new Map<number, Reading[]>();
  for (const [criterionId, evidence] of recorded.evidence) {
    for (const e of evidence) {
      if (e.turn >= turn) continue;
      const list = byTurn.get(e.turn) ?? [];
      list.push({
        criterionId,
        reading: e.reading,
        quote: e.quote,
        ...(e.missing === undefined ? {} : { missing: e.missing }),
        ...(e.statement === undefined ? {} : { statement: e.statement }),
      });
      byTurn.set(e.turn, list);
    }
  }
  let progress = initialProgress(recorded.criteria);
  for (const t of [...byTurn.keys()].sort((a, b) => a - b)) {
    const message = recorded.transcript[t]?.text ?? "";
    progress = applyReadings(
      { criteria: recorded.criteria, progress, turn: t, message },
      byTurn.get(t) ?? [],
    ).progress;
  }
  return progress;
}

/** What the session would have passed the read call for the reply at `turn`. */
export function readContextAt(recorded: Recorded, turn: number): ReadContext {
  const reply = recorded.transcript[turn];
  if (reply === undefined || reply.speaker !== "participant") {
    throw new Error(`${recorded.id} turn ${turn} is not a participant reply`);
  }
  const { open, answered, saidSoFar } = readable(recorded.criteria, progressAt(recorded, turn));
  const asked = recorded.transcript
    .slice(0, turn)
    .findLast((t) => t.speaker === "agent" && t.kind === "question");
  return {
    transcript: recorded.transcript.slice(0, turn + 1),
    message: reply.text,
    askedAbout: asked?.criterionId ?? null,
    open,
    answered,
    saidSoFar,
  };
}

/**
 * Ordinary turns for counting false corrections: every fifth participant
 * reply from the tenth on, skipping correction turns (spec §5).
 */
export function ordinaryTurns(recorded: Recorded, skip: ReadonlySet<number>): number[] {
  const replies = recorded.transcript.filter((t) => t.speaker === "participant");
  return replies
    .filter((_, i) => i + 1 >= 10 && (i + 1) % 5 === 0)
    .map((t) => t.index)
    .filter((index) => !skip.has(index));
}

export type Outcome = "caught" | "missed" | "false-correction" | "none";

/**
 * What a fresh read of `turn` does: which answered criteria it would unsettle,
 * and the outcome. On a correction turn, `caught` if it unsettles the
 * corrected criterion; on an ordinary turn, `false-correction` if it unsettles
 * anything. Readings are applied as the session applies them, rule 1 included.
 */
export function classify(
  recorded: Recorded,
  turn: number,
  readings: readonly Reading[],
  corrected?: string,
): { outcome: Outcome; unsettled: string[] } {
  const before = progressAt(recorded, turn);
  const message = recorded.transcript[turn]?.text ?? "";
  const after = applyReadings(
    { criteria: recorded.criteria, progress: before, turn, message },
    readings,
  ).progress;
  const changed = unsettled(before, after);
  if (corrected !== undefined) {
    return { outcome: changed.includes(corrected) ? "caught" : "missed", unsettled: changed };
  }
  return { outcome: changed.length > 0 ? "false-correction" : "none", unsettled: changed };
}
