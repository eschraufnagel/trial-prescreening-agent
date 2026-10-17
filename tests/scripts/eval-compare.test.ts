import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvalRun } from "../../evals/runner.js";
import {
  barLines,
  compareParses,
  median,
  noiseWidening,
  overlap,
} from "../../scripts/eval-compare.js";
import type { ParsedCriteria } from "../../src/criteria/index.js";

/**
 * The parser bar's arithmetic (slice 0011, spec §9.3 as Gate 1 left it), on
 * copies of R2's committed result with its diagnostics edited. R2 is the
 * before. No parse is read: reach, which needs parses, is tested in
 * `tests/evals/screening-grader.test.ts`.
 */
const BASE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../evals/results/02-73c3b301c4a9.json", import.meta.url)),
    "utf8",
  ),
) as EvalRun;

const copy = (): EvalRun => structuredClone(BASE);
const study = (run: EvalRun, nctId: string) => {
  const found = run.studies.find((s) => s.nctId === nctId);
  if (found?.metrics === undefined || found.diagnostics === undefined) throw new Error(nctId);
  return { metrics: found.metrics, diagnostics: found.diagnostics };
};

/** Keep only the first `n` `patient`→`clinical` type errors, pooled. */
function withPatientToClinical(n: number): EvalRun {
  const run = copy();
  let kept = 0;
  for (const s of run.studies) {
    if (s.diagnostics === undefined) continue;
    s.diagnostics.typeErrors = s.diagnostics.typeErrors.filter((e) => {
      if (e.labelled !== "patient" || e.predicted !== "clinical") return true;
      kept += 1;
      return kept <= n;
    });
  }
  return run;
}

function line(run: EvalRun, measure: string, scope: "pooled" | "dev" | "held" = "pooled") {
  const found = barLines(BASE, run, scope).find((l) => l.measure.startsWith(measure));
  if (found === undefined) throw new Error(`no line ${measure}`);
  return found;
}

describe("the parser bar", () => {
  it("reads R2's own numbers as the baseline", () => {
    expect(line(BASE, "patient typed clinical")).toMatchObject({
      before: 25,
      after: 25,
      pass: false,
    });
    expect(line(BASE, "patient typed clinical", "dev")).toMatchObject({ after: 18, pass: false });
    expect(line(BASE, "patient typed clinical", "held")).toMatchObject({ after: 7, pass: false });
  });

  it("meets the patient-typed-clinical line at 12 and not at 13", () => {
    expect(line(withPatientToClinical(12), "patient typed clinical").pass).toBe(true);
    expect(line(withPatientToClinical(13), "patient typed clinical").pass).toBe(false);
  });

  // Gate 1: NCT04385368's parse changes run to run on identical input.
  it("reports NCT04385368's noisy numbers without judging them", () => {
    const run = copy();
    const noisy = study(run, "NCT04385368");
    noisy.diagnostics.missed.push(...noisy.diagnostics.missed, ...noisy.diagnostics.missed);
    noisy.metrics.narrativeFalsePositives += 20;
    const lines = barLines(BASE, run, "pooled");
    const reported = lines.filter((l) => !l.judged);
    expect(reported.map((l) => l.measure)).toEqual([
      "NCT04385368: protocol typed clinical",
      "NCT04385368: labels missed",
      "NCT04385368: precision",
      "NCT04385368: narrative false positives",
    ]);
    expect(lines.filter((l) => l.judged && !l.pass).map((l) => l.measure)).toEqual([
      "patient typed clinical",
    ]);
  });

  it("leaves the three clinical labels the rule contradicts out of the dangerous-direction line", () => {
    const run = copy();
    const noisy = study(run, "NCT04385368");
    noisy.diagnostics.typeErrors.push(
      { id: "L15", labelled: "clinical", predicted: "patient", quote: "wedge resection" },
      { id: "L50", labelled: "clinical", predicted: "patient", quote: "transfusion" },
    );
    // R2 has one, NCT03433469's.
    expect(line(run, "clinical typed patient").after).toBe(1);

    noisy.diagnostics.typeErrors.push(
      { id: "L52", labelled: "clinical", predicted: "patient", quote: "intercurrent illness" },
      { id: "L53", labelled: "clinical", predicted: "patient", quote: "another malignancy" },
    );
    expect(line(run, "clinical typed patient")).toMatchObject({ after: 3, pass: false });
  });

  it("holds a guardrail to its before, with the slack", () => {
    // Held back, NCT03433469: 48 matched of 49 predictions.
    const within = copy();
    study(within, "NCT03433469").metrics.predictions += 1;
    expect(line(within, "precision", "held").pass).toBe(true);

    const past = copy();
    study(past, "NCT03433469").metrics.predictions += 3;
    expect(line(past, "precision", "held").pass).toBe(false);
  });

  it("holds the held-back studies to five patient-typed-clinical", () => {
    const run = copy();
    const d = study(run, "NCT03433469").diagnostics;
    d.typeErrors = d.typeErrors.filter(
      (e) => !(e.labelled === "patient" && e.predicted === "clinical"),
    );
    // 7 held back, less NCT03433469's 5.
    expect(line(run, "patient typed clinical", "held")).toMatchObject({ after: 2, pass: true });
  });
});

