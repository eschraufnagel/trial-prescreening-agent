import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadLabelSet } from "../../evals/cases/load.js";
import { loadVignettes } from "../../evals/cases/vignettes.js";
import { referenceCounts, screeningWorkloads } from "../../evals/screening-estimate.js";
import { fromLabels } from "../../evals/screening-input.js";
import { EVAL_RUN } from "../../scripts/app/eval-run.js";
import { FakeModelAdapter, tokensFor } from "../../src/models/index.js";
import { read } from "../../src/screening/calls.js";
import {
  buildReadPrompt,
  READ_CONTEXT_TURNS,
  READ_SYSTEM_PROMPT,
} from "../../src/screening/prompts.js";
import type { Turn } from "../../src/screening/types.js";

/** The estimate printed before a paid run has to describe the agent that would run. */
describe("the screening estimate", () => {
  const vignette = loadVignettes().find((v) => v.id === "NCT04316364-v1");
  if (vignette === undefined) {
    throw new Error("NCT04316364-v1 is missing");
  }
  const agent = screeningWorkloads({ vignettes: [vignette], sources: ["labels"] }).agent;

  it("caps an agent call's output at what the read call actually asks for", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: { readings: [] } }]);
    await read(adapter, {
      transcript: [],
      message: "No.",
      askedAbout: null,
      open: [],
      answered: [],
    });
    expect(agent.perCallCeiling.outputTokens).toBe(adapter.requests[0]?.maxOutputTokens);
  });

  it("counts calls from the run the review serves", () => {
    const served = fileURLToPath(
      new URL(`../../evals/results/screening/${EVAL_RUN}`, import.meta.url),
    );
    expect(referenceCounts()).toEqual(referenceCounts(served));
  });

  it("sizes the largest read prompt with what was said shown under every criterion", () => {
    const criteria = fromLabels(loadLabelSet(vignette.nctId));
    const reply = "x".repeat(150);
    const turns: Turn[] = Array.from({ length: READ_CONTEXT_TURNS }, (_, index) => ({
      index,
      speaker: index % 2 === 0 ? "agent" : "participant",
      kind: index % 2 === 0 ? "question" : "reply",
      text: reply,
    }));
    const everySaid = buildReadPrompt({
      transcript: turns,
      message: reply,
      askedAbout: criteria[0]?.id ?? null,
      open: criteria,
      answered: [],
      saidSoFar: Object.fromEntries(
        criteria.map((c) => [c.id, { reading: "does-not-hold", quote: reply }]),
      ),
    });
    expect(agent.perCallCeiling.inputTokens).toBeGreaterThanOrEqual(
      tokensFor(READ_SYSTEM_PROMPT) + tokensFor(everySaid),
    );
  });
});
