import { describe, expect, it } from "vitest";
import { loadLabelSets } from "../../evals/cases/load.js";
import { normalize } from "../../src/criteria/normalize.js";
import {
  initialProgress,
  LAB_VALUE_PATTERN,
  MAX_ASKS,
  nextCriterion,
  raisability,
} from "../../src/screening/agenda.js";
import type { Progress, ScreeningCriterion } from "../../src/screening/types.js";

/**
 * The agenda is where "never ask about a protocol criterion" and "the
 * conversation ends" are guaranteed. These tests pin both, and pin the
 * lab-value rule against the real labels, including its two known misfires.
 */
function criterion(id: string, type: ScreeningCriterion["type"], text = "x"): ScreeningCriterion {
  return { id, polarity: "inclusion", type, text };
}

describe("raisability", () => {
  it("raises patient and non-lab clinical criteria, and nothing else", () => {
    expect(raisability(criterion("a", "patient"))).toEqual({ raise: true, as: "patient" });
    expect(raisability(criterion("b", "clinical", "ECOG 0 or 1"))).toEqual({
      raise: true,
      as: "clinical",
    });
    expect(raisability(criterion("c", "protocol"))).toEqual({ raise: false, reason: "protocol" });
    expect(raisability(criterion("d", "definitional"))).toEqual({
      raise: false,
      reason: "definitional",
    });
  });

  it("never raises a lab value, and never treats a patient criterion as one", () => {
    expect(raisability(criterion("e", "clinical", "Platelet count >= 100,000/mm^3"))).toEqual({
      raise: false,
      reason: "lab-value",
    });
    // The rule applies to clinical criteria only; a patient criterion is always asked.
    expect(raisability(criterion("f", "patient", "creatinine")).raise).toBe(true);
  });
});

describe("the lab-value rule against the labelled corpus", () => {
  const clinical = loadLabelSets().flatMap((set) =>
    set.criteria
      .filter((l) => l.type === "clinical")
      .map((l) => ({ key: `${set.nctId} ${l.id}`, text: normalize(l.quote).text })),
  );
  const matched = clinical.filter((c) => LAB_VALUE_PATTERN.test(c.text)).map((c) => c.key);

  it("skips the 23 labelled lab-value criteria counted in spec §4.2", () => {
    expect(matched).toHaveLength(23);
  });

  it("includes the known misfire on a leukocyte-depleted transfusion", () => {
    expect(matched).toContain("NCT04385368 L50");
  });

  it("misses 'Adequate organ function', which will therefore be asked", () => {
    expect(matched).not.toContain("NCT04316364 L6");
  });

  // Slice 0011 unescapes `\^`, which changes the text of four labelled criteria.
  // Each is skipped as a lab value in both spellings, so no model call made
  // from labels changes, and 0009's labels conversations stay valid.
  it("skips the four criteria whose exponent 0011 unescapes, in both spellings", () => {
    const touched = [
      ["NCT00077350", "L11"],
      ["NCT00077350", "L13"],
      ["NCT06728852", "L11"],
      ["NCT06728852", "L12"],
    ];
    const sets = loadLabelSets();
    for (const [nctId, id] of touched) {
      const quote = sets.find((s) => s.nctId === nctId)?.criteria.find((l) => l.id === id)?.quote;
      expect(quote, `${nctId} ${id}`).toContain("\\^");
      const escaped = (quote ?? "").replace(/\\([>.<=])/g, "$1");
      for (const text of [escaped, normalize(quote ?? "").text]) {
        expect(raisability(criterion(id ?? "", "clinical", text)), text).toEqual({
          raise: false,
          reason: "lab-value",
        });
      }
    }
  });

  it("does not match ordinary clinical criteria", () => {
    for (const text of [
      "Eastern Cooperative Oncology Group (ECOG) performance status 0 or 1",
      "Has a known history of human immunodeficiency virus (HIV) infection",
      "Malignancies other than NSCLC within 5 years prior to randomization",
      "Past medical history of interstitial lung disease",
    ]) {
      expect(LAB_VALUE_PATTERN.test(text), text).toBe(false);
    }
  });
});

describe("order and attempts", () => {
  const criteria = [
    criterion("L1", "patient"),
    criterion("L2", "protocol"),
    criterion("L3", "clinical", "ECOG 0 or 1"),
    criterion("L4", "patient"),
  ];

  it("starts non-raisable criteria closed with their reason", () => {
    const progress = initialProgress(criteria);

    expect(progress.map((p) => [p.criterionId, p.status, p.reason])).toEqual([
      ["L1", "open", null],
      ["L2", "not-raised", "protocol"],
      ["L3", "open", null],
      ["L4", "open", null],
    ]);
  });

  it("takes open criteria in the order given, skipping settled ones", () => {
    const progress = initialProgress(criteria);
    expect(nextCriterion(criteria, progress)?.id).toBe("L1");

    const settled = progress.map((p) =>
      p.criterionId === "L1" ? { ...p, status: "holds" as const } : p,
    );
    expect(nextCriterion(criteria, settled)?.id).toBe("L3");
  });

  it("stops asking a criterion after its follow-up", () => {
    const progress: Progress[] = initialProgress(criteria).map((p) =>
      p.status === "open" ? { ...p, timesAsked: MAX_ASKS } : p,
    );

    expect(nextCriterion(criteria, progress)).toBeNull();
  });

  it("asks a criterion still open after one ask again straight away, as its follow-up", () => {
    const progress = initialProgress(criteria).map((p) =>
      p.criterionId === "L1" ? { ...p, timesAsked: 1 } : p,
    );

    expect(nextCriterion(criteria, progress)?.id).toBe("L1");
  });
});
