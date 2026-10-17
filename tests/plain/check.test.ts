import { describe, expect, it } from "vitest";
import { checkPlain } from "../../src/plain/check.js";

/**
 * The check's rules, one passing and one failing case each (spec §5.2), and
 * what it cannot see (spec §5.4). Criteria are real, from the labelled
 * studies; renderings are written here to exercise one rule at a time.
 */

const lines = (criterion: string, plain: string | null) =>
  checkPlain(criterion, plain).problems.map((p) => `${p.category}: ${p.line}`);

describe("rule 1: quantities, both ways", () => {
  const criterion = "Platelet count \\>= 100,000/mm\\^3";

  it("passes when every number and unit is kept", () => {
    expect(
      lines(criterion, "A platelet count (cells that help blood clot) of at least 100,000/mm^3."),
    ).toEqual([]);
  });

  it("refuses a missing or an added quantity", () => {
    expect(lines(criterion, "A normal platelet count.")).toEqual([
      "quantity: missing: 100,000/mm^3",
    ]);
    expect(lines(criterion, "A platelet count of at least 100,000/mm^3 within 6 months.")).toEqual([
      "quantity: added: 6 months",
    ]);
  });

  it("refuses a unit that changed", () => {
    expect(lines("Hemoglobin \\>= 9 g/L", "Hemoglobin of at least 9 g/dL.")).toEqual([
      "quantity: missing: 9 g/L",
      "quantity: added: 9 g/dL",
    ]);
  });
});

describe("rule 2: direction", () => {
  const criterion =
    "Patients must have completed any radiation therapy \\>= 3 weeks prior to registration";

  it("passes when the comparison points the same way in other words", () => {
    expect(
      lines(
        criterion,
        "Must have finished any radiation therapy at least 3 weeks before registration.",
      ),
    ).toEqual([]);
  });

  it("refuses a comparison that changed, was dropped or was added", () => {
    expect(
      lines(
        criterion,
        "Must have finished any radiation therapy within 3 weeks before registration.",
      ),
    ).toEqual(["direction: direction: ≥ 3 weeks became ≤ 3 weeks"]);
    expect(
      lines(criterion, "Must have finished any radiation therapy 3 weeks before registration."),
    ).toEqual(["direction: direction dropped from ≥ 3 weeks"]);
    expect(
      lines("ECOG performance status 0 or 1", "An ECOG performance status of 0 or at least 1."),
    ).toEqual(["direction: direction added to 1"]);
  });
});

describe("rule 3: anchor", () => {
  const criterion = "Measurable disease within 4 weeks prior to registration";

  it("passes when a window runs the same way", () => {
    expect(lines(criterion, "Measurable disease within 4 weeks before registration.")).toEqual([]);
  });

  it("refuses a window that now runs the other way, or lost its anchor", () => {
    expect(lines(criterion, "Measurable disease within 4 weeks after registration.")).toEqual([
      "anchor: anchor: 4 weeks before became after",
      // "prior" went with the anchor, and is a scope word too.
      "scope: missing: prior",
    ]);
    expect(lines(criterion, "Measurable disease within 4 weeks of registration.")).toEqual([
      "anchor: anchor dropped from 4 weeks before",
      "scope: missing: prior",
    ]);
  });
});

describe("rule 4: negations, counted", () => {
  const criterion = "Patients must not have received prior gemcitabine chemotherapy";

  it("passes with the same number of negations", () => {
    expect(lines(criterion, "Must not have had prior gemcitabine chemotherapy.")).toEqual([]);
  });

  it("refuses a negation lost or added", () => {
    expect(lines(criterion, "Has had prior gemcitabine chemotherapy.")).toEqual([
      "negation: negations: 1 in the protocol, 0 in the plain",
    ]);
  });

  const l18 =
    "patients with previous brain metastases who have not yet received therapy specifically intended for their brain metastases are not eligible to enroll in this protocol";

  it("refuses a double negative made single", () => {
    expect(
      lines(
        l18,
        "Patients whose previous brain metastases have received therapy are not eligible to enroll in this protocol.",
      ),
    ).toEqual(["negation: negations: 2 in the protocol, 1 in the plain"]);
  });

  // Until prefixes counted, this rendering was the example above. "Untreated"
  // says "not yet received therapy" with its negation as a prefix.
  it("passes a double negative kept, one of them as a prefix", () => {
    expect(
      lines(
        l18,
        "Patients whose previous brain metastases are untreated are not eligible to enroll in this protocol.",
      ),
    ).toEqual([]);
  });
});

