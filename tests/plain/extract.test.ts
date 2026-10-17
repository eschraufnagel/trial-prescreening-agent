import { describe, expect, it } from "vitest";
import {
  namedTerms,
  negations,
  prepare,
  quantities,
  scopeGroups,
  verdictWords,
} from "../../src/plain/extract.js";

/**
 * What the check pulls out of a text, on the corpus's real notation (spec
 * §5.1, §10). The inputs are criteria as `fromLabels` gives them, so registry
 * escaping of `^` is still present.
 */

const q = (text: string) => quantities(text).map((x) => [x.direction, x.key, x.anchor]);

describe("prepare", () => {
  it("undoes the escaping normalize() leaves, and evens out spacing", () => {
    expect(prepare("WBC \\>= 3000/mm\\^3")).toBe("WBC >= 3000/mm^3");
    expect(prepare("  a\n  b – c ")).toBe("a b - c");
  });
});

describe("quantities", () => {
  it("reads lab thresholds with their units and comparisons", () => {
    expect(q("WBC >= 3000/mm\\^3")).toEqual([["≥", "3000 /mm3", null]]);
    expect(q("absolute neutrophil count (ANC) ≥ 1.5×10\\^9/L")).toEqual([
      ["≥", "1.5×10^9 /l", null],
    ]);
    expect(q("Serum creatinine =< 1.5 mg/dL, or creatinine clearance >= 60 mL/min")).toEqual([
      ["≤", "1.5 mg/dl", null],
      ["≥", "60 ml/min", null],
    ]);
    expect(q("hemoglobin ≥ 90g/L")).toEqual([["≥", "90 g/l", null]]);
  });

  it("treats 100,000 and 100000 as the same number", () => {
    expect(quantities("Platelet count >= 100,000/mm\\^3")[0]?.key).toBe(
      quantities("a platelet count of at least 100000/mm^3")[0]?.key,
    );
  });

  it("reads a multiple of a limit, however it is written", () => {
    expect(q("Bilirubin < 1.5 x upper limit of normal")).toEqual([["<", "1.5 ×", null]]);
    expect(q("bilirubin ≤ 1.5× upper limit")).toEqual([["≤", "1.5 ×", null]]);
    expect(q("bilirubin no more than 1.5 times the upper limit")).toEqual([["≤", "1.5 ×", null]]);
  });

  it("reads a window and which way it runs", () => {
    expect(q("measurable disease within 4 weeks prior to registration")).toEqual([
      ["≤", "4 week", "before"],
    ]);
    expect(q("completed radiation therapy \\>= 3 weeks prior to registration")).toEqual([
      ["≥", "3 week", "before"],
    ]);
    expect(q("abstinence at least 180 days after the last dose")).toEqual([
      ["≥", "180 day", "after"],
    ]);
    expect(q("eligible if the patient is > 3 weeks post surgery")).toEqual([
      [">", "3 week", "after"],
    ]);
    expect(q("myocardial infarction within the prior 6 months")).toEqual([["≤", "6 month", null]]);
  });

  it("gives time units the same key however they are spelled", () => {
    expect(quantities("3 wks")[0]?.key).toBe(quantities("3 weeks")[0]?.key);
  });

  it("reads a trailing comparison", () => {
    expect(q("18 years of age or older")).toEqual([["≥", "18 year", null]]);
    expect(q("no evidence of grade 2 or greater adverse events")).toEqual([["≥", "2", null]]);
    expect(q("amenorrhoeic for 12 months or more following cessation")).toEqual([
      ["≥", "12 month", "after"],
    ]);
  });

  it("reads a comparison a few words before its number", () => {
    expect(q("an event (≥CTCAE grade 2)")).toEqual([["≥", "2", null]]);
  });

  it("reads both ends of a range, with no direction", () => {
    expect(q("performance status of 0-1")).toEqual([
      [null, "0", null],
      [null, "1", null],
    ]);
    expect(q("aged 18 to 75")).toEqual([
      [null, "18", null],
      [null, "75", null],
    ]);
  });

  it("gives a number with no cue no direction", () => {
    expect(q("ECOG performance status 0 or 1")).toEqual([
      [null, "0", null],
      [null, "1", null],
    ]);
  });

  it("does not take a cue from beyond punctuation or another number", () => {
    // "one" is a number and takes the cue; "2" is past the colon and does not.
    expect(q("at least one of: 2 prior lines")).toEqual([
      ["≥", "1", null],
      [null, "2", null],
    ]);
    expect(q("up to 3 cycles and 4 more")).toEqual([
      ["≤", "3", null],
      [null, "4", null],
    ]);
  });

  it("reads a number written as a word, and compares it as digits", () => {
    expect(
      q("during the last 2 months or within five half-lives of the compound, whichever is longer"),
    ).toEqual([
      ["≤", "2 month", null],
      ["≤", "5", null],
    ]);
    expect(quantities("at least three prior regimens")[0]?.key).toBe(
      quantities("at least 3 prior regimens")[0]?.key,
    );
    expect(q("someone, anyone, often, tone")).toEqual([]);
  });

  it("leaves the numbers inside codes to the codes", () => {
    expect(q("Confirmed COVID-19 infection, PD-L1 testing, RECIST v1.1, T790M")).toEqual([]);
  });
});

