import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedCriteria } from "../src/criteria/index.js";
import {
  NORMALIZE_VERSION,
  PROMPT_VERSION,
  parseCriteria,
  parseIdentity,
} from "../src/criteria/index.js";
import type { ModelAdapter, ModelDescriptor, Spent } from "../src/models/index.js";
import { isBudgetStop, monthStamp, spentBy, unsetReasons } from "../src/models/index.js";
import { getTrial } from "../src/trials/index.js";
import { assertLabellingComplete, loadLabelSet } from "./cases/load.js";
import type { LabelSet } from "./cases/types.js";
import type { MatchResult } from "./graders/match.js";
import { MATCHER_SETTINGS, matchCriteria } from "./graders/match.js";
import type { PooledMetrics, StudyMetrics } from "./graders/metrics.js";
import { poolMetrics, scoreStudy } from "./graders/metrics.js";
import { nextRunFile } from "./run-file.js";

/**
 * Runs the parser over the labelled studies and grades the result.
 *
 * ## Why parses are cached, and why that is correctness rather than comfort
 *
 * Slice 0002 measured a full-corpus run at roughly 45 minutes, with generation
 * slowing about fourfold as it went and one study blowing a twenty-minute
 * timeout that parsed in 78 seconds when run alone. A harness that lost
 * everything on a late failure would push whoever ran it toward grading
 * whatever subset happened to finish, without saying so. So a parse is written
 * the moment it returns, a failed study is recorded and the run continues, and
 * the result names what is missing and why.
 *
 * The cache key includes the model, the prompt version and the seed, because a
 * parse produced by a different prompt is a different experiment. Reusing one
 * across a prompt change would silently compare two things.
 */

const DEFAULT_RESULTS_DIR = fileURLToPath(new URL("./results", import.meta.url));

/**
 * The studies the parser's prompt is tuned on in slice 0011 (spec §8.1). They
 * hold 15 of 0003's 22 `patient` typed `clinical`, all 7 `protocol` typed
 * `clinical`, and all 16 misses. The other three labelled studies are held
 * back: parsed at a new prompt once, after it is frozen.
 */
export const PARSER_DEV_STUDIES: readonly string[] = ["NCT04385368", "NCT00077350"];

export interface EvalOptions {
  /** Defaults to every study with a committed label set. */
  studies?: readonly string[];
  /** Ignore cached parses and call the model again. */
  refresh?: boolean;
  resultsDir?: string;
  maxOutputTokens?: number;
  /** Progress reporting. Silent by default so tests stay quiet. */
  onProgress?: (message: string) => void;
  /**
   * How many studies to parse at once. 1 by default, as before. A batched
   * adapter sets it to every study, so their requests queue together and go
   * as one batch at half price (slice 0008). Outcomes keep study order.
   */
  concurrency?: number;
  /**
   * A dev run (slice 0011): the run file goes to `dev/` under the results
   * directory, and its parses to the same cache as every other run's.
   */
  dev?: boolean;
  /**
   * Which repeat of the same parse this is (slice 0011, Gate 1a). 1 by default.
   * A later sample is cached beside the first instead of replacing it, so a
   * study whose parse changes run to run on identical input can be measured
   * more than once. NCT04385368 is that study.
   */
  sample?: number;
}

export interface StudyOutcome {
  nctId: string;
  status: "graded" | "failed";
  /** Where the parse came from, so a run's cost is legible afterwards. */
  parseSource: "cache" | "model" | "none";
  metrics?: StudyMetrics;
  /**
   * Quotes the location check threw out, and quotes it found only by letting
   * whitespace differ (slice 0011). The net's own record of firing, which 0003's
   * result didn't keep. Absent on failure.
   */
  quotes?: QuoteCounts;
  /** Present on failure. The run continues; the result says what is missing. */
  error?: string;
  /**
   * A readable account of what went wrong, rather than the whole matching.
   *
   * The full `MatchResult` carries both objects for every matched pair, which
   * made a five-study result 343KB of mostly-correct pairs nobody reads. The
   * same reasoning trimmed the trial fixtures in 0001: a committed artifact
   * should be legible. Full diagnostics stay reproducible from the cached
   * parse and the labels via `npm run eval:inspect`.
   */
  diagnostics?: StudyDiagnostics;
}

