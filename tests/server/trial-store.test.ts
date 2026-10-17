import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AddedTrialRecord, RESTARTED_JOB, TrialStore } from "../../src/server/index.js";
import { ADDED_ID, addedTrial } from "../fixtures/added-trial.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prescreen-trials-"));
  dirs.push(dir);
  return dir;
}

function record(over: Partial<AddedTrialRecord> = {}): AddedTrialRecord {
  return {
    version: 1,
    nctId: ADDED_ID,
    state: "ready",
    trial: addedTrial(),
    parsed: null,
    problem: null,
    addedAt: "2000-02-03T10:00:00.000Z",
    updatedAt: "2000-02-03T10:00:00.000Z",
    ...over,
  };
}

describe("TrialStore", () => {
  it("keeps a record across instances, one file each, with no temporary file left", () => {
    const dir = tempDir();
    new TrialStore(dir).save(record());
    expect(new TrialStore(dir).list()).toEqual([record()]);
    expect(readdirSync(dir)).toEqual([`${ADDED_ID}.json`]);
  });

  it("returns nothing for a directory that doesn't exist yet", () => {
    expect(new TrialStore(join(tempDir(), "absent")).list()).toEqual([]);
  });

  it.each([
    "fetching",
    "parsing",
  ] as const)("brings a record left %s by a restart back failed, keeping what it had", (state) => {
    const dir = tempDir();
    new TrialStore(dir).save(record({ state }));
    expect(new TrialStore(dir).list()).toEqual([
      record({ state: "failed", problem: RESTARTED_JOB }),
    ]);
  });

  it("skips a corrupt file, another version, a mismatched name and anything else", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "NCT00000002.json"), "{ corrupt");
    writeFileSync(
      join(dir, "NCT00000003.json"),
      JSON.stringify(record({ nctId: "NCT00000003", version: 2 as 1 })),
    );
    writeFileSync(join(dir, "NCT00000004.json"), JSON.stringify(record()));
    writeFileSync(join(dir, "notes.txt"), "hello");
    expect(new TrialStore(dir).list()).toEqual([]);
  });

  it("removes a record, and removing one already gone is fine", () => {
    const dir = tempDir();
    const store = new TrialStore(dir);
    store.save(record());
    store.remove(ADDED_ID);
    store.remove(ADDED_ID);
    expect(store.list()).toEqual([]);
  });

  it("refuses an id that isn't an NCT ID before building a path", () => {
    const store = new TrialStore(tempDir());
    expect(() => store.remove("../escape")).toThrow("not an NCT ID");
    expect(() => store.save(record({ nctId: "NCT1/../../x" }))).toThrow("not an NCT ID");
  });
});
