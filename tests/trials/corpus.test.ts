import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORPUS, CORPUS_IDS } from "../../src/trials/corpus.js";
import { loadTrials } from "../../src/trials/load.js";

/**
 * Asserts the mechanically checkable parts of the corpus selection criteria.
 *
 * What this file cannot check is the part that matters most: whether the
 * formatting is genuinely awkward and whether a study is biomarker-*gated*
 * rather than merely biomarker-*mentioning*. Those are judgments, they live in
 * the rationale strings, and they are enforced by review. See spec section 10.4.
 * A green run here is not evidence that the corpus is strong.
 */
describe("corpus list", () => {
  it("pins twelve studies", () => {
    expect(CORPUS).toHaveLength(12);
  });

  it("has no duplicate NCT IDs", () => {
    expect(new Set(CORPUS_IDS).size).toBe(CORPUS.length);
  });

  it("uses well-formed NCT IDs", () => {
    for (const { nctId } of CORPUS) {
      expect(nctId).toMatch(/^NCT\d{8}$/);
    }
  });

  it("gives every study a rationale that says something", () => {
    for (const { nctId, rationale } of CORPUS) {
      expect(rationale.length, `${nctId} rationale`).toBeGreaterThan(40);
    }
  });
});

/**
 * These need the fixtures, which the fetch script writes in step 5. Until then
 * there is nothing to measure, so they are skipped rather than left failing —
 * a red suite at a review gate teaches people to ignore red suites.
 *
 * Step 5 removes this guard.
 */
const fixturesDir = fileURLToPath(new URL("../../data/trials", import.meta.url));
const haveFixtures = existsSync(fixturesDir);

describe.skipIf(!haveFixtures)("corpus content", () => {
  it("varies criteria length: at least two short blocks and two long ones", () => {
    const lengths = loadTrials().map((t) => t.eligibility.criteriaText.length);

    expect(lengths.filter((n) => n < 1500).length).toBeGreaterThanOrEqual(2);
    expect(lengths.filter((n) => n > 6000).length).toBeGreaterThanOrEqual(2);
  });

  it("varies phase: at least two each of phase 1, 2 and 3", () => {
    const trials = loadTrials();
    const count = (phase: string) => trials.filter((t) => t.phases.includes(phase)).length;

    expect(count("PHASE1")).toBeGreaterThanOrEqual(2);
    expect(count("PHASE2")).toBeGreaterThanOrEqual(2);
    expect(count("PHASE3")).toBeGreaterThanOrEqual(2);
  });

  it("is not concentrated in one sponsor's house style", () => {
    const perSponsor = new Map<string, number>();
    for (const trial of loadTrials()) {
      perSponsor.set(trial.leadSponsor, (perSponsor.get(trial.leadSponsor) ?? 0) + 1);
    }

    expect(Math.max(...perSponsor.values())).toBeLessThanOrEqual(4);
  });
});
