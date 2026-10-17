import { describe, expect, it } from "vitest";
import { reportOn, withRendering, workFor } from "../../scripts/render-plain.js";
import type { PlainFile } from "../../src/plain/index.js";
import { textSha } from "../../src/plain/index.js";

const CRITERIA = [
  { id: "L1", text: "Pregnant" },
  { id: "L2", text: "Age ≥ 18 years" },
  { id: "L3", text: "Brain metastases" },
];

const RUN = {
  model: "Qwen3.6-35B-A3B-MLX-8bit",
  quantization: "8bit",
  temperature: 0,
  seed: 20260921,
  adapter: "omlx",
  thinking: "off" as const,
  promptVersion: "abcdef123456",
};

function file(renderings: PlainFile["renderings"], run = RUN): PlainFile {
  return {
    nctId: "NCT00000001",
    source: "labels",
    run: { ...run, timestamp: "2000-01-23T00:00:00.000Z" },
    renderings,
  };
}

/** A rendering the check passes: the criterion's own words, reworded. */
const done = (id: string, text: string, plain = `Is: ${text}.`) => ({
  criterionId: id,
  textSha: textSha(text),
  attempts: [{ plain }],
});

describe("workFor", () => {
  it("renders every criterion for a study with no file", () => {
    expect(workFor(CRITERIA, undefined, RUN, false)).toEqual({
      render: ["L1", "L2", "L3"],
      retry: [],
      fresh: true,
    });
  });

  it("resumes: skips what is rendered from the current wording, redoes what is stale", () => {
    const existing = file([done("L1", "Pregnant"), done("L2", "Age >= 18")]);
    expect(workFor(CRITERIA, existing, RUN, false)).toEqual({
      render: ["L2", "L3"],
      retry: [],
      fresh: false,
    });
  });

  it("retries a refused first attempt once, and never a second time", () => {
    const existing = file([
      { criterionId: "L1", textSha: textSha("Pregnant"), attempts: [{ plain: null }] },
      done("L2", "Age \u2265 18 years", "Is an adult."),
      {
        ...done("L3", "Brain metastases", "Has cancer."),
        attempts: [{ plain: "Has cancer." }, { plain: "Has cancer in the lungs." }],
      },
    ]);
    expect(workFor(CRITERIA, existing, RUN, false)).toEqual({
      render: [],
      retry: ["L1", "L2"],
      fresh: false,
    });
  });

  it("refuses to add to a file made with another prompt or other settings", () => {
    const existing = file([done("L1", "Pregnant")], { ...RUN, promptVersion: "000000000000" });
    const work = workFor(CRITERIA, existing, RUN, false);
    expect(work).toEqual({
      refuse: expect.stringMatching(/promptVersion 000000000000 → abcdef123456.*--force/),
    });
    const other = file([done("L1", "Pregnant")], { ...RUN, temperature: 0.7 });
    expect(workFor(CRITERIA, other, RUN, false)).toHaveProperty("refuse");
  });

  it("starts the study again with --force", () => {
    const existing = file([done("L1", "Pregnant")], { ...RUN, promptVersion: "000000000000" });
    expect(workFor(CRITERIA, existing, RUN, true)).toEqual({
      render: ["L1", "L2", "L3"],
      retry: [],
      fresh: true,
    });
  });
});

describe("withRendering", () => {
  it("keeps renderings in the criteria's order and replaces one already there", () => {
    let f = file([]);
    f = withRendering(f, CRITERIA, done("L3", "Brain metastases"));
    f = withRendering(f, CRITERIA, done("L1", "Pregnant"));
    f = withRendering(f, CRITERIA, {
      ...done("L3", "Brain metastases"),
      attempts: [{ plain: "new" }],
    });
    expect(f.renderings.map((r) => [r.criterionId, r.attempts[0]?.plain])).toEqual([
      ["L1", "Is: Pregnant."],
      ["L3", "new"],
    ]);
  });
});

describe("reportOn", () => {
  it("gives the check's problems as a person reads them, for the record and the retry", () => {
    expect(reportOn("Age \u2265 18 years", { plain: "Is an adult." })).toEqual([
      "number missing: 18 years",
    ]);
    expect(reportOn("Pregnant", { plain: "Is pregnant." })).toEqual([]);
  });
});
