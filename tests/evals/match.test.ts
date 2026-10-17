import { describe, expect, it } from "vitest";
import type { LabelSet } from "../../evals/cases/types.js";
import { MATCHER_SETTINGS, matchCriteria } from "../../evals/graders/match.js";
import { poolMetrics, scoreStudy } from "../../evals/graders/metrics.js";
import type { Criterion } from "../../src/criteria/types.js";

/**
 * The matcher decides every number this project publishes, and a miscalibrated
 * one produces plausible numbers rather than obviously wrong ones. These cases
 * are built by hand so each says what the rule should do, independently of any
 * study.
 */
function label(
  id: string,
  quote: string,
  start: number,
  overrides: Partial<LabelSet["criteria"][number]> = {},
): LabelSet["criteria"][number] {
  return {
    id,
    quote,
    start,
    end: start + quote.length,
    polarity: "inclusion",
    type: "clinical",
    ...overrides,
  };
}

function prediction(
  id: string,
  text: string,
  start: number,
  length: number,
  overrides: Partial<Criterion> = {},
): Criterion {
  return {
    id,
    polarity: "inclusion",
    type: "clinical",
    text,
    source: { start, end: start + length, text: "" },
    confidence: 1,
    ...overrides,
  };
}

function labelSet(
  criteria: LabelSet["criteria"],
  notCriteria: LabelSet["notCriteria"] = [],
): LabelSet {
  return {
    nctId: "NCT00000000",
    labelledAt: "2000-01-22",
    criteriaTextSha: "0".repeat(64),
    criteria,
    notCriteria,
  };
}

const ECOG = "ECOG performance status of 0 or 1";

