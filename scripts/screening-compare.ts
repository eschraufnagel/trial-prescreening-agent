/**
 * Compares two committed screening runs (0009 spec §8.3).
 *
 *   npm run screening:compare -- <before.json> <after.json>                the twelve, labels and parses
 *   npm run screening:compare -- <before.json> <after.json> --least-seen   also the three least-seen, apart
 *
 * Reads the two run files and nothing else: no conversation cache, no model.
 * A bare file name is looked for in `evals/results/screening/`, then in its
 * `dev/`. Two dev runs give the dev report instead: every fact that wasn't
 * correct, per vignette, with the words behind it.
 *
 * The three least-seen conversations are left out unless `--least-seen` is
 * given, and their numbers are never computed without it. 0009 passes the flag
 * only after its scored run, once the fixes are frozen.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Discipline,
  LabelOutcome,
  ReportedAgreement,
  ScreeningScore,
} from "../evals/graders/screening.js";
import { poolScores, VERDICT_PATTERN } from "../evals/graders/screening.js";
import { isLeastSeen } from "./lib/least-seen.js";

const SCREENING_DIR = fileURLToPath(new URL("../evals/results/screening", import.meta.url));

/** A grade as `forCommit` writes it: numbers, and only the outcomes that weren't correct. */
export interface CommittedGrade {
  score: ScreeningScore;
  reported: ReportedAgreement;
  discipline: Discipline;
  notCorrect: LabelOutcome[];
}

export interface CommittedConversation {
  vignetteId: string;
  nctId: string;
  source: "labels" | "parse";
  status: "graded" | "failed" | "not-run";
  timing?: {
    agentMs: number;
    participantMs: number;
    fidelityMs: number;
    agentCalls: number;
    participantCalls: number;
    fidelityCalls: number;
  };
  questions?: number;
  labels?: CommittedGrade;
  parse?: { scored: CommittedGrade };
  error?: string;
}

/** A run file as the screening runner commits it. */
export interface CommittedRun {
  model: string;
  quantization: string;
  temperature: number | null;
  seed: number | null;
  thinking?: string;
  promptVersion: string;
  simulatorVersion: string;
  graderVersion: string;
  dev: boolean;
  conversations: CommittedConversation[];
}

/**
 * `defer` facts whose words say the criterion is for the other sex. Before
 * 0009 the agent recorded these as does-not-hold, and the vignette convention
 * grades any abstention correct. Excluding them shows how much of a change is
 * the does-not-apply reading, which is close to mechanical, and how much is
 * the rest. Built from the vignette files, never from a grade.
 *
 * The twelve's four are all there are in those twelve vignettes. The three
 * least-seen vignettes hold one, added only after 0009's scored run.
 */
export const OTHER_SEX_FACTS: ReadonlyArray<{ vignetteId: string; label: string }> = [
  { vignetteId: "NCT03433469-v1", label: "L49" },
  { vignetteId: "NCT03433469-v3", label: "L49" },
  { vignetteId: "NCT06728852-v1", label: "L15" },
  { vignetteId: "NCT06728852-v3", label: "L15" },
  // The least-seen three's, added after 0009's scored run (step 13).
  { vignetteId: "NCT06728852-v2", label: "L16" },
];

/** 0009 spec §8.2, fixed before the run. Rates on the twelve. */
export const BAR = {
  labels: { better: 0.07, worse: 0.14 },
  parse: { better: 0.13, worse: 0.13 },
  abstention: 0.1,
} as const;

export type Verdict = "better" | "worse" | "mixed";

export interface GroupNumbers {
  conversations: number;
  failed: string[];
  score: ScreeningScore;
  reported: { graded: number; agreed: number };
  discipline: {
    questions: number;
    followUps: number;
    multiQuestion: number;
    overLength: number;
    verdictHits: Array<{ vignetteId: string; source: string; text: string }>;
  };
  wrong: Array<{ vignetteId: string; source: string; outcome: LabelOutcome }>;
}

