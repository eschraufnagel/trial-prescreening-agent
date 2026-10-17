import { describe, expect, it } from "vitest";
import { CriteriaParseError } from "../../src/criteria/types.js";
import { readCriteriaEnvelope } from "../../src/criteria/validate.js";

/**
 * Model output is untrusted input. These tests are about what happens when it
 * is wrong, because that is the case the eval harness in 0003 would otherwise
 * measure as model quality: a criterion quietly relabelled to something valid
 * looks like a parse, and a criterion silently dropped looks like a short one.
 */
const CONTEXT = "NCT00000000";

function envelope(...criteria: unknown[]): unknown {
  return { criteria };
}

const GOOD = {
  quote: "18 years of age or older",
  text: "Patient is 18 years of age or older",
  polarity: "inclusion",
  type: "patient",
  confidence: 0.95,
};

describe("readCriteriaEnvelope", () => {
  it("reads a well-formed criterion", () => {
    const { valid, rejected } = readCriteriaEnvelope(envelope(GOOD), CONTEXT);

    expect(rejected).toEqual([]);
    expect(valid).toEqual([
      {
        quote: "18 years of age or older",
        text: "Patient is 18 years of age or older",
        polarity: "inclusion",
        type: "patient",
        appliesTo: null,
        confidence: 0.95,
      },
    ]);
  });

  it("accepts all four criterion types", () => {
    const types = ["patient", "clinical", "definitional", "protocol"];
    const { valid, rejected } = readCriteriaEnvelope(
      envelope(...types.map((type) => ({ ...GOOD, type }))),
      CONTEXT,
    );

    expect(rejected).toEqual([]);
    expect(valid.map((criterion) => criterion.type)).toEqual(types);
  });

  it("keeps an arm or phase condition as the text the source used", () => {
    const { valid } = readCriteriaEnvelope(
      envelope({ ...GOOD, appliesTo: "  Phase I portion  " }),
      CONTEXT,
    );

    expect(valid[0]?.appliesTo).toBe("Phase I portion");
  });

  it("empties an all-whitespace appliesTo to null rather than keeping it", () => {
    const { valid } = readCriteriaEnvelope(envelope({ ...GOOD, appliesTo: "   " }), CONTEXT);

    expect(valid[0]?.appliesTo).toBeNull();
  });

  describe("whole-parse failures", () => {
    it.each([
      ["a string", "criteria"],
      ["an array", []],
      ["null", null],
      ["a number", 7],
    ])("throws when the response is %s", (_label, content) => {
      expect(() => readCriteriaEnvelope(content, CONTEXT)).toThrow(CriteriaParseError);
    });

    it("throws when there is no criteria array, and says what keys there were", () => {
      expect(() => readCriteriaEnvelope({ results: [] }, CONTEXT)).toThrow(/keys: results/);
    });

    it("names the trial, so a failure in a batch says which study", () => {
      expect(() => readCriteriaEnvelope({}, "NCT04385368")).toThrow(/NCT04385368/);
    });
  });

  describe("rejections", () => {
    it("rejects rather than coerces an unknown type", () => {
      const { valid, rejected } = readCriteriaEnvelope(envelope({ ...GOOD, type: "lab" }), CONTEXT);

      expect(valid).toEqual([]);
      expect(rejected[0]?.reason).toMatch(/type "lab" is not one of/);
    });

    it("rejects an unknown polarity", () => {
      const { rejected } = readCriteriaEnvelope(envelope({ ...GOOD, polarity: "maybe" }), CONTEXT);

      expect(rejected[0]?.reason).toMatch(/polarity "maybe"/);
    });

    it.each([
      ["a missing quote", { ...GOOD, quote: undefined }],
      ["an empty quote", { ...GOOD, quote: "  " }],
      ["a non-string quote", { ...GOOD, quote: 42 }],
      ["missing text", { ...GOOD, text: undefined }],
      ["a criterion that is not an object", "just a string"],
    ])("rejects %s", (_label, entry) => {
      const { valid, rejected } = readCriteriaEnvelope(envelope(entry), CONTEXT);

      expect(valid).toEqual([]);
      expect(rejected).toHaveLength(1);
    });

    it("reports every problem with a criterion, not just the first", () => {
      const { rejected } = readCriteriaEnvelope(
        envelope({ quote: "", text: "", polarity: "x", type: "y" }),
        CONTEXT,
      );

      expect(rejected[0]?.reason.split(";").length).toBeGreaterThanOrEqual(4);
    });

    it("keeps the offending value so a bad parse can be diagnosed without a rerun", () => {
      const bad = { ...GOOD, type: "lab" };
      const { rejected } = readCriteriaEnvelope(envelope(bad), CONTEXT);

      expect(rejected[0]?.raw).toEqual(bad);
      expect(rejected[0]?.quote).toBe("18 years of age or older");
    });

    // One bad criterion is not a failed parse. Thirty-nine good ones survive.
    it("keeps the good criteria alongside the bad", () => {
      const { valid, rejected } = readCriteriaEnvelope(
        envelope(GOOD, { ...GOOD, type: "lab" }, GOOD),
        CONTEXT,
      );

      expect(valid).toHaveLength(2);
      expect(rejected).toHaveLength(1);
    });

    it("returns nothing at all for an empty criteria array, without throwing", () => {
      expect(readCriteriaEnvelope(envelope(), CONTEXT)).toEqual({ valid: [], rejected: [] });
    });
  });

  describe("confidence", () => {
    it("is null when the model does not give one", () => {
      const { valid } = readCriteriaEnvelope(envelope({ ...GOOD, confidence: undefined }), CONTEXT);

      expect(valid[0]?.confidence).toBeNull();
    });

    it("is null when the model explicitly says null", () => {
      const { valid } = readCriteriaEnvelope(envelope({ ...GOOD, confidence: null }), CONTEXT);

      expect(valid[0]?.confidence).toBeNull();
    });

    it.each([0, 0.5, 1])("accepts %s", (confidence) => {
      const { valid } = readCriteriaEnvelope(envelope({ ...GOOD, confidence }), CONTEXT);

      expect(valid[0]?.confidence).toBe(confidence);
    });

    // Clamping would hide a model that has misunderstood the field, which is
    // worth knowing about before its confidences are used for anything.
    it.each([1.5, -0.2, Number.NaN, "high"])("rejects %s rather than clamping it", (confidence) => {
      const { valid, rejected } = readCriteriaEnvelope(envelope({ ...GOOD, confidence }), CONTEXT);

      expect(valid).toEqual([]);
      expect(rejected[0]?.reason).toMatch(/confidence/);
    });
  });
});
