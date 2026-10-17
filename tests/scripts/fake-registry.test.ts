import { describe, expect, it } from "vitest";
import { FAKE_ONLY, FAKE_STUDY, fakeFetchStudy } from "../../scripts/app/fake-registry.js";

describe("fake mode's registry", () => {
  it("trims its one invented study as a real response would be", async () => {
    const trial = await fakeFetchStudy(FAKE_STUDY);
    expect(trial.nctId).toBe(FAKE_STUDY);
    expect(trial.briefTitle).toMatch(/^Invented study/);
    expect(trial.conditions).toEqual(["Non-small cell lung cancer"]);
  });

  it("refuses any other study, without the network", async () => {
    await expect(fakeFetchStudy("NCT99999999")).rejects.toThrow(FAKE_ONLY);
    await expect(fakeFetchStudy("../registry/NCT00000000")).rejects.toThrow(FAKE_ONLY);
  });
});
