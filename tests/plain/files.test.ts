import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadLabelSet } from "../../evals/cases/load.js";
import { fromLabels } from "../../evals/screening-input.js";
import { DEFAULT_PLAIN_DIR, displayFor, loadPlainFile, textSha } from "../../src/plain/index.js";

/**
 * Every committed renderings file is usable as the page will use it (spec
 * §4.3, §10): it loads, records how it was made, covers every criterion of its
 * study from that criterion's current wording, and gives each one a checked
 * state.
 */

const files = readdirSync(DEFAULT_PLAIN_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

describe("committed renderings", () => {
  it("exist", () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  for (const nctId of files) {
    it(`${nctId}: covers every criterion from its current wording, and records its run`, () => {
      const file = loadPlainFile(nctId);
      const criteria = fromLabels(loadLabelSet(nctId));
      expect(file?.renderings.map((r) => r.criterionId)).toEqual(criteria.map((c) => c.id));
      for (const c of criteria) {
        const rendering = file?.renderings.find((r) => r.criterionId === c.id);
        expect(rendering?.textSha, `${c.id} is stale`).toBe(textSha(c.text));
      }
      expect(file?.run).toMatchObject({ temperature: 0, promptVersion: expect.any(String) });
      expect(file?.run.seed).not.toBeNull();
    });

    it(`${nctId}: gives every criterion a checked state`, () => {
      const criteria = fromLabels(loadLabelSet(nctId));
      const states = Object.values(displayFor(criteria, loadPlainFile(nctId))).map((d) => d.state);
      expect(states.filter((s) => s !== "shown" && s !== "failed")).toEqual([]);
    });
  }
});
