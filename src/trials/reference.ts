/**
 * Reads the trial a person named on the Trials screen (slice 0013): a
 * ClinicalTrials.gov link in any of its forms, or a bare NCT ID.
 *
 * Only the ID is kept. A link is never requested as given, so what a person
 * pastes can't steer the server to another address; `registry.ts` builds the
 * one URL it fetches from the ID alone.
 */

export const NCT_ID = /^NCT\d{8}$/;

export const NO_ID =
  "No NCT ID found. Paste a ClinicalTrials.gov study link or an ID like NCT01234567.";
export const SEVERAL_IDS = "More than one NCT ID found. Add one trial at a time.";

export function readTrialReference(input: string): { nctId: string } | { problem: string } {
  const found = new Set(
    [...input.trim().matchAll(/NCT\d{8}(?!\d)/gi)].map((m) => m[0].toUpperCase()),
  );
  if (found.size === 0) {
    return { problem: NO_ID };
  }
  if (found.size > 1) {
    return { problem: SEVERAL_IDS };
  }
  return { nctId: [...found][0] as string };
}
