/**
 * Refetches the pinned trial corpus from ClinicalTrials.gov and writes fixtures.
 *
 * The request itself is `fetchStudy` in `src/trials/registry.ts`, which the
 * app's Trials screen also uses (slice 0013). This script is what writes the
 * pinned corpus: the app reads these fixtures and never rewrites them.
 *
 *   npm run fetch:trials              refetch and overwrite fixtures
 *   npm run fetch:trials -- --dry-run report what would change, write nothing
 *
 * Run by a person, deliberately, not by anything automatic.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS } from "../src/trials/corpus.js";
import { fetchStudy, StudyNotFoundError } from "../src/trials/registry.js";
import { serializeTrial } from "../src/trials/trim.js";
import type { Trial } from "../src/trials/types.js";

const OUTPUT_DIR = fileURLToPath(new URL("../data/trials", import.meta.url));

type Outcome =
  | { status: "unchanged" | "new"; nctId: string }
  | { status: "changed"; nctId: string; fields: string[] }
  | { status: "error"; nctId: string; reason: string };

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  if (!dryRun) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outcomes: Outcome[] = [];

  // Sequential on purpose. Twelve requests against a public registry is not a
  // reason to open twelve connections at once.
  for (const { nctId } of CORPUS) {
    const outcome = await fetchOne(nctId, dryRun);
    outcomes.push(outcome);
    report(outcome);

    // Hard failure: no retry, no fallback, no silent skip. Fixtures already
    // written stay on disk, and the git diff is the recovery surface.
    if (outcome.status === "error") {
      console.error(`\nStopped at ${nctId}. Fix the cause and run again.`);
      process.exitCode = 1;
      return;
    }
  }

  summarize(outcomes, dryRun);
}

async function fetchOne(nctId: string, dryRun: boolean): Promise<Outcome> {
  let trial: Trial;
  try {
    trial = await fetchStudy(nctId);
  } catch (error) {
    return {
      status: "error",
      nctId,
      reason:
        error instanceof StudyNotFoundError
          ? `${error.message} It may have been withdrawn or removed; decide whether to drop or replace it in src/trials/corpus.ts`
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }

  const path = join(OUTPUT_DIR, `${nctId}.json`);
  const next = serializeTrial(trial);
  const current = readIfPresent(path);

  if (current === undefined) {
    if (!dryRun) {
      writeFileSync(path, next, "utf8");
    }
    return { status: "new", nctId };
  }

  if (current === next) {
    return { status: "unchanged", nctId };
  }

  if (!dryRun) {
    writeFileSync(path, next, "utf8");
  }
  return { status: "changed", nctId, fields: changedFields(current, next) };
}

/**
 * Names which top-level fields differ, so a `changed` result says what moved.
 * Worth having because `overallStatus` and `lastUpdatePostDate` churn for
 * administrative reasons: a change here usually does not mean the criteria moved.
 */
export function changedFields(before: string, after: string): string[] {
  let a: Record<string, unknown>;
  try {
    a = JSON.parse(before) as Record<string, unknown>;
  } catch {
    // A fixture already on disk can be corrupt — a bad merge, a truncated write,
    // a hand edit. That is still a `changed` result, not a reason to abort the
    // run with a stack trace.
    return ["whole file: what is on disk is not valid JSON"];
  }

  const b = JSON.parse(after) as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  return [...keys].filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function report(outcome: Outcome): void {
  switch (outcome.status) {
    case "unchanged":
      console.log(`  unchanged  ${outcome.nctId}`);
      break;
    case "new":
      console.log(`  new        ${outcome.nctId}`);
      break;
    case "changed":
      console.log(`  changed    ${outcome.nctId}  (${outcome.fields.join(", ")})`);
      break;
    case "error":
      console.error(`  error      ${outcome.nctId}  ${outcome.reason}`);
      break;
  }
}

function summarize(outcomes: Outcome[], dryRun: boolean): void {
  const count = (status: Outcome["status"]) => outcomes.filter((o) => o.status === status).length;

  console.log(
    `\n${outcomes.length} studies: ${count("unchanged")} unchanged, ${count("changed")} changed, ${count("new")} new`,
  );

  if (dryRun) {
    console.log("Dry run: nothing written.");
    // Non-zero so the mode works as a check that the committed corpus still
    // matches the registry. A `new` study counts as a mismatch: it means a
    // pinned NCT ID has no fixture, so the corpus on disk is incomplete.
    if (count("changed") > 0 || count("new") > 0) {
      process.exitCode = 1;
    }
  }
}

// Only when run as a script. Exporting `changedFields` for tests would otherwise
// execute the whole fetch on import.
if (import.meta.main) {
  await main();
}
