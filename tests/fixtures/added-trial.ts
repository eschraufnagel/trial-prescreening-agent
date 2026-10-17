import type { ScriptedResponse } from "../../src/models/index.js";
import type { Trial } from "../../src/trials/index.js";

/**
 * A made-up trial for the Trials screen's tests (slice 0013), and the parse a
 * fake parser gives for it. Its ID is all zeros but one, so nobody takes it
 * for a real study.
 */

export const ADDED_ID = "NCT00000001";

export function addedTrial(criteriaText = TEXT, nctId = ADDED_ID): Trial {
  return {
    nctId,
    briefTitle: `Made-up study ${nctId}`,
    officialTitle: null,
    overallStatus: "RECRUITING",
    phases: ["PHASE2"],
    conditions: ["Non-small cell lung cancer"],
    leadSponsor: "Nobody",
    lastUpdatePostDate: "2000-02-01",
    eligibility: {
      criteriaText,
      sex: "ALL",
      minimumAge: "18 Years",
      maximumAge: null,
      healthyVolunteers: false,
      stdAges: ["ADULT"],
    },
  };
}

export const TEXT = [
  "Inclusion Criteria:",
  "",
  "* Aged 18 or older",
  "* Able to swallow tablets",
  "",
  "Exclusion Criteria:",
  "",
  "* Pregnant or breastfeeding",
].join("\n");

/** A parser's answer for any trial: one criterion per `* ` line, typed by heading. */
export function cannedParse(request: { user: string }): ScriptedResponse {
  let polarity = "inclusion";
  const criteria = request.user.split("\n").flatMap((line) => {
    if (/^Exclusion/i.test(line)) {
      polarity = "exclusion";
    }
    const quote = /^\* (.+)$/.exec(line)?.[1];
    return quote === undefined
      ? []
      : [{ quote, text: quote, polarity, type: "patient", appliesTo: null, confidence: 0.9 }];
  });
  return { kind: "json", content: { criteria } };
}
