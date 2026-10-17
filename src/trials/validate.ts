import { type Trial, TrialFixtureError } from "./types.js";

/**
 * Confirms that a parsed fixture really is a `Trial`, by hand.
 *
 * Hand-written rather than schema-library based, which keeps this project at
 * zero runtime dependencies. The shape is flat and small, and the only errors
 * worth producing are "which file, which field" — which a schema library would
 * produce no better.
 *
 * Every fault is collected before throwing. A fixture with three problems should
 * take one run to diagnose, not three.
 */
export function validateTrial(value: unknown, source: string): Trial {
  const problems: string[] = [];
  const record = asRecord(value);

  if (record === undefined) {
    throw new TrialFixtureError(`Invalid trial fixture ${source}`, [
      "file does not contain a JSON object",
    ]);
  }

  requireString(record["nctId"], "nctId", problems);
  requireString(record["briefTitle"], "briefTitle", problems);
  requireNullableString(record["officialTitle"], "officialTitle", problems);
  requireString(record["overallStatus"], "overallStatus", problems);
  requireStringArray(record["phases"], "phases", problems);
  requireStringArray(record["conditions"], "conditions", problems);
  requireString(record["leadSponsor"], "leadSponsor", problems);
  requireString(record["lastUpdatePostDate"], "lastUpdatePostDate", problems);
  validateEligibility(record["eligibility"], problems);

  if (problems.length > 0) {
    throw new TrialFixtureError(`Invalid trial fixture ${source}`, problems);
  }

  return record as unknown as Trial;
}

function validateEligibility(value: unknown, problems: string[]): void {
  const record = asRecord(value);

  if (record === undefined) {
    problems.push("eligibility is missing or not an object");
    return;
  }

  requireString(record["criteriaText"], "eligibility.criteriaText", problems);
  requireString(record["sex"], "eligibility.sex", problems);
  requireNullableString(record["minimumAge"], "eligibility.minimumAge", problems);
  requireNullableString(record["maximumAge"], "eligibility.maximumAge", problems);
  requireStringArray(record["stdAges"], "eligibility.stdAges", problems);

  const healthyVolunteers: unknown = record["healthyVolunteers"];
  if (typeof healthyVolunteers !== "boolean" && healthyVolunteers !== null) {
    problems.push("eligibility.healthyVolunteers is not a boolean or null");
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string, problems: string[]): void {
  if (typeof value !== "string" || value.length === 0) {
    problems.push(`${field} is missing or not a non-empty string`);
  }
}

/**
 * A field that is either a string or explicitly null. `undefined` is a fault:
 * absent optionals are written as null, so a missing key means the fixture was
 * produced by something other than the fetch script.
 */
function requireNullableString(value: unknown, field: string, problems: string[]): void {
  if (value !== null && typeof value !== "string") {
    problems.push(`${field} is not a string or null`);
  }
}

function requireStringArray(value: unknown, field: string, problems: string[]): void {
  if (!Array.isArray(value)) {
    problems.push(`${field} is not an array`);
    return;
  }
  if (!value.every((item) => typeof item === "string")) {
    problems.push(`${field} contains a non-string entry`);
  }
}