/**
 * Found in the full run: NCT04385368 L50's retry reversed "Non-leukocyte-depleted"
 * to "leukocyte-depleted" and the check passed it, because a negation written
 * as a prefix was invisible to it. The correct first attempt ("was not
 * leukocyte-depleted") had been refused for the same reason.
 */
describe("rule 4: a negation written as a prefix counts", () => {
  const l50 =
    "Non-leukocyte-depleted whole blood transfusion within 120 days of genetic sample collection.";

  it("refuses a rendering that drops a non- prefix", () => {
    expect(
      lines(
        l50,
        "Has received a whole blood transfusion within 120 days of genetic sample collection, where the transfusion was leukocyte-depleted.",
      ),
    ).toEqual(["negation: negations: 1 in the protocol, 0 in the plain"]);
  });

  it("passes a prefix said as a word", () => {
    expect(
      lines(
        l50,
        "Has received a whole blood transfusion within 120 days of genetic sample collection, where the transfusion was not leukocyte-depleted.",
      ),
    ).toEqual([]);
    expect(lines("unresectable NSCLC", "NSCLC that cannot be removed by surgery.")).toEqual([]);
  });
});

describe("rule 5: named terms, both ways", () => {
  const criterion = "Documented activating EGFR mutation (Exon 19 deletion, T790M, or L858R)";

  it("passes when every term is kept, explained or not", () => {
    expect(
      lines(
        criterion,
        "A documented activating EGFR mutation (a change in a gene) (Exon 19 deletion, T790M, or L858R).",
      ),
    ).toEqual([]);
  });

  it("refuses a term dropped or one added", () => {
    expect(
      lines(criterion, "A documented activating EGFR mutation (Exon 19 deletion, or L858R)."),
    ).toEqual(["named-term: missing: t790m"]);
    expect(lines("non-small cell lung cancer", "non-small cell lung cancer (NSCLC)")).toEqual([
      "named-term: added: nsclc",
    ]);
  });
});

describe("rule 6: scope words", () => {
  const criterion = "Patients must not have an active second malignancy";

  it("passes when the scope words are kept, or said the plain way", () => {
    expect(lines(criterion, "Must not have an active second cancer (malignancy).")).toEqual([]);
    expect(
      lines("Any previous systematic therapy", "Any prior therapy through the bloodstream."),
    ).toEqual([]);
  });

  it("refuses a scope word dropped", () => {
    expect(lines(criterion, "Must not have another cancer (second malignancy).")).toEqual([
      "scope: missing: active",
    ]);
  });

  it("does not refuse a scope word added; that is for the reader", () => {
    expect(lines("Pregnant", "Is currently pregnant.")).toEqual([]);
  });
});

describe("rule 7: no verdict wording", () => {
  it("refuses a rendering that tells someone whether they can take part", () => {
    expect(lines("Pregnant", "You cannot take part if you are pregnant.")).toEqual([
      "negation: negations: 0 in the protocol, 1 in the plain",
      "verdict: verdict word: you",
      "verdict: verdict word: take part",
    ]);
  });

  it("allows a word the protocol itself uses", () => {
    const l18 =
      "patients with previous brain metastases who have not yet received therapy specifically intended for their brain metastases are not eligible to enroll in this protocol";
    expect(
      lines(
        l18,
        "Patients with previous brain metastases (cancer that has spread to the brain) who have not yet had treatment aimed at them are not eligible to enroll in this protocol.",
      ),
    ).toEqual([]);
  });
});

describe("rule 7: a word of the same family is the protocol's own", () => {
  // Found in the full run: NCT04385368 L25 and L68 were refused for "enrolled".
  it("allows another form of a word the protocol uses", () => {
    expect(
      lines(
        "Concurrent enrollment in another clinical study",
        "Is enrolled in another clinical study at the same time.",
      ),
    ).toEqual([]);
  });

  it("still refuses a word of another family", () => {
    expect(
      lines("Concurrent enrollment in another study", "Is eligible and enrolled in another study."),
    ).toEqual(["verdict: verdict word: eligible"]);
  });
});

// Found in the full run: "with the exception of" rendered as "except" was refused.
describe("rule 4: an exception said two ways", () => {
  it("counts 'with the exception of' like 'except'", () => {
    expect(
      lines(
        "diverticulitis [with the exception of diverticulosis]",
        "Has diverticulitis, except for diverticulosis.",
      ),
    ).toEqual([]);
  });
});

