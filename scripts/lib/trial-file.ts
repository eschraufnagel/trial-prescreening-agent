import { readFileSync } from "node:fs";
import type { Trial } from "../../src/trials/index.js";
import { validateTrial } from "../../src/trials/validate.js";

/**
 * A trial from a JSON file: a trimmed study, as in `data/trials/`, or an app
 * record holding one under `trial`, as in `added-trials/` and 0013's gate
 * records (slice 0015). It lets `parse:criteria` parse a trial the corpus
 * doesn't pin, from text that can't drift the way a refetch can.
 */
export function readTrialFile(path: string): Trial {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read a trial from ${path}: ${(error as Error).message}`);
  }
  const record = value as { trial?: unknown } | null;
  const trial =
    typeof record === "object" && record !== null && "trial" in record ? record.trial : value;
  return validateTrial(trial, path);
}
