import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { serializeTrial, trimStudy } from "../../src/trials/trim.js";
import { TrialFixtureError } from "../../src/trials/types.js";

/**
 * One real, untrimmed API v2 response, saved verbatim. This is the only place in
 * the repository a full response belongs; `data/trials/` holds trimmed fixtures.
 */
const samplePath = fileURLToPath(new URL("./fixtures/study-NCT00106626.json", import.meta.url));
const sampleText = readFileSync(samplePath, "utf8");

// The sample is an arbitrary registry response that tests navigate and mutate
// freely. Modelling its full shape would duplicate the registry's schema to no
// benefit, and `unknown` would bury every assertion in casts.
// biome-ignore lint/suspicious/noExplicitAny: untyped registry response
function sample(): Record<string, any> {
  // Re-parsed per test so that mutations in one test cannot leak into another.
  return JSON.parse(sampleText);
}

describe("trimStudy", () => {
  // R-18
  it("maps every field from the paths the spec names", () => {
    const raw = sample();
    const trial = trimStudy(raw);
    const protocol = raw["protocolSection"];

    expect(trial.nctId).toBe(protocol.identificationModule.nctId);
    expect(trial.briefTitle).toBe(protocol.identificationModule.briefTitle);
    expect(trial.officialTitle).toBe(protocol.identificationModule.officialTitle);
    expect(trial.overallStatus).toBe(protocol.statusModule.overallStatus);
    expect(trial.phases).toEqual(protocol.designModule.phases);
    expect(trial.conditions).toEqual(protocol.conditionsModule.conditions);
    expect(trial.leadSponsor).toBe(protocol.sponsorCollaboratorsModule.leadSponsor.name);
    expect(trial.lastUpdatePostDate).toBe(protocol.statusModule.lastUpdatePostDateStruct.date);
    expect(trial.eligibility.sex).toBe(protocol.eligibilityModule.sex);
    expect(trial.eligibility.minimumAge).toBe(protocol.eligibilityModule.minimumAge);
    expect(trial.eligibility.healthyVolunteers).toBe(protocol.eligibilityModule.healthyVolunteers);
    expect(trial.eligibility.stdAges).toEqual(protocol.eligibilityModule.stdAges);
  });

  // R-18: the trim has to actually drop things, not just rename them.
  it("discards every field the project does not use", () => {
    const trial = trimStudy(sample());

    expect(Object.keys(trial)).toEqual([
      "nctId",
      "briefTitle",
      "officialTitle",
      "overallStatus",
      "phases",
      "conditions",
      "leadSponsor",
      "lastUpdatePostDate",
      "eligibility",
    ]);
    // Site contact blocks name real coordinators and give their phone numbers.
    expect(JSON.stringify(trial)).not.toContain("contactsLocationsModule");
    expect(sampleText).toContain("contactsLocationsModule");
  });

  // R-21: the single most important assertion in this file. Comparing against the
  // string read out of the source, never a retyped literal — a retyped expectation
  // would pass while the code quietly normalized whitespace.
  it("stores criteriaText byte-for-byte as the registry returned it", () => {
    const raw = sample();
    const expected = raw["protocolSection"].eligibilityModule.eligibilityCriteria;
    const trial = trimStudy(raw);

    expect(trial.eligibility.criteriaText).toBe(expected);
    expect(trial.eligibility.criteriaText.length).toBe(expected.length);
    // Guards the specific tidying a careless implementation would do.
    expect(trial.eligibility.criteriaText).toContain("\n");
    expect(trial.eligibility.criteriaText.startsWith(expected.slice(0, 40))).toBe(true);
    expect(trial.eligibility.criteriaText.endsWith(expected.slice(-40))).toBe(true);
  });

  // R-21: the real sample happens to carry no leading or trailing whitespace, so
  // the assertion above cannot catch a stray .trim(). This one can. Registry text
  // does sometimes arrive padded, and padding is part of what 0002 has to handle.
  it("preserves leading and trailing whitespace in criteriaText", () => {
    const raw = sample();
    const padded = "\n\n  Inclusion Criteria:\n\n* Over 18\n  \n";
    raw["protocolSection"].eligibilityModule.eligibilityCriteria = padded;

    expect(trimStudy(raw).eligibility.criteriaText).toBe(padded);
  });

  // R-19
  it("turns absent optional scalars into null", () => {
    const raw = sample();
    // This study genuinely has no maximumAge, so the absence is real, not staged.
    expect(raw["protocolSection"].eligibilityModule.maximumAge).toBeUndefined();
    expect(trimStudy(raw).eligibility.maximumAge).toBeNull();

    delete raw["protocolSection"].identificationModule.officialTitle;
    delete raw["protocolSection"].eligibilityModule.minimumAge;
    delete raw["protocolSection"].eligibilityModule.healthyVolunteers;
    const trial = trimStudy(raw);

    expect(trial.officialTitle).toBeNull();
    expect(trial.eligibility.minimumAge).toBeNull();
    expect(trial.eligibility.healthyVolunteers).toBeNull();
  });

  // R-19: "the registry is silent" must not become "healthy volunteers refused".
  it("does not default healthyVolunteers to false", () => {
    const raw = sample();
    delete raw["protocolSection"].eligibilityModule.healthyVolunteers;

    expect(trimStudy(raw).eligibility.healthyVolunteers).not.toBe(false);
    expect(trimStudy(raw).eligibility.healthyVolunteers).toBeNull();
  });

  // R-19
  it("turns absent optional arrays into empty arrays", () => {
    const raw = sample();
    delete raw["protocolSection"].designModule.phases;
    delete raw["protocolSection"].conditionsModule.conditions;
    delete raw["protocolSection"].eligibilityModule.stdAges;
    const trial = trimStudy(raw);

    expect(trial.phases).toEqual([]);
    expect(trial.conditions).toEqual([]);
    expect(trial.eligibility.stdAges).toEqual([]);
  });

  // R-20
  it("throws and names the field when eligibilityCriteria is missing", () => {
    const raw = sample();
    delete raw["protocolSection"].eligibilityModule.eligibilityCriteria;

    expect(() => trimStudy(raw, "NCT00106626")).toThrow(TrialFixtureError);
    expect(() => trimStudy(raw, "NCT00106626")).toThrow(/eligibilityModule\.eligibilityCriteria/);
    expect(() => trimStudy(raw, "NCT00106626")).toThrow(/NCT00106626/);
  });

  // R-20
  it("reports every missing required field at once, not just the first", () => {
    const raw = sample();
    delete raw["protocolSection"].identificationModule.nctId;
    delete raw["protocolSection"].eligibilityModule.eligibilityCriteria;
    delete raw["protocolSection"].eligibilityModule.sex;

    try {
      trimStudy(raw, "broken");
      expect.unreachable("expected trimStudy to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TrialFixtureError);
      expect((error as TrialFixtureError).problems).toHaveLength(3);
    }
  });

  // R-20
  it("throws when the response has no protocolSection at all", () => {
    expect(() => trimStudy({}, "empty")).toThrow(/protocolSection/);
    expect(() => trimStudy(null, "null")).toThrow(/protocolSection/);
  });
});

describe("serializeTrial", () => {
  // R-22
  it("writes keys in declaration order regardless of the source object's order", () => {
    const trial = trimStudy(sample());
    const shuffled = Object.fromEntries(Object.entries(trial).reverse()) as unknown as typeof trial;

    expect(serializeTrial(shuffled)).toBe(serializeTrial(trial));
    expect(Object.keys(JSON.parse(serializeTrial(trial)))).toEqual(Object.keys(trial));
  });

  // R-22
  it("is byte-stable across repeated runs", () => {
    expect(serializeTrial(trimStudy(sample()))).toBe(serializeTrial(trimStudy(sample())));
  });

  // R-5
  it("uses two-space indent and a trailing newline", () => {
    const text = serializeTrial(trimStudy(sample()));

    expect(text.endsWith("}\n")).toBe(true);
    expect(text.split("\n")[1]).toMatch(/^ {2}"nctId":/);
  });

  // R-21 again, through the serializer: a round trip must not touch the text.
  it("round-trips criteriaText unchanged", () => {
    const raw = sample();
    const expected = raw["protocolSection"].eligibilityModule.eligibilityCriteria;
    const written = JSON.parse(serializeTrial(trimStudy(raw)));

    expect(written.eligibility.criteriaText).toBe(expected);
  });
});
