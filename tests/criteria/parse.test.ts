import { describe, expect, it } from "vitest";
import {
  CriteriaParseError,
  isPatientAnswerable,
  NORMALIZE_VERSION,
  PROMPT_VERSION,
  parseCriteria,
} from "../../src/criteria/index.js";
import { FakeModelAdapter, type ScriptedResponse } from "../../src/models/index.js";
import type { Trial } from "../../src/trials/index.js";
import { getTrial } from "../../src/trials/index.js";

/**
 * The parser is exercised with a scripted adapter, so these tests say what the
 * code does with a model's answer rather than what the model answers. The
 * second question belongs to `evals/`, and mixing them would put a
 * non-deterministic assertion in a suite that has to stay fast and certain.
 *
 * The trial is real. Quotes have to occur in a real fixture to resolve, so an
 * invented block would not exercise the thing most likely to break.
 */
const TRIAL: Trial = getTrial("NCT04316364");
const TEXT = TRIAL.eligibility.criteriaText;

/** Quotes that genuinely occur in this fixture, in document order. */
const REAL_QUOTE = "Eastern Cooperative Oncology Group (ECOG) performance status 0 or 1";
const CONSENT_QUOTE =
  "Women of childbearing age without sterilizing or male, must agree to use contraception";

function criterion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    quote: REAL_QUOTE,
    text: "ECOG performance status is 0 or 1",
    polarity: "inclusion",
    type: "clinical",
    confidence: 0.9,
    ...overrides,
  };
}

function adapterReturning(...criteria: unknown[]): FakeModelAdapter {
  return new FakeModelAdapter([{ kind: "json", content: { criteria } }]);
}

function scripted(response: ScriptedResponse): FakeModelAdapter {
  return new FakeModelAdapter([response]);
}

describe("parseCriteria", () => {
  it("returns criteria whose spans slice back out of the registry's own text", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion()));

    expect(parsed.nctId).toBe("NCT04316364");
    expect(parsed.criteria).toHaveLength(1);

    const [only] = parsed.criteria;
    expect(TEXT.slice(only?.source.start, only?.source.end)).toBe(only?.source.text);
    expect(only?.source.text).toBe(REAL_QUOTE);
  });

  it("derives an id from the span, so two runs agree on the same sentence", async () => {
    const first = await parseCriteria(TRIAL, adapterReturning(criterion()));
    // A second run that found an extra criterion earlier in the block must not
    // renumber the one both runs found.
    const second = await parseCriteria(
      TRIAL,
      adapterReturning(criterion({ quote: "Evaluation by an attending" }), criterion()),
    );

    expect(second.criteria.map((c) => c.id)).toContain(first.criteria[0]?.id);
  });

  it("records everything needed to reproduce the run", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion()));

    expect(parsed.run).toMatchObject({
      model: "fake",
      quantization: "none",
      temperature: 0,
      seed: 0,
      adapter: "fake",
      promptVersion: PROMPT_VERSION,
    });
    expect(Date.parse(parsed.run.timestamp)).not.toBeNaN();
  });

  it("sends the cleaned text and asks for JSON", async () => {
    const adapter = adapterReturning(criterion());
    await parseCriteria(TRIAL, adapter);

    const request = adapter.requests[0];
    expect(request?.responseFormat).toBe("json");
    expect(request?.user).toContain("NCT04316364");
    expect(request?.user).toContain("Eligibility criteria:");
    expect(request?.system).toContain("definitional");
  });

  it("carries an arm or phase label through to the criterion", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion({ appliesTo: "Arm A" })));

    expect(parsed.criteria[0]?.appliesTo).toBe("Arm A");
  });

  it("omits the label entirely when a criterion applies unconditionally", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion({ appliesTo: null })));

    expect(parsed.criteria[0]).not.toHaveProperty("appliesTo");
  });

  it("derives answerability from type rather than storing it", async () => {
    // Two distinct quotes: one span per criterion, or the second is rejected
    // as a duplicate before answerability is ever reached.
    const parsed = await parseCriteria(
      TRIAL,
      adapterReturning(
        criterion({ type: "clinical" }),
        criterion({ quote: CONSENT_QUOTE, type: "patient" }),
      ),
    );

    expect(parsed.rejected).toEqual([]);
    expect(parsed.criteria.map(isPatientAnswerable)).toEqual([false, true]);
    expect(parsed.criteria[0]).not.toHaveProperty("patientAnswerable");
  });
});

