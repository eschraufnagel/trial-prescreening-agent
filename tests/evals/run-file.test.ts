import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextRunFile } from "../../evals/run-file.js";
import { monthStamp } from "../../src/models/index.js";

/** Committed runs are numbered, and dated to the month, never the day or time. */
describe("run files", () => {
  it("numbers the first run in a folder 01", () => {
    const dir = mkdtempSync(join(tmpdir(), "runs-"));
    expect(nextRunFile(dir, "73c3b301c4a9")).toBe("01-73c3b301c4a9.json");
  });

  it("takes the number after the highest, whatever the prompt, and ignores other files", () => {
    const dir = mkdtempSync(join(tmpdir(), "runs-"));
    for (const name of ["01-73c3b301c4a9.json", "09-e1e694b399d4.json", "notes.md", "review"]) {
      writeFileSync(join(dir, name), "");
    }
    expect(nextRunFile(dir, "e1e694b399d4")).toBe("10-e1e694b399d4.json");
  });

  it("dates a record to its month", () => {
    expect(monthStamp(new Date(Date.UTC(2000, 1, 4, 14, 14, 2)))).toBe("2000-02");
    expect(monthStamp()).toMatch(/^\d{4}-\d{2}$/);
  });
});
