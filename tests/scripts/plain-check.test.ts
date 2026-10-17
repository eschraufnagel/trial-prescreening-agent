import { describe, expect, it } from "vitest";
import { checkRows, readingList, summarize } from "../../scripts/plain-check.js";
import type { PlainFile } from "../../src/plain/index.js";
import { textSha } from "../../src/plain/index.js";

const CRITERIA = [
  { id: "L1", text: "Pregnant" },
  { id: "L2", text: "Known HIV infection" },
  { id: "L3", text: "Age ≥ 18 years" },
  { id: "L4", text: "Brain metastases" },
];

const FILE: PlainFile = {
  nctId: "NCT00000001",
  source: "labels",
  run: {
    model: "fake",
    quantization: "none",
    temperature: 0,
    seed: 0,
    adapter: "fake",
    promptVersion: "abcdef123456",
    timestamp: "2000-01-23T00:00:00.000Z",
  },
  renderings: [
    { criterionId: "L1", textSha: textSha("Pregnant"), attempts: [{ plain: "Is pregnant." }] },
    {
      criterionId: "L2",
      textSha: textSha("Known HIV infection"),
      attempts: [{ plain: "Has an HIV infection." }, { plain: "Has a known HIV infection." }],
    },
    {
      criterionId: "L3",
      textSha: textSha("Age ≥ 18 years"),
      attempts: [{ plain: "Is an adult." }, { plain: "Is 18 years old." }],
    },
  ],
};

describe("plain:check", () => {
  const rows = checkRows(CRITERIA, FILE);

  it("counts first tries, retries and what is not shown", () => {
    expect(summarize(rows)).toMatchObject({
      criteria: 4,
      firstTry: 1,
      afterRetry: 1,
      notShown: 2,
      refusedFirst: { scope: 1, quantity: 1 },
      refusedFinal: { direction: 1 },
    });
  });

  it("measures the shown renderings against their criteria", () => {
    expect(summarize(rows).length).toEqual({
      plainMedian: "Has a known HIV infection.".length,
      plainLongest: "Has a known HIV infection.".length,
      protocolMedian: "Known HIV infection".length,
      protocolLongest: "Known HIV infection".length,
    });
  });

  it("lists the whole reading study, and retried renderings from every other", () => {
    expect(
      readingList([
        { nctId: "NCT00077350", rows: rows.slice(0, 2) },
        { nctId: "NCT00000001", rows },
      ]),
    ).toEqual([
      { nctId: "NCT00077350", id: "L1", why: "study" },
      { nctId: "NCT00077350", id: "L2", why: "retry" },
      { nctId: "NCT00000001", id: "L2", why: "retry" },
    ]);
  });
});
