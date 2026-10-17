import { describe, expect, it } from "vitest";
import {
  READING_SEED,
  readingSet,
  reserveSet,
  rowsToAnswer,
  sheetText,
  shuffled,
} from "../../scripts/review-sheet.js";
import { readingRun } from "../fixtures/eval-run.js";

describe("the reading sheet", () => {
  const run = readingRun();
  const set = shuffled(readingSet(run), READING_SEED);

  it("reads v1 and v3 of each labelled study, from labels, and holds back the unseen v2s", () => {
    expect(set.map((c) => c.id).sort()).toEqual(
      ["NCT00077350", "NCT03433469", "NCT04316364", "NCT04385368", "NCT06728852"].flatMap((n) => [
        `eval ${n}-v1-labels`,
        `eval ${n}-v3-labels`,
      ]),
    );
    expect(reserveSet(run).map((c) => c.id)).toEqual([
      "eval NCT03433469-v2-labels",
      "eval NCT04385368-v2-labels",
      "eval NCT06728852-v2-labels",
    ]);
  });

  it("puts them in the same shuffled order every time, not protocol order", () => {
    expect(shuffled(readingSet(run), READING_SEED).map((c) => c.id)).toEqual(set.map((c) => c.id));
    expect(set.map((c) => c.id)).not.toEqual(readingSet(run).map((c) => c.id));
    expect(shuffled([1, 2, 3, 4, 5], 1).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("lists exactly the settled rows, which is where every known wrong finding is", () => {
    for (const c of set) {
      const settled = c.result.findings
        .filter((f) => f.status === "holds" || f.status === "does-not-hold")
        .map((f) => f.criterionId);
      expect(rowsToAnswer(c).sort()).toEqual(settled.sort());
    }
  });

  it("gives the reader nothing to read a finding from: ids only", () => {
    const text = sheetText(set);
    expect(text).not.toMatch(
      /holds|does not|met|applies|correct|wrong|expected|grade|vignette says/i,
    );
    const rowLines = text.split("\n").filter((l) => l.startsWith("- L"));
    expect(rowLines.length).toBe(set.reduce((n, c) => n + rowsToAnswer(c).length, 0));
    expect(rowLines.every((l) => /^- L\d+ · answer: · where:$/.test(l))).toBe(true);
  });
});
