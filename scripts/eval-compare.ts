/**
 * Compares committed parser results against the bar slice 0011 fixed before
 * any run (spec §9.3), and the checks around it.
 *
 *   npm run eval:compare -- <before.json> <after.json>          the bar, pooled, dev and held back
 *   npm run eval:compare -- <before.json> <after.json> --noise  do identical inputs give identical parses?
 *   npm run eval:compare -- <before.json> <after.json> --samples <s2.json> <s3.json>
 *                                                              NCT04385368 judged by the median of its samples
 *   npm run eval:compare -- --overlap                           prompt wording shared with the corpus
 *   npm run eval:compare -- --unlabelled <identity> <identity>  the seven unlabelled, before and after
 *
 * Reads committed results, committed parses, labels, vignettes and fixtures.
 * Calls no model. A bare result name is looked for in `evals/results/`, then
 * in its `dev/`. Two dev results are compared over the dev studies alone.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLabelSet } from "../evals/cases/load.js";
import { loadVignettes } from "../evals/cases/vignettes.js";
import type { PooledMetrics, StudyMetrics } from "../evals/graders/metrics.js";
import { poolMetrics } from "../evals/graders/metrics.js";
import { parseCategories } from "../evals/graders/screening.js";
import type { EvalRun, StudyOutcome } from "../evals/runner.js";
import { labelledStudies, PARSER_DEV_STUDIES, parseFileName } from "../evals/runner.js";
import type { ParsedCriteria } from "../src/criteria/index.js";
import { normalize, SYSTEM_PROMPT } from "../src/criteria/index.js";
import { CORPUS_IDS, getTrial } from "../src/trials/index.js";

const RESULTS_DIR = fileURLToPath(new URL("../evals/results/", import.meta.url));
const PARSES_DIR = join(RESULTS_DIR, "parses");
const PINNED = { model: "Qwen3.6-35B-A3B-MLX-8bit", seed: 20260921 };

/** Studies whose input 0011's escapes leave byte-identical (spec §9.2). */
export const NOISE_STUDIES: readonly string[] = ["NCT04316364", "NCT04385368"];

/**
 * The labels the exposure-versus-condition rule contradicts (spec §5.2). Left
 * as labelled. A parser that follows the rule is scored wrong on them, so they
 * are printed apart, and the three `clinical` ones are left out of the
 * dangerous-direction guardrail, as agreed before any run.
 */
export const CONTRADICTIONS: ReadonlyArray<{
  nctId: string;
  label: string;
  labelled: "patient" | "clinical";
}> = [
  { nctId: "NCT00077350", label: "L35", labelled: "patient" },
  { nctId: "NCT03433469", label: "L20", labelled: "patient" },
  { nctId: "NCT04316364", label: "L22", labelled: "patient" },
  { nctId: "NCT06728852", label: "L25", labelled: "patient" },
  { nctId: "NCT03433469", label: "L4", labelled: "clinical" },
  { nctId: "NCT04385368", label: "L15", labelled: "clinical" },
  { nctId: "NCT04385368", label: "L50", labelled: "clinical" },
];

/**
 * The study whose parse differs run to run on identical input (Gate 1, from
 * R2): 42 criteria changed, misses went 16 → 2 and narrative false positives
 * 6 → 14 with nothing changed. One run of it can't judge a prompt, so its
 * misses, protocol typing, precision and narrative are reported, not judged,
 * and it's left out of the guardrails.
 */
export const NOISY_STUDY = "NCT04385368";

/**
 * Spec §9.3 as Gate 1 left it (2026-09). The before is R2, the escapes fixed
 * and the prompt unchanged. `patient` typed `clinical` moved by 1 on identical
 * input, so it is the fault judged, widened by 1. Guardrails are relative to the
 * before, with the slack the first pooled thresholds gave the pooled baseline.
 */
export const PARSER_BAR = {
  patientToClinical: { pooled: 12, dev: 8, held: 5 },
  reach: 110,
  clinicalToPatient: 2,
  slack: { precision: 0.02, mergeRate: 0.02, polarity: 0.005 },
} as const;

export type Scope = "pooled" | "dev" | "held";

export interface Line {
  measure: string;
  before: number | null;
  after: number | null;
  bar: string;
  /** False for a line reported beside the bar but not part of it. */
  judged: boolean;
  pass: boolean;
}

