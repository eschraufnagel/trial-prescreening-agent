import { describe, expect, it } from "vitest";
import { loadLabelSet } from "../../evals/cases/load.js";
import { fromLabels, fromParse, studyContext } from "../../evals/screening-input.js";
import type { Criterion, ParsedCriteria } from "../../src/criteria/types.js";

describe("fromLabels", () => {
  const labels = loadLabelSet("NCT00077350");
  const criteria = fromLabels(labels);

  it("keeps every label, in document order", () => {
    expect(criteria).toHaveLength(labels.criteria.length);
    const starts = criteria.map((c) => labels.criteria.find((l) => l.id === c.id)?.start ?? -1);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("removes registry escaping the model should not see", () => {
    const bilirubin = criteria.find((c) => c.id === "L7");
    expect(bilirubin?.text).toBe("Bilirubin < 1.5 x upper limit of normal");
  });
});

describe("fromParse", () => {
  it("gives criteria sharing a span distinct ordinal ids, and maps each object back", () => {
    const shared = { start: 0, end: 10, text: "0123456789" };
    const a: Criterion = {
      id: "NCT1:0-10",
      polarity: "inclusion",
      type: "patient",
      text: "Age 18 or over",
      source: shared,
      confidence: null,
    };
    const b: Criterion = { ...a, type: "clinical", text: "Confirmed NSCLC" };
    const parsed = { criteria: [a, b] } as unknown as ParsedCriteria;

    const { criteria, ids } = fromParse(parsed);

    expect(criteria.map((c) => c.id)).toEqual(["P1", "P2"]);
    expect(ids.get(a)).toBe("P1");
    expect(ids.get(b)).toBe("P2");
  });
});

describe("studyContext", () => {
  it("names the study by its registry title", () => {
    expect(studyContext("NCT04316364").briefTitle.length).toBeGreaterThan(10);
  });
});