describe("parseCriteria failures that invalidate the whole parse", () => {
  // The case the eval harness would otherwise score as model quality.
  it("throws on a truncated response rather than returning a short parse", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { criteria: [criterion()] }, finishReason: "length" },
    ]);

    await expect(parseCriteria(TRIAL, adapter)).rejects.toThrow(CriteriaParseError);
    await expect(
      parseCriteria(
        TRIAL,
        new FakeModelAdapter([
          { kind: "json", content: { criteria: [criterion()] }, finishReason: "length" },
        ]),
      ),
    ).rejects.toThrow(/truncated/);
  });

  it("says how many criteria were recovered before the cut, and what to do", async () => {
    const adapter = new FakeModelAdapter([
      {
        kind: "json",
        content: { criteria: [criterion(), criterion()] },
        finishReason: "length",
      },
    ]);

    await expect(parseCriteria(TRIAL, adapter)).rejects.toThrow(/recovered 2 criteria/);
  });

  it("throws when nothing survives validation", async () => {
    const adapter = adapterReturning(criterion({ type: "lab" }));

    await expect(parseCriteria(TRIAL, adapter)).rejects.toThrow(/no criterion survived/);
  });

  it("throws when every quote was invented", async () => {
    const adapter = adapterReturning(criterion({ quote: "Life expectancy of at least 12 weeks" }));

    await expect(parseCriteria(TRIAL, adapter)).rejects.toThrow(CriteriaParseError);
  });

  it("throws when the envelope is unreadable, naming the trial", async () => {
    await expect(parseCriteria(TRIAL, scripted({ kind: "json", content: [] }))).rejects.toThrow(
      /NCT04316364/,
    );
  });

  it("lets an adapter failure through rather than dressing it as a parse failure", async () => {
    const adapter = scripted({ kind: "error", message: "connection refused" });

    await expect(parseCriteria(TRIAL, adapter)).rejects.toThrow(/connection refused/);
  });
});

describe("parseCriteria rejections", () => {
  it("reports a hallucinated quote instead of dropping it", async () => {
    const parsed = await parseCriteria(
      TRIAL,
      adapterReturning(criterion(), criterion({ quote: "Documented EGFR exon 19 deletion" })),
    );

    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.rejected).toHaveLength(1);
    expect(parsed.rejected[0]?.reason).toMatch(/does not appear in the source/);
    expect(parsed.rejected[0]?.quote).toBe("Documented EGFR exon 19 deletion");
  });

  // One sentence routinely holds several requirements, and the prompt asks for
  // those to be split. Rejecting them for sharing a span would throw away real
  // criteria to satisfy a bookkeeping rule.
  it("keeps several criteria drawn from one sentence, with distinct ids", async () => {
    const parsed = await parseCriteria(
      TRIAL,
      adapterReturning(
        criterion({ text: "ECOG performance status is 0 or 1" }),
        criterion({ text: "The patient has an ECOG assessment on record" }),
      ),
    );

    expect(parsed.rejected).toEqual([]);
    expect(parsed.criteria).toHaveLength(2);
    expect(new Set(parsed.criteria.map((c) => c.id)).size).toBe(2);
    // Both still point at the same source sentence.
    expect(parsed.criteria[0]?.source).toEqual(parsed.criteria[1]?.source);
  });

  it("gives the first criterion on a span the bare span id", async () => {
    const parsed = await parseCriteria(
      TRIAL,
      adapterReturning(criterion(), criterion({ text: "a second requirement" })),
    );

    expect(parsed.criteria[0]?.id).not.toMatch(/#/);
    expect(parsed.criteria[1]?.id).toMatch(/#2$/);
  });

  it("rejects a criterion that merely restates one already taken from the span", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion(), criterion()));

    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.rejected[0]?.reason).toMatch(/restates a criterion/);
  });

  it("keeps schema rejections and location rejections together", async () => {
    const parsed = await parseCriteria(
      TRIAL,
      adapterReturning(
        criterion(),
        criterion({ type: "lab" }),
        criterion({ quote: "invented text that is not present" }),
      ),
    );

    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.rejected).toHaveLength(2);
  });
});

