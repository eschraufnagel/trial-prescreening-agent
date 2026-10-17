import { describe, expect, it } from "vitest";
import { HEADER_NOTE, hostedNote, reviewModel } from "../../src/web/review.js";
import { REVIEW } from "../fixtures/review.js";

/**
 * Slice 0017: a review made on a hosted model says so, and that the agent was
 * measured on the local model only. `tests/web/review.test.ts` walks every
 * note for verdict words, this one included, unedited.
 */
describe("the hosted note", () => {
  const onHaiku = {
    ...REVIEW,
    result: {
      ...REVIEW.result,
      run: { ...REVIEW.result.run, adapter: "anthropic", model: "claude-haiku-4-5" },
    },
  };

  it("appears for a screening made on a hosted provider", () => {
    expect(reviewModel(onHaiku).frame.notes).toEqual([
      HEADER_NOTE,
      "Made with Anthropic · claude-haiku-4-5. The agent was measured on the local model only.",
    ]);
    expect(hostedNote("xAI", "grok-4.3")).toMatch(/^Made with xAI · grok-4\.3\./);
  });

  it("doesn't appear for the local model or the scripted agent", () => {
    for (const adapter of ["omlx", "fake"]) {
      const run = { ...REVIEW.result.run, adapter };
      const notes = reviewModel({ ...REVIEW, result: { ...REVIEW.result, run } }).frame.notes;
      expect(notes.some((n) => n.startsWith("Made with"))).toBe(false);
    }
  });
});
