import { fileURLToPath } from "node:url";
import type { Budget, ModelAdapter, ModelSpec, Workload } from "../../src/models/index.js";
import {
  appendSpend,
  catalogEntry,
  describeSettings,
  descriptorFor,
  estimate,
  formatEstimate,
  formatSpec,
  formatUsd,
  isFrontier,
  ModelError,
  monthStamp,
  PRICES_AS_OF,
  parseModelSpec,
  SEED,
  spendSoFar,
  spentBy,
} from "../../src/models/index.js";

/**
 * The model flags shared by the scripts that may run on a frontier provider
 * (`eval`, `eval:screening`, `parse:criteria`, `models:smoke`), and the one
 * rule they all follow: **a paid run is dry unless `--spend` is given.**
 *
 * Without it, a run that names a frontier provider prints its roles and an
 * estimate and exits 0, before any adapter is built or any key is read. With
 * it, the run still refuses to start if the expected cost is over `--max-usd`.
 * A provider is only ever chosen here, on the command line: `.env` holds keys
 * and nothing that selects a model.
 */

export const SPEND_LOG = fileURLToPath(new URL("../../evals/results/spend.jsonl", import.meta.url));

export const DEFAULT_MAX_CALLS = 100;
export const DEFAULT_MAX_USD = 1.0;

export interface ModelFlags {
  /** One spec per role flag the script accepts, `omlx` when not given. */
  roles: Record<string, ModelSpec>;
  spend: boolean;
  maxCalls: number;
  maxUsd: number;
  batch: boolean;
  all: boolean;
}

/**
 * Reads `--<role> <spec>` for each role the script accepts, and the budget
 * flags. Throws `ModelError` on a spec it can't use or a number it can't read,
 * so a typo stops the run before anything is estimated.
 */
export function readModelFlags(argv: readonly string[], roleFlags: readonly string[]): ModelFlags {
  const roles: Record<string, ModelSpec> = {};
  for (const role of roleFlags) {
    const value = valueAfter(argv, `--${role}`);
    roles[role] = parseModelSpec(value ?? "omlx");
  }
  return {
    roles,
    spend: argv.includes("--spend"),
    maxCalls: positiveNumber(argv, "--max-calls", DEFAULT_MAX_CALLS, true),
    maxUsd: positiveNumber(argv, "--max-usd", DEFAULT_MAX_USD, false),
    batch: argv.includes("--batch"),
    all: argv.includes("--all"),
  };
}

export function isPaid(flags: ModelFlags): boolean {
  return Object.values(flags.roles).some(isFrontier);
}

/** What a role runs on, in one line, printed before anything runs. */
export function roleLine(role: string, spec: ModelSpec): string {
  if (!isFrontier(spec)) {
    return `${role.padEnd(12)} ${formatSpec(spec)}${spec.model === undefined ? " (OMLX_MODEL or the pinned model)" : ""}, local, free`;
  }
  const entry = catalogEntry(spec.provider, spec.model);
  const settings = entry === undefined ? "" : ` (${describeSettings(descriptorFor(entry, SEED))})`;
  return `${role.padEnd(12)} ${formatSpec(spec)}${settings}`;
}

export interface PaidRole {
  role: string;
  spec: ModelSpec;
  workload: Workload;
}

export type RunPlan =
  | { kind: "local" }
  | { kind: "estimate-only"; text: string }
  | { kind: "refused"; text: string }
  | { kind: "spend"; text: string; budget: Budget };

/**
 * Decides whether a run may spend, and says what it would spend. Pure apart
 * from reading the spend log's total; builds no adapter and reads no key.
 */
