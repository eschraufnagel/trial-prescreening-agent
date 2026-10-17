import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PlainFile } from "../../src/plain/index.js";
import { displayFor, loadPlainFile, PlainError, textSha } from "../../src/plain/index.js";

const CRITERIA = [
  { id: "L1", text: "Pregnant" },
  { id: "L2", text: "Age ≥ 18 years" },
  { id: "L3", text: "Brain metastases" },
  { id: "L4", text: "Known HIV infection" },
];

function file(overrides: Partial<PlainFile> = {}): PlainFile {
  return {
    nctId: "NCT00000001",
    source: "labels",
    run: {
      model: "fake",
      quantization: "none",
      temperature: 0,
      seed: 0,
      adapter: "fake",
      promptVersion: "abcdef123456",
      timestamp: "2000-01-23T00:00:00.000Z",
    },
    renderings: [
      { criterionId: "L1", textSha: textSha("Pregnant"), attempts: [{ plain: "Is pregnant." }] },
      // Made from wording the criterion no longer has.
      {
        criterionId: "L2",
        textSha: textSha("Age >= 18"),
        attempts: [{ plain: "Is 18 or older." }],
      },
      // The model's reply held no rendering.
      {
        criterionId: "L4",
        textSha: textSha("Known HIV infection"),
        attempts: [{ plain: null, reportAtGeneration: ["no rendering in {}"] }],
      },
    ],
    ...overrides,
  };
}

describe("displayFor", () => {
  it("gives every criterion a state, checked as the check is now", () => {
    expect(displayFor(CRITERIA, file())).toEqual({
      L1: { state: "shown", text: "Is pregnant.", attempt: 1 },
      L2: { state: "stale" },
      L3: { state: "missing" },
      L4: { state: "failed", problems: ["no rendering"] },
    });
  });

  it("shows a retry that passed, and says so", () => {
    const retried = file({
      renderings: [
        {
          criterionId: "L4",
          textSha: textSha("Known HIV infection"),
          attempts: [{ plain: "Has an HIV infection." }, { plain: "Has a known HIV infection." }],
        },
      ],
    });
    expect(displayFor(CRITERIA, retried)["L4"]).toEqual({
      state: "shown",
      text: "Has a known HIV infection.",
      attempt: 2,
    });
  });

  it("refuses when no attempt passes, with the last attempt's problems", () => {
    const refused = file({
      renderings: [
        {
          criterionId: "L4",
          textSha: textSha("Known HIV infection"),
          attempts: [{ plain: "Has an infection." }, { plain: "Has an HIV infection." }],
        },
      ],
    });
    expect(displayFor(CRITERIA, refused)["L4"]).toEqual({
      state: "failed",
      problems: ["scope word missing: known"],
    });
  });

  it("shows nothing but missing when the study has no renderings", () => {
    expect(Object.values(displayFor(CRITERIA, undefined))).toEqual(
      CRITERIA.map(() => ({ state: "missing" })),
    );
  });
});

describe("loadPlainFile", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function write(name: string, content: unknown): string {
    dir = mkdtempSync(join(tmpdir(), "prescreen-plain-"));
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(content));
    return dir;
  }

  it("reads a valid file", () => {
    const d = write("NCT00000001", file());
    expect(loadPlainFile("NCT00000001", d)).toEqual(file());
  });

  it("returns undefined for a study with no file", () => {
    const d = write("NCT00000001", file());
    expect(loadPlainFile("NCT00000002", d)).toBeUndefined();
  });

  it("refuses a file made for another study", () => {
    const d = write("NCT00000002", file());
    expect(() => loadPlainFile("NCT00000002", d)).toThrow(/nctId is "NCT00000001"/);
  });

  it("names every problem in a malformed file", () => {
    const d = write("NCT00000001", {
      ...file(),
      run: { model: "fake" },
      renderings: [
        { criterionId: "L1", textSha: "short", attempts: [] },
        { criterionId: "L1", textSha: textSha("x"), attempts: [{ plain: 3 }] },
      ],
    });
    let error: unknown;
    try {
      loadPlainFile("NCT00000001", d);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(PlainError);
    expect((error as PlainError).problems).toEqual([
      "run.quantization is missing",
      "run.adapter is missing",
      "run.promptVersion is missing",
      "run.timestamp is missing",
      "run.temperature is missing",
      "run.seed is missing",
      "renderings[0].textSha is not a sha-256 hex digest",
      "renderings[0].attempts must hold one or two attempts",
      "renderings[1]: L1 appears twice",
      "renderings[1].attempts[0].plain must be a string or null",
    ]);
  });

  it("refuses a file that is not JSON", () => {
    dir = mkdtempSync(join(tmpdir(), "prescreen-plain-"));
    writeFileSync(join(dir, "NCT00000001.json"), "{");
    expect(() => loadPlainFile("NCT00000001", dir)).toThrow(PlainError);
  });
});
