import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVAL_RUN,
  loadEvalRun,
  READING_RUN,
  REVIEW_DIR,
  type ReviewFile,
} from "../../scripts/app/eval-run.js";
import { EVAL_ONLY_KEYS, evalRun, keysOf } from "../fixtures/eval-run.js";

describe("the eval run's conversations, for review", () => {
  it("loads every conversation the committed run graded, fifteen from each source", () => {
    const run = evalRun();
    expect(run).toHaveLength(30);
    expect(run.filter((c) => c.source === "labels")).toHaveLength(15);
    expect(run.filter((c) => c.source === "parse")).toHaveLength(15);
    expect(new Set(run.map((c) => c.id)).size).toBe(30);
    expect(run.every((c) => /^eval NCT\d{8}-v\d-(labels|parse)$/.test(c.id))).toBe(true);
  });

  it("passes on the result, criteria and renderings, and nothing from the vignette or the grade", () => {
    const run = evalRun();
    expect(
      run.every((c) => Object.keys(c).sort().join() === "criteria,id,plain,result,source"),
    ).toBe(true);
    expect(keysOf(run).filter((k) => EVAL_ONLY_KEYS.includes(k))).toEqual([]);
  });

  it("gives renderings to labelled criteria only", () => {
    const run = evalRun();
    expect(
      run.filter((c) => c.source === "parse").every((c) => Object.keys(c.plain).length === 0),
    ).toBe(true);
    for (const c of run.filter((c) => c.source === "labels")) {
      expect(Object.keys(c.plain).sort()).toEqual(c.criteria.map((x) => x.id).sort());
    }
  });

  it("reads a committed review file for every run the page serves or the reading is scored against", () => {
    for (const runFile of [EVAL_RUN, READING_RUN]) {
      const path = join(REVIEW_DIR, runFile);
      expect(existsSync(path), `${path}: npm run review:export -- ${runFile}`).toBe(true);
      const committed = JSON.parse(readFileSync(path, "utf8")) as ReviewFile;
      expect(committed.runFile).toBe(runFile);
      expect(keysOf(committed).filter((k) => EVAL_ONLY_KEYS.includes(k))).toEqual([]);
    }
  });

  /** A run file and its review file in a temp dir, the review's fields replaced by `review`. */
  function runDir(review: Partial<ReviewFile> | null): string {
    const dir = mkdtempSync(join(tmpdir(), "prescreen-evalrun-"));
    mkdirSync(join(dir, "review"));
    writeFileSync(join(dir, EVAL_RUN), JSON.stringify({ promptVersion: "000000000000" }));
    if (review !== null) {
      writeFileSync(
        join(dir, "review", EVAL_RUN),
        JSON.stringify({
          runFile: EVAL_RUN,
          promptVersion: "000000000000",
          conversations: [
            {
              id: "eval NCT00000001-v1-parse",
              nctId: "NCT00000001",
              source: "parse",
              criteria: [],
              result: { findings: [], transcript: [] },
            },
          ],
          ...review,
        }),
      );
    }
    return dir;
  }

  it("loads a run from its review file alone, with no conversation cache", () => {
    const dir = runDir({});
    try {
      expect(loadEvalRun(dir).map((c) => [c.id, c.source, c.plain])).toEqual([
        ["eval NCT00000001-v1-parse", "parse", {}],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a missing review file, naming the command that makes it", () => {
    const dir = runDir(null);
    try {
      expect(() => loadEvalRun(dir)).toThrow(/missing: make it with npm run review:export -- /);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a review file of another run, or made with another prompt", () => {
    const other = runDir({ runFile: "20990101T000000-111111111111.json" });
    const prompt = runDir({ promptVersion: "222222222222" });
    try {
      expect(() => loadEvalRun(other)).toThrow(
        /is the review of 20990101T000000-111111111111.json/,
      );
      expect(() => loadEvalRun(prompt)).toThrow(
        /exported with prompt 222222222222, but .* says 000000000000/,
      );
    } finally {
      rmSync(other, { recursive: true, force: true });
      rmSync(prompt, { recursive: true, force: true });
    }
  });
});
