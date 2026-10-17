import { describe, expect, it } from "vitest";
import { loadLabelSets } from "../../evals/cases/load.js";
import { loadVignettes } from "../../evals/cases/vignettes.js";
import { setWarnings } from "../../scripts/check-vignettes.js";

/**
 * Every committed vignette loads, and the set has the shape spec §8.1 asks for.
 *
 * Loading is the real check: `validateVignette` refuses a vignette with a
 * missing patient fact, an expected outcome on a clinical fact, or labels that
 * changed underneath it. This file makes that refusal part of `npm test`, so a
 * label edit that invalidates a vignette fails on the commit that makes it.
 */
const vignettes = loadVignettes();
const scored = vignettes.filter((v) => !v.dev);
const labelled = loadLabelSets().map((l) => l.nctId);

describe("committed vignettes", () => {
  it("covers every labelled study with three scored vignettes", () => {
    for (const nctId of labelled) {
      expect(
        scored.filter((v) => v.nctId === nctId),
        nctId,
      ).toHaveLength(3);
    }
    expect(scored).toHaveLength(labelled.length * 3);
  });

  it("makes each behavior primary in at least two scored vignettes", () => {
    expect(setWarnings(vignettes)).toEqual([]);
  });

  // The ordering rule from the intent: vignettes before the agent's prompts.
  it("records that no scored vignette was drafted after seeing the agent's prompts", () => {
    expect(scored.filter((v) => v.provenance.sawAgentPrompt)).toEqual([]);
  });

  it("gives every vignette at least one fact that tests abstention", () => {
    const passive = scored.filter(
      (v) =>
        !v.facts.some(
          (f) =>
            f.declines === true ||
            f.laterSays !== undefined ||
            f.expected === "defer" ||
            f.expected === "unresolved",
        ),
    );
    expect(passive.map((v) => v.id)).toEqual([]);
  });

  // Abstention is only measurable against facts that can be settled.
  it("keeps settleable facts the majority, so abstention can be measured", () => {
    for (const v of scored) {
      const patient = v.facts.filter((f) => f.expected !== undefined);
      const settleable = patient.filter(
        (f) => f.expected === "holds" || f.expected === "does-not-hold",
      );
      expect(settleable.length / patient.length, v.id).toBeGreaterThan(0.5);
    }
  });
});