export interface StudyDiagnostics {
  /** Labels nothing covered. The failure that matters. */
  missed: Array<{ id: string; polarity: string; type: string; quote: string }>;
  /** Predictions matching no label. */
  extra: Array<{ polarity: string; type: string; text: string }>;
  /** Labels captured only inside a bundled criterion. */
  merged: Array<{ id: string; inside: string }>;
  /** Matched pairs that disagreed on type, which is where the prompt is wrong. */
  typeErrors: Array<{ id: string; labelled: string; predicted: string; quote: string }>;
  /** Extras landing in text a reader explicitly ruled out. */
  narrative: Array<{ text: string; ruledOutBecause: string }>;
}

export interface QuoteCounts {
  rejected: number;
  loose: number;
}

export interface EvalRun {
  startedAt: string;
  finishedAt: string;
  /** Everything needed to reproduce, per CLAUDE.md. */
  model: string;
  quantization: string;
  temperature: number | null;
  seed: number | null;
  adapter: string;
  /** Why temperature or seed is null, when one is (slice 0008). */
  unset?: NonNullable<ModelDescriptor["unset"]>;
  seedGuarantee?: NonNullable<ModelDescriptor["seedGuarantee"]>;
  promptVersion: string;
  /** Which normalization the model was shown (slice 0011). */
  normalizeVersion: string;
  /**
   * Prompt, normalization and reasoning mode together: what names the parses
   * this run graded, and the files they're in (slice 0011).
   */
  parseIdentity: string;
  /**
   * The parser's reasoning mode, written out (slice 0011). "default" is the
   * runtime's, which for the pinned local model means reasoning on.
   */
  thinking: "default" | "off";
  /** Present, as true, for a run over the dev studies only (slice 0011). */
  dev?: true;
  /** Present for a repeat of an earlier parse, from 2 up (slice 0011). */
  sample?: number;
  matcher: typeof MATCHER_SETTINGS;
  studies: StudyOutcome[];
  pooled: PooledMetrics;
  /** Quote counts over every graded study (slice 0011). */
  quotes: QuoteCounts;
  /** Named rather than merely absent, so a partial run cannot read as a whole one. */
  failed: string[];
  /** Present when the run stopped early, with why (slice 0008: the budget). */
  stopped?: string;
  /** What a frontier parser spent, at catalog prices. Absent for a local run. */
  spend?: Spent;
}

export async function runEval(adapter: ModelAdapter, options: EvalOptions = {}): Promise<EvalRun> {
  const resultsDir = options.resultsDir ?? DEFAULT_RESULTS_DIR;
  const parsesDir = join(resultsDir, "parses");
  const report = options.onProgress ?? (() => {});
  const dev = options.dev === true;
  const runDir = dev ? join(resultsDir, "dev") : resultsDir;

  mkdirSync(parsesDir, { recursive: true });
  mkdirSync(runDir, { recursive: true });

  const studies = options.studies ?? labelledStudies();
  const startedAt = monthStamp();
  const runFile = join(runDir, nextRunFile(runDir, PROMPT_VERSION));
  const outcomes: StudyOutcome[] = [];

  let stopped: string | undefined;
  const size = Math.max(1, Math.floor(options.concurrency ?? 1));

  for (let i = 0; i < studies.length; i += size) {
    const group = studies.slice(i, i + size);
    if (stopped !== undefined) {
      for (const nctId of group) {
        outcomes.push({
          nctId,
          status: "failed",
          parseSource: "none",
          error: `not run: ${stopped}`,
        });
      }
      continue;
    }
    const results = await Promise.all(
      group.map((nctId) => runStudy(nctId, adapter, parsesDir, options, report)),
    );
    for (const { outcome } of results) outcomes.push(outcome);
    if (results.some((r) => r.budgetStop)) {
      // Every further call would be refused. Studies already parsed are cached
      // and cost nothing on the next run.
      stopped = "the budget was reached; parsed studies are cached for the next run";
      report(`STOPPING: ${stopped}`);
    }

    // Written after every study (or group). A failure in the ninth must not
    // cost the eight before it.
    writeRun(runFile, buildRun(startedAt, adapter, outcomes, dev, options.sample ?? 1, stopped));
  }

  const run = buildRun(startedAt, adapter, outcomes, dev, options.sample ?? 1, stopped);
  writeRun(runFile, run);
  return run;
}

