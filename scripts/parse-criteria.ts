/**
 * Parses a trial's eligibility criteria with a model and prints the
 * result for a person to read.
 *
 * Run by a person, deliberately. Never imported by the application, and never
 * part of `npm test` — it costs real model time and its output is not
 * deterministic.
 *
 *   npm run parse:criteria                     parse one trial (the first pinned)
 *   npm run parse:criteria -- NCT04316364      parse a specific study
 *   npm run parse:criteria -- --all            parse the whole corpus
 *   npm run parse:criteria -- NCT00743379 --json out.json   also write the parse
 *   npm run parse:criteria -- NCT00743379 --max-output-tokens 16384
 *   npm run parse:criteria -- NCT07229729 --record tests/criteria/fixtures/model-responses
 *   npm run parse:criteria -- NCT04316364 --model anthropic   dry: prints an estimate
 *   npm run parse:criteria -- NCT00743379 --cache   also keep it in the eval's parse cache
 *   npm run parse:criteria -- --trial-file work/0013-trials-by-link/gate/NCT06090266.json
 *                                              parse a trial from a file: a trimmed study, or
 *                                              an app record holding one (slice 0015)
 *
 * `--cache` (slice 0011) writes each parse to `evals/results/parses/` under the
 * key `npm run eval` uses, and skips a study already there. It's how the
 * unlabelled studies get parses to compare before and after a prompt change,
 * since the eval parses labelled studies only. Local model only.
 *
 * The parser runs on oMLX unless `--model <spec>` names a frontier provider
 * (slice 0008), and then only with `--spend`, capped by `--max-calls` and
 * `--max-usd`.
 *
 * This is the instrument for the slice's second gate: whether the corpus is
 * genuinely hard, which no test can answer. Read a parse against its source
 * rather than counting criteria and believing the number.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parserWorkloadFor } from "../evals/estimate.js";
import { cacheKey } from "../evals/runner.js";
import type { ParsedCriteria } from "../src/criteria/index.js";
import {
  CriteriaParseError,
  isPatientAnswerable,
  PROMPT_VERSION,
  parseCriteria,
} from "../src/criteria/index.js";
import type {
  CompletionRequest,
  CompletionResponse,
  ModelAdapter,
  ModelSpec,
} from "../src/models/index.js";
import {
  createAdapter,
  describeSettings,
  formatUsd,
  ModelError,
  monthStamp,
} from "../src/models/index.js";
import type { Trial } from "../src/trials/index.js";
import { CORPUS_IDS, getTrial, loadTrials } from "../src/trials/index.js";
import type { ModelFlags, RunPlan } from "./lib/model-flags.js";
import { logSpend, planPaidRun, readModelFlags, roleLine } from "./lib/model-flags.js";
import { readTrialFile } from "./lib/trial-file.js";

/** The eval's parse cache, which `--cache` writes into. */
const PARSES_DIR = fileURLToPath(new URL("../evals/results/parses/", import.meta.url));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const jsonPath = valueAfter(args, "--json");
  const ids = args.filter((arg) => /^NCT\d+$/i.test(arg)).map((id) => id.toUpperCase());

  const maxOutputTokens = numberAfter(args, "--max-output-tokens");
  const recordDir = valueAfter(args, "--record");
  const cache = args.includes("--cache");
  const trialFile = valueAfter(args, "--trial-file");
  if (trialFile !== undefined && (all || ids.length > 0 || cache)) {
    console.error(
      cache
        ? "--trial-file can't be cached: the parse cache is keyed for pinned studies."
        : "--trial-file parses the trial in that file: drop the NCT ID or --all.",
    );
    process.exitCode = 1;
    return;
  }
  let trials: Trial[];
  try {
    trials = trialFile === undefined ? selectTrials(all, ids) : [readTrialFile(trialFile)];
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  if (trials.length === 0) {
    console.error("No trial selected. Pass an NCT ID, or --all.");
    process.exitCode = 1;
    return;
  }

  let flags: ModelFlags;
  let plan: RunPlan;
  try {
    flags = readModelFlags(args, ["model"]);
    plan = planPaidRun({
      flags,
      paid: [
        {
          role: "parser",
          spec: modelSpec(flags),
          workload: parserWorkloadFor(trials),
        },
      ],
      scope: `${trials.length} ${trials.length === 1 ? "study" : "studies"}`,
    });
  } catch (error) {
    console.error(error instanceof ModelError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  console.log(`${roleLine("parser", modelSpec(flags))}\n`);
  if (cache && modelSpec(flags).provider !== "omlx") {
    console.error("--cache keeps the local parser's parses only: drop --model, or --cache.");
    process.exitCode = 1;
    return;
  }
  if (plan.kind === "estimate-only" || plan.kind === "refused") {
    console.log(plan.text);
    if (plan.kind === "refused") process.exitCode = 1;
    return;
  }

  let model: ModelAdapter;
  let adapter: ModelAdapter;
  try {
    model = createAdapter(modelSpec(flags), plan.kind === "spend" ? { budget: plan.budget } : {});
    adapter = recordDir === undefined ? model : new RecordingAdapter(model, recordDir);
  } catch (error) {
    // Configuration faults are the common case here and already carry a
    // readable message. A stack trace would bury it.
    console.error(error instanceof ModelError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  console.log(`model: ${adapter.descriptor.model} (${adapter.descriptor.quantization})`);
  console.log(`${describeSettings(adapter.descriptor)}\n`);

  const parsed: ParsedCriteria[] = [];

  for (const trial of trials) {
    const cachePath = join(PARSES_DIR, cacheKey(trial.nctId, adapter.descriptor));
    if (cache && existsSync(cachePath)) {
      console.log(`${trial.nctId}  already cached at ${cachePath}, skipped\n`);
      continue;
    }
    const result = await parseOne(trial, adapter, maxOutputTokens);
    if (result !== undefined) {
      parsed.push(result);
      if (cache) {
        mkdirSync(PARSES_DIR, { recursive: true });
        writeFileSync(cachePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
        console.log(`  cached at ${cachePath}\n`);
      }
    }
  }

  if (jsonPath !== undefined && parsed.length > 0) {
    writeFileSync(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${parsed.length} parse(s) to ${jsonPath}`);
  }

  if (plan.kind === "spend") {
    const spent = logSpend(
      "parse:criteria",
      [{ role: "parser", spec: modelSpec(flags), adapter: model }],
      {
        batch: false,
      },
    );
    console.log(`\nspent about ${formatUsd(spent)} at catalog prices (evals/results/spend.jsonl)`);
  }
}

function modelSpec(flags: ModelFlags): ModelSpec {
  return flags.roles["model"] ?? { provider: "omlx" };
}

/**
 * Saves what the model actually returned, alongside the settings that produced
 * it.
 *
 * Tests need model output they can trust to be real. Writing a plausible
 * response by hand would test the parser against what we imagine the model
 * says, which is exactly the assumption worth not making — and a recorded
 * response costs one run rather than one per test.
 */
class RecordingAdapter implements ModelAdapter {
  readonly descriptor: ModelAdapter["descriptor"];

  #inner: ModelAdapter;
  #dir: string;
  #nctId = "unknown";

  constructor(inner: ModelAdapter, dir: string) {
    this.#inner = inner;
    this.#dir = dir;
    this.descriptor = inner.descriptor;
    mkdirSync(dir, { recursive: true });
  }

  forTrial(nctId: string): void {
    this.#nctId = nctId;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.#inner.complete(request);

    const fixture = {
      nctId: this.#nctId,
      // CLAUDE.md: a result without these is not a result.
      model: this.descriptor.model,
      quantization: this.descriptor.quantization,
      temperature: this.descriptor.temperature,
      seed: this.descriptor.seed,
      promptVersion: PROMPT_VERSION,
      recordedAt: monthStamp(),
      finishReason: response.finishReason,
      usage: response.usage,
      response: response.content,
    };

    const path = join(this.#dir, `${this.#nctId}.json`);
    writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
    console.log(`  recorded ${path}`);

    return response;
  }
}

async function parseOne(
  trial: Trial,
  adapter: ModelAdapter,
  maxOutputTokens: number | undefined,
): Promise<ParsedCriteria | undefined> {
  if (adapter instanceof RecordingAdapter) {
    adapter.forTrial(trial.nctId);
  }

  const started = Date.now();
  const size = trial.eligibility.criteriaText.length;

  process.stdout.write(`${trial.nctId}  (${size} chars) ... `);

  try {
    const parsed = await parseCriteria(
      trial,
      adapter,
      maxOutputTokens === undefined ? {} : { maxOutputTokens },
    );
    console.log(`${Math.round((Date.now() - started) / 1000)}s`);
    report(trial, parsed);
    return parsed;
  } catch (error) {
    console.log("FAILED");
    // A failure here is a finding, not a crash: truncation on the longest
    // block is exactly what the gate is watching for.
    console.error(
      error instanceof CriteriaParseError || error instanceof ModelError
        ? `${error.message}\n`
        : `${String(error)}\n`,
    );
    return undefined;
  }
}

function report(trial: Trial, parsed: ParsedCriteria): void {
  const byType = counts(parsed.criteria.map((criterion) => criterion.type));
  const answerable = parsed.criteria.filter(isPatientAnswerable).length;

  console.log(`  ${parsed.criteria.length} criteria  (${describeCounts(byType)})`);
  console.log(
    `  ${answerable} patient-answerable, ${parsed.rejected.length} rejected, ` +
      `${parsed.unclaimed.length} unclaimed span(s)`,
  );

  for (const criterion of parsed.criteria) {
    const label = criterion.appliesTo === undefined ? "" : ` [${criterion.appliesTo}]`;
    console.log(
      `    ${criterion.polarity === "inclusion" ? "+" : "-"} ${criterion.type.padEnd(12)}` +
        `${label} ${criterion.text}`,
    );
  }

  for (const rejection of parsed.rejected) {
    console.log(`    ! rejected: ${rejection.reason}`);
    if (rejection.quote !== null) {
      console.log(`      quote: ${truncate(rejection.quote, 100)}`);
    }
  }

  // Printed in full, not summarized. This is the signal that the model stopped
  // reading halfway down a block, and a character count would hide which half.
  for (const span of parsed.unclaimed) {
    console.log(`    ? unclaimed ${span.start}-${span.end}: ${truncate(span.text.trim(), 300)}`);
  }

  const coverage = Math.round(
    (claimedCharacters(parsed) / trial.eligibility.criteriaText.length) * 100,
  );
  console.log(`  source coverage: ${coverage}%\n`);
}

/**
 * How much of the source is claimed by at least one criterion.
 *
 * The union of the spans, not the sum of their lengths. Summing reported 262%
 * for NCT00077350, whose cooperative-group prose packs several requirements
 * into a sentence that several criteria then each quote in full — so every
 * shared span was counted once per criterion. A coverage figure above 100% is
 * nonsense, and this one was being read at a review gate.
 */
function claimedCharacters(parsed: ParsedCriteria): number {
  const spans = [...parsed.criteria]
    .map((criterion) => criterion.source)
    .sort((a, b) => a.start - b.start);

  let claimed = 0;
  let cursor = 0;

  for (const span of spans) {
    const from = Math.max(span.start, cursor);
    if (span.end > from) {
      claimed += span.end - from;
      cursor = span.end;
    }
  }

  return claimed;
}

function selectTrials(all: boolean, ids: string[]): Trial[] {
  if (all) {
    return loadTrials();
  }
  if (ids.length > 0) {
    return ids.map((id) => getTrial(id));
  }
  // One trial by default: iterating on the prompt should not cost twelve runs.
  const first = CORPUS_IDS[0];
  return first === undefined ? [] : [getTrial(first)];
}

function counts(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) {
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return result;
}

function describeCounts(byType: Map<string, number>): string {
  return [...byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
}

function numberAfter(args: string[], flag: string): number | undefined {
  const raw = valueAfter(args, flag);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function truncate(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ");
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

if (import.meta.main) {
  await main();
}
