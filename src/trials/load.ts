import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS_IDS } from "./corpus.js";
import { type Trial, TrialFixtureError } from "./types.js";
import { validateTrial } from "./validate.js";

/**
 * Reads the committed trial corpus. No network, ever — that is the whole point
 * of the split between this module and `scripts/fetch-trials.ts`.
 *
 * Eager, synchronous and uncached. The corpus is twelve small files; caching
 * would buy nothing and would add state that tests have to reset.
 *
 * Every fault throws `TrialFixtureError` naming the file. Nothing returns
 * undefined, nothing returns a partial `Trial`, nothing logs and carries on. A
 * broken fixture should be a test failure with a filename in it, not an
 * `undefined` surfacing three layers into the criteria parser.
 */
const DEFAULT_DIR = fileURLToPath(new URL("../../data/trials", import.meta.url));

export function loadTrials(dir: string = DEFAULT_DIR): Trial[] {
  const present = listFixtures(dir);

  // A file with no entry in the pinned list means the corpus on disk and the
  // corpus in code disagree. Silently ignoring it would let a stray fixture sit
  // in the repository being read by nothing.
  const orphans = present.filter((name) => !CORPUS_IDS.includes(basename(name)));
  if (orphans.length > 0) {
    throw new TrialFixtureError(
      `Unexpected files in ${dir}`,
      orphans.map((name) => `${name} is not in the pinned corpus (src/trials/corpus.ts)`),
    );
  }

  return CORPUS_IDS.map((nctId) => readFixture(nctId, dir));
}

export function getTrial(nctId: string, dir: string = DEFAULT_DIR): Trial {
  if (!CORPUS_IDS.includes(nctId)) {
    throw new TrialFixtureError(`Unknown trial ${nctId}`, [
      "not in the pinned corpus (src/trials/corpus.ts)",
    ]);
  }
  return readFixture(nctId, dir);
}

function readFixture(nctId: string, dir: string): Trial {
  const path = join(dir, `${nctId}.json`);

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new TrialFixtureError(`Missing trial fixture ${path}`, [
      "file does not exist or cannot be read; run `npm run fetch:trials`",
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new TrialFixtureError(`Malformed JSON in ${path}`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  const trial = validateTrial(parsed, path);

  // Catches a fixture copied to the wrong filename, which would otherwise make
  // loadTrials return a study under an NCT ID that is not its own.
  if (trial.nctId !== nctId) {
    throw new TrialFixtureError(`Wrong study in ${path}`, [
      `file is named ${nctId} but contains ${trial.nctId}`,
    ]);
  }

  return trial;
}

function listFixtures(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    throw new TrialFixtureError(`Cannot read trial directory ${dir}`, [
      "directory does not exist or is not readable; run `npm run fetch:trials`",
    ]);
  }
}

function basename(fileName: string): string {
  return fileName.slice(0, -".json".length);
}
