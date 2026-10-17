import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parserWorkload, parserWorkloadFor } from "../../evals/estimate.js";
import { readTrialFile } from "../../scripts/lib/trial-file.js";
import { getTrial } from "../../src/trials/index.js";
import { GATE_RECORD } from "../fixtures/gate-trial.js";

/** `parse:criteria --trial-file` (slice 0015). */
describe("readTrialFile", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it("reads the trial out of an app record", () => {
    const trial = readTrialFile(GATE_RECORD);

    expect(trial.nctId).toBe("NCT06090266");
    expect(trial.eligibility.criteriaText.length).toBeGreaterThan(10_000);
  });

  it("reads a trimmed study as itself", () => {
    const path = fileURLToPath(new URL("../../data/trials/NCT00077350.json", import.meta.url));

    expect(readTrialFile(path)).toEqual(getTrial("NCT00077350"));
  });

  it("names the file when it holds no trial", () => {
    const scratch = mkdtempSync(join(tmpdir(), "trial-file-"));
    dir = scratch;
    const path = join(scratch, "not-a-trial.json");
    writeFileSync(path, JSON.stringify({ trial: { nctId: "NCT00000001" } }));

    expect(() => readTrialFile(path)).toThrow(path);
    expect(() => readTrialFile(join(scratch, "missing.json"))).toThrow("missing.json");
  });
});

describe("parserWorkloadFor", () => {
  it("estimates a trial in hand as parserWorkload does a pinned one", () => {
    expect(parserWorkloadFor([getTrial("NCT04316364")])).toEqual(parserWorkload(["NCT04316364"]));
  });
});