export interface ScopeNumbers {
  studies: string[];
  pooled: PooledMetrics;
  typeErrors: Record<string, number>;
  /** `clinical` typed `patient`, less the contradicting labels. */
  clinicalToPatient: number;
  misses: number | null;
  failed: number;
}

const isContradiction = (nctId: string, label: string) =>
  CONTRADICTIONS.some((c) => c.nctId === nctId && c.label === label);

export function scopeStudies(scope: Scope): readonly string[] {
  if (scope === "dev") return PARSER_DEV_STUDIES;
  if (scope === "held") return labelledStudies().filter((s) => !PARSER_DEV_STUDIES.includes(s));
  return labelledStudies();
}

/** The numbers the bar reads, over a set of studies. */
export function scopeNumbers(run: EvalRun, studies: readonly string[]): ScopeNumbers {
  const inScope = run.studies.filter((s) => studies.includes(s.nctId));
  const graded = inScope.filter(
    (s): s is StudyOutcome & { metrics: StudyMetrics } => s.metrics !== undefined,
  );
  const typeErrors: Record<string, number> = {};
  let clinicalToPatient = 0;
  for (const s of graded) {
    for (const e of s.diagnostics?.typeErrors ?? []) {
      const key = `${e.labelled}→${e.predicted}`;
      typeErrors[key] = (typeErrors[key] ?? 0) + 1;
      if (key === "clinical→patient" && !isContradiction(s.nctId, e.id)) clinicalToPatient += 1;
    }
  }
  const noisy = graded.find((s) => s.nctId === NOISY_STUDY);
  return {
    studies: graded.map((s) => s.nctId),
    pooled: poolMetrics(graded.map((s) => s.metrics)),
    typeErrors,
    clinicalToPatient,
    misses: noisy?.diagnostics?.missed.length ?? null,
    failed: inScope.length - graded.length,
  };
}

/** Patient facts per reach category, over the scored vignettes of the given studies. */
export function reachOf(
  run: EvalRun,
  studies: readonly string[],
  parsesDir = PARSES_DIR,
): Record<string, number> {
  const totals: Record<string, number> = {
    scored: 0,
    "mis-typed": 0,
    bundled: 0,
    "missed-upstream": 0,
  };
  for (const vignette of loadVignettes().filter((v) => !v.dev && studies.includes(v.nctId))) {
    const parsed = readParse(run, vignette.nctId, parsesDir);
    const { categories } = parseCategories(parsed, loadLabelSet(vignette.nctId), vignette);
    for (const [k, v] of Object.entries(categories)) totals[k] = (totals[k] ?? 0) + v;
  }
  return totals;
}