describe("matchCriteria", () => {
  it("matches a criterion restated in the model's own words", () => {
    const labels = labelSet([label("L1", ECOG, 100)]);
    const predictions = [
      prediction("P1", "The patient has an ECOG performance status of 0 or 1", 100, ECOG.length),
    ];

    const result = matchCriteria(predictions, labels);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.label.id).toBe("L1");
    expect(result.missed).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it("counts a label nothing overlapped as a miss", () => {
    const labels = labelSet([label("L1", ECOG, 100), label("L2", "Hemoglobin >= 9 g/L", 400)]);
    const predictions = [prediction("P1", "ECOG performance status of 0 or 1", 100, ECOG.length)];

    const result = matchCriteria(predictions, labels);

    expect(result.matched).toHaveLength(1);
    expect(result.missed.map((entry) => entry.id)).toEqual(["L2"]);
  });

  it("counts a prediction matching nothing as an extra", () => {
    const labels = labelSet([label("L1", ECOG, 100)]);
    const predictions = [
      prediction("P1", "ECOG performance status of 0 or 1", 100, ECOG.length),
      prediction("P2", "Life expectancy greater than 3 months", 900, 37),
    ];

    const result = matchCriteria(predictions, labels);

    expect(result.extra.map((entry) => entry.id)).toEqual(["P2"]);
  });

  // The case the annotation guide's granularity rule creates constantly: one
  // sentence, several requirements, overlapping spans.
  describe("several criteria drawn from one sentence", () => {
    const labels = labelSet([
      label("L1", "Absolute granulocyte count >= 1500/mm3", 100),
      label("L2", "WBC >= 3000/mm^3", 142),
    ]);

    it("pairs each with the prediction that says the same thing", () => {
      const predictions = [
        prediction("P1", "Absolute granulocyte count is at least 1500/mm3", 100, 38),
        prediction("P2", "WBC is at least 3000/mm^3", 142, 16),
      ];

      const result = matchCriteria(predictions, labels);

      expect(result.matched).toHaveLength(2);
      const pairs = result.matched.map((pair) => `${pair.label.id}:${pair.prediction.id}`);
      expect(pairs).toEqual(["L1:P1", "L2:P2"]);
    });

    // Without the text signal these two would be interchangeable, and the
    // matcher would pair them by whichever sorted first.
    it("does not swap them when their spans both cover the sentence", () => {
      const predictions = [
        prediction("P1", "WBC is at least 3000/mm^3", 100, 58),
        prediction("P2", "Absolute granulocyte count is at least 1500/mm3", 100, 58),
      ];

      const result = matchCriteria(predictions, labels);
      const pairs = result.matched.map((pair) => `${pair.label.id}:${pair.prediction.id}`);

      expect(pairs).toContain("L1:P2");
      expect(pairs).toContain("L2:P1");
    });

    it("never uses one prediction for two labels", () => {
      const predictions = [prediction("P1", "Adequate haematological function", 100, 58)];

      const result = matchCriteria(predictions, labels);

      expect(result.matched).toHaveLength(1);
      expect(result.missed).toHaveLength(1);
    });
  });

  // An alternation is one criterion with several acceptable answers, so a
  // parser that returns it whole must not be charged for the alternatives.
  it("matches an alternation as one criterion rather than three misses", () => {
    const quote = "Documented activating EGFR mutation (Exon 19 deletion, T790M, or L858R)";
    const labels = labelSet([label("L1", quote, 200)]);
    const predictions = [
      prediction(
        "P1",
        "Documented activating EGFR mutation: exon 19 deletion, T790M, or L858R",
        200,
        quote.length,
      ),
    ];

    const result = matchCriteria(predictions, labels);

    expect(result.matched).toHaveLength(1);
    expect(result.missed).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it("rejects an overlapping pair that is plainly a different criterion", () => {
    const labels = labelSet([label("L1", "Life expectancy greater than 3 months", 100)]);
    const predictions = [prediction("P1", "Serum creatinine below 1.5 mg per decilitre", 120, 30)];

    const result = matchCriteria(predictions, labels);

    expect(result.matched).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.score).toBeLessThan(MATCHER_SETTINGS.floor);
  });

  it("reports near misses so a floor in the wrong place is visible", () => {
    const labels = labelSet([label("L1", "Life expectancy greater than 3 months", 100)]);
    // Overlaps a little and shares no words: below the floor on both signals.
    const predictions = [prediction("P1", "Unrelated requirement entirely", 128, 20)];

    expect(matchCriteria(predictions, labels).rejected).toHaveLength(1);
  });

  /**
   * A consequence of the weights worth stating rather than discovering: at
   * 0.6 span weight and a 0.3 floor, a span IoU above 0.5 clears the floor by
   * itself. A prediction sitting squarely on a label's span matches even with
   * no words in common.
   *
   * Defensible — position in the source is strong evidence, and a model that
   * restates a criterion in entirely different vocabulary is still pointing at
   * it. But it means the floor is effectively a span test for well-aligned
   * pairs, and the text signal only decides between competing candidates.
   * Pinned here so a change to either constant shows up as a failure.
   */
  it("matches on span alone when the spans align closely", () => {
    const labels = labelSet([label("L1", "Life expectancy greater than 3 months", 100)]);
    const predictions = [prediction("P1", "Unrelated requirement entirely", 110, 20)];

    const result = matchCriteria(predictions, labels);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.textF1).toBe(0);
    expect(result.matched[0]?.spanIou).toBeGreaterThan(0.5);
  });

  it("is stable: the same input gives the same pairing", () => {
    const labels = labelSet([label("L1", ECOG, 100), label("L2", "Hemoglobin >= 9 g/L", 140)]);
    const predictions = [
      prediction("P1", "ECOG performance status of 0 or 1", 100, 33),
      prediction("P2", "Hemoglobin of at least 9 g/L", 140, 19),
    ];

    const first = matchCriteria(predictions, labels);
    const second = matchCriteria(predictions, labels);

    expect(first.matched.map((p) => p.prediction.id)).toEqual(
      second.matched.map((p) => p.prediction.id),
    );
  });

  describe("narrative false positives", () => {
    // The distinction nothing in 0002 could produce: a criterion invented out
    // of procedural prose, rather than one worded differently.
    it("flags an extra landing in text a reader ruled out", () => {
      const labels = labelSet(
        [label("L1", ECOG, 100)],
        [
          {
            quote: "because Triapine has teratogenic potential",
            start: 500,
            end: 542,
            why: "rationale",
          },
        ],
      );
      const predictions = [
        prediction("P1", "ECOG performance status of 0 or 1", 100, ECOG.length),
        prediction("P2", "Triapine has teratogenic potential", 505, 30),
      ];

      const result = matchCriteria(predictions, labels);

      expect(result.narrative).toHaveLength(1);
      expect(result.narrative[0]?.prediction.id).toBe("P2");
      expect(result.narrative[0]?.notCriterion.why).toBe("rationale");
    });

    it("does not flag an extra that merely grazes a ruled-out passage", () => {
      const labels = labelSet(
        [label("L1", ECOG, 100)],
        [{ quote: "rationale sentence here", start: 512, end: 535, why: "rationale" }],
      );
      // Overlaps by 8 of its 40 characters, well under the half required.
      const predictions = [prediction("P1", "Something else entirely", 480, 40)];

      expect(matchCriteria(predictions, labels).narrative).toEqual([]);
    });

    it("counts a narrative false positive as an extra too, not instead", () => {
      const labels = labelSet(
        [],
        [
          {
            quote: "because Triapine has teratogenic potential",
            start: 500,
            end: 542,
            why: "rationale",
          },
        ],
      );
      const predictions = [prediction("P1", "Triapine has teratogenic potential", 505, 30)];

      const result = matchCriteria(predictions, labels);

      expect(result.extra).toHaveLength(1);
      expect(result.narrative).toHaveLength(1);
    });
  });

  describe("edges", () => {
    it("handles no predictions at all", () => {
      const result = matchCriteria([], labelSet([label("L1", ECOG, 100)]));

      expect(result.missed).toHaveLength(1);
      expect(result.matched).toEqual([]);
    });

    it("handles no labels at all", () => {
      const result = matchCriteria([prediction("P1", ECOG, 100, 33)], labelSet([]));

      expect(result.extra).toHaveLength(1);
      expect(result.matched).toEqual([]);
    });

    it("handles both empty", () => {
      const result = matchCriteria([], labelSet([]));

      expect(result).toMatchObject({ matched: [], missed: [], extra: [], narrative: [] });
    });
  });
});

describe("scoreStudy", () => {
  const labels = labelSet([
    label("L1", ECOG, 100),
    label("L2", "Hemoglobin >= 9 g/L", 140),
    label("L3", "Life expectancy greater than 3 months", 200),
  ]);

  it("reports recall against the labels, not against the predictions", () => {
    const predictions = [prediction("P1", "ECOG performance status of 0 or 1", 100, 33)];

    const metrics = scoreStudy("NCT00000000", matchCriteria(predictions, labels));

    expect(metrics.labels).toBe(3);
    expect(metrics.matched).toBe(1);
    expect(metrics.strictRecall).toBeCloseTo(1 / 3);
    expect(metrics.precision).toBe(1);
  });

  it("scores type and polarity only over matched pairs", () => {
    const predictions = [
      prediction("P1", "ECOG performance status of 0 or 1", 100, 33, { type: "patient" }),
      prediction("P2", "Hemoglobin of at least 9 g/L", 140, 19),
    ];

    const metrics = scoreStudy("NCT00000000", matchCriteria(predictions, labels));

    expect(metrics.matched).toBe(2);
    expect(metrics.typeAccuracy).toBe(0.5);
    expect(metrics.polarityAccuracy).toBe(1);
  });

  // A study with nothing to match has no accuracy. Reporting 0 would claim a
  // failure that did not happen; reporting 1 would claim a success.
  it("reports null rather than a number when there is no denominator", () => {
    const metrics = scoreStudy("NCT00000000", matchCriteria([], labelSet([])));

    expect(metrics.strictRecall).toBeNull();
    expect(metrics.coverageRecall).toBeNull();
    expect(metrics.precision).toBeNull();
    expect(metrics.typeAccuracy).toBeNull();
  });

  it("reports perfect recall when every label is found", () => {
    const predictions = [
      prediction("P1", "ECOG performance status of 0 or 1", 100, 33),
      prediction("P2", "Hemoglobin of at least 9 g/L", 140, 19),
      prediction("P3", "Life expectancy greater than 3 months", 200, 37),
    ];

    expect(scoreStudy("NCT00000000", matchCriteria(predictions, labels)).strictRecall).toBe(1);
  });

  it("reports zero recall when nothing is found, which is not the same as null", () => {
    const metrics = scoreStudy("NCT00000000", matchCriteria([], labels));

    expect(metrics.strictRecall).toBe(0);
    expect(metrics.coverageRecall).toBe(0);
  });
});

/**
 * A requirement bundled into a neighbouring criterion was still captured. On
 * NCT00077350 all five strict misses turned out to sit inside a criterion the
 * parser did return, and counting them as content it never found was untrue.
 */
describe("merged labels", () => {
  const labels = labelSet([
    label("L1", "Absolute granulocyte count >= 1500/mm3", 100),
    label("L2", "WBC >= 3000/mm^3", 142),
  ]);

  it("credits coverage when one prediction bundles two requirements", () => {
    const predictions = [
      prediction("P1", "Absolute granulocyte count >= 1500/mm3 and WBC >= 3000/mm^3", 100, 58),
    ];

    const result = matchCriteria(predictions, labels);

    expect(result.matched).toHaveLength(1);
    expect(result.merged).toHaveLength(1);
    expect(result.missed).toEqual([]);
    expect(result.merged[0]?.label.id).toBe("L2");
  });

  it("keeps the granularity failure visible instead of hiding it in recall", () => {
    const predictions = [
      prediction("P1", "Absolute granulocyte count >= 1500/mm3 and WBC >= 3000/mm^3", 100, 58),
    ];

    const metrics = scoreStudy("NCT00000000", matchCriteria(predictions, labels));

    expect(metrics.coverageRecall).toBe(1);
    expect(metrics.strictRecall).toBe(0.5);
    expect(metrics.mergeRate).toBe(0.5);
  });

  // The guard against the degenerate parser: one criterion spanning the whole
  // block contains every label but mentions none of them.
  it("does not credit a prediction that contains a label but says nothing of it", () => {
    const predictions = [prediction("P1", "The subject is eligible", 0, 5000)];

    const result = matchCriteria(predictions, labels);

    expect(result.merged).toEqual([]);
    expect(result.missed).toHaveLength(2);
  });

  it("reports a bundled label as merged rather than missed", () => {
    const wordy = labelSet([
      label("L1", "Pregnant women are excluded from this study", 1472),
      label("L2", "breastfeeding should be discontinued if the mother is treated", 2000),
    ]);
    const predictions = [
      prediction("P1", "Women must not be pregnant or breastfeeding.", 1472, 1213),
    ];

    const result = matchCriteria(predictions, wordy);

    expect(result.missed).toEqual([]);
    expect(result.matched.length + result.merged.length).toBe(2);
  });

  // Coverage on its own is gameable, so the pair of numbers has to give it
  // away rather than a caveat in prose.
  it("makes a degenerate parse visible through the pair of numbers", () => {
    const many = labelSet(
      Array.from({ length: 10 }, (_, i) => label(`L${i}`, `Requirement number ${i} here`, i * 50)),
    );
    const predictions = [prediction("P1", "Requirement number here", 0, 5000)];

    const metrics = scoreStudy("NCT00000000", matchCriteria(predictions, many));

    expect(metrics.coverageRecall).toBeGreaterThan(0.5);
    expect(metrics.strictRecall).toBeLessThan(0.2);
  });
});

describe("poolMetrics", () => {
  // Pooled over criteria, so a four-criterion study cannot weigh as heavily as
  // a sixty-criterion one.
  it("pools over criteria rather than averaging study rates", () => {
    const small = scoreStudy(
      "NCT00000001",
      matchCriteria([prediction("P1", ECOG, 100, 33)], labelSet([label("L1", ECOG, 100)])),
    );
    const large = scoreStudy(
      "NCT00000002",
      matchCriteria(
        [],
        labelSet(Array.from({ length: 9 }, (_, i) => label(`L${i}`, ECOG, 100 + i * 50))),
      ),
    );

    const pooled = poolMetrics([small, large]);

    expect(pooled.labels).toBe(10);
    expect(pooled.matched).toBe(1);
    // A mean of the two study rates would be 0.5. Pooled is 0.1.
    expect(pooled.strictRecall).toBeCloseTo(0.1);
  });

  it("counts studies and sums narrative false positives", () => {
    const one = scoreStudy("NCT00000001", matchCriteria([], labelSet([label("L1", ECOG, 100)])));

    const pooled = poolMetrics([one, one]);

    expect(pooled.studies).toBe(2);
    expect(pooled.labels).toBe(2);
  });

  it("handles an empty set of studies", () => {
    expect(poolMetrics([])).toMatchObject({
      studies: 0,
      labels: 0,
      strictRecall: null,
      coverageRecall: null,
    });
  });
});