export function planPaidRun(input: {
  flags: ModelFlags;
  paid: readonly PaidRole[];
  scope: string;
  spendLog?: string;
}): RunPlan {
  const paid = input.paid.filter((p) => isFrontier(p.spec));
  if (paid.length === 0) {
    return { kind: "local" };
  }

  const { flags } = input;
  const spentSoFar = spendSoFar(input.spendLog ?? SPEND_LOG);
  let expected = 0;
  let expectedCalls = 0;
  const lines: string[] = [];

  for (const p of paid) {
    if (!isFrontier(p.spec)) continue;
    const entry = catalogEntry(p.spec.provider, p.spec.model);
    if (entry === undefined) {
      throw new ModelError(`Cannot use ${formatSpec(p.spec)}`, ["not in src/models/catalog.ts"]);
    }
    const batch = flags.batch && entry.batch !== null;
    const e = estimate(entry, p.workload, { maxCalls: flags.maxCalls, batch });
    expected += e.expected.usd;
    expectedCalls += e.expected.calls;
    lines.push(
      formatEstimate(
        {
          role: p.role,
          spec: formatSpec(p.spec),
          scope: input.scope,
          maxUsd: flags.maxUsd,
          batch,
          spentSoFar,
        },
        e,
      ),
    );
  }

  if (paid.length > 1) {
    lines.push(
      `together: about ${formatUsd(expected)}; the caps (${flags.maxCalls} calls, ` +
        `${formatUsd(flags.maxUsd)}) are shared by every paid role in this run`,
    );
  }

  // The cap is a stop, not a plan: a run expected to need more calls than it
  // allows would end partway, so say so, and don't start it paid.
  const capTooLow = expectedCalls > flags.maxCalls;
  if (capTooLow) {
    lines.push(
      `the call cap would stop this run partway: it expects about ${expectedCalls} calls and ` +
        `--max-calls is ${flags.maxCalls}. Raise --max-calls to about ${expectedCalls} to run it all.`,
    );
  }

  if (!flags.spend) {
    lines.push("", "Dry run: nothing was sent. Add --spend to run it and pay for it.");
    return { kind: "estimate-only", text: lines.join("\n") };
  }
  if (capTooLow) {
    lines.push("", "Refused: raise --max-calls, or narrow the run, to go ahead.");
    return { kind: "refused", text: lines.join("\n") };
  }
  if (expected > flags.maxUsd) {
    lines.push(
      "",
      `Refused: about ${formatUsd(expected)} expected, over --max-usd ${formatUsd(flags.maxUsd)}. ` +
        "Raise --max-usd, or narrow the run, to go ahead.",
    );
    return { kind: "refused", text: lines.join("\n") };
  }
  return {
    kind: "spend",
    text: lines.join("\n"),
    budget: { maxCalls: flags.maxCalls, maxUsd: flags.maxUsd },
  };
}

/** Appends one spend-log line per paid role that spent anything, and returns the total. */
export function logSpend(
  script: string,
  roles: ReadonlyArray<{ role: string; spec: ModelSpec; adapter: ModelAdapter }>,
  options: { batch: boolean; spendLog?: string },
): number {
  let total = 0;
  const logged = new Set<ModelAdapter>();
  for (const { role, spec, adapter } of roles) {
    const spent = spentBy(adapter);
    // A role sharing another's adapter is the same spend; log it once.
    if (spent === undefined || spent.calls === 0 || logged.has(adapter)) continue;
    logged.add(adapter);
    total += spent.usd;
    appendSpend(options.spendLog ?? SPEND_LOG, {
      date: monthStamp(),
      script,
      role,
      spec: formatSpec(spec),
      servedModels: spent.servedModels,
      calls: spent.calls,
      inputTokens: spent.inputTokens,
      outputTokens: spent.outputTokens,
      cacheWriteTokens: spent.cacheWriteTokens,
      cacheReadTokens: spent.cacheReadTokens,
      usd: spent.usd,
      batch: options.batch,
      pricesAsOf: PRICES_AS_OF,
    });
  }
  return total;
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new ModelError(`Cannot read ${flag}`, [`${flag} needs a value`]);
  }
  return value;
}

function positiveNumber(
  argv: readonly string[],
  flag: string,
  fallback: number,
  integer: boolean,
): number {
  const raw = valueAfter(argv, flag);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new ModelError(`Cannot read ${flag}`, [
      `expected a positive ${integer ? "whole number" : "number"}, got "${raw}"`,
    ]);
  }
  return value;
}