export interface SourceNumbers {
  all: GroupNumbers;
  /** Labels only: the same group with `OTHER_SEX_FACTS` taken out. */
  withoutOtherSex?: ScreeningScore;
}

export interface RunNumbers {
  labels: SourceNumbers;
  parse: SourceNumbers;
  /** True when verdict hits were stored by grader v3 and have been filtered by v4's pattern. */
  verdictRefiltered: boolean;
}

export interface Comparison {
  twelve: { before: RunNumbers; after: RunNumbers };
  leastSeen?: { before: RunNumbers; after: RunNumbers };
  verdict: { labels: Verdict; parse: Verdict; improvement: boolean };
}

function gradeOf(c: CommittedConversation): CommittedGrade | undefined {
  return c.source === "labels" ? c.labels : c.parse?.scored;
}

/** The numbers for one run, one group of conversations, one source. */
export function groupNumbers(
  run: CommittedRun,
  conversations: readonly CommittedConversation[],
): GroupNumbers {
  const graded = conversations.filter((c) => c.status === "graded" && gradeOf(c) !== undefined);
  const grades = graded.map((c) => ({ c, g: gradeOf(c) as CommittedGrade }));
  // Grader v3 stored its own hits. v4 only ever matches less, so filtering the
  // stored texts by v4's pattern gives exactly what a re-grade would (spec §6).
  const refilter = run.graderVersion === "3";
  return {
    conversations: graded.length,
    failed: conversations
      .filter((c) => c.status !== "graded")
      .map((c) => `${c.vignetteId} (${c.source})`),
    score: poolScores(grades.map(({ g }) => g.score)),
    reported: {
      graded: grades.reduce((n, { g }) => n + g.reported.graded, 0),
      agreed: grades.reduce((n, { g }) => n + g.reported.agreed, 0),
    },
    discipline: {
      questions: grades.reduce((n, { g }) => n + g.discipline.agentQuestions, 0),
      followUps: grades.reduce((n, { g }) => n + g.discipline.followUps, 0),
      multiQuestion: grades.reduce((n, { g }) => n + g.discipline.multiQuestion, 0),
      overLength: grades.reduce((n, { g }) => n + g.discipline.overLength, 0),
      verdictHits: grades.flatMap(({ c, g }) =>
        g.discipline.verdictLanguage
          .filter((h) => !refilter || VERDICT_PATTERN.test(h.text))
          .map((h) => ({ vignetteId: c.vignetteId, source: c.source, text: h.text })),
      ),
    },
    wrong: grades.flatMap(({ c, g }) =>
      g.notCorrect
        .filter((o) => o.outcome === "confidently-wrong")
        .map((outcome) => ({ vignetteId: c.vignetteId, source: c.source, outcome })),
    ),
  };
}

/**
 * The pooled score with the other-sex facts taken out. A fact graded
 * confidently wrong leaves the determinations; one that was simulator-affected
 * leaves that count; any other was a correct abstention, since every one is
 * `defer`, and leaves the abstainable facts. Labels only: from a parse, a fact
 * is graded only if its label reached the agent intact.
 */
export function withoutOtherSex(
  conversations: readonly CommittedConversation[],
  facts: ReadonlyArray<{ vignetteId: string; label: string }> = OTHER_SEX_FACTS,
): ScreeningScore {
  const scores: ScreeningScore[] = [];
  for (const c of conversations) {
    if (c.status !== "graded" || c.labels === undefined) {
      continue;
    }
    const s = { ...c.labels.score };
    for (const f of facts.filter((x) => x.vignetteId === c.vignetteId)) {
      const outcome = c.labels.notCorrect.find((o) => o.label === f.label)?.outcome;
      if (outcome === "confidently-wrong") {
        s.determinations -= 1;
        s.confidentlyWrong -= 1;
      } else if (outcome === "simulator-affected") {
        s.simulatorAffected -= 1;
      } else {
        s.abstainable -= 1;
        s.correctAbstentions -= 1;
      }
    }
    scores.push(s);
  }
  return poolScores(scores);
}