describe("what a parse keeps about its quotes (slice 0011)", () => {
  it("keeps a quote the model retyped with different spacing, and marks it loose", async () => {
    const retyped = REAL_QUOTE.replace("Group (ECOG) performance", "Group (ECOG)\n  performance");
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion({ quote: retyped })));

    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.criteria[0]?.loose).toBe(true);
    expect(parsed.criteria[0]?.source.text).toBe(REAL_QUOTE);
  });

  it("leaves an exact quote unmarked, so parses made before 0011 read the same", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion()));

    expect(Object.keys(parsed.criteria[0] ?? {})).not.toContain("loose");
  });

  it("leaves an exact quote without a heading, so parses made before 0015 read the same", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion()));

    expect(Object.keys(parsed.criteria[0] ?? {})).not.toContain("heading");
  });

  describe("a heading quoted with its item (slice 0015)", () => {
    const HEADING =
      "Participants with any of the following serious and ongoing infectious conditions documented at the screening visit:";
    const NESTED: Trial = {
      ...TRIAL,
      eligibility: {
        ...TRIAL.eligibility,
        criteriaText: [
          `1. ${HEADING}`,
          "",
          "   1. Active hepatitis B.",
          "   2. Active hepatitis C.",
          "2. Organ transplant.",
        ].join("\n"),
      },
    };
    const adapter = () =>
      adapterReturning(
        criterion({ quote: `${HEADING} Active hepatitis B.`, text: "Has active hepatitis B" }),
        criterion({ quote: "Active hepatitis C.", text: "Has active hepatitis C" }),
        criterion({ quote: "Organ transplant.", text: "Had an organ transplant" }),
      );

    it("keeps the item as the source and the heading beside it", async () => {
      const parsed = await parseCriteria(NESTED, adapter());

      expect(parsed.rejected).toEqual([]);
      expect(parsed.criteria[0]?.source.text).toBe("Active hepatitis B.");
      expect(parsed.criteria[0]?.heading?.text).toBe(HEADING);
      expect(parsed.criteria[1]).not.toHaveProperty("heading");
    });

    it("counts the heading as read, not as a passage left behind", async () => {
      // Long enough that, unclaimed, it would be reported on its own.
      expect(HEADING.replace(/\s/g, "").length).toBeGreaterThanOrEqual(80);

      const parsed = await parseCriteria(NESTED, adapter());

      expect(parsed.unclaimed).toEqual([]);
    });
  });

  it("records which normalization the model was shown", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion()));

    expect(parsed.run.normalizeVersion).toBe(NORMALIZE_VERSION);
  });
});

describe("unclaimed source", () => {
  // The cheapest signal that a model quietly stopped halfway down a block.
  it("reports the stretch a single-criterion parse left behind", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion()));

    expect(parsed.unclaimed.length).toBeGreaterThan(0);

    const covered = parsed.unclaimed.reduce((total, span) => total + span.text.length, 0);
    expect(covered).toBeGreaterThan(TEXT.length / 2);
  });

  it("reports unclaimed spans that slice out of the original", async () => {
    const parsed = await parseCriteria(TRIAL, adapterReturning(criterion()));

    for (const span of parsed.unclaimed) {
      expect(TEXT.slice(span.start, span.end)).toBe(span.text);
    }
  });

  it("ignores gaps too small to be a missed criterion", async () => {
    const lines = TEXT.split("\n")
      .map((line) => line.replace(/^\*\s*/, "").trim())
      .filter((line) => line.length > 30);

    const parsed = await parseCriteria(
      TRIAL,
      adapterReturning(...lines.map((line) => criterion({ quote: line }))),
    );

    // With every substantial line claimed, what is left is headings and
    // punctuation — nothing a reader should be asked to look at.
    expect(parsed.criteria.length).toBe(lines.length);
    expect(parsed.unclaimed).toEqual([]);
  });
});
