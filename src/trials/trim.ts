import { type Trial, type TrialEligibility, TrialFixtureError } from "./types.js";

/**
 * Turns a ClinicalTrials.gov API v2 study response into a `Trial`.
 *
 * Pure: no I/O, no network, no clock. The fetch script calls this, which is what
 * lets the transformation be tested against a committed sample response without
 * touching the network.
 *
 * Every field is read from exactly one path. Nothing is computed, inferred or
 * merged, so a surprising value in a fixture always traces back to the registry
 * rather than to something this function decided.
 */
export function trimStudy(raw: unknown, source = "study"): Trial {
  const problems: string[] = [];
  const protocol = asRecord(asRecord(raw)?.["protocolSection"]);

  if (protocol === undefined) {
    throw new TrialFixtureError(`Cannot read ${source}`, [
      "protocolSection is missing or not an object",
    ]);
  }

  const identification = asRecord(protocol["identificationModule"]);
  const status = asRecord(protocol["statusModule"]);
  const design = asRecord(protocol["designModule"]);
  const conditions = asRecord(protocol["conditionsModule"]);
  const sponsors = asRecord(protocol["sponsorCollaboratorsModule"]);
  const eligibilityModule = asRecord(protocol["eligibilityModule"]);

  const trial: Trial = {
    nctId: required(identification?.["nctId"], "identificationModule.nctId", problems),
    briefTitle: required(
      identification?.["briefTitle"],
      "identificationModule.briefTitle",
      problems,
    ),
    officialTitle: optional(identification?.["officialTitle"]),
    overallStatus: required(status?.["overallStatus"], "statusModule.overallStatus", problems),
    phases: stringArray(design?.["phases"]),
    conditions: stringArray(conditions?.["conditions"]),
    leadSponsor: required(
      asRecord(sponsors?.["leadSponsor"])?.["name"],
      "sponsorCollaboratorsModule.leadSponsor.name",
      problems,
    ),
    lastUpdatePostDate: required(
      asRecord(status?.["lastUpdatePostDateStruct"])?.["date"],
      "statusModule.lastUpdatePostDateStruct.date",
      problems,
    ),
    eligibility: trimEligibility(eligibilityModule, problems),
  };

  if (problems.length > 0) {
    throw new TrialFixtureError(`Cannot read ${source}`, problems);
  }

  return trial;
}

function trimEligibility(
  module: Record<string, unknown> | undefined,
  problems: string[],
): TrialEligibility {
  return {
    // Read as-is. Anything that looks like tidying this string is a bug.
    criteriaText: required(
      module?.["eligibilityCriteria"],
      "eligibilityModule.eligibilityCriteria",
      problems,
    ),
    sex: required(module?.["sex"], "eligibilityModule.sex", problems),
    minimumAge: optional(module?.["minimumAge"]),
    maximumAge: optional(module?.["maximumAge"]),
    healthyVolunteers: optionalBoolean(module?.["healthyVolunteers"]),
    stdAges: stringArray(module?.["stdAges"]),
  };
}

/**
 * Serializes a trial for `data/trials/`.
 *
 * Keys are written in the order `Trial` declares them rather than in whatever
 * order the source object happens to carry, because byte-stability is what makes
 * a refetch diff readable. Two-space indent, trailing newline.
 */
export function serializeTrial(trial: Trial): string {
  const ordered = {
    nctId: trial.nctId,
    briefTitle: trial.briefTitle,
    officialTitle: trial.officialTitle,
    overallStatus: trial.overallStatus,
    phases: trial.phases,
    conditions: trial.conditions,
    leadSponsor: trial.leadSponsor,
    lastUpdatePostDate: trial.lastUpdatePostDate,
    eligibility: {
      criteriaText: trial.eligibility.criteriaText,
      sex: trial.eligibility.sex,
      minimumAge: trial.eligibility.minimumAge,
      maximumAge: trial.eligibility.maximumAge,
      healthyVolunteers: trial.eligibility.healthyVolunteers,
      stdAges: trial.eligibility.stdAges,
    },
  };

  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/**
 * A field the project cannot work without. Records a problem and returns a
 * placeholder so that a single pass collects every fault rather than stopping at
 * the first; `trimStudy` throws before any placeholder can escape.
 */
function required(value: unknown, path: string, problems: string[]): string {
  if (typeof value !== "string" || value.length === 0) {
    problems.push(`${path} is missing or not a non-empty string`);
    return "";
  }
  return value;
}

/** Absent optional scalars become null, and are still written to the fixture. */
function optional(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Absent optional arrays become empty arrays, and are still written. */
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
