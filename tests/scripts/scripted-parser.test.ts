import { describe, expect, it } from "vitest";
import { FAKE_STUDY, fakeFetchStudy } from "../../scripts/app/fake-registry.js";
import { PARSE_MS, scriptedParser } from "../../scripts/app/scripted-parser.js";
import { parseCriteria } from "../../src/criteria/index.js";
import { FakeModelAdapter } from "../../src/models/index.js";

/**
 * The scripted parser through the real `parseCriteria`, on fake mode's
 * invented study. If the parser's prompt layout changes, this fails rather
 * than fake mode quietly parsing nothing.
 */
describe("the scripted parser", () => {
  it("gives the invented study three inclusion and two exclusion criteria, all located", async () => {
    const trial = await fakeFetchStudy(FAKE_STUDY);
    const respond = (request: Parameters<typeof scriptedParser>[0]) => ({
      ...scriptedParser(request),
      delayMs: 0,
    });
    const parsed = await parseCriteria(trial, new FakeModelAdapter([], { respond }));

    expect(parsed.rejected).toEqual([]);
    expect(parsed.criteria.map((c) => [c.polarity, c.text])).toEqual([
      ["inclusion", "Aged 18 or older"],
      ["inclusion", "Diagnosed with lung cancer"],
      ["inclusion", "Able to swallow tablets"],
      ["exclusion", "Pregnant or breastfeeding"],
      ["exclusion", "Taking part in another drug study"],
    ]);
  });

  it("holds its answer back so the screen shows the trial parsing", () => {
    const response = scriptedParser({
      system: "",
      user: "Trial: NCT00000000\n\nEligibility criteria:\n\n* Aged 18 or older",
      responseFormat: "json",
      maxOutputTokens: 1,
    });
    expect(response.delayMs).toBe(PARSE_MS);
  });
});
