/**
 * Prints a matching in full, for reading pair by pair.
 *
 *   npm run eval:inspect -- NCT00077350 <parse.json>
 *
 * The instrument for the slice's second gate. The matcher decides every number
 * this project publishes, and a miscalibrated one produces plausible numbers
 * rather than obviously wrong ones — there is no aggregate that reveals a
 * floor in the wrong place. So every pair gets printed with its two component
 * scores, every miss and extra is listed, and near misses are shown with what
 * they scored.
 *
 * Reads a label set and a parse from disk. Calls no model.
 */
import { readFileSync } from "node:fs";
import { loadLabelSet } from "../evals/cases/load.js";
import { MATCHER_SETTINGS, matchCriteria } from "../evals/graders/match.js";
import { formatRate, scoreStudy } from "../evals/graders/metrics.js";
import type { Criterion } from "../src/criteria/types.js";

function main(): void {
  const args = process.argv.slice(2);
  const nctId = args.find((arg) => /^NCT\d+$/i.test(arg))?.toUpperCase();
  const parsePath = args.find((arg) => arg.endsWith(".json"));

  if (nctId === undefined || parsePath === undefined) {
    console.error("Usage: npm run eval:inspect -- <NCT ID> <parse.json>");
    process.exitCode = 1;
    return;
  }

  const labels = loadLabelSet(nctId);
  const predictions = readPredictions(parsePath, nctId);
  const match = matchCriteria(predictions, labels);
  const metrics = scoreStudy(nctId, match);

  console.log(`${nctId}: ${metrics.labels} labels, ${metrics.predictions} predictions`);
  console.log(
    `matcher v${MATCHER_SETTINGS.version}  ` +
      `span ${MATCHER_SETTINGS.spanWeight} / text ${MATCHER_SETTINGS.textWeight}  ` +
      `floor ${MATCHER_SETTINGS.floor}\n`,
  );

  console.log(`MATCHED (${match.matched.length})`);
  for (const pair of match.matched) {
    const flags = [
      pair.label.type === pair.prediction.type
        ? ""
        : `type ${pair.label.type}→${pair.prediction.type}`,
      pair.label.polarity === pair.prediction.polarity
        ? ""
        : `polarity ${pair.label.polarity}→${pair.prediction.polarity}`,
    ].filter((flag) => flag.length > 0);

    console.log(
      `  ${pair.score.toFixed(2)}  (span ${pair.spanIou.toFixed(2)} text ${pair.textF1.toFixed(2)})` +
        `  ${pair.label.id}${flags.length > 0 ? `  [${flags.join(", ")}]` : ""}`,
    );
    console.log(`     label: ${clip(pair.label.quote)}`);
    console.log(`     pred:  ${clip(pair.prediction.text)}`);
  }

  console.log(
    `\nMERGED (${match.merged.length})  — captured inside a bundled criterion, not as their own`,
  );
  for (const entry of match.merged) {
    console.log(
      `  ${entry.label.id}  (contained ${entry.containment.toFixed(2)}, words ${entry.tokenRecall.toFixed(2)})`,
    );
    console.log(`     label: ${clip(entry.label.quote)}`);
    console.log(`     inside: ${clip(entry.prediction.text)}`);
  }

  // The real failure: content the parser never produced in any form.
  console.log(`\nMISSED (${match.missed.length})  — no prediction covers these at all`);
  for (const miss of match.missed) {
    console.log(`  ${miss.id}  ${miss.polarity}/${miss.type}  ${clip(miss.quote)}`);
  }

  console.log(`\nEXTRA (${match.extra.length})  — predictions matching no label`);
  for (const extra of match.extra) {
    console.log(`  ${extra.polarity}/${extra.type}  ${clip(extra.text)}`);
    console.log(`     source: ${clip(extra.source.text)}`);
  }

  console.log(
    `\nNARRATIVE FALSE POSITIVES (${match.narrative.length})  — extras in ruled-out text`,
  );
  for (const entry of match.narrative) {
    console.log(`  ${clip(entry.prediction.text)}`);
    console.log(`     ruled out because: ${entry.notCriterion.why}`);
  }

  // The calibration signal. A real match sitting just under the floor means
  // the floor is too high; junk sitting just over means it is too low.
  console.log(`\nNEAR MISSES (${match.rejected.length})  — overlapped but under the floor`);
  for (const pair of [...match.rejected].sort((a, b) => b.score - a.score).slice(0, 15)) {
    console.log(`  ${pair.score.toFixed(2)}  ${pair.label.id}: ${clip(pair.label.quote, 60)}`);
    console.log(`         pred: ${clip(pair.prediction.text, 60)}`);
  }

  console.log(
    `\ncoverage recall ${formatRate(metrics.coverageRecall)}  ` +
      `strict recall ${formatRate(metrics.strictRecall)}  ` +
      `merge rate ${formatRate(metrics.mergeRate)}`,
  );
  console.log(
    `precision ${formatRate(metrics.precision)}  type ${formatRate(metrics.typeAccuracy)}  ` +
      `polarity ${formatRate(metrics.polarityAccuracy)}`,
  );
}

/**
 * Reads criteria out of a parse file, accepting either a single parse or the
 * array the parse script writes.
 */
function readPredictions(path: string, nctId: string): Criterion[] {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const parses = Array.isArray(parsed) ? parsed : [parsed];

  const match = parses.find(
    (entry): entry is { nctId: string; criteria: Criterion[] } =>
      typeof entry === "object" && entry !== null && (entry as { nctId?: string }).nctId === nctId,
  );

  if (match === undefined) {
    throw new Error(`${path} contains no parse for ${nctId}`);
  }

  return match.criteria;
}

function clip(text: string, limit = 110): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

if (import.meta.main) {
  main();
}
