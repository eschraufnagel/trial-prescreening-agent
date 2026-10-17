import type { FindingReason, Progress, ScreeningCriterion } from "./types.js";

/**
 * Which criteria the agent raises, in what order, and how many times.
 *
 * All of it is code, none of it is the model (spec D3). The model is later
 * asked to phrase a question about the criterion chosen here; it never chooses.
 * That is what makes "never ask about a protocol criterion", "never ask more
 * than twice" and "the conversation ends" properties that tests can pin rather
 * than behavior a prompt hopes for.
 */

/** A criterion is asked at most this many times: once, and one follow-up. */
export const MAX_ASKS = 2;

/**
 * A `clinical` criterion that names a laboratory measurement.
 *
 * Almost nobody knows their creatinine clearance, and asking turns the
 * conversation into a string of "I don't know" that adds nothing the chart will
 * not show (spec §4.2). The rule is textual, not clinical: an analyte name or a
 * lab unit in the criterion's text. It misfires at the edges, and both known
 * misfires are pinned by tests:
 *
 * - NCT04385368 L50, a *leukocyte-depleted* transfusion, matches on the analyte
 *   name although a patient could answer it.
 * - "Adequate organ function" (NCT04316364 L6) is a lab requirement in all but
 *   name and does not match, so it is asked.
 *
 * A misfire is visible: every criterion this skips carries `lab-value` in the
 * result, where a coordinator will see it.
 */
export const LAB_VALUE_PATTERN =
  /\b(bilirubin|creatinine|h(a)?emoglobin|platelets?|neutrophils?|granulocytes?|leukocytes?|wbc|anc|ast|alt|sgot|sgpt|aminotransferase|transaminases?|inr|ptt|prothrombin|potassium|magnesium|uln)\b|upper limit of normal|mg\/dl|g\/dl|\bg\/l\b|\/mm3|\/mm\\?\^3|\/mcl|\/µl|\/ul\b|10\\?\^9|ml\/min|mmol|µmol/i;

export type Raisability =
  | { raise: true; as: "patient" | "clinical" }
  | { raise: false; reason: Extract<FindingReason, "lab-value" | "protocol" | "definitional"> };

export function raisability(criterion: ScreeningCriterion): Raisability {
  switch (criterion.type) {
    case "patient":
      return { raise: true, as: "patient" };
    case "clinical":
      return LAB_VALUE_PATTERN.test(criterion.text)
        ? { raise: false, reason: "lab-value" }
        : { raise: true, as: "clinical" };
    case "protocol":
      return { raise: false, reason: "protocol" };
    case "definitional":
      return { raise: false, reason: "definitional" };
  }
}

/** The starting point: raisable criteria open, the rest already closed with a reason. */
export function initialProgress(criteria: readonly ScreeningCriterion[]): Progress[] {
  return criteria.map((criterion) => {
    const r = raisability(criterion);
    return r.raise
      ? { criterionId: criterion.id, status: "open", reason: null, evidence: [], timesAsked: 0 }
      : {
          criterionId: criterion.id,
          status: "not-raised",
          reason: r.reason,
          evidence: [],
          timesAsked: 0,
        };
  });
}

/**
 * The next criterion to ask about, or null when the conversation is done.
 *
 * Criteria are taken in the order given, which the input adapters set to
 * document order. A criterion still open after `MAX_ASKS` is not asked again;
 * `finalize` closes it. There is no early stop (spec D5): a disqualifying
 * answer changes nothing here.
 */
export function nextCriterion(
  criteria: readonly ScreeningCriterion[],
  progress: readonly Progress[],
): ScreeningCriterion | null {
  const byId = new Map(progress.map((p) => [p.criterionId, p]));
  return (
    criteria.find((c) => {
      const p = byId.get(c.id);
      return p !== undefined && p.status === "open" && p.timesAsked < MAX_ASKS;
    }) ?? null
  );
}