/**
 * From Gate 3's reading (reading.md). NCT04385368 L15 and NCT00077350 L18:
 * the first attempts rightly dropped "are not eligible", as the statement form
 * does, but the "not" was still counted, so the retry put the verdict back.
 */
describe("rule 4: a negation that belongs to a verdict the rendering drops", () => {
  const l15 = "Patients undergoing wedge resection are not eligible for this study.";

  it("is not counted when the rendering has no verdict word", () => {
    expect(
      lines(
        l15,
        "Is undergoing wedge resection (a type of surgery to remove a wedge-shaped piece of tissue).",
      ),
    ).toEqual([]);
  });

  it("is counted when the rendering keeps a verdict word, so a reversal is still refused", () => {
    expect(lines(l15, "Is undergoing wedge resection and is eligible for this study.")).toEqual([
      "negation: negations: 1 in the protocol, 0 in the plain",
    ]);
  });
});

/**
 * From Gate 3's reading. NCT00077350 L17: "Patients with brain metastases which
 * have been treated are eligible if …" became "Has brain metastases …": a
 * permission with a condition turned into a requirement.
 */
describe("rule 7: a verdict with a condition", () => {
  const l17 =
    "Patients with brain metastases which have been treated are eligible if the patient is > 3 weeks post completion of treatment for their brain metastases, and patient is neurologically stable";

  it("refuses a rendering that drops it", () => {
    expect(
      lines(
        l17,
        "Has brain metastases that have been treated, and is more than 3 weeks after the treatment for the brain metastases finished, and is neurologically stable.",
      ),
    ).toEqual(["verdict: verdict with a condition dropped: eligible if"]);
  });

  it("passes a rendering that keeps it", () => {
    expect(
      lines(
        l17,
        "Patients with brain metastases that have been treated are eligible if they are more than 3 weeks after the treatment for their brain metastases finished, and are neurologically stable.",
      ),
    ).toEqual([]);
  });
});

describe("no rendering", () => {
  it("fails a missing or empty rendering", () => {
    expect(lines("Pregnant", null)).toEqual(["empty: no rendering"]);
    expect(lines("Pregnant", "  ")).toEqual(["empty: no rendering"]);
  });
});

/**
 * What the check cannot see (spec §5.4). Each is a rendering that is wrong
 * and passes. `it.fails` keeps them visible: if the check ever starts
 * catching one, the test turns red and this list needs updating.
 */
describe("known gaps: wrong renderings the check passes", () => {
  const refused = (criterion: string, plain: string) =>
    expect(checkPlain(criterion, plain).pass).toBe(false);

  // Found in Gate 3's reading: NCT04385368 L67 explains "IP" (investigational
  // product) as "an intervention group". Shown, and named in the README.
  it.fails("a wrong explanation of an abbreviation, from the reading", () => {
    refused(
      "Previous IP assignment in the present study.",
      "Has been assigned to an intervention group (IP) in the current study prior to this.",
    );
  });

  it.fails("a wrong explanation", () => {
    refused(
      "Documented activating EGFR mutation",
      "A documented activating EGFR mutation (a type of lung cancer).",
    );
  });

  it.fails("a clause dropped that holds nothing the check extracts", () => {
    refused(
      "Evaluation by an attending thoracic surgeon to confirm eligibility for an R0 resection with curative intent",
      "Evaluation by a surgeon to confirm an R0 resection is possible.",
    );
  });

  it.fails("an 'and' turned into an 'or' when the text already has an 'or'", () => {
    refused(
      "Significant history of cardiovascular and cerebrovascular disease, or bleeding",
      "A significant history of cardiovascular or cerebrovascular disease, or bleeding.",
    );
  });

  it.fails("an ordinary word changed outside the lists", () => {
    refused("Brain metastases", "Cancer that has spread to the lungs.");
  });

  // Found by the mutation tests in the full run: the anchor rule covers a
  // duration's "before" or "after", not one that orders two events.
  it.fails("before and after swapped where no duration is attached", () => {
    refused(
      "brain metastasis symptoms that are stable after prior treatment",
      "Has brain metastasis symptoms that are stable before prior treatment.",
    );
  });

  it.fails("a negation moved to another clause", () => {
    refused(
      "Cytology alone is not acceptable; histology is required",
      "Cytology alone is acceptable; histology is not required.",
    );
  });
});
