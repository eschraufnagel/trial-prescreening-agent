import { describe, expect, it } from "vitest";
import { locateQuote } from "../../src/criteria/locate.js";
import { normalize } from "../../src/criteria/normalize.js";
import { getTrial } from "../../src/trials/index.js";

/**
 * Locating a quote is how a hallucinated criterion is caught. The model is
 * asked for text it can copy rather than for offsets it would have to compute,
 * and text that does not occur in the source is text the model made up.
 */
const BLOCK = [
  "Inclusion Criteria:",
  "",
  "* 18 years of age or older",
  "* ECOG performance status 0 or 1",
  "* Measurable disease per RECIST 1.1",
  "",
  "Exclusion Criteria:",
  "",
  "* ECOG performance status 0 or 1 within 6 months",
  "* Pregnant or breastfeeding",
].join("\n");

describe("locateQuote", () => {
  const normalized = normalize(BLOCK);

  it("finds a quote and returns its span in the original", () => {
    const result = locateQuote(normalized, "ECOG performance status 0 or 1");

    expect(result).toBeDefined();
    expect(result?.span.text).toBe("ECOG performance status 0 or 1");
    expect(BLOCK.slice(result?.span.start ?? 0, result?.span.end ?? 0)).toBe(result?.span.text);
    expect(result?.loose).toBe(false);
  });

  it("rejects a quote that does not occur, which is how a hallucination shows up", () => {
    expect(locateQuote(normalized, "Life expectancy of at least 12 weeks")).toBeUndefined();
  });

  it("rejects an empty quote", () => {
    expect(locateQuote(normalized, "   ")).toBeUndefined();
  });

  // A criterion legitimately repeated must resolve to the right occurrence,
  // which is what keeps a second mention from being scored as the first.
  it("resolves a repeated quote to the occurrence after the previous criterion", () => {
    const first = locateQuote(normalized, "ECOG performance status 0 or 1");
    const second = locateQuote(normalized, "ECOG performance status 0 or 1", first?.nextFrom);

    expect(second).toBeDefined();
    expect(second?.span.start).toBeGreaterThan(first?.span.start ?? 0);
    // The later occurrence is the one in the exclusion list, which continues
    // "within 6 months" — the detail that makes it a different criterion.
    expect(BLOCK.slice(second?.span.end ?? 0)).toMatch(/^ within 6 months/);
  });

  it("advances nextFrom past the match, so criteria come out in document order", () => {
    const result = locateQuote(normalized, "18 years of age or older");

    expect(result?.nextFrom).toBe(
      normalized.text.indexOf("18 years of age or older") + "18 years of age or older".length,
    );
  });

  // A model returning criteria out of order is not a model hallucinating.
  it("falls back to searching the whole text when nothing matches after the cursor", () => {
    const result = locateQuote(normalized, "18 years of age or older", normalized.text.length - 5);

    expect(result).toBeDefined();
    expect(result?.span.text).toBe("18 years of age or older");
  });

  describe("whitespace-tolerant fallback", () => {
    it("matches a quote the model reflowed across a line break", () => {
      const wrapped = normalize("* Histologically confirmed NSCLC with\n  measurable disease");
      const result = locateQuote(wrapped, "Histologically confirmed NSCLC with measurable disease");

      expect(result).toBeDefined();
      expect(result?.loose).toBe(true);
      expect(result?.span.text).toBe("Histologically confirmed NSCLC with\n  measurable disease");
    });

    it("reports a loose match as loose, so a suspicious parse can be spotted", () => {
      expect(locateQuote(normalized, "ECOG  performance   status 0 or 1")?.loose).toBe(true);
    });

    it("does not let the fallback match text that is merely similar", () => {
      expect(locateQuote(normalized, "ECOG performance status 2 or 3")).toBeUndefined();
    });

    it("treats regex metacharacters in a quote as literal text", () => {
      const result = locateQuote(normalized, "Measurable disease per RECIST 1.1");

      expect(result?.span.text).toBe("Measurable disease per RECIST 1.1");
      // "1.1" must not match "101" via the regex fallback's dot.
      expect(locateQuote(normalized, "RECIST 101")).toBeUndefined();
    });
  });

  describe("against a real block", () => {
    // NCT03753685 numbers its criteria with escaped markup. A quote copied
    // from the cleaned text must still resolve to a span of the raw fixture.
    const trial = getTrial("NCT03753685");
    const realNormalized = normalize(trial.eligibility.criteriaText);

    it("maps a quote from cleaned text back onto the escaped original", () => {
      const result = locateQuote(realNormalized, "Histologically or cytologically confirmed");

      expect(result).toBeDefined();
      expect(trial.eligibility.criteriaText.slice(result?.span.start, result?.span.end)).toBe(
        result?.span.text,
      );
    });

    it("walks the whole block without a span ever failing to slice back", () => {
      let cursor = 0;
      const sentences = realNormalized.text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 25);

      expect(sentences.length).toBeGreaterThan(5);

      for (const sentence of sentences) {
        const result = locateQuote(realNormalized, sentence, cursor);

        expect(result).toBeDefined();
        expect(trial.eligibility.criteriaText.slice(result?.span.start, result?.span.end)).toBe(
          result?.span.text,
        );
        cursor = result?.nextFrom ?? cursor;
      }
    });
  });
});

