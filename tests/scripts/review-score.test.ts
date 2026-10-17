import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type Grades,
  groupCounts,
  loadGrades,
  parseSheet,
  scoreSheet,
} from "../../scripts/review-score.js";
import { READING_SEED, readingSet, shuffled } from "../../scripts/review-sheet.js";
import { readingRun } from "../fixtures/eval-run.js";

const FILLED = readFileSync(new URL("../fixtures/reading-filled.md", import.meta.url), "utf8");

const grades = (g: { wrong?: string[]; correct?: string[]; sim?: string[] }): Grades => ({
  wrong: new Set(g.wrong ?? []),
  correct: new Set(g.correct ?? []),
  simulatorAffected: new Set(g.sim ?? []),
});

describe("scoring a filled sheet", () => {
  it("reads answers, where, and times, forgiving case and apostrophes", () => {
    const sheet = parseSheet(FILLED);
    expect(sheet.problems).toEqual([]);
    expect(sheet.conversations.map((c) => [c.id, c.started, c.finished, c.rows.length])).toEqual([
      ["eval NCT00000000-v1-labels", "14:05", "14:17", 5],
      ["eval NCT00000000-v3-labels", "23:55", "0:04", 3],
    ]);
    expect(sheet.conversations[1]?.rows[0]).toMatchObject({ answer: "no", where: "row" });
    expect(sheet.conversations[0]?.rows[2]?.answer).toBe("cant-tell");
    expect(sheet.conversations[1]?.rows[1]?.answer).toBeNull();
  });

  it("counts catches, false alarms, can't-tells and where a catch was seen", () => {
    const score = scoreSheet(
      parseSheet(FILLED),
      new Map([
        [
          "eval NCT00000000-v1-labels",
          grades({ wrong: ["L2", "L4"], correct: ["L1", "L3"], sim: ["L5"] }),
        ],
        ["eval NCT00000000-v3-labels", grades({ wrong: ["L2"], correct: ["L1"] })],
      ]),
    );
    expect(score.caught).toEqual({
      of: 3,
      no: 2,
      yes: 0,
      cantTell: 0,
      unanswered: 1,
      inTranscript: 1,
    });
    expect(score.correct).toEqual({
      of: 3,
      no: 1,
      yes: 1,
      cantTell: 1,
      unanswered: 0,
      inTranscript: 0,
    });
    expect(score.ungradedNo).toEqual([]);
    expect(score.minutes).toEqual([12, 9]);
  });

  it("lists a no on a row nothing graded, for reading rather than scoring", () => {
    const score = scoreSheet(
      parseSheet(FILLED),
      new Map([
        ["eval NCT00000000-v1-labels", grades({})],
        ["eval NCT00000000-v3-labels", grades({})],
      ]),
    );
    expect(score.ungradedNo).toEqual([
      "eval NCT00000000-v1-labels L2",
      "eval NCT00000000-v1-labels L4",
      "eval NCT00000000-v1-labels L5",
      "eval NCT00000000-v3-labels L1",
    ]);
  });

  it("names the line of an answer it can't read, and a time written wrongly", () => {
    const bad = FILLED.replace("- L1 · answer: yes", "- L1 · answer: maybe").replace(
      "Started: 14:05",
      "Started: five past",
    );
    expect(parseSheet(bad).problems).toEqual([
      'line 9: a time is written like 14:05, not "five past"',
      'line 12: answer "maybe" is not yes, no or can\'t tell',
    ]);
  });
});

describe("the committed grades the sheet is scored against", () => {
  const run = readingRun();
  const all = loadGrades(run);

  it("find all 24 known wrong findings from labels, and 15 in the reading set", () => {
    expect([...all.values()].reduce((n, g) => n + g.wrong.size, 0)).toBe(24);
    const set = shuffled(readingSet(run), READING_SEED);
    expect(set.reduce((n, c) => n + (all.get(c.id)?.wrong.size ?? 0), 0)).toBe(15);
  });

  it("never count a finding as both wrong and correct", () => {
    for (const g of all.values()) {
      expect([...g.wrong].filter((l) => g.correct.has(l))).toEqual([]);
    }
  });

  it("count rows per review group over the fifteen labels conversations", () => {
    const counts = groupCounts(run);
    expect(counts).toHaveLength(15);
    for (const { id, counts: c } of counts) {
      const review = run.find((r) => r.id === id);
      expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(review?.criteria.length);
    }
  });
});
