import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ModelAdapter, monthStamp } from "../../src/models/index.js";
import { initialProgress } from "../../src/screening/agenda.js";
import { applyReadings, finalize, type Reading, unsettled } from "../../src/screening/apply.js";
import { read } from "../../src/screening/calls.js";
import { buildReadPrompt, PROMPT_VERSION, type ReadContext } from "../../src/screening/prompts.js";
import { readable } from "../../src/screening/readable.js";
import { withCorrections } from "../../src/screening/session.js";
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
import { ScreeningError } from "../../src/screening/types.js";

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
  return {
    transcript: recorded.transcript.slice(0, turn + 1),
    message: reply.text,
    askedAbout: askedAt(recorded, turn),
    open,
    answered,
    saidSoFar,
  };
}

/** The criterion the last question before `turn` named, if any. */
function askedAt(recorded: Recorded, turn: number): string | null {
  const asked = recorded.transcript
    .slice(0, turn)
    .findLast((t) => t.speaker === "agent" && t.kind === "question");
  return asked?.criterionId ?? null;
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
    {
      criteria: recorded.criteria,
      progress: before,
      turn,
      message,
      askedAbout: askedAt(recorded, turn),
    },
    readings,
  ).progress;
  const changed = unsettled(before, after);
  if (corrected !== undefined) {
    return { outcome: changed.includes(corrected) ? "caught" : "missed", unsettled: changed };
  }
  return { outcome: changed.length > 0 ? "false-correction" : "none", unsettled: changed };
}

/** One replayed turn, as the result file records it. */
export interface ReplayedTurn {
  conversation: string;
  turn: number;
  kind: "correction" | "ordinary";
  /** On a correction turn. */
  criterionId?: string;
  shape?: Shape;
  outcome: Outcome | "failed";
  unsettled: string[];
  /** The user prompt's length in characters: late turns list many answered criteria. */
  promptChars: number;
  /** What the read call returned, for reading. On `failed`, why. */
  readings?: Reading[];
  corrections?: Reading[];
  problems?: string[];
}

export interface ReplayResult {
  month: string;
  model: string;
  quantization: string;
  temperature: number | null;
  seed: number | null;
  adapter: string;
  thinking?: "off";
  promptVersion: string;
  calls: number;
  turns: ReplayedTurn[];
  summary: ReplaySummary;
}

export interface ReplaySummary {
  /** The bar counts these: corrections of an answer that was settled. */
  settled: { caught: number; of: number };
  /** Reported, not counted: the other shapes, caught meaning only that something unsettled. */
  otherShapes: { conversation: string; criterionId: string; shape: Shape; outcome: string }[];
  ordinary: { turns: number; falseCorrections: number; failed: number };
}

/**
 * Replays the read call at every correction turn and the ordinary sample, one
 * call each through `read()`, and classifies what each would do. A turn whose
 * call fails after its retries is recorded as `failed`, not dropped.
 */
export async function replay(
  adapter: ModelAdapter,
  options: { cases?: CasesFile; root?: string; onTurn?: (t: ReplayedTurn) => void } = {},
): Promise<ReplayResult> {
  const file = options.cases ?? loadCases();
  const conversations = new Map(
    file.conversations.map((ref) => [ref.id, loadRecorded(ref, options.root)]),
  );
  const plan: { recorded: Recorded; turn: number; c?: CorrectionCase }[] = [];
  for (const c of file.cases) {
    const recorded = conversations.get(c.conversation);
    if (recorded === undefined) throw new Error(`no conversation ${c.conversation}`);
    plan.push({ recorded, turn: c.turn, c });
  }
  for (const recorded of conversations.values()) {
    const skip = new Set(
      file.cases.filter((c) => c.conversation === recorded.id).map((c) => c.turn),
    );
    for (const turn of ordinaryTurns(recorded, skip)) plan.push({ recorded, turn });
  }

  let calls = 0;
  const turns: ReplayedTurn[] = [];
  for (const { recorded, turn, c } of plan) {
    const context = readContextAt(recorded, turn);
    const base = {
      conversation: recorded.id,
      turn,
      kind: c === undefined ? ("ordinary" as const) : ("correction" as const),
      ...(c === undefined ? {} : { criterionId: c.criterionId, shape: c.shape }),
      promptChars: buildReadPrompt(context).length,
    };
    let replayed: ReplayedTurn;
    try {
      const result = await read(adapter, context);
      calls += result.calls;
      const { readings, corrections } = result.value;
      const merged = withCorrections(readings, corrections);
      replayed = {
        ...base,
        ...classify(recorded, turn, merged, c?.criterionId),
        readings,
        corrections,
      };
    } catch (error) {
      if (!(error instanceof ScreeningError)) throw error;
      // read() gives up after its two attempts.
      calls += 2;
      replayed = { ...base, outcome: "failed", unsettled: [], problems: [...error.problems] };
    }
    turns.push(replayed);
    options.onTurn?.(replayed);
  }

  const d = adapter.descriptor;
  return {
    month: monthStamp(),
    model: d.model,
    quantization: d.quantization,
    temperature: d.temperature,
    seed: d.seed,
    adapter: d.adapter,
    ...(d.thinking === undefined ? {} : { thinking: d.thinking }),
    promptVersion: PROMPT_VERSION,
    calls,
    turns,
    summary: summarize(turns),
  };
}

export function summarize(turns: readonly ReplayedTurn[]): ReplaySummary {
  const settled = turns.filter((t) => t.shape === "settled");
  const ordinary = turns.filter((t) => t.kind === "ordinary");
  return {
    settled: { caught: settled.filter((t) => t.outcome === "caught").length, of: settled.length },
    otherShapes: turns
      .filter((t) => t.kind === "correction" && t.shape !== "settled")
      .map((t) => ({
        conversation: t.conversation,
        criterionId: t.criterionId ?? "",
        shape: t.shape ?? "settled",
        outcome: t.outcome,
      })),
    ordinary: {
      turns: ordinary.length,
      falseCorrections: ordinary.filter((t) => t.outcome === "false-correction").length,
      failed: ordinary.filter((t) => t.outcome === "failed").length,
    },
  };
}
