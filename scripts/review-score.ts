/**
 * Scores 0007's blind reading against 0004's grades (spec §9.4).
 *
 *   npm run review:score             the filled work/0007-coordinator-review-pane/reading.md
 *   npm run review:score -- <file>   another sheet
 *   npm run review:score -- --groups rows per review group over the 15 labels conversations
 *
 * The reader never sees a grade. This joins what they answered with what the
 * committed run already recorded: a known wrong finding is one 0004 graded
 * confidently wrong; a graded correct one is a settled finding on a label the
 * vignette set an expectation for, and not listed as wrong. Everything else
 * is ungraded, and a "no" there is listed for reading, not scored.
 *
 * Deterministic, and no model.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVignettes } from "../evals/cases/vignettes.js";
import type { ScreeningRun } from "../evals/screening-runner.js";
import type { FinishedConversation } from "../src/server/index.js";
import { reviewModel } from "../src/web/review.js";
import { loadReadingRun, READING_RUN } from "./app/eval-run.js";
import { SHEET_PATH } from "./review-sheet.js";

const SCREENING_DIR = fileURLToPath(new URL("../evals/results/screening", import.meta.url));

export type Answer = "yes" | "no" | "cant-tell";

export interface SheetRow {
  label: string;
  answer: Answer | null;
  where: "row" | "transcript" | null;
  line: number;
}

export interface SheetConversation {
  id: string;
  started: string | null;
  finished: string | null;
  rows: SheetRow[];
}

export interface ParsedSheet {
  conversations: SheetConversation[];
  /** Each names its line. A sheet with problems is not scored. */
  problems: string[];
}

const HEADING = /^## \d+\. (eval \S+)$/;
const ROW = /^- (\S+) · answer:(.*)· where:(.*)$/;
const TIME = /^(Started|Finished):\s*(.*)$/;

function answerOf(raw: string): Answer | null | undefined {
  const text = raw.trim().toLowerCase().replace(/[’']/g, "");
  if (text === "") return null;
  if (text === "yes") return "yes";
  if (text === "no") return "no";
  if (text === "cant tell") return "cant-tell";
  return undefined;
}

function whereOf(raw: string): SheetRow["where"] | undefined {
  const text = raw.trim().toLowerCase();
  if (text === "") return null;
  if (text === "row" || text === "transcript") return text;
  return undefined;
}

export function parseSheet(text: string): ParsedSheet {
  const conversations: SheetConversation[] = [];
  const problems: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    const n = i + 1;
    const heading = HEADING.exec(line);
    if (heading?.[1] !== undefined) {
      conversations.push({ id: heading[1], started: null, finished: null, rows: [] });
      return;
    }
    const current = conversations.at(-1);
    if (current === undefined) {
      return;
    }
    const time = TIME.exec(line);
    if (time !== null) {
      const value = (time[2] ?? "").trim();
      if (value !== "" && !/^\d{1,2}:\d{2}$/.test(value)) {
        problems.push(`line ${n}: a time is written like 14:05, not "${value}"`);
      }
      const at = value === "" ? null : value;
      if (time[1] === "Started") current.started = at;
      else current.finished = at;
      return;
    }
    const row = ROW.exec(line);
    if (row === null) {
      return;
    }
    const answer = answerOf(row[2] ?? "");
    const where = whereOf(row[3] ?? "");
    if (answer === undefined) {
      problems.push(`line ${n}: answer "${(row[2] ?? "").trim()}" is not yes, no or can't tell`);
    }
    if (where === undefined) {
      problems.push(`line ${n}: where "${(row[3] ?? "").trim()}" is not row or transcript`);
    }
    current.rows.push({
      label: row[1] ?? "",
      answer: answer ?? null,
      where: where ?? null,
      line: n,
    });
  });
  return { conversations, problems };
}

/** What 0004 recorded about one conversation, by label. */
export interface Grades {
  wrong: Set<string>;
  correct: Set<string>;
  /** Excluded from 0004's numbers, and so from these. */
  simulatorAffected: Set<string>;
}

/** The committed grades for every labels conversation, keyed by the review's id. */
export function loadGrades(
  run: readonly FinishedConversation[] = loadReadingRun(),
): Map<string, Grades> {
  const committed = JSON.parse(
    readFileSync(join(SCREENING_DIR, READING_RUN), "utf8"),
  ) as ScreeningRun;
  const vignettes = new Map(loadVignettes().map((v) => [v.id, v]));
  const results = new Map(run.map((c) => [c.id, c.result]));
  const grades = new Map<string, Grades>();
  for (const outcome of committed.conversations) {
    if (outcome.source !== "labels" || outcome.labels === undefined) {
      continue;
    }
    const id = `eval ${outcome.vignetteId}-labels`;
    const vignette = vignettes.get(outcome.vignetteId);
    const result = results.get(id);
    if (vignette === undefined || result === undefined) {
      throw new Error(`no vignette or result for ${id}`);
    }
    // The committed file keeps only the outcomes that were not correct.
    const notCorrect = (
      outcome.labels as unknown as { notCorrect: Array<{ label: string; outcome: string }> }
    ).notCorrect;
    const labelled = (kind: string) =>
      new Set(notCorrect.filter((o) => o.outcome === kind).map((o) => o.label));
    const wrong = labelled("confidently-wrong");
    const simulatorAffected = labelled("simulator-affected");
    const settled = new Set(
      result.findings
        .filter((f) => f.status === "holds" || f.status === "does-not-hold")
        .map((f) => f.criterionId),
    );
    const listed = new Set(notCorrect.map((o) => o.label));
    const correct = new Set(
      vignette.facts
        .filter((f) => f.expected !== undefined && settled.has(f.label) && !listed.has(f.label))
        .map((f) => f.label),
    );
    grades.set(id, { wrong, correct, simulatorAffected });
  }
  return grades;
}

