/**
 * Runs the eval harness and writes a result.
 *
 *   npm run eval                      every labelled study, reusing cached parses
 *   npm run eval -- --study NCT00077350
 *   npm run eval -- --refresh         ignore the cache and call the model again
 *   npm run eval -- --dev             the two dev studies only, result under dev/ (slice 0011)
 *   npm run eval -- --thinking off    the parser with its reasoning mode off (slice 0011)
 *   npm run eval -- --dev NCT04385368 --sample 2   a second parse of the same input (slice 0011)
 *
 * `--dev` tunes the parser on NCT04385368 and NCT00077350 and never touches the
 * three held-back studies, which are parsed at a new prompt once, after the
 * freeze (0011 spec §8). It takes no study list and runs on oMLX only.
 *
 * The parser runs on oMLX unless `--model <spec>` names another (slice 0008),
 * e.g. `--model anthropic`. A frontier run is **dry unless `--spend` is
 * given**: it prints an estimate and exits. `--max-calls` and `--max-usd` cap
 * it (100 calls and $1.00 by default). `--batch` sends an Anthropic run
 * through the Message Batches API at half price: every study in one batch,
 * usually back within the hour, at most 24. A batch interrupted by stopping
 * the script is collected, not paid for again, on the next run.
 *
 * Run by a person. Not part of `npm test`: it calls a model, takes minutes per
 * study, and its duration is not deterministic.
 */

import { fileURLToPath } from "node:url";
import { parserWorkload } from "../evals/estimate.js";
import { formatRate } from "../evals/graders/metrics.js";
import { labelledStudies, PARSER_DEV_STUDIES, runEval } from "../evals/runner.js";
import type { ModelAdapter, ModelSpec } from "../src/models/index.js";
import { createAdapter, describeSettings, formatUsd, ModelError } from "../src/models/index.js";
import type { ModelFlags, RunPlan } from "./lib/model-flags.js";
import { logSpend, planPaidRun, readModelFlags, roleLine } from "./lib/model-flags.js";

/** Where submitted batches are recorded, so an interrupted one is collected rather than resubmitted. */
const BATCH_LEDGER = fileURLToPath(new URL("../evals/results/batches/", import.meta.url));

export interface EvalPlan {
  flags: ModelFlags;
  spec: ModelSpec;
  studies: string[];
  plan: RunPlan;
  dev: boolean;
  /** Which repeat of the parse (Gate 1a); 1 unless `--sample` says otherwise. */
  sample: number;
  /** False with `--thinking off`; absent for the runtime's default. */
  thinking?: false;
}