async function runStudy(
  nctId: string,
  adapter: ModelAdapter,
  parsesDir: string,
  options: EvalOptions,
  report: (message: string) => void,
): Promise<{ outcome: StudyOutcome; budgetStop: boolean }> {
  try {
    const labels = loadLabelSet(nctId);
    // A skeleton is a valid file. Grading one would report zero recall and
    // look like a catastrophic parser failure rather than unfinished work.
    assertLabellingComplete(labels);

    const cachePath = join(parsesDir, cacheKey(nctId, adapter.descriptor, options.sample));
    const cached = options.refresh === true ? undefined : readCache(cachePath);

    let parsed: ParsedCriteria;
    let parseSource: StudyOutcome["parseSource"];

    if (cached !== undefined) {
      parsed = cached;
      parseSource = "cache";
      report(`${nctId}: cached parse`);
    } else {
      report(`${nctId}: parsing…`);
      parsed = await parseCriteria(
        getTrial(nctId),
        adapter,
        options.maxOutputTokens === undefined ? {} : { maxOutputTokens: options.maxOutputTokens },
      );
      writeFileSync(cachePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      parseSource = "model";
    }

    const { metrics, diagnostics } = gradeStudy(nctId, parsed, labels);
    const quotes = quoteCounts(parsed);
    report(
      `${nctId}: coverage ${fmt(metrics.coverageRecall)} strict ${fmt(metrics.strictRecall)} ` +
        `merge ${fmt(metrics.mergeRate)}`,
    );

    return {
      outcome: { nctId, status: "graded", parseSource, metrics, quotes, diagnostics },
      budgetStop: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report(`${nctId}: FAILED — ${message.split("\n")[0]}`);
    return {
      outcome: { nctId, status: "failed", parseSource: "none", error: message },
      budgetStop: isBudgetStop(error),
    };
  }
}

/**
 * One study's grade from its parse and its labels. Exported so a committed
 * result can be re-graded from its committed parses by exactly this code
 * (`tests/evals/committed-results.test.ts`, slice 0011).
 */
export function gradeStudy(
  nctId: string,
  parsed: ParsedCriteria,
  labels: LabelSet,
): { metrics: StudyMetrics; diagnostics: StudyDiagnostics } {
  const match = matchCriteria(parsed.criteria, labels);
  return { metrics: scoreStudy(nctId, match), diagnostics: summarize(match) };
}

/** What the parse says about its own quotes. */
export function quoteCounts(parsed: ParsedCriteria): QuoteCounts {
  return {
    rejected: parsed.rejected.length,
    loose: parsed.criteria.filter((c) => c.loose === true).length,
  };
}

function summarize(match: MatchResult): StudyDiagnostics {
  return {
    missed: match.missed.map((label) => ({
      id: label.id,
      polarity: label.polarity,
      type: label.type,
      quote: clip(label.quote),
    })),
    extra: match.extra.map((prediction) => ({
      polarity: prediction.polarity,
      type: prediction.type,
      text: clip(prediction.text),
    })),
    merged: match.merged.map((entry) => ({
      id: entry.label.id,
      inside: clip(entry.prediction.text),
    })),
    typeErrors: match.matched
      .filter((pair) => pair.label.type !== pair.prediction.type)
      .map((pair) => ({
        id: pair.label.id,
        labelled: pair.label.type,
        predicted: pair.prediction.type,
        quote: clip(pair.label.quote),
      })),
    narrative: match.narrative.map((entry) => ({
      text: clip(entry.prediction.text),
      ruledOutBecause: entry.notCriterion.why,
    })),
  };
}

function clip(text: string, limit = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

/**
 * A parse is keyed by what produced it, not just by the study.
 *
 * Model, prompt, normalization, reasoning mode and seed all change the output,
 * so a cache hit across any of them would silently grade one experiment's
 * parse under another's settings.
 *
 * Takes the parser's settings, not an adapter: a screening run reads the parse
 * its model makes at the parser's default reasoning mode, whatever mode the
 * agent itself runs in (slice 0011).
 */
export function cacheKey(
  nctId: string,
  parser: Pick<ModelDescriptor, "model" | "seed" | "thinking">,
  sample = 1,
): string {
  return parseFileName(
    nctId,
    parser.model,
    sampledIdentity(parseIdentity(parser), sample),
    parser.seed,
  );
}

/** A repeat's identity: the parse's own, with `-s<n>` for every sample after the first. */
export function sampledIdentity(identity: string, sample = 1): string {
  return sample > 1 ? `${identity}-s${sample}` : identity;
}

/** The file a parse is cached in, from what a result recorded about it. */
export function parseFileName(
  nctId: string,
  model: string,
  identity: string,
  seed: number | null,
): string {
  const parts = [nctId, model, identity, String(seed)];
  return `${parts.map(sanitize).join("-")}.json`;
}

function sanitize(part: string): string {
  return part.replace(/[^A-Za-z0-9._-]/g, "_");
}

function readCache(path: string): ParsedCriteria | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ParsedCriteria;
  } catch {
    // A missing or corrupt cache is not a failure, it is a cache miss.
    return undefined;
  }
}

function buildRun(
  startedAt: string,
  adapter: ModelAdapter,
  outcomes: StudyOutcome[],
  dev: boolean,
  sample: number,
  stopped?: string,
): EvalRun {
  const spent = spentBy(adapter);
  const graded = outcomes
    .filter((outcome) => outcome.status === "graded")
    .map((outcome) => outcome.metrics)
    .filter((metrics): metrics is StudyMetrics => metrics !== undefined);

  return {
    startedAt,
    finishedAt: monthStamp(),
    model: adapter.descriptor.model,
    quantization: adapter.descriptor.quantization,
    temperature: adapter.descriptor.temperature,
    seed: adapter.descriptor.seed,
    adapter: adapter.descriptor.adapter,
    ...unsetReasons(adapter.descriptor),
    promptVersion: PROMPT_VERSION,
    normalizeVersion: NORMALIZE_VERSION,
    parseIdentity: sampledIdentity(parseIdentity(adapter.descriptor), sample),
    ...(sample > 1 ? { sample } : {}),
    thinking: adapter.descriptor.thinking === "off" ? "off" : "default",
    ...(dev ? { dev: true as const } : {}),
    matcher: MATCHER_SETTINGS,
    studies: outcomes,
    pooled: poolMetrics(graded),
    quotes: outcomes.reduce<QuoteCounts>(
      (sum, o) => ({
        rejected: sum.rejected + (o.quotes?.rejected ?? 0),
        loose: sum.loose + (o.quotes?.loose ?? 0),
      }),
      { rejected: 0, loose: 0 },
    ),
    failed: outcomes
      .filter((outcome) => outcome.status === "failed")
      .map((outcome) => outcome.nctId),
    ...(stopped === undefined ? {} : { stopped }),
    ...(spent === undefined ? {} : { spend: spent }),
  };
}

function writeRun(path: string, run: EvalRun): void {
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

/** Every study with a committed label set, in filename order. */
export function labelledStudies(): string[] {
  const labelsDir = fileURLToPath(new URL("./cases/labels", import.meta.url));

  try {
    return readdirSync(labelsDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => name.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

function fmt(rate: number | null): string {
  return rate === null ? "n/a" : rate.toFixed(2);
}
