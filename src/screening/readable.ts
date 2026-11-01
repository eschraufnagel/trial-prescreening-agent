import { raisability } from "./agenda.js";
import type { AnsweredCriterion } from "./prompts.js";
import type { Progress, ScreeningCriterion } from "./types.js";

/**
 * What the read call is shown about each raisable criterion: open ones it may
 * answer, with what was said so far, and answered ones with what was recorded
 * and the words behind it, so it can tell whether a reply changes one.
 *
 * Lifted out of the session in slice 0022, so the read replay rebuilds the
 * read call's input with the same code the session uses, not a copy.
 */
export interface Readable {
  open: ScreeningCriterion[];
  answered: AnsweredCriterion[];
  saidSoFar: Record<string, { reading: string; quote: string }>;
}

export function readable(
  criteria: readonly ScreeningCriterion[],
  progress: readonly Progress[],
): Readable {
  const byId = new Map(progress.map((p) => [p.criterionId, p]));
  const raisable = criteria.filter((c) => raisability(c).raise);
  const answered: Array<{ record: AnsweredCriterion; turn: number }> = [];
  const saidSoFar: Record<string, { reading: string; quote: string }> = {};
  for (const c of raisable) {
    const p = byId.get(c.id);
    if (p === undefined) {
      continue;
    }
    const turn = p.evidence.at(-1)?.turn ?? -1;
    if (p.status === "holds" || p.status === "does-not-hold") {
      answered.push({ record: recordOf(c, "recorded", p.status, p), turn });
    } else if (p.status === "chart-review") {
      answered.push({ record: recordOf(c, "reported", p.reported ?? "nothing", p), turn });
    } else if (p.status === "open") {
      const last = p.evidence.at(-1);
      if (last !== undefined) {
        saidSoFar[c.id] = { reading: last.reading, quote: last.quote };
      }
    }
  }
  return {
    open: raisable.filter((c) => byId.get(c.id)?.status === "open"),
    // Most recently answered first: a correction usually follows closely
    // on what it corrects, and a long list otherwise buries it (slice 0009).
    // A stable sort keeps protocol order among answers from one turn.
    answered: answered.sort((a, b) => b.turn - a.turn).map((a) => a.record),
    saidSoFar,
  };
}

const DETERMINATE_READINGS: readonly string[] = ["holds", "does-not-hold", "does-not-apply"];

/** An answered criterion with the words behind its last determinate reading, or its last words. */
function recordOf(
  criterion: ScreeningCriterion,
  kind: AnsweredCriterion["kind"],
  value: string,
  progress: Progress,
): AnsweredCriterion {
  const evidence =
    progress.evidence.findLast((e) => DETERMINATE_READINGS.includes(e.reading)) ??
    progress.evidence.at(-1);
  return { criterion, kind, value, ...(evidence === undefined ? {} : { quote: evidence.quote }) };
}
