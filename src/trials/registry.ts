import { NCT_ID } from "./reference.js";
import { trimStudy } from "./trim.js";
import type { Trial } from "./types.js";

/**
 * Fetches one study from ClinicalTrials.gov and trims it (slice 0013).
 *
 * The one file outside `src/models/` that may reach the network, and only
 * this host. The running app calls it when a person clicks Add or Refresh on
 * the Trials screen, and `npm run fetch:trials` calls it for the pinned
 * corpus. Nothing fetches in the background or at startup.
 * `tests/boundary.test.ts` holds this file to `fetch()` and to
 * `clinicaltrials.gov`, and every other file to the absolute rule.
 *
 * The full record is requested and trimmed here rather than with the API's
 * `fields` parameter, so trimming stays in one tested place. Trimming also
 * drops the site contacts, which name real coordinators, before anything is
 * kept.
 */

export const REGISTRY_HOST = "clinicaltrials.gov";
const REQUEST_TIMEOUT_MS = 30_000;

/** Raised for a study the registry doesn't have, so a caller can add its own advice. */
export class StudyNotFoundError extends Error {
  constructor(nctId: string) {
    super(`ClinicalTrials.gov has no study ${nctId}.`);
    this.name = "StudyNotFoundError";
  }
}

/**
 * `fetch` is a parameter so tests pass their own, and it keeps that name so the
 * boundary test's detector sees the call: a renamed `fetchImpl(` would slip
 * past a check that looks for `fetch(`.
 */
export async function fetchStudy(
  nctId: string,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<Trial> {
  if (!NCT_ID.test(nctId)) {
    throw new Error(`Not an NCT ID: ${JSON.stringify(nctId)}`);
  }

  let response: Response;
  try {
    response = await fetch(`https://clinicaltrials.gov/api/v2/studies/${nctId}?format=json`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Couldn't reach ClinicalTrials.gov (${detail}).`);
  }

  if (response.status === 404) {
    throw new StudyNotFoundError(nctId);
  }
  if (!response.ok) {
    throw new Error(`ClinicalTrials.gov answered HTTP ${response.status}.`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("ClinicalTrials.gov sent something that isn't JSON.");
  }
  return trimStudy(body, nctId);
}