export function readParse(run: EvalRun, nctId: string, parsesDir = PARSES_DIR): ParsedCriteria {
  const identity = run.parseIdentity ?? run.promptVersion;
  const path = join(parsesDir, parseFileName(nctId, run.model, identity, run.seed));
  if (!existsSync(path)) {
    throw new Error(`${path} is missing: the result's parse isn't committed`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as ParsedCriteria;
}

const count = (n: ScopeNumbers, key: string) => n.typeErrors[key] ?? 0;
const atMost = (after: number | null, max: number | null) =>
  after !== null && max !== null && after <= max + 1e-9;
const atLeast = (after: number | null, min: number | null) =>
  after !== null && min !== null && after >= min - 1e-9;

/** Spec §9.3's lines for one scope, before and after. */
/** The middle value; for an even count, the mean of the middle two. */
export function median(xs: readonly number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Spec §9.3's lines for one scope, before and after.
 *
 * `samples` are further parses of NCT04385368 at the after's prompt (Gate 1a).
 * With them, that study's `patient` typed `clinical` counts by the median of
 * every sample, the after included, and each sample is reported.
 */
export function barLines(
  before: EvalRun,
  after: EvalRun,
  scope: Scope,
  reach?: { before: number; after: number },
  samples: readonly EvalRun[] = [],
): Line[] {
  const studies = scopeStudies(scope);
  const b = scopeNumbers(before, studies);
  const a = scopeNumbers(after, studies);
  const quiet = studies.filter((s) => s !== NOISY_STUDY);
  const bq = scopeNumbers(before, quiet);
  const aq = scopeNumbers(after, quiet);
  const max = PARSER_BAR.patientToClinical[scope];
  const slack = PARSER_BAR.slack;
  const shift = (x: number | null, d: number) => (x === null ? null : x + d);

  const sampled = samples.length > 0 && studies.includes(NOISY_STUDY);
  const noisyEach = [after, ...samples].map((run) =>
    count(scopeNumbers(run, [NOISY_STUDY]), "patient→clinical"),
  );
  const p2c = sampled
    ? count(aq, "patient→clinical") + median(noisyEach)
    : count(a, "patient→clinical");
  const lines: Line[] = [
    {
      measure: sampled
        ? `patient typed clinical (${NOISY_STUDY} by median of ${noisyEach.length})`
        : "patient typed clinical",
      before: count(b, "patient→clinical"),
      after: p2c,
      bar: `≤ ${max}`,
      judged: true,
      pass: atMost(p2c, max),
    },
  ];
  if (sampled) {
    noisyEach.forEach((n, i) => {
      lines.push({
        measure: `${NOISY_STUDY}: patient typed clinical, sample ${i + 1}`,
        before: null,
        after: n,
        bar: "reported",
        judged: false,
        pass: true,
      });
    });
  }
  if (scope === "pooled" && reach !== undefined) {
    lines.push({
      measure: "reach: patient facts scored",
      before: reach.before,
      after: reach.after,
      bar: `≥ ${PARSER_BAR.reach}`,
      judged: true,
      pass: atLeast(reach.after, PARSER_BAR.reach),
    });
  }
  const minP = shift(bq.pooled.precision, -slack.precision);
  const maxM = shift(bq.pooled.mergeRate, slack.mergeRate);
  const minPol = shift(bq.pooled.polarityAccuracy, -slack.polarity);
  const guard = `, less ${NOISY_STUDY}`;
  lines.push(
    {
      measure: "clinical typed patient (not the §5.2 three)",
      before: b.clinicalToPatient,
      after: a.clinicalToPatient,
      bar: `≤ ${PARSER_BAR.clinicalToPatient}`,
      judged: true,
      pass: atMost(a.clinicalToPatient, PARSER_BAR.clinicalToPatient),
    },
    {
      measure: `precision${guard}`,
      before: bq.pooled.precision,
      after: aq.pooled.precision,
      bar: `≥ ${fmt(minP)}`,
      judged: true,
      pass: atLeast(aq.pooled.precision, minP),
    },
    {
      measure: `narrative false positives${guard}`,
      before: bq.pooled.narrativeFalsePositives,
      after: aq.pooled.narrativeFalsePositives,
      bar: `≤ ${bq.pooled.narrativeFalsePositives}`,
      judged: true,
      pass: atMost(aq.pooled.narrativeFalsePositives, bq.pooled.narrativeFalsePositives),
    },
    {
      measure: `merge rate${guard}`,
      before: bq.pooled.mergeRate,
      after: aq.pooled.mergeRate,
      bar: `≤ ${fmt(maxM)}`,
      judged: true,
      pass: atMost(aq.pooled.mergeRate, maxM),
    },
    {
      measure: `polarity accuracy${guard}`,
      before: bq.pooled.polarityAccuracy,
      after: aq.pooled.polarityAccuracy,
      bar: `≥ ${fmt(minPol)}`,
      judged: true,
      pass: atLeast(aq.pooled.polarityAccuracy, minPol),
    },
    {
      measure: `coverage recall${guard}`,
      before: bq.pooled.coverageRecall,
      after: aq.pooled.coverageRecall,
      bar: "not lower",
      judged: true,
      pass: atLeast(aq.pooled.coverageRecall, bq.pooled.coverageRecall),
    },
    {
      measure: `strict recall${guard}`,
      before: bq.pooled.strictRecall,
      after: aq.pooled.strictRecall,
      bar: "not lower",
      judged: true,
      pass: atLeast(aq.pooled.strictRecall, bq.pooled.strictRecall),
    },
    {
      measure: "parse failures",
      before: b.failed,
      after: a.failed,
      bar: "0",
      judged: true,
      pass: a.failed === 0,
    },
  );
  if (studies.includes(NOISY_STUDY)) {
    const bn = scopeNumbers(before, [NOISY_STUDY]);
    const an = scopeNumbers(after, [NOISY_STUDY]);
    const reported = (measure: string, x: number | null, y: number | null): Line => ({
      measure: `${NOISY_STUDY}: ${measure}`,
      before: x,
      after: y,
      bar: "reported",
      judged: false,
      pass: true,
    });
    lines.push(
      reported(
        "protocol typed clinical",
        count(bn, "protocol→clinical"),
        count(an, "protocol→clinical"),
      ),
      reported("labels missed", bn.misses, an.misses),
      reported("precision", bn.pooled.precision, an.pooled.precision),
      reported(
        "narrative false positives",
        bn.pooled.narrativeFalsePositives,
        an.pooled.narrativeFalsePositives,
      ),
    );
  }
  return lines;
}

/** How each contradicting label was typed, before and after. */
export function contradictionRows(
  before: EvalRun,
  after: EvalRun,
  parsesDir = PARSES_DIR,
): string[] {
  const typed = (run: EvalRun, nctId: string, label: string): string => {
    const study = run.studies.find((s) => s.nctId === nctId);
    if (study?.metrics === undefined) return "–";
    const error = study.diagnostics?.typeErrors.find((e) => e.id === label);
    if (error !== undefined) return error.predicted;
    if (study.diagnostics?.missed.some((m) => m.id === label)) return "missed";
    if (study.diagnostics?.merged.some((m) => m.id === label)) return "bundled";
    // Matched with no type error: typed as labelled. Checked against the parse exists.
    readParse(run, nctId, parsesDir);
    return CONTRADICTIONS.find((c) => c.nctId === nctId && c.label === label)?.labelled ?? "?";
  };
  return CONTRADICTIONS.map(
    (c) =>
      `  ${c.nctId} ${c.label.padEnd(4)} labelled ${c.labelled.padEnd(8)}  ` +
      `before ${typed(before, c.nctId, c.label).padEnd(8)}  after ${typed(after, c.nctId, c.label)}`,
  );
}

// ------------------------------------------------------------------ noise

export interface NoiseStudy {
  nctId: string;
  identical: boolean;
  differences: string[];
}

/** Criterion by criterion: id, type, polarity and text. */
export function compareParses(nctId: string, a: ParsedCriteria, b: ParsedCriteria): NoiseStudy {
  const key = (p: ParsedCriteria) =>
    p.criteria.map((c) => `${c.id} | ${c.type} | ${c.polarity} | ${c.text}`);
  const ka = key(a);
  const kb = key(b);
  const differences = [
    ...ka.filter((k) => !kb.includes(k)).map((k) => `- ${k}`),
    ...kb.filter((k) => !ka.includes(k)).map((k) => `+ ${k}`),
  ];
  return { nctId, identical: differences.length === 0 && ka.length === kb.length, differences };
}

/** The largest change in each bar quantity across the noise studies (spec §9.2). */
export function noiseWidening(before: EvalRun, after: EvalRun): Record<string, number> {
  const widen: Record<string, number> = {};
  for (const nctId of NOISE_STUDIES) {
    const b = scopeNumbers(before, [nctId]);
    if (b.studies.length === 0 || scopeNumbers(after, [nctId]).studies.length === 0) continue;
    const a = scopeNumbers(after, [nctId]);
    const pairs: Array<[string, number | null, number | null]> = [
      ["patient→clinical", count(b, "patient→clinical"), count(a, "patient→clinical")],
      ["protocol→clinical", count(b, "protocol→clinical"), count(a, "protocol→clinical")],
      ["clinical→patient", b.clinicalToPatient, a.clinicalToPatient],
      ["misses", b.misses, a.misses],
      ["precision", b.pooled.precision, a.pooled.precision],
      ["narrative", b.pooled.narrativeFalsePositives, a.pooled.narrativeFalsePositives],
      ["merge rate", b.pooled.mergeRate, a.pooled.mergeRate],
    ];
    for (const [name, x, y] of pairs) {
      if (x === null || y === null) continue;
      widen[name] = Math.max(widen[name] ?? 0, Math.abs(y - x));
    }
  }
  return widen;
}

// ---------------------------------------------------------------- overlap

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

function shingles(text: string, n: number): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/**
 * Runs of `n` words the prompt shares with any fixture (spec §8.3). A list for
 * the freeze gate to read, not a check: some general wording coincides.
 */
export function overlap(
  prompt = SYSTEM_PROMPT,
  texts: ReadonlyArray<{ nctId: string; text: string }> = corpusTexts(),
  n = 5,
): Array<{ phrase: string; studies: string[] }> {
  const found = new Map<string, string[]>();
  const promptShingles = shingles(prompt, n);
  for (const { nctId, text } of texts) {
    for (const s of shingles(text, n)) {
      if (promptShingles.has(s)) found.set(s, [...(found.get(s) ?? []), nctId]);
    }
  }
  return [...found]
    .map(([phrase, studies]) => ({ phrase, studies }))
    .sort((a, b) => a.phrase.localeCompare(b.phrase));
}

function corpusTexts(): Array<{ nctId: string; text: string }> {
  return CORPUS_IDS.map((nctId) => ({
    nctId,
    text: normalize(getTrial(nctId).eligibility.criteriaText).text,
  }));
}

// ------------------------------------------------------------- unlabelled

export interface ParseStats {
  criteria: number;
  byType: Record<string, number>;
  unclaimed: number;
  rejected: number;
  loose: number;
}

export function parseStats(parsed: ParsedCriteria): ParseStats {
  const byType: Record<string, number> = {};
  for (const c of parsed.criteria) byType[c.type] = (byType[c.type] ?? 0) + 1;
  return {
    criteria: parsed.criteria.length,
    byType,
    unclaimed: parsed.unclaimed.reduce((n, s) => n + s.text.replace(/\s/g, "").length, 0),
    rejected: parsed.rejected.length,
    loose: parsed.criteria.filter((c) => c.loose === true).length,
  };
}

export function unlabelledStudies(): string[] {
  const labelled = labelledStudies();
  return CORPUS_IDS.filter((id) => !labelled.includes(id));
}

// ---------------------------------------------------------------- output

const fmt = (n: number | null) =>
  n === null ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(3);

function renderLines(title: string, lines: Line[]): string[] {
  const out = [title];
  for (const l of lines) {
    const status = !l.judged ? "" : l.pass ? "met" : "NOT MET";
    out.push(
      `  ${l.measure.padEnd(46)} ${fmt(l.before).padStart(6)} → ${fmt(l.after).padEnd(6)} ` +
        `${l.bar.padEnd(10)} ${status}`,
    );
  }
  const failed = lines.filter((l) => l.judged && !l.pass).length;
  out.push(`  ${failed === 0 ? "every line met" : `${failed} line(s) not met`}`, "");
  return out;
}

/** Scored patient facts, with NCT04385368's by the median of its samples when there are any. */
function scoredReach(run: EvalRun, samples: readonly EvalRun[]): number {
  const studies = scopeStudies("pooled");
  if (samples.length === 0) return reachOf(run, studies)["scored"] ?? 0;
  const quiet = reachOf(
    run,
    studies.filter((s) => s !== NOISY_STUDY),
  )["scored"];
  const noisy = [run, ...samples].map((r) => reachOf(r, [NOISY_STUDY])["scored"] ?? 0);
  return (quiet ?? 0) + median(noisy);
}

export function renderBar(
  before: EvalRun,
  after: EvalRun,
  samples: readonly EvalRun[] = [],
): string {
  const out: string[] = [
    `before ${before.parseIdentity ?? before.promptVersion}  after ${after.parseIdentity ?? after.promptVersion}` +
      `  (${after.model}, temperature ${after.temperature}, seed ${after.seed}, thinking ${after.thinking ?? "default"}, matcher v${after.matcher.version})`,
    "",
  ];
  const devOnly = after.dev === true || before.dev === true;
  const scopes: Scope[] = devOnly ? ["dev"] : ["pooled", "dev", "held"];
  for (const scope of scopes) {
    const studies = scopeStudies(scope);
    const reach =
      scope === "pooled"
        ? { before: scoredReach(before, []), after: scoredReach(after, samples) }
        : undefined;
    out.push(
      ...renderLines(
        `${scope} (${studies.join(", ")})`,
        barLines(before, after, scope, reach, samples),
      ),
    );
  }
  if (!devOnly) {
    out.push("the labels the rule contradicts (spec §5.2), as typed:");
    out.push(...contradictionRows(before, after), "");
    const b = reachOf(before, scopeStudies("pooled"));
    const a = reachOf(after, scopeStudies("pooled"));
    out.push(
      "reach (patient facts over the scored vignettes):",
      ...Object.keys(a).map((k) => `  ${k.padEnd(16)} ${String(b[k]).padStart(4)} → ${a[k]}`),
    );
  }
  return out.join("\n");
}

export function renderNoise(before: EvalRun, after: EvalRun): string {
  const out: string[] = [];
  const graded = (run: EvalRun, nctId: string) =>
    run.studies.some((st) => st.nctId === nctId && st.status === "graded");
  // A sample result holds one study; compare only what both results parsed.
  const both = [...new Set([...NOISE_STUDIES, ...after.studies.map((st) => st.nctId)])].filter(
    (id) => graded(before, id) && graded(after, id),
  );
  for (const nctId of both) {
    const r = compareParses(nctId, readParse(before, nctId), readParse(after, nctId));
    out.push(`${nctId}: ${r.identical ? "identical" : `${r.differences.length} difference(s)`}`);
    out.push(...r.differences.map((d) => `  ${d.slice(0, 180)}`));
  }
  const widen = noiseWidening(before, after);
  out.push(
    "",
    "largest change per bar quantity across these studies (the widening, if any):",
    ...Object.entries(widen).map(([k, v]) => `  ${k.padEnd(20)} ${fmt(v)}`),
  );
  return out.join("\n");
}

export function renderUnlabelled(beforeIdentity: string, afterIdentity: string): string {
  const out: string[] = [`unlabelled studies, ${beforeIdentity} → ${afterIdentity}`];
  const read = (nctId: string, identity: string): ParseStats | undefined => {
    const path = join(PARSES_DIR, parseFileName(nctId, PINNED.model, identity, PINNED.seed));
    return existsSync(path)
      ? parseStats(JSON.parse(readFileSync(path, "utf8")) as ParsedCriteria)
      : undefined;
  };
  const describe = (s: ParseStats | undefined) =>
    s === undefined
      ? "no parse"
      : `${s.criteria} criteria (${Object.entries(s.byType)
          .sort()
          .map(([t, n]) => `${t} ${n}`)
          .join(", ")}), unclaimed ${s.unclaimed}, rejected ${s.rejected}, loose ${s.loose}`;
  for (const nctId of unlabelledStudies()) {
    out.push(`${nctId}`, `  before ${describe(read(nctId, beforeIdentity))}`);
    out.push(`  after  ${describe(read(nctId, afterIdentity))}`);
  }
  return out.join("\n");
}

export function resolveResultPath(arg: string, dir = RESULTS_DIR): string {
  for (const candidate of [arg, join(dir, arg), join(dir, "dev", arg)]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`no result ${arg}, here or under ${dir}`);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--overlap")) {
    const found = overlap();
    console.log(`${found.length} run(s) of five words the prompt shares with the corpus:`);
    for (const f of found) console.log(`  "${f.phrase}"  (${f.studies.join(", ")})`);
    return;
  }
  const files = args.filter((a) => !a.startsWith("--"));
  if (args.includes("--unlabelled")) {
    const [before, after] = files;
    if (before === undefined || after === undefined) {
      console.error(
        "usage: npm run eval:compare -- --unlabelled <identity-before> <identity-after>",
      );
      process.exitCode = 1;
      return;
    }
    console.log(renderUnlabelled(before, after));
    return;
  }
  if (files.length < 2 || (files.length > 2 && !args.includes("--samples"))) {
    console.error(
      "usage: npm run eval:compare -- <before.json> <after.json> [--noise | --samples <more.json>...]",
    );
    process.exitCode = 1;
    return;
  }
  const [before, after, ...samples] = files.map(
    (f) => JSON.parse(readFileSync(resolveResultPath(f), "utf8")) as EvalRun,
  ) as [EvalRun, EvalRun, ...EvalRun[]];
  console.log(
    args.includes("--noise") ? renderNoise(before, after) : renderBar(before, after, samples),
  );
}

if (import.meta.main) {
  main();
}