describe("samples of NCT04385368 (Gate 1a)", () => {
  /** A copy whose NCT04385368 has `n` `patient`→`clinical`. */
  function noisyWith(n: number): EvalRun {
    const run = copy();
    const d = study(run, "NCT04385368").diagnostics;
    const others = d.typeErrors.filter(
      (e) => !(e.labelled === "patient" && e.predicted === "clinical"),
    );
    d.typeErrors = [
      ...others,
      ...Array.from({ length: n }, (_, i) => ({
        id: `X${i}`,
        labelled: "patient",
        predicted: "clinical",
        quote: "x",
      })),
    ];
    return run;
  }

  it("counts NCT04385368 by the median of its samples, and reports each", () => {
    // Dev: NCT00077350 has 6. Samples 2, 13 and 3 give a median of 3.
    const lines = barLines(BASE, noisyWith(2), "dev", undefined, [noisyWith(13), noisyWith(3)]);
    expect(lines[0]).toMatchObject({ after: 9, pass: false });
    expect(lines.filter((l) => l.measure.includes("sample")).map((l) => l.after)).toEqual([
      2, 13, 3,
    ]);
  });

  it("gives an even count the mean of the middle two", () => {
    expect(median([4, 1, 9, 2])).toBe(3);
    expect(median([5])).toBe(5);
  });
});

describe("the noise check", () => {
  const parse = (types: string[]): ParsedCriteria =>
    ({
      nctId: "NCT0",
      criteria: types.map((type, i) => ({
        id: `c${i}`,
        type,
        polarity: "inclusion",
        text: `criterion ${i}`,
      })),
    }) as unknown as ParsedCriteria;

  it("calls identical parses identical", () => {
    expect(
      compareParses("NCT0", parse(["patient", "clinical"]), parse(["patient", "clinical"])),
    ).toMatchObject({ identical: true, differences: [] });
  });

  it("names a criterion whose type changed", () => {
    const r = compareParses("NCT0", parse(["patient", "clinical"]), parse(["patient", "patient"]));
    expect(r.identical).toBe(false);
    expect(r.differences).toEqual([
      "- c1 | clinical | inclusion | criterion 1",
      "+ c1 | patient | inclusion | criterion 1",
    ]);
  });
});

describe("the noise widening on a one-study sample", () => {
  // A sample result holds NCT04385368 alone. NCT04316364, absent from it, must
  // not read as a change from its before to nothing.
  it("widens by what the shared study changed, and nothing for the absent one", () => {
    const sample = copy();
    sample.studies = sample.studies.filter((st) => st.nctId === "NCT04385368");
    expect(Object.values(noiseWidening(BASE, sample)).every((v) => v === 0)).toBe(true);
  });
});

describe("the overlap list", () => {
  it("finds a run of five words the prompt shares with a protocol", () => {
    const found = overlap("Rules: alpha beta gamma delta epsilon, then more.", [
      { nctId: "NCT1", text: "Prose with Alpha, beta gamma delta epsilon inside it." },
      { nctId: "NCT2", text: "Nothing in common here at all, none." },
    ]);
    expect(found).toEqual([{ phrase: "alpha beta gamma delta epsilon", studies: ["NCT1"] }]);
  });
});
