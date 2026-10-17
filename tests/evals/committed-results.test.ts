import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadLabelSet } from "../../evals/cases/load.js";
import { poolMetrics } from "../../evals/graders/metrics.js";
import type { EvalRun } from "../../evals/runner.js";
import { gradeStudy, parseFileName, quoteCounts } from "../../evals/runner.js";
import type { ParsedCriteria } from "../../src/criteria/index.js";

/**
 * Every committed parser result, re-graded from its committed parses (slice
 * 0011, spec §3.5).
 *
 * Each number a parser result states is reproduced here with today's matcher
 * and labels, from the parses the result graded. So a number in the README can
 * be checked from a fresh clone, a parse a result depends on can't be left
 * uncommitted, and a change to the matcher or the labels fails here, because
 * the ruler moved. Nothing here calls a model.
 */
const RESULTS = fileURLToPath(new URL("../../evals/results/", import.meta.url));
const PARSES = join(RESULTS, "parses");

function parserResults(): Array<{ name: string; run: EvalRun }> {
  const dirs = [RESULTS, join(RESULTS, "dev")].filter((d) => existsSync(d));
  return dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => ({ name, run: JSON.parse(readFileSync(join(dir, name), "utf8")) }))
      .filter(({ run }) => run.matcher !== undefined && Array.isArray(run.studies)),
  );
}

describe.each(parserResults())("committed parser result $name", ({ run }) => {
  // Results made before 0011 record no identity: their parses are named by the prompt alone.
  const identity = run.parseIdentity ?? run.promptVersion;
  const graded = run.studies.filter((s) => s.status === "graded");

  const parseOf = (nctId: string): ParsedCriteria => {
    const file = join(PARSES, parseFileName(nctId, run.model, identity, run.seed));
    expect(existsSync(file), `${file} is missing: commit the parse this result graded`).toBe(true);
    return JSON.parse(readFileSync(file, "utf8")) as ParsedCriteria;
  };

  it("pools to the same numbers", () => {
    const metrics = graded.map(
      (s) => gradeStudy(s.nctId, parseOf(s.nctId), loadLabelSet(s.nctId)).metrics,
    );
    expect(poolMetrics(metrics)).toEqual(run.pooled);
  });

  it.each(
    graded.map((s) => [s.nctId, s] as const),
  )("re-grades %s to the same numbers", (_, study) => {
    const parsed = parseOf(study.nctId);

    const { metrics, diagnostics } = gradeStudy(study.nctId, parsed, loadLabelSet(study.nctId));

    expect(metrics).toEqual(study.metrics);
    const counts = (d: typeof diagnostics) => ({
      missed: d.missed.length,
      extra: d.extra.length,
      merged: d.merged.length,
      typeErrors: d.typeErrors.length,
      narrative: d.narrative.length,
    });
    expect(study.diagnostics).toBeDefined();
    if (study.diagnostics !== undefined) {
      expect(counts(diagnostics)).toEqual(counts(study.diagnostics));
      expect(diagnostics.typeErrors).toEqual(study.diagnostics.typeErrors);
    }
    if (study.quotes !== undefined) {
      expect(quoteCounts(parsed)).toEqual(study.quotes);
    }
  });
});
