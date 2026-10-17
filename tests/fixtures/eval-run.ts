import { loadEvalRun, loadReadingRun } from "../../scripts/app/eval-run.js";
import type { FinishedConversation } from "../../src/server/index.js";

/**
 * Fields that exist only in the eval run's files: the vignette, the simulated
 * participant, the timing and the grades. None may reach the review, which is
 * blind to them (0007 spec §8.3).
 */
export const EVAL_ONLY_KEYS: readonly string[] = [
  "vignetteId",
  "participant",
  "memory",
  "fidelityChecked",
  "timing",
  "labels",
  "expected",
  "outcome",
  "notCorrect",
  "grade",
];

/** Every key in a JSON value, at any depth. */
export function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keysOf);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
  }
  return [];
}

let loaded: FinishedConversation[] | undefined;

/** The committed eval run, loaded once for every test file that reads it. */
export function evalRun(): FinishedConversation[] {
  loaded ??= loadEvalRun();
  return loaded;
}

let reading: FinishedConversation[] | undefined;

/** The run 0007's reading was made against, for the sheet and score tests, loaded once. */
export function readingRun(): FinishedConversation[] {
  reading ??= loadReadingRun();
  return reading;
}