/**
 * A heading quoted together with one of its items (slice 0015). The block is
 * invented; each test changes one thing about the quote or the layout, so that
 * each clause of the rule in spec §2.2 is seen both holding and failing.
 */
const NESTED = [
  "Exclusion Criteria:",
  "",
  "1. Serious infection including the following:",
  "",
  "   1. Uncontrolled infection with virus A.",
  "   2. Known active virus B.",
  "2. Note: participants must fast before visits.",
  "3. For Arm X only:",
  "",
  "   a. Prior pneumonitis.",
  "   b. Kidney panel:",
  "   c. Creatinine at or below the upper limit.",
  "4. Cohorts:",
  "",
  "   * A.) Cohort Y patients:",
  "",
  "      * Had surgery within 4 weeks.",
  "5. Serious infection including the following:",
  "",
  "   1. Known active virus B.",
  "   2. Known active virus C.",
  "6. Organ transplant.",
].join("\n");

describe("heading joins (slice 0015)", () => {
  const normalized = normalize(NESTED);
  const HEADING = "Serious infection including the following:";

  it("keeps a heading joined to its item, at the item, with the heading beside it", () => {
    const result = locateQuote(normalized, `${HEADING} Known active virus B.`);

    expect(result?.span.text).toBe("Known active virus B.");
    expect(result?.heading?.text).toBe(HEADING);
    expect(NESTED.slice(result?.heading?.start, result?.heading?.end)).toBe(HEADING);
    expect(result?.nextFrom).toBe(normalized.text.indexOf("Known active virus B.") + 21);
    expect(result?.loose).toBe(false);
  });

  it("leaves heading off an exact or a loose match", () => {
    expect(locateQuote(normalized, "Known active virus B.")).not.toHaveProperty("heading");
    expect(locateQuote(normalized, "Known  active virus B.")).not.toHaveProperty("heading");
  });

  describe("the heading", () => {
    it("may follow two markers on its line", () => {
      const result = locateQuote(normalized, "Cohort Y patients: Had surgery within 4 weeks.");

      expect(result?.heading?.text).toBe("Cohort Y patients:");
    });

    it("must be in the source as written", () => {
      expect(
        locateQuote(
          normalized,
          "Serious infections including the following: Known active virus B.",
        ),
      ).toBeUndefined();
    });

    it("must start its line, after nothing but its lead", () => {
      expect(
        locateQuote(normalized, "infection including the following: Known active virus B."),
      ).toBeUndefined();
    });

    it("must end its line at the colon", () => {
      // An item that would otherwise pass: the list under the line holds it.
      const inline = normalize(
        "1. Infections: any of the following\n\n   1. Known active virus B.",
      );

      expect(
        locateQuote(inline, "Infections: any of the following Known active virus B."),
      ).toBeUndefined();
      expect(locateQuote(inline, "Infections: Known active virus B.")).toBeUndefined();
      expect(locateQuote(normalized, "Note: Known active virus B.")).toBeUndefined();
    });
  });

  describe("the item", () => {
    it("may keep its own marker", () => {
      const result = locateQuote(normalized, `${HEADING} 2. Known active virus B.`);

      expect(result?.span.text).toBe("2. Known active virus B.");
    });

    it("must start its line", () => {
      expect(locateQuote(normalized, `${HEADING} active virus B.`)).toBeUndefined();
    });

    it("must be indented deeper than the heading", () => {
      expect(
        locateQuote(normalized, "Kidney panel: Creatinine at or below the upper limit."),
      ).toBeUndefined();
    });

    it("must come before the heading's list ends", () => {
      expect(locateQuote(normalized, `${HEADING} Organ transplant.`)).toBeUndefined();
      expect(
        locateQuote(normalized, "For Arm X only: Had surgery within 4 weeks."),
      ).toBeUndefined();
    });

    it("must come after the heading", () => {
      expect(locateQuote(normalized, "Known active virus B. For Arm X only:")).toBeUndefined();
    });
  });

  it("tries each occurrence of a repeated heading, the cursor's first", () => {
    const first = locateQuote(normalized, `${HEADING} Known active virus B.`);
    const second = locateQuote(normalized, `${HEADING} Known active virus B.`, first?.nextFrom);
    const onlySecond = locateQuote(normalized, `${HEADING} Known active virus C.`);

    expect(second?.span.start).toBeGreaterThan(first?.span.start ?? 0);
    expect(second?.heading?.start).toBeGreaterThan(first?.heading?.start ?? 0);
    expect(onlySecond?.heading?.start).toBe(second?.heading?.start);
  });

  it("is loose when either half matched only with different whitespace", () => {
    const headLoose = locateQuote(
      normalized,
      "Serious  infection including\nthe following: Known active virus B.",
    );
    const itemLoose = locateQuote(normalized, `${HEADING} Known active\n virus B.`);

    expect(headLoose?.heading?.text).toBe(HEADING);
    expect(headLoose?.loose).toBe(true);
    expect(itemLoose?.span.text).toBe("Known active virus B.");
    expect(itemLoose?.loose).toBe(true);
  });
});
