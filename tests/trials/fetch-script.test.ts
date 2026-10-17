import { describe, expect, it } from "vitest";
import { changedFields } from "../../scripts/fetch-trials.js";

/**
 * The fetch script's network path is not tested — `CLAUDE.md` forbids network
 * calls in `tests/`, and mocking `fetch` would test the mock. Its pure parts are
 * fair game, and this one had a bug: a corrupt fixture already on disk crashed
 * the run with an unhandled SyntaxError instead of the designed clean failure.
 */
describe("changedFields", () => {
  const a = JSON.stringify({ nctId: "NCT1", overallStatus: "RECRUITING" }, null, 2);
  const b = JSON.stringify({ nctId: "NCT1", overallStatus: "COMPLETED" }, null, 2);

  it("names the fields that differ", () => {
    expect(changedFields(a, b)).toEqual(["overallStatus"]);
  });

  it("returns nothing when the two are identical", () => {
    expect(changedFields(a, a)).toEqual([]);
  });

  it("does not throw when the file already on disk is not valid JSON", () => {
    expect(() => changedFields("{ corrupt", b)).not.toThrow();
    expect(changedFields("{ corrupt", b).join(" ")).toMatch(/not valid JSON/);
  });
});