export function runNumbers(
  run: CommittedRun,
  include: (c: CommittedConversation) => boolean,
): RunNumbers {
  const of = (source: "labels" | "parse") =>
    run.conversations.filter((c) => c.source === source && include(c));
  const labels = of("labels");
  return {
    labels: { all: groupNumbers(run, labels), withoutOtherSex: withoutOtherSex(labels) },
    parse: { all: groupNumbers(run, of("parse")) },
    verdictRefiltered: run.graderVersion === "3",
  };
}

/** Spec §8.2's verdict, from the twelve's numbers after the run. */
export function barVerdict(labels: ScreeningScore, parse: ScreeningScore): Comparison["verdict"] {
  const judge = (s: ScreeningScore, bar: { better: number; worse: number }): Verdict => {
    const wrong = s.confidentlyWrongRate ?? 0;
    const abstention = s.abstentionRate ?? 0;
    if (wrong > bar.worse || abstention > BAR.abstention) return "worse";
    if (wrong <= bar.better) return "better";
    return "mixed";
  };
  const l = judge(labels, BAR.labels);
  const p = judge(parse, BAR.parse);
  return { labels: l, parse: p, improvement: l === "better" && p !== "worse" };
}

export function compareRuns(
  before: CommittedRun,
  after: CommittedRun,
  options: { leastSeen: boolean },
): Comparison {
  const twelve = (c: CommittedConversation) => !isLeastSeen(c.vignetteId);
  const three = (c: CommittedConversation) => isLeastSeen(c.vignetteId);
  const afterTwelve = runNumbers(after, twelve);
  return {
    twelve: { before: runNumbers(before, twelve), after: afterTwelve },
    ...(options.leastSeen
      ? { leastSeen: { before: runNumbers(before, three), after: runNumbers(after, three) } }
      : {}),
    verdict: barVerdict(afterTwelve.labels.all.score, afterTwelve.parse.all.score),
  };
}

const rate = (n: number | null) => (n === null ? "  –  " : n.toFixed(3));
const cell = (a: number, b: number, r: number | null) => `${a}/${b} ${rate(r)}`.padEnd(18);

function describeRun(name: string, run: CommittedRun): string {
  return (
    `${name}: prompt ${run.promptVersion} · simulator ${run.simulatorVersion} · grader ${run.graderVersion} · ` +
    `${run.model} ${run.quantization} · temperature ${run.temperature ?? "not set"} · ` +
    `seed ${run.seed ?? "none"} · thinking ${run.thinking ?? "default"}`
  );
}

function scoreRows(b: ScreeningScore, a: ScreeningScore, indent = "  "): string[] {
  return [
    `${indent}${"confidently wrong".padEnd(22)}${cell(b.confidentlyWrong, b.determinations, b.confidentlyWrongRate)}${cell(a.confidentlyWrong, a.determinations, a.confidentlyWrongRate)}`,
    `${indent}${"abstained".padEnd(22)}${cell(b.abstained, b.answerable, b.abstentionRate)}${cell(a.abstained, a.answerable, a.abstentionRate)}`,
    `${indent}${"correct abstention".padEnd(22)}${cell(b.correctAbstentions, b.abstainable, b.correctAbstentionRate)}${cell(a.correctAbstentions, a.abstainable, a.correctAbstentionRate)}`,
    `${indent}${"simulator-affected".padEnd(22)}${String(b.simulatorAffected).padEnd(18)}${a.simulatorAffected}`,
  ];
}

