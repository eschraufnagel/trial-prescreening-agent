import { describe, expect, it } from "vitest";
import {
  assertLabellingComplete,
  criteriaTextSha,
  loadLabelSet,
  validateLabelSet,
} from "../../evals/cases/load.js";
import { LabelError } from "../../evals/cases/types.js";
import { splitPassages } from "../../scripts/label-criteria.js";
import { getTrial } from "../../src/trials/index.js";

/**
 * Label sets are hand-edited JSON, written across several sittings, and every
 * number the harness reports is computed from them. The faults worth catching
 * are the ones that stay plausible: an offset edited without its quote, or a
 * file written against a protocol version since refetched. Both still look
 * like labels.
 */
const TRIAL = getTrial("NCT04316364");
const TEXT = TRIAL.eligibility.criteriaText;
const SHA = criteriaTextSha(TEXT);

/** A span that genuinely occurs in this fixture. */
const QUOTE = "Eastern Cooperative Oncology Group (ECOG) performance status 0 or 1";
const START = TEXT.indexOf(QUOTE);
const END = START + QUOTE.length;

function labelSet(overrides: Record<string, unknown> = {}): unknown {
  return {
    nctId: "NCT04316364",
    labelledAt: "2000-01-22",
    criteriaTextSha: SHA,
    criteria: [
      { id: "L1", quote: QUOTE, start: START, end: END, polarity: "inclusion", type: "clinical" },
    ],
    notCriteria: [],
    ...overrides,
  };
}

