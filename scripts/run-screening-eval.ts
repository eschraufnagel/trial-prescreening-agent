/**
 * Runs the screening agent against the vignettes and writes a result.
 *
 *   npm run eval:screening                      every scored vignette, labels then parses
 *   npm run eval:screening -- NCT04316364       one study
 *   npm run eval:screening -- --source labels   one input
 *   npm run eval:screening -- --dev             the dev vignette only, never scored
 *   npm run eval:screening -- --refresh         ignore cached conversations
 *
 * Each role runs on oMLX unless named (slice 0008):
 *
 *   --agent <spec>  --participant <spec>  --fidelity <spec>
 *
 * where a spec is `omlx`, `anthropic`, `anthropic:claude-sonnet-5`, `openai`
 * or `xai`. A run with any role on a frontier provider is **dry unless
 * `--spend` is given**: it prints the roles and an estimate and exits. With a
 * frontier agent and no study named it runs one conversation
 * (`NCT00077350-v1` from labels); `--all` runs every vignette. `--max-calls`
 * and `--max-usd` cap the run (100 calls and $1.00 by default).
 *
 * Run by a person. Not part of `npm test`: it makes many local model calls and
 * takes minutes per conversation. Finished and partial conversations are kept,
 * so stopping it and running it again loses nothing.
 */

import type { Vignette } from "../evals/cases/types.js";
import { loadVignettes } from "../evals/cases/vignettes.js";
import { formatRate } from "../evals/graders/metrics.js";
import type { ScreeningRole } from "../evals/screening-estimate.js";
import { screeningWorkloads } from "../evals/screening-estimate.js";
import type { Source } from "../evals/screening-runner.js";
import { runScreening } from "../evals/screening-runner.js";
import type { ModelAdapter, ModelSpec } from "../src/models/index.js";
import {
  BudgetPool,
  createAdapter,
  describeSettings,
  formatSpec,
  formatUsd,
  isFrontier,
  ModelError,
} from "../src/models/index.js";
import type { ModelFlags, RunPlan } from "./lib/model-flags.js";
import { logSpend, planPaidRun, readModelFlags, roleLine } from "./lib/model-flags.js";

const ROLES: readonly ScreeningRole[] = ["agent", "participant", "fidelity"];

/** The one conversation a paid run defaults to: smallest first. */
export const SMALLEST_VIGNETTE = "NCT00077350-v1";

export interface ScreeningPlan {
  flags: ModelFlags;
  vignettes: Vignette[];
  sources: Source[];
  dev: boolean;
  scope: string;
  plan: RunPlan;
}

/**
 * Everything decided before a model is touched: roles, which conversations,
 * and whether this run may spend. Builds no adapter and reads no key, so the
 * estimate is available before a key exists on the machine.
 */
export function planScreening(args: readonly string[], spendLog?: string): ScreeningPlan {
  const flags = readModelFlags(args, ROLES);
  const studies = args.filter((a) => /^NCT\d+$/i.test(a)).map((a) => a.toUpperCase());
  const dev = args.includes("--dev");
  const frontierAgent = isFrontier(roleSpec(flags, "agent"));

  const sourceArg = args[args.indexOf("--source") + 1];
  const sources: Source[] =
    args.includes("--source") && (sourceArg === "labels" || sourceArg === "parse")
      ? [sourceArg]
      : // The dev vignette is only ever screened from labels: it exists to tune
        // prompts. A frontier agent screens from labels too, because cached
        // parses are keyed by the agent's model (0008 spec §8).
        dev || frontierAgent
        ? ["labels"]
        : ["labels", "parse"];

  const matching = loadVignettes()
    .filter((v) => v.dev === dev)
    .filter((v) => studies.length === 0 || studies.includes(v.nctId));
  const smallestFirst = frontierAgent && !dev && studies.length === 0 && !flags.all;
  const vignettes = smallestFirst ? matching.filter((v) => v.id === SMALLEST_VIGNETTE) : matching;

  const conversations = vignettes.length * sources.length;
  const scope =
    conversations === 1
      ? `1 conversation (${vignettes[0]?.id} from ${sources[0]})`
      : `${conversations} conversations (${vignettes.length} vignettes from ${sources.join(" and ")})`;

  const workloads = screeningWorkloads({ vignettes, sources });
  const plan = planPaidRun({
    flags,
    paid: ROLES.map((role) => ({ role, spec: roleSpec(flags, role), workload: workloads[role] })),
    scope,
    ...(spendLog === undefined ? {} : { spendLog }),
  });

  return { flags, vignettes, sources, dev, scope, plan };
}

