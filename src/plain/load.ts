import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPlain, describeProblem } from "./check.js";
import type { PlainDisplay, PlainFile, Rendering } from "./types.js";
import { PlainError } from "./types.js";

/**
 * Reads committed renderings and decides what the page shows for each
 * criterion. No model, no network: renderings are made by
 * `scripts/render-plain.ts`, run by a person, and read here as fixtures, the
 * way `src/trials/` reads `data/trials/`.
 *
 * A malformed file throws `PlainError` naming the file. A missing file is not a
 * fault: a study nobody has rendered yet has no plain versions, and says so.
 */

export const DEFAULT_PLAIN_DIR = fileURLToPath(new URL("../../data/plain", import.meta.url));

/** What a rendering is matched against: the criterion's id and its exact text. */
export interface CriterionWords {
  id: string;
  text: string;
}

export function textSha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function plainPath(nctId: string, dir: string = DEFAULT_PLAIN_DIR): string {
  return join(dir, `${nctId}.json`);
}

/** The study's renderings, or undefined if none have been made. */
export function loadPlainFile(
  nctId: string,
  dir: string = DEFAULT_PLAIN_DIR,
): PlainFile | undefined {
  const path = plainPath(nctId, dir);
  if (!existsSync(path)) {
    return undefined;
  }
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PlainError(`Cannot read ${path}`, [
      error instanceof Error ? error.message : "bad JSON",
    ]);
  }
  const problems = validate(record, nctId);
  if (problems.length > 0) {
    throw new PlainError(`Unusable renderings in ${path}`, problems);
  }
  return record as PlainFile;
}

/**
 * What to show under each criterion. Keyed by criterion id; every criterion
 * gets an entry, so the page never has to guess what an absence means.
 */
export function displayFor(
  criteria: readonly CriterionWords[],
  file: PlainFile | undefined,
): Record<string, PlainDisplay> {
  const byId = new Map((file?.renderings ?? []).map((r) => [r.criterionId, r]));
  const out: Record<string, PlainDisplay> = {};
  for (const criterion of criteria) {
    out[criterion.id] = displayOne(criterion, byId.get(criterion.id));
  }
  return out;
}

function displayOne(criterion: CriterionWords, rendering: Rendering | undefined): PlainDisplay {
  if (rendering === undefined) {
    return { state: "missing" };
  }
  if (rendering.textSha !== textSha(criterion.text)) {
    return { state: "stale" };
  }
  // The check as it is now, not as it was when the rendering was made: a
  // tightened check stops showing a rendering without regenerating it.
  let problems: string[] = [];
  for (const [i, attempt] of rendering.attempts.entries()) {
    const result = checkPlain(criterion.text, attempt.plain);
    if (result.pass && attempt.plain !== null) {
      return { state: "shown", text: attempt.plain, attempt: i === 0 ? 1 : 2 };
    }
    problems = result.problems.map(describeProblem);
  }
  return { state: "failed", problems };
}

function validate(record: unknown, nctId: string): string[] {
  if (!isRecord(record)) {
    return ["not a JSON object"];
  }
  const problems: string[] = [];
  if (record["nctId"] !== nctId) {
    problems.push(`nctId is ${JSON.stringify(record["nctId"])}, expected ${nctId}`);
  }
  if (record["source"] !== "labels") {
    problems.push(`source is ${JSON.stringify(record["source"])}, expected "labels"`);
  }
  const run = record["run"];
  if (!isRecord(run)) {
    problems.push("run is missing");
  } else {
    for (const key of ["model", "quantization", "adapter", "promptVersion", "timestamp"]) {
      if (typeof run[key] !== "string") {
        problems.push(`run.${key} is missing`);
      }
    }
    if (typeof run["temperature"] !== "number") {
      problems.push("run.temperature is missing");
    }
    if (typeof run["seed"] !== "number" && run["seed"] !== null) {
      problems.push("run.seed is missing");
    }
  }
  const renderings = record["renderings"];
  if (!Array.isArray(renderings)) {
    problems.push("renderings is not an array");
    return problems;
  }
  const seen = new Set<string>();
  renderings.forEach((r, i) => {
    if (!isRecord(r)) {
      problems.push(`renderings[${i}] is not an object`);
      return;
    }
    const id = r["criterionId"];
    if (typeof id !== "string" || id.length === 0) {
      problems.push(`renderings[${i}].criterionId is missing`);
    } else if (seen.has(id)) {
      problems.push(`renderings[${i}]: ${id} appears twice`);
    } else {
      seen.add(id);
    }
    if (typeof r["textSha"] !== "string" || !/^[0-9a-f]{64}$/.test(r["textSha"])) {
      problems.push(`renderings[${i}].textSha is not a sha-256 hex digest`);
    }
    const attempts = r["attempts"];
    if (!Array.isArray(attempts) || attempts.length < 1 || attempts.length > 2) {
      problems.push(`renderings[${i}].attempts must hold one or two attempts`);
      return;
    }
    attempts.forEach((a, j) => {
      if (!isRecord(a) || (typeof a["plain"] !== "string" && a["plain"] !== null)) {
        problems.push(`renderings[${i}].attempts[${j}].plain must be a string or null`);
        return;
      }
      const report = a["reportAtGeneration"];
      if (
        report !== undefined &&
        !(Array.isArray(report) && report.every((line) => typeof line === "string"))
      ) {
        problems.push(`renderings[${i}].attempts[${j}].reportAtGeneration must be strings`);
      }
    });
  });
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
