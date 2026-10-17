import { describe, expect, it } from "vitest";
import { normalize, toSourceSpan } from "../../src/criteria/normalize.js";
import { loadTrials } from "../../src/trials/index.js";

/**
 * Normalization is the one part of parsing that is fully deterministic, so it
 * carries the property the whole schema rests on: every span of cleaned text
 * maps back to the registry's own characters.
 */
describe("normalize", () => {
  it("leaves clean text alone", () => {
    const text = "Inclusion Criteria:\n\n* 18 years or older\n* ECOG 0 or 1";

    expect(normalize(text).text).toBe(text);
  });

  it.each([
    ["\r\n line endings", "a\r\nb", "a\nb"],
    ["lone carriage returns", "a\rb", "a\nb"],
    [
      "escaped numbering, as NCT03753685 carries it",
      "1\\. Histologically confirmed",
      "1. Histologically confirmed",
    ],
    ["escaped comparisons", "Males and females \\>=18 years", "Males and females >=18 years"],
    ["escaped bullets", "\\* measurable disease", "* measurable disease"],
    ["escaped brackets", "RECIST \\[1.1\\]", "RECIST [1.1]"],
    ["escaped exponents, as in lab thresholds (slice 0011)", "1.5×10\\^9/L", "1.5×10^9/L"],
    ["escaped ampersands (slice 0011)", "gefitinib, \\& rociletinib", "gefitinib, & rociletinib"],
    ["trailing spaces", "a line   \nnext", "a line\nnext"],
    ["trailing tabs", "a line\t\nnext", "a line\nnext"],
    ["runs of blank lines", "a\n\n\n\n\nb", "a\n\nb"],
  ])("normalizes %s", (_label, input, expected) => {
    expect(normalize(input).text).toBe(expected);
  });

  it("keeps a backslash that is not escaping punctuation", () => {
    expect(normalize("dose 5\\u mg").text).toBe("dose 5\\u mg");
  });

  // Bullet structure is the variance the corpus exists to contain. Flattening
  // it here would be a regex faking the judgment the parser has to make.
  it("does not invent list structure where there is none", () => {
    const unbulleted = "Sign the informed consent. Aged 18 to 70. ECOG 0 or 1.";

    expect(normalize(unbulleted).text).toBe(unbulleted);
  });

  it("does not touch clinical terminology, case or spelling", () => {
    const text = "EGFR sensitising mutations; ALT (SGPT) \\<=2.5 x ULN";

    expect(normalize(text).text).toBe("EGFR sensitising mutations; ALT (SGPT) <=2.5 x ULN");
  });

  it("maps every surviving character back to where it came from", () => {
    const original = "1\\. Age \\>=18\r\n\n\n\n* ECOG 0   \n";
    const normalized = normalize(original);

    for (let i = 0; i < normalized.text.length; i++) {
      const source = normalized.sourceIndex[i];
      expect(source).toBeDefined();
      expect(original[source as number]).toBe(normalized.text[i]);
    }
  });

  it("produces one source index per normalized character", () => {
    const normalized = normalize("1\\. Age \\>=18\r\nnext");

    expect(normalized.sourceIndex).toHaveLength(normalized.text.length);
  });

  it("handles an empty block without throwing", () => {
    expect(normalize("").text).toBe("");
    expect(normalize("").sourceIndex).toEqual([]);
  });
});

describe("toSourceSpan", () => {
  it("returns a span whose text is sliced from the original", () => {
    const original = "1\\. Age \\>=18 years";
    const normalized = normalize(original);
    const start = normalized.text.indexOf("Age");
    const span = toSourceSpan(normalized, start, start + "Age >=18 years".length);

    expect(span).toBeDefined();
    expect(original.slice(span?.start ?? 0, span?.end ?? 0)).toBe(span?.text);
    // The original span is wider: it still contains the backslash.
    expect(span?.text).toBe("Age \\>=18 years");
  });

  it.each([
    ["a negative start", -1, 3],
    ["an end past the text", 0, 9999],
    ["an empty span", 3, 3],
    ["a reversed span", 5, 2],
  ])("refuses %s", (_label, start, end) => {
    expect(toSourceSpan(normalize("some text here"), start, end)).toBeUndefined();
  });
});

/**
 * The property that matters, checked against every real block in the corpus
 * rather than against invented examples. These twelve were chosen to vary
 * exactly the formatting this code touches.
 */
describe("round trip over the real corpus", () => {
  const trials = loadTrials();

  it("covers all twelve studies", () => {
    expect(trials).toHaveLength(12);
  });

  it.each(
    trials.map((trial) => [trial.nctId, trial.eligibility.criteriaText] as const),
  )("%s: every normalized span slices back out of the original", (_nctId, criteriaText) => {
    const normalized = normalize(criteriaText);

    expect(normalized.sourceIndex).toHaveLength(normalized.text.length);

    // Sample spans across the whole block rather than one near the start,
    // since the failure worth catching is drift that accumulates.
    const step = Math.max(1, Math.floor(normalized.text.length / 50));
    for (let start = 0; start + 40 < normalized.text.length; start += step) {
      const span = toSourceSpan(normalized, start, start + 40);

      expect(span).toBeDefined();
      expect(criteriaText.slice(span?.start ?? 0, span?.end ?? 0)).toBe(span?.text);
    }
  });

  it.each(
    trials.map((trial) => [trial.nctId, trial.eligibility.criteriaText] as const),
  )("%s: source indices never go backwards", (_nctId, criteriaText) => {
    const { sourceIndex } = normalize(criteriaText);

    // Collected and asserted once: an expect per character cost about 400 ms
    // across the corpus, most of the suite's budget, for the same check.
    const backwards: number[] = [];
    for (let i = 1; i < sourceIndex.length; i++) {
      if ((sourceIndex[i] as number) <= (sourceIndex[i - 1] as number)) {
        backwards.push(i);
      }
    }
    expect(sourceIndex.length).toBeGreaterThan(0);
    expect(backwards).toEqual([]);
  });

  // Slice 0011: `\^` and `\&` reached the model for 0003's whole run. A registry
  // escape normalization doesn't know about now fails here, not in a parse.
  it.each(
    trials.map((trial) => [trial.nctId, trial.eligibility.criteriaText] as const),
  )("%s: no registry escape survives", (_nctId, criteriaText) => {
    expect(normalize(criteriaText).text.match(/\\[!-/:-@[-`{-~]/g) ?? []).toEqual([]);
  });

  it("removes the escaped numbering NCT03753685 actually contains", () => {
    const trial = trials.find((candidate) => candidate.nctId === "NCT03753685");
    const criteriaText = trial?.eligibility.criteriaText ?? "";

    expect(criteriaText).toContain("1\\.");
    expect(normalize(criteriaText).text).not.toContain("1\\.");
    expect(normalize(criteriaText).text).toContain("1. Histologically");
  });
});