function roleSpec(flags: ModelFlags, role: ScreeningRole): ModelSpec {
  return flags.roles[role] ?? { provider: "omlx" };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let planned: ScreeningPlan;
  try {
    planned = planScreening(args);
  } catch (error) {
    console.error(error instanceof ModelError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const { flags, plan } = planned;

  for (const role of ROLES) {
    console.log(roleLine(role, roleSpec(flags, role)));
  }
  console.log(`${"scope".padEnd(12)} ${planned.scope}\n`);

  if (plan.kind === "estimate-only" || plan.kind === "refused") {
    console.log(plan.text);
    if (plan.kind === "refused") process.exitCode = 1;
    return;
  }
  if (plan.kind === "spend") {
    console.log(`${plan.text}\n`);
  }

  let adapters: Record<ScreeningRole, ModelAdapter>;
  try {
    adapters = buildAdapters(flags, plan);
  } catch (error) {
    console.error(error instanceof ModelError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const run = await runScreening({
    agent: adapters.agent,
    participant: adapters.participant,
    fidelity: adapters.fidelity,
    vignettes: planned.vignettes,
    sources: planned.sources,
    dev: planned.dev,
    refresh: args.includes("--refresh"),
    onProgress: (message) => console.log(`  ${message}`),
  });

  if (plan.kind === "spend") {
    const spent = logSpend(
      "eval:screening",
      ROLES.map((role) => ({ role, spec: roleSpec(flags, role), adapter: adapters[role] })),
      { batch: false },
    );
    console.log(`\nspent about ${formatUsd(spent)} at catalog prices (evals/results/spend.jsonl)`);
  }

  console.log(`\nmodel ${run.model} (${run.quantization})  ${describeSettings(run)}`);
  console.log(
    `prompt ${run.promptVersion}  simulator ${run.simulatorVersion}  grader v${run.graderVersion}  ` +
      `vignettes ${run.vignetteSetHash}${run.dev ? "  (DEV — not scored)" : ""}\n`,
  );

  console.log(
    "vignette          source  questions  minutes  wrong/determined  abstained/answerable",
  );
  for (const c of run.conversations) {
    const s = c.labels?.score ?? c.parse?.scored.score;
    const minutes =
      c.timing === undefined
        ? "-"
        : ((c.timing.agentMs + c.timing.participantMs + c.timing.fidelityMs) / 60000).toFixed(1);
    console.log(
      `${c.vignetteId.padEnd(17)} ${c.source.padEnd(7)} ` +
        (c.status !== "graded" || s === undefined
          ? c.status.toUpperCase()
          : `${String(c.questions).padStart(9)}  ${minutes.padStart(7)}  ` +
            `${`${s.confidentlyWrong}/${s.determinations}`.padStart(16)}  ` +
            `${`${s.abstained}/${s.answerable}`.padStart(20)}`),
    );
  }

  const l = run.pooled.labels;
  console.log(
    `\nfrom labels: confidently wrong ${formatRate(l.confidentlyWrongRate)} ` +
      `(${l.confidentlyWrong}/${l.determinations}), abstention ${formatRate(l.abstentionRate)} ` +
      `(${l.abstained}/${l.answerable}), correct abstention ${formatRate(l.correctAbstentionRate)}, ` +
      `simulator-affected ${l.simulatorAffected}`,
  );
  const p = run.pooled.parse;
  if (Object.keys(p.categories).length > 0) {
    console.log(
      `from parses: confidently wrong ${formatRate(p.scored.confidentlyWrongRate)}, ` +
        `abstention ${formatRate(p.scored.abstentionRate)} over scored labels; ` +
        `categories ${JSON.stringify(p.categories)}`,
    );
  }

  if (run.stopped !== undefined) {
    console.log(`\nSTOPPED: ${run.stopped}`);
  }
  // Stated rather than implied: a partial run must not read as a whole one.
  if (run.failed.length > 0) {
    console.log(`\n${run.failed.length} conversation(s) not graded:\n  ${run.failed.join("\n  ")}`);
    console.log("The numbers above cover only the conversations that were graded.");
    process.exitCode = 1;
  }
}

/**
 * One adapter per distinct spec, so roles on the same local model share one,
 * as every run before slice 0008 did, and every paid role draws on one budget.
 */
function buildAdapters(flags: ModelFlags, plan: RunPlan): Record<ScreeningRole, ModelAdapter> {
  const pool = new BudgetPool();
  const bySpec = new Map<string, ModelAdapter>();
  const built: Partial<Record<ScreeningRole, ModelAdapter>> = {};
  for (const role of ROLES) {
    const spec = roleSpec(flags, role);
    const adapter =
      bySpec.get(formatSpec(spec)) ??
      createAdapter(spec, {
        thinking: false,
        pool,
        ...(plan.kind === "spend" ? { budget: plan.budget } : {}),
        onRetry: (message) => console.log(`  ${role}: ${message}`),
      });
    bySpec.set(formatSpec(spec), adapter);
    built[role] = adapter;
  }
  return built as Record<ScreeningRole, ModelAdapter>;
}

if (import.meta.main) {
  await main();
}