function groupBlock(title: string, pair: { before: RunNumbers; after: RunNumbers }): string[] {
  const lines = [title, `  ${"".padEnd(22)}${"before".padEnd(18)}after`];
  for (const source of ["labels", "parse"] as const) {
    const b = pair.before[source];
    const a = pair.after[source];
    lines.push(
      `${source === "labels" ? "from labels" : "from parses"} (${b.all.conversations} and ${a.all.conversations} conversations)`,
    );
    lines.push(...scoreRows(b.all.score, a.all.score));
    lines.push(
      `  ${"reported agreement".padEnd(22)}${`${b.all.reported.agreed}/${b.all.reported.graded}`.padEnd(18)}${a.all.reported.agreed}/${a.all.reported.graded}`,
    );
    if (b.withoutOtherSex !== undefined && a.withoutOtherSex !== undefined) {
      lines.push("  without the other-sex facts");
      lines.push(...scoreRows(b.withoutOtherSex, a.withoutOtherSex, "    "));
    }
    for (const [which, n] of [
      ["before", b],
      ["after", a],
    ] as const) {
      if (n.all.failed.length > 0) {
        lines.push(`  not graded ${which}: ${n.all.failed.join(", ")}`);
      }
    }
  }
  const d = (n: RunNumbers) => {
    const l = n.labels.all.discipline;
    const p = n.parse.all.discipline;
    return {
      questions: l.questions + p.questions,
      followUps: l.followUps + p.followUps,
      multi: l.multiQuestion + p.multiQuestion,
      over: l.overLength + p.overLength,
      hits: [...l.verdictHits, ...p.verdictHits],
    };
  };
  const db = d(pair.before);
  const da = d(pair.after);
  lines.push("discipline, both sources");
  lines.push(`  ${"questions".padEnd(22)}${String(db.questions).padEnd(18)}${da.questions}`);
  lines.push(`  ${"follow-ups".padEnd(22)}${String(db.followUps).padEnd(18)}${da.followUps}`);
  lines.push(`  ${"more than one ?".padEnd(22)}${String(db.multi).padEnd(18)}${da.multi}`);
  lines.push(`  ${"over length".padEnd(22)}${String(db.over).padEnd(18)}${da.over}`);
  lines.push(
    `  ${"verdict language".padEnd(22)}${String(db.hits.length).padEnd(18)}${da.hits.length}`,
  );
  if (pair.before.verdictRefiltered) {
    lines.push("    (before: grader v3's stored hits, filtered by v4's pattern)");
  }
  for (const [which, hits] of [
    ["before", db.hits],
    ["after", da.hits],
  ] as const) {
    for (const h of hits) {
      lines.push(`    ${which} ${h.vignetteId} (${h.source}): ${h.text}`);
    }
  }
  return lines;
}

function wrongList(title: string, n: RunNumbers): string[] {
  const all = [...n.labels.all.wrong, ...n.parse.all.wrong];
  return [
    title,
    ...all.map(
      ({ vignetteId, source, outcome }) =>
        `  ${vignetteId} (${source}) ${outcome.label}: expected ${outcome.expected}, ` +
        `recorded ${outcome.status}. ${outcome.evidence.map((e) => `"${e}"`).join(" ")}`,
    ),
  ];
}

export function renderComparison(
  before: CommittedRun,
  after: CommittedRun,
  comparison: Comparison,
): string {
  const lines = [describeRun("before", before), describeRun("after ", after), ""];
  lines.push(...groupBlock("THE TWELVE (the three least-seen left out)", comparison.twelve), "");
  const v = comparison.verdict;
  lines.push(
    "The bar (0009 spec §8.2), on the twelve after:",
    `  from labels: ${v.labels} (better: wrong ≤ ${BAR.labels.better} and abstention ≤ ${BAR.abstention}; worse: wrong > ${BAR.labels.worse} or abstention > ${BAR.abstention})`,
    `  from parses: ${v.parse} (better: wrong ≤ ${BAR.parse.better} and abstention ≤ ${BAR.abstention}; worse: wrong > ${BAR.parse.worse} or abstention > ${BAR.abstention})`,
    `  may be called an improvement: ${v.improvement ? "yes" : "no"}`,
  );
  if (comparison.leastSeen !== undefined) {
    lines.push(
      "",
      ...groupBlock("THE THREE LEAST-SEEN, apart", comparison.leastSeen),
      "",
      ...wrongList("  confidently wrong before:", comparison.leastSeen.before),
      ...wrongList("  confidently wrong after:", comparison.leastSeen.after),
    );
  }
  return lines.join("\n");
}

