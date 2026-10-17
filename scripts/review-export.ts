/**
 * Writes the review file for one eval run (0010 spec §3.2).
 *
 *   npm run review:export -- <run file>           evals/results/screening/review/<run file>
 *   npm run review:export -- <run file> --force   overwrite a committed file that differs
 *
 * The coordinator review reads this file, not the conversation cache, which
 * is gitignored. A run named by `EVAL_RUN` or `READING_RUN` commits its review
 * file in the same change, and a test fails if it doesn't.
 *
 * Reads the cache under `evals/results/screening/conversations/`, so it runs
 * on the machine that made the run. Deterministic, and no model.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportReview, REVIEW_DIR, reviewText } from "./app/eval-run.js";

const SCREENING_DIR = fileURLToPath(new URL("../evals/results/screening", import.meta.url));

export type WriteDecision = "write" | "unchanged" | "refuse";

/**
 * Whether to write. A file that exists and differs means the cache no longer
 * matches what was committed, which is worth stopping for.
 */
export function writeDecision(
  existing: string | undefined,
  next: string,
  force: boolean,
): WriteDecision {
  if (existing === undefined) {
    return "write";
  }
  if (existing === next) {
    return "unchanged";
  }
  return force ? "write" : "refuse";
}

function main(argv: readonly string[]): void {
  const runFile = argv.find((a) => !a.startsWith("--"));
  if (runFile === undefined) {
    console.error("Usage: npm run review:export -- <run file> [--force]");
    process.exitCode = 1;
    return;
  }
  const path = join(REVIEW_DIR, runFile);
  const next = reviewText(exportReview(SCREENING_DIR, runFile));
  const existing = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  switch (writeDecision(existing, next, argv.includes("--force"))) {
    case "unchanged":
      console.log(`${path}: unchanged`);
      return;
    case "refuse":
      console.error(
        `${path} differs from what the cache gives now: the cache no longer matches the committed review file. ` +
          "Pass --force to overwrite it.",
      );
      process.exitCode = 1;
      return;
    case "write": {
      mkdirSync(REVIEW_DIR, { recursive: true });
      writeFileSync(path, next);
      const conversations = (JSON.parse(next) as { conversations: unknown[] }).conversations.length;
      console.log(
        `Wrote ${path}: ${conversations} conversations, ${Buffer.byteLength(next)} bytes.`,
      );
    }
  }
}

if (import.meta.main) {
  main(process.argv.slice(2));
}