export interface Tally {
  of: number;
  no: number;
  yes: number;
  cantTell: number;
  unanswered: number;
  /** Of the "no" answers, how many were found in the transcript rather than the row. */
  inTranscript: number;
}

export interface Score {
  caught: Tally;
  correct: Tally;
  /** Rows no vignette set an expectation for, answered "no": for reading, not scoring. */
  ungradedNo: string[];
  minutes: number[];
}

const empty = (): Tally => ({ of: 0, no: 0, yes: 0, cantTell: 0, unanswered: 0, inTranscript: 0 });

function count(tally: Tally, row: SheetRow): void {
  tally.of += 1;
  if (row.answer === null) tally.unanswered += 1;
  else if (row.answer === "yes") tally.yes += 1;
  else if (row.answer === "cant-tell") tally.cantTell += 1;
  else {
    tally.no += 1;
    if (row.where === "transcript") tally.inTranscript += 1;
  }
}

function minutesBetween(start: string | null, end: string | null): number | null {
  if (start === null || end === null) return null;
  const at = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const d = at(end) - at(start);
  return d < 0 ? d + 24 * 60 : d;
}

export function scoreSheet(sheet: ParsedSheet, grades: ReadonlyMap<string, Grades>): Score {
  const score: Score = {
    caught: empty(),
    correct: empty(),
    ungradedNo: [],
    minutes: [],
  };
  for (const conversation of sheet.conversations) {
    const g = grades.get(conversation.id);
    if (g === undefined) {
      throw new Error(`no grades for ${conversation.id}`);
    }
    for (const row of conversation.rows) {
      if (g.simulatorAffected.has(row.label)) continue;
      if (g.wrong.has(row.label)) count(score.caught, row);
      else if (g.correct.has(row.label)) count(score.correct, row);
      else if (row.answer === "no") score.ungradedNo.push(`${conversation.id} ${row.label}`);
    }
    const minutes = minutesBetween(conversation.started, conversation.finished);
    if (minutes !== null) score.minutes.push(minutes);
  }
  return score;
}

/** Rows per review group, per labels conversation: what a conversation leaves the coordinator. */
export function groupCounts(
  run: readonly FinishedConversation[],
): Array<{ id: string; counts: Record<string, number> }> {
  return run
    .filter((c) => c.source === "labels")
    .map((c) => ({
      id: c.id,
      counts: Object.fromEntries(
        reviewModel({ ...c, origin: "eval-run" }).frame.groups.map((g) => [g.key, g.count]),
      ),
    }));
}

function describe(name: string, t: Tally): string {
  const where = t.no > 0 ? ` (${t.inTranscript} of them found in the transcript)` : "";
  return (
    `${name}: ${t.of} rows. no ${t.no}${where}, yes ${t.yes}, can't tell ${t.cantTell}` +
    (t.unanswered > 0 ? `, unanswered ${t.unanswered}` : "")
  );
}

function main(): void {
  if (process.argv.includes("--groups")) {
    const rows = groupCounts(loadReadingRun());
    const keys = ["settled", "chart", "unresolved", "not-raised"];
    console.log(["conversation", ...keys].join("\t"));
    for (const r of rows) {
      console.log([r.id, ...keys.map((k) => r.counts[k] ?? 0)].join("\t"));
    }
    const total = (k: string) => rows.reduce((n, r) => n + (r.counts[k] ?? 0), 0);
    console.log(["total", ...keys.map(total)].join("\t"));
    return;
  }

  const path = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? SHEET_PATH;
  const sheet = parseSheet(readFileSync(path, "utf8"));
  if (sheet.problems.length > 0) {
    console.error(`${path} can't be scored yet:`);
    for (const p of sheet.problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }
  const score = scoreSheet(sheet, loadGrades());
  const sorted = [...score.minutes].sort((a, b) => a - b);
  const median = sorted.length === 0 ? null : sorted[Math.floor((sorted.length - 1) / 2)];
  console.log(`${sheet.conversations.length} conversations read.`);
  console.log(describe("Known wrong findings (caught = no)", score.caught));
  console.log(describe("Graded correct findings (false alarm = no)", score.correct));
  console.log(`Ungraded rows answered no: ${score.ungradedNo.length}`);
  for (const r of score.ungradedNo) console.log(`  ${r}`);
  console.log(
    median === null
      ? "Minutes per conversation: not recorded"
      : `Minutes per conversation: median ${median}, range ${sorted[0]}–${sorted.at(-1)}`,
  );
}

if (import.meta.main) {
  main();
}