describe("negations", () => {
  it("counts each negation", () => {
    expect(
      negations(
        "patients with previous brain metastases who have not yet received therapy specifically intended for their brain metastases are not eligible to enroll in this protocol",
      ),
    ).toEqual(["not", "not"]);
    expect(negations("cytology alone is not acceptable")).toEqual(["not"]);
    expect(negations("Malignancies other than NSCLC")).toEqual(["other than"]);
    expect(negations("Women of childbearing age without sterilizing")).toEqual(["without"]);
    expect(negations("unless it has resolved, and never smoked")).toEqual(["unless", "never"]);
    expect(negations("She can't, and cannot")).toEqual(["n't", "cannot"]);
  });

  it("leaves a negation inside a comparison to the comparison", () => {
    expect(negations("no more than 28 days of treatment")).toEqual([]);
    expect(negations("not less than 3 weeks")).toEqual([]);
  });

  it("counts a negation written as a prefix", () => {
    expect(negations("Non-leukocyte-depleted whole blood transfusion")).toEqual(["non-"]);
    expect(negations("untreated active hepatitis B, unresectable disease")).toEqual(["un-", "un-"]);
  });

  it("leaves words that only begin like a prefix", () => {
    expect(
      negations("non-small cell lung cancer, undergoing surgery, until the unit is uniform"),
    ).toEqual([]);
    expect(negations("unless")).toEqual(["unless"]);
  });

  it("does not find negations inside other words", () => {
    expect(negations("non-small cell lung cancer, known, nothing, notable")).toEqual([]);
  });
});

describe("named terms", () => {
  it("finds abbreviations, codes and drug names", () => {
    expect(
      namedTerms("Documented activating EGFR mutation (Exon 19 deletion, T790M, or L858R)"),
    ).toEqual(["egfr", "t790m", "l858r"]);
    expect(namedTerms("must not have received prior gemcitabine chemotherapy")).toEqual([
      "gemcitabine",
    ]);
    expect(namedTerms("Prior osimertinib or durvalumab")).toEqual(["osimertinib", "durvalumab"]);
    expect(namedTerms("Stage I to IIIa, PD-L1, G6PD, RECIST v1.1")).toEqual([
      "iiia",
      "pd",
      "l1",
      "g6pd",
      "recist",
      "v1.1",
    ]);
  });

  it("takes hyphenated words by their parts", () => {
    expect(namedTerms("HIV-positive, EGFR-mutant")).toEqual(["hiv", "egfr"]);
    expect(namedTerms("HIV positive, EGFR mutant")).toEqual(["hiv", "egfr"]);
  });

  it("treats a plural abbreviation as the same term", () => {
    expect(namedTerms("3 ECGs")).toEqual(namedTerms("an ECG"));
  });

  it("ignores capitalised ordinary words and short words", () => {
    expect(namedTerms("Patients must NOT have an active second malignancy")).toEqual([]);
    expect(namedTerms("Stage I, a nib, the lib")).toEqual([]);
  });
});

describe("scope groups", () => {
  it("finds each group once, by its first word", () => {
    expect(scopeGroups("Patients must not have an active second malignancy")).toEqual(["active"]);
    expect(scopeGroups("Any previous systematic therapy or known infection")).toEqual([
      "prior",
      "any",
      "known",
      "or",
    ]);
  });

  it("does not find a group inside another word", () => {
    expect(scopeGroups("asymptomatic, reactive, small cell, unknown")).toEqual(["asymptomatic"]);
  });
});

describe("verdict words", () => {
  it("finds words that tell someone whether they can take part, with their family", () => {
    const words = (text: string) => verdictWords(text).map((v) => v.word);
    expect(words("You can take part if your cancer is eligible")).toEqual([
      "you",
      "your",
      "eligible",
      "take part",
    ]);
    expect(words("Is pregnant.")).toEqual([]);
    const family = (text: string) => verdictWords(text)[0]?.family;
    expect(family("Concurrent enrollment")).toBe(family("Is enrolled"));
    expect(family("permitted to enroll")).not.toBe(family("is allowed"));
  });
});
