import { describe, expect, it } from "vitest";
import { NO_ID, readTrialReference, SEVERAL_IDS } from "../../src/trials/reference.js";

describe("readTrialReference", () => {
  it.each([
    "NCT01234567",
    "  nct01234567 ",
    "https://clinicaltrials.gov/study/NCT01234567",
    "https://clinicaltrials.gov/study/NCT01234567?tab=results",
    "https://clinicaltrials.gov/ct2/show/NCT01234567",
    "https://www.clinicaltrials.gov/study/NCT01234567#eligibility",
  ])("reads the ID from %j", (input) => {
    expect(readTrialReference(input)).toEqual({ nctId: "NCT01234567" });
  });

  it("accepts the same ID named twice", () => {
    expect(readTrialReference("NCT01234567 https://clinicaltrials.gov/study/NCT01234567")).toEqual({
      nctId: "NCT01234567",
    });
  });

  it.each([
    "",
    "   ",
    "https://clinicaltrials.gov/",
    "NCT1234567",
    "NCT012345678",
    "lung cancer",
  ])("finds no ID in %j", (input) => {
    expect(readTrialReference(input)).toEqual({ problem: NO_ID });
  });

  it("refuses two different IDs", () => {
    expect(readTrialReference("NCT01234567, NCT07654321")).toEqual({ problem: SEVERAL_IDS });
  });
});
