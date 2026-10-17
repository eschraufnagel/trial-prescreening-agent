import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CORPUS_IDS } from "../../src/trials/corpus.js";
import { getTrial, loadTrials } from "../../src/trials/load.js";
import { TrialFixtureError } from "../../src/trials/types.js";

/**
 * Broken fixture directories are built per test rather than committed, so that
 * each failure mode is visible in the test that exercises it instead of hidden
 * in a file someone has to go and open.
 */
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function validTrial(nctId: string): Record<string, unknown> {
  return {
    nctId,
    briefTitle: "A study",
    officialTitle: null,
    overallStatus: "COMPLETED",
    phases: ["PHASE2"],
    conditions: ["Non-Small Cell Lung Cancer"],
    leadSponsor: "Somewhere",
    lastUpdatePostDate: "2025-01-01",
    eligibility: {
      criteriaText: "Inclusion Criteria:\n\n* Over 18",
      sex: "ALL",
      minimumAge: "18 Years",
      maximumAge: null,
      healthyVolunteers: false,
      stdAges: ["ADULT"],
    },
  };
}

/** A directory holding the whole pinned corpus, with optional per-study edits. */
function corpusDir(edits: Record<string, unknown | null> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "trials-"));
  created.push(dir);

  for (const nctId of CORPUS_IDS) {
    if (nctId in edits) {
      const replacement = edits[nctId];
      if (replacement === null) {
        continue; // deliberately missing
      }
      writeFileSync(join(dir, `${nctId}.json`), JSON.stringify(replacement, null, 2));
      continue;
    }
    writeFileSync(join(dir, `${nctId}.json`), JSON.stringify(validTrial(nctId), null, 2));
  }

  return dir;
}

describe("loadTrials", () => {
  it("loads every pinned study, in pinned-list order", () => {
    const trials = loadTrials(corpusDir());

    expect(trials).toHaveLength(CORPUS_IDS.length);
    // Order is pinned-list order, not directory order and not sorted by ID.
    expect(trials.map((t) => t.nctId)).toEqual([...CORPUS_IDS]);
    expect(trials.map((t) => t.nctId)).not.toEqual([...CORPUS_IDS].sort());
  });

  // R-15
  it("throws when the directory does not exist", () => {
    expect(() => loadTrials("/nonexistent/trials")).toThrow(TrialFixtureError);
    expect(() => loadTrials("/nonexistent/trials")).toThrow(/Cannot read trial directory/);
  });

  // R-15
  it("throws and names the file when a pinned fixture is missing", () => {
    const dir = corpusDir({ NCT00106626: null });

    expect(() => loadTrials(dir)).toThrow(TrialFixtureError);
    expect(() => loadTrials(dir)).toThrow(/NCT00106626\.json/);
  });

  // R-15: a fixture nothing reads is a corpus that disagrees with itself.
  it("throws when the directory holds a file not in the pinned list", () => {
    const dir = corpusDir();
    writeFileSync(join(dir, "NCT99999999.json"), JSON.stringify(validTrial("NCT99999999")));

    expect(() => loadTrials(dir)).toThrow(/NCT99999999\.json is not in the pinned corpus/);
  });

  // R-15
  it("throws and names the file when JSON is malformed", () => {
    const dir = corpusDir();
    writeFileSync(join(dir, "NCT00106626.json"), "{ not json");

    expect(() => loadTrials(dir)).toThrow(/Malformed JSON in .*NCT00106626\.json/);
  });

  // R-15
  it("throws when a required field is missing", () => {
    const broken = validTrial("NCT00106626");
    delete broken["leadSponsor"];
    const dir = corpusDir({ NCT00106626: broken });

    expect(() => loadTrials(dir)).toThrow(/leadSponsor is missing/);
  });

  // R-15
  it("throws when a field has the wrong type", () => {
    const broken = validTrial("NCT00106626");
    broken["phases"] = "PHASE2";
    const dir = corpusDir({ NCT00106626: broken });

    expect(() => loadTrials(dir)).toThrow(/phases is not an array/);
  });

  // R-15: undefined is a fault, because absent optionals are written as null.
  it("throws when a nullable field is absent rather than null", () => {
    const broken = validTrial("NCT00106626");
    delete broken["officialTitle"];
    const dir = corpusDir({ NCT00106626: broken });

    expect(() => loadTrials(dir)).toThrow(/officialTitle is not a string or null/);
  });

  // R-15
  it("throws when healthyVolunteers is neither boolean nor null", () => {
    const broken = validTrial("NCT00106626");
    (broken["eligibility"] as Record<string, unknown>)["healthyVolunteers"] = "false";
    const dir = corpusDir({ NCT00106626: broken });

    expect(() => loadTrials(dir)).toThrow(/healthyVolunteers is not a boolean or null/);
  });

  // R-15
  it("throws when the eligibility block is missing entirely", () => {
    const broken = validTrial("NCT00106626");
    delete broken["eligibility"];
    const dir = corpusDir({ NCT00106626: broken });

    expect(() => loadTrials(dir)).toThrow(/eligibility is missing or not an object/);
  });

  // R-15: otherwise a mis-copied file returns a study under the wrong ID.
  it("throws when a fixture's nctId does not match its filename", () => {
    const dir = corpusDir({ NCT00106626: validTrial("NCT04385368") });

    expect(() => loadTrials(dir)).toThrow(/file is named NCT00106626 but contains NCT04385368/);
  });

  // R-16
  it("reports every fault in a fixture at once", () => {
    const broken = validTrial("NCT00106626");
    delete broken["leadSponsor"];
    delete broken["briefTitle"];
    broken["conditions"] = 42;
    const dir = corpusDir({ NCT00106626: broken });

    try {
      loadTrials(dir);
      expect.unreachable("expected loadTrials to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TrialFixtureError);
      expect((error as TrialFixtureError).problems).toHaveLength(3);
    }
  });
});

describe("getTrial", () => {
  it("returns the requested study", () => {
    const trial = getTrial("NCT04385368", corpusDir());

    expect(trial.nctId).toBe("NCT04385368");
  });

  it("throws for an NCT ID that is not in the pinned corpus", () => {
    expect(() => getTrial("NCT00000000", corpusDir())).toThrow(/Unknown trial NCT00000000/);
  });

  it("throws when the pinned study has no fixture on disk", () => {
    const dir = corpusDir({ NCT00106626: null });

    expect(() => getTrial("NCT00106626", dir)).toThrow(/Missing trial fixture/);
  });
});