/** Roles, studies and whether this run may spend. Builds no adapter and reads no key. */
export function planEval(args: readonly string[], spendLog?: string): EvalPlan {
  const flags = readModelFlags(args, ["model"]);
  const spec = flags.roles["model"] ?? { provider: "omlx" };
  const named = args.filter((arg) => /^NCT\d+$/i.test(arg)).map((id) => id.toUpperCase());
  const dev = args.includes("--dev");
  const outside = named.filter((id) => !PARSER_DEV_STUDIES.includes(id));
  if (dev && outside.length > 0) {
    throw new ModelError("Cannot use --dev with a held-back study", [
      `--dev runs the dev studies (${PARSER_DEV_STUDIES.join(", ")}) or some of them; not ${outside.join(", ")}`,
    ]);
  }
  const sample = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) : 1;
  if (!Number.isInteger(sample) || sample < 1) {
    throw new ModelError("Cannot read --sample", ["--sample takes a whole number, 2 or more"]);
  }
  if (dev && spec.provider !== "omlx") {
    throw new ModelError("Cannot use --dev here", ["dev iterations run on the local model only"]);
  }
  const thinkingArg = args.includes("--thinking")
    ? args[args.indexOf("--thinking") + 1]
    : undefined;
  if (thinkingArg !== undefined && thinkingArg !== "off") {
    throw new ModelError("Cannot read --thinking", [
      `only --thinking off is accepted, not ${thinkingArg}`,
    ]);
  }
  const studies =
    dev && named.length === 0
      ? [...PARSER_DEV_STUDIES]
      : named.length > 0
        ? named
        : labelledStudies();
  if (flags.batch && spec.provider !== "anthropic") {
    throw new ModelError("Cannot use --batch here", [
      "the batch path is built for Anthropic only: use --model anthropic[:model]",
    ]);
  }
  const plan = planPaidRun({
    flags,
    paid: [{ role: "parser", spec, workload: parserWorkload(studies) }],
    scope: `${studies.length} ${studies.length === 1 ? "study" : "studies"} (${studies.join(", ")})`,
    ...(spendLog === undefined ? {} : { spendLog }),
  });
  return {
    flags,
    spec,
    studies,
    plan,
    dev,
    sample,
    ...(thinkingArg === "off" ? { thinking: false as const } : {}),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");

  let planned: EvalPlan;
  try {
    planned = planEval(args);
  } catch (error) {
    console.error(error instanceof ModelError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const { plan, spec } = planned;
  console.log(`${roleLine("parser", spec)}\n`);

  if (plan.kind === "estimate-only" || plan.kind === "refused") {
    console.log(plan.text);
    if (plan.kind === "refused") process.exitCode = 1;
    return;
  }
  if (plan.kind === "spend") {
    console.log(`${plan.text}\n`);
  }

  let adapter: ModelAdapter;
  try {
    adapter = createAdapter(spec, {
      ...(plan.kind === "spend" ? { budget: plan.budget } : {}),
      ...(planned.thinking === false ? { thinking: false } : {}),
      ...(planned.flags.batch ? { batch: { ledgerDir: BATCH_LEDGER } } : {}),
      onRetry: (message) => console.log(`  ${message}`),
      onProgress: (message) => console.log(`  ${message}`),
    });
  } catch (error) {
    console.error(error instanceof ModelError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const run = await runEval(adapter, {
    studies: planned.studies,
    refresh,
    dev: planned.dev,
    sample: planned.sample,
    ...(planned.flags.batch ? { concurrency: planned.studies.length } : {}),
    onProgress: (message) => {
      console.log(`  ${message}`);
    },
  });

  if (plan.kind === "spend") {
    const spent = logSpend("eval", [{ role: "parser", spec, adapter }], {
      batch: planned.flags.batch,
    });
    console.log(`\nspent about ${formatUsd(spent)} at catalog prices (evals/results/spend.jsonl)`);
  }

  const { thinking, ...settings } = run;
  console.log(
    `\nmodel ${run.model} (${run.quantization})  ` +
      describeSettings(thinking === "off" ? { ...settings, thinking } : settings),
  );
  console.log(
    `parse ${run.parseIdentity} (prompt ${run.promptVersion}, normalization ${run.normalizeVersion})  ` +
      `matcher v${run.matcher.version}`,
  );
  console.log(
    `quotes rejected by the location check ${run.quotes.rejected}, matched loosely ${run.quotes.loose}\n`,
  );

  console.log("study         labels  cover  strict  merge  prec   type");
  for (const outcome of run.studies) {
    if (outcome.metrics === undefined) {
      console.log(`${outcome.nctId}  FAILED`);
      continue;
    }
    const m = outcome.metrics;
    console.log(
      `${outcome.nctId}  ${String(m.labels).padStart(6)}  ` +
        `${formatRate(m.coverageRecall)}   ${formatRate(m.strictRecall)}    ` +
        `${formatRate(m.mergeRate)}   ${formatRate(m.precision)}  ${formatRate(m.typeAccuracy)}`,
    );
  }

  const pooled = run.pooled;
  console.log(
    `\npooled over ${pooled.labels} criteria in ${pooled.studies} studies:\n` +
      `  coverage recall ${formatRate(pooled.coverageRecall)}  ` +
      `strict recall ${formatRate(pooled.strictRecall)}  ` +
      `merge rate ${formatRate(pooled.mergeRate)}\n` +
      `  precision ${formatRate(pooled.precision)}  ` +
      `type ${formatRate(pooled.typeAccuracy)}  ` +
      `polarity ${formatRate(pooled.polarityAccuracy)}`,
  );

  // Stated rather than implied. A run covering four of five studies must not
  // read as a run covering five.
  if (run.failed.length > 0) {
    console.log(`\n${run.failed.length} study/studies FAILED: ${run.failed.join(", ")}`);
    console.log("The numbers above cover only the studies that succeeded.");
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