/** Mean time per conversation and per agent call, for sizing the scored run. */
export function pace(run: CommittedRun): {
  conversations: number;
  agentMsPerCall: number | null;
  msPerConversation: number | null;
  agentMsPerConversation: number | null;
} {
  const timed = run.conversations.filter((c) => c.status === "graded" && c.timing !== undefined);
  const sum = (f: (t: NonNullable<CommittedConversation["timing"]>) => number) =>
    timed.reduce((n, c) => n + f(c.timing as NonNullable<CommittedConversation["timing"]>), 0);
  const calls = sum((t) => t.agentCalls);
  const n = timed.length;
  return {
    conversations: n,
    agentMsPerCall: calls === 0 ? null : sum((t) => t.agentMs) / calls,
    msPerConversation: n === 0 ? null : sum((t) => t.agentMs + t.participantMs + t.fidelityMs) / n,
    agentMsPerConversation: n === 0 ? null : sum((t) => t.agentMs) / n,
  };
}

/**
 * Two dev runs side by side: per vignette, the score, and every fact that
 * wasn't correct with the words behind it. Dev vignettes are never scored, so
 * all of it can be read.
 */
export function devReport(before: CommittedRun, after: CommittedRun): string {
  const lines = [describeRun("before", before), describeRun("after ", after), ""];
  const ids = [
    ...new Set([...before.conversations, ...after.conversations].map((c) => c.vignetteId)),
  ].sort();
  for (const id of ids) {
    lines.push(`━━ ${id}`);
    for (const [which, run] of [
      ["before", before],
      ["after", after],
    ] as const) {
      const c = run.conversations.find((x) => x.vignetteId === id && x.source === "labels");
      const g = c === undefined ? undefined : gradeOf(c);
      if (c === undefined || c.status !== "graded" || g === undefined) {
        lines.push(
          `  ${which}: ${c === undefined ? "not in this run" : `${c.status} ${c.error ?? ""}`}`,
        );
        continue;
      }
      const s = g.score;
      lines.push(
        `  ${which}: wrong ${s.confidentlyWrong}/${s.determinations}, abstained ${s.abstained}/${s.answerable}, ` +
          `correct abstention ${s.correctAbstentions}/${s.abstainable}, reported ${g.reported.agreed}/${g.reported.graded}, ` +
          `${c.questions ?? "?"} questions, ${g.discipline.followUps} follow-ups`,
      );
      for (const o of g.notCorrect) {
        lines.push(
          `    ${o.label} ${o.outcome}: expected ${o.expected}, recorded ${o.status}. ` +
            o.evidence.map((e) => `"${e}"`).join(" "),
        );
      }
    }
  }
  const pb = pace(before);
  const pa = pace(after);
  const seconds = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);
  const minutes = (ms: number | null) => (ms === null ? "–" : `${(ms / 60000).toFixed(1)} min`);
  lines.push(
    "",
    "pace",
    `  agent call      before ${seconds(pb.agentMsPerCall)}, after ${seconds(pa.agentMsPerCall)}`,
    `  agent per conversation  before ${minutes(pb.agentMsPerConversation)}, after ${minutes(pa.agentMsPerConversation)}`,
    `  whole conversation      before ${minutes(pb.msPerConversation)}, after ${minutes(pa.msPerConversation)}`,
  );
  return lines.join("\n");
}

export function resolveRunPath(arg: string, dir = SCREENING_DIR): string {
  for (const candidate of [arg, join(dir, arg), join(dir, "dev", arg)]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`no run file ${arg}, here or under ${dir}`);
}

function main(): void {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length !== 2) {
    console.error("usage: npm run screening:compare -- <before.json> <after.json> [--least-seen]");
    process.exitCode = 1;
    return;
  }
  const [before, after] = files.map(
    (f) => JSON.parse(readFileSync(resolveRunPath(f), "utf8")) as CommittedRun,
  ) as [CommittedRun, CommittedRun];
  if (before.dev || after.dev) {
    console.log(devReport(before, after));
    return;
  }
  const comparison = compareRuns(before, after, { leastSeen: args.includes("--least-seen") });
  console.log(renderComparison(before, after, comparison));
}

if (import.meta.main) {
  main();
}