describe("validateLabelSet", () => {
  it("accepts a well-formed label set", () => {
    const labels = validateLabelSet(labelSet(), "test");

    expect(labels.criteria).toHaveLength(1);
    expect(labels.criteria[0]?.quote).toBe(QUOTE);
  });

  it("keeps an optional note, and omits the field when absent", () => {
    const withNote = validateLabelSet(
      labelSet({
        criteria: [
          {
            id: "L1",
            quote: QUOTE,
            start: START,
            end: END,
            polarity: "inclusion",
            type: "clinical",
            note: "protocol, not clinical: no result is required",
          },
        ],
      }),
      "test",
    );

    expect(withNote.criteria[0]?.note).toMatch(/no result is required/);
    expect(validateLabelSet(labelSet(), "test").criteria[0]).not.toHaveProperty("note");
  });

  // The fault that stays plausible: the label still points somewhere, just at
  // the wrong words.
  it("rejects a quote that does not match the text at its offsets", () => {
    const wrong = labelSet({
      criteria: [
        {
          id: "L1",
          quote: QUOTE,
          start: START + 5,
          end: END,
          polarity: "inclusion",
          type: "clinical",
        },
      ],
    });

    expect(() => validateLabelSet(wrong, "test")).toThrow(/quote does not match the text/);
  });

  it("rejects labels written against different protocol text", () => {
    const stale = labelSet({ criteriaTextSha: "0".repeat(64) });

    expect(() => validateLabelSet(stale, "test")).toThrow(/different text/);
  });

  // Updating the hash would make the error disappear while leaving every
  // offset pointing at the wrong words, so the message says not to.
  it("tells the reader to re-check the labels rather than update the hash", () => {
    expect(() => validateLabelSet(labelSet({ criteriaTextSha: "0".repeat(64) }), "test")).toThrow(
      /Re-check the labels/,
    );
  });

  it("rejects a span running past the end of the text", () => {
    const past = labelSet({
      criteria: [
        {
          id: "L1",
          quote: QUOTE,
          start: START,
          end: TEXT.length + 10,
          polarity: "inclusion",
          type: "clinical",
        },
      ],
    });

    expect(() => validateLabelSet(past, "test")).toThrow(/past the end/);
  });

  // Results reference labels by id; two sharing one would make a miss and a
  // match indistinguishable in the diagnostics.
  it("rejects duplicate ids", () => {
    const duplicated = labelSet({
      criteria: [
        { id: "L1", quote: QUOTE, start: START, end: END, polarity: "inclusion", type: "clinical" },
        { id: "L1", quote: QUOTE, start: START, end: END, polarity: "exclusion", type: "patient" },
      ],
    });

    expect(() => validateLabelSet(duplicated, "test")).toThrow(/duplicate id/);
  });

  it.each([
    ["an unknown type", { type: "lab" }],
    ["an unknown polarity", { polarity: "maybe" }],
    ["a missing id", { id: undefined }],
    ["a reversed span", { end: START }],
  ])("rejects %s", (_label, override) => {
    const broken = labelSet({
      criteria: [
        {
          id: "L1",
          quote: QUOTE,
          start: START,
          end: END,
          polarity: "inclusion",
          type: "clinical",
          ...override,
        },
      ],
    });

    expect(() => validateLabelSet(broken, "test")).toThrow(LabelError);
  });

  it("reports every problem at once rather than the first", () => {
    try {
      validateLabelSet({ nctId: "NCT04316364", criteriaTextSha: "nope" }, "test");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as LabelError).problems.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("rejects a file whose name and contents disagree", () => {
    expect(() => validateLabelSet(labelSet(), "test", "NCT00106626")).toThrow(/but labels/);
  });
});

describe("assertLabellingComplete", () => {
  // A skeleton is a valid file. Grading one would report zero recall and look
  // like a catastrophic parser failure rather than an unfinished afternoon.
  it("refuses a skeleton with nothing labelled", () => {
    const skeleton = validateLabelSet(labelSet({ criteria: [] }), "test");

    expect(() => assertLabellingComplete(skeleton)).toThrow(/untouched skeleton/);
  });

  it("refuses a passage left in notCriteria with no reason", () => {
    const partial = validateLabelSet(
      labelSet({ notCriteria: [{ quote: QUOTE, start: START, end: END, why: "  " }] }),
      "test",
    );

    expect(() => assertLabellingComplete(partial)).toThrow(/no reason written/);
  });

  it("accepts a finished label set", () => {
    const finished = validateLabelSet(
      labelSet({
        notCriteria: [{ quote: QUOTE, start: START, end: END, why: "heading, asserts nothing" }],
      }),
      "test",
    );

    expect(() => assertLabellingComplete(finished)).not.toThrow();
  });
});

describe("splitPassages", () => {
  it("produces passages that slice back out of the original text", () => {
    for (const passage of splitPassages(TEXT)) {
      expect(TEXT.slice(passage.start, passage.end)).toBe(passage.quote);
    }
  });

  it("is deterministic", () => {
    expect(splitPassages(TEXT)).toEqual(splitPassages(TEXT));
  });

  it("leaves every passage unexplained, so labelling is an act rather than a default", () => {
    expect(splitPassages(TEXT).every((passage) => passage.why === "")).toBe(true);
  });

  it("drops the list marker so a span covers the criterion's words", () => {
    const passages = splitPassages("Inclusion Criteria:\n\n* Eighteen years of age or older\n");

    expect(passages[0]?.quote).toBe("Eighteen years of age or older");
  });

  it.each([
    ["asterisk bullets", "* Eighteen years of age or older and able to consent"],
    ["numbered items", "1. Eighteen years of age or older and able to consent"],
    ["lettered sub-items", "a. Eighteen years of age or older and able to consent"],
  ])("drops a %s marker", (_label, line) => {
    expect(splitPassages(`${line}\n`)[0]?.quote).toBe(
      "Eighteen years of age or older and able to consent",
    );
  });

  // Regression: a 25-character floor dropped `Hemoglobin >= 9 g/L` from
  // NCT00077350. A skeleton that hides a criterion means the label set omits
  // it and the parser is charged a false positive for finding it correctly —
  // the measurement corrupted in the parser's disfavour.
  it("keeps a short criterion, because lab thresholds are terse", () => {
    const passages = splitPassages("Inclusion Criteria:\n\n* Hemoglobin >= 9 g/L\n");

    expect(passages.map((passage) => passage.quote)).toEqual(["Hemoglobin >= 9 g/L"]);
  });

  it("keeps the real hemoglobin criterion from NCT00077350", () => {
    const text = getTrial("NCT00077350").eligibility.criteriaText;

    expect(splitPassages(text).some((passage) => /Hemoglobin/.test(passage.quote))).toBe(true);
  });

  it("skips headings, which is what the length floor used to do", () => {
    const passages = splitPassages(
      "Inclusion Criteria:\n\nDose escalation subjects:\n* Eighteen years of age or older\n",
    );

    expect(passages.map((passage) => passage.quote)).toEqual(["Eighteen years of age or older"]);
  });

  // Blocks with no list structure exist in the corpus and are why sentence
  // splitting is here at all.
  it("splits an unbulleted block on sentence ends", () => {
    const passages = splitPassages(
      "Participants must be eighteen years or older. Participants must have measurable disease.",
    );

    expect(passages).toHaveLength(2);
    expect(passages[1]?.quote).toBe("Participants must have measurable disease.");
  });

  it("handles an empty block without throwing", () => {
    expect(splitPassages("")).toEqual([]);
  });
});

describe("the committed label sets", () => {
  // Every committed label set must still match the fixture it cites. A refetch
  // that revises a protocol invalidates labels silently otherwise.
  it("all load and match their fixtures", () => {
    // Loaded individually so a failure names the study.
    for (const nctId of ["NCT04316364"]) {
      expect(() => loadLabelSet(nctId)).not.toThrow();
    }
  });
});
