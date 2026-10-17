import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fetchStudy, StudyNotFoundError } from "../../src/trials/registry.js";
import { TrialFixtureError } from "../../src/trials/types.js";

/**
 * `fetchStudy` with a fetch passed in, so nothing leaves the machine. The
 * response is the committed sample `trim.test.ts` reads.
 */

const sample = readFileSync(
  fileURLToPath(new URL("./fixtures/study-NCT00106626.json", import.meta.url)),
  "utf8",
);

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function answering(response: () => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response();
  };
  return { fetch: fake as typeof fetch, calls };
}

describe("fetchStudy", () => {
  it("asks ClinicalTrials.gov for the study by ID and trims what comes back", async () => {
    const { fetch, calls } = answering(() => new Response(sample, { status: 200 }));
    const trial = await fetchStudy("NCT00106626", fetch);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://clinicaltrials.gov/api/v2/studies/NCT00106626?format=json");
    expect(calls[0]?.init?.headers).toEqual({ accept: "application/json" });
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(trial.nctId).toBe("NCT00106626");
    expect(trial.eligibility.criteriaText.length).toBeGreaterThan(0);
    expect(JSON.stringify(trial)).not.toMatch(/contactsLocationsModule/);
  });

  it("says when the registry has no such study", async () => {
    const { fetch } = answering(() => new Response("{}", { status: 404 }));
    await expect(fetchStudy("NCT09999999", fetch)).rejects.toThrow(StudyNotFoundError);
    await expect(fetchStudy("NCT09999999", fetch)).rejects.toThrow(
      "ClinicalTrials.gov has no study NCT09999999.",
    );
  });

  it("says when the registry answers with another error", async () => {
    const { fetch } = answering(() => new Response("", { status: 503 }));
    await expect(fetchStudy("NCT00106626", fetch)).rejects.toThrow(
      "ClinicalTrials.gov answered HTTP 503.",
    );
  });

  it("says when the registry can't be reached", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof globalThis.fetch;
    await expect(fetchStudy("NCT00106626", fetch)).rejects.toThrow(
      "Couldn't reach ClinicalTrials.gov (fetch failed).",
    );
  });

  it("says when the body isn't JSON", async () => {
    const { fetch } = answering(() => new Response("<html>", { status: 200 }));
    await expect(fetchStudy("NCT00106626", fetch)).rejects.toThrow("isn't JSON");
  });

  it("names every field trimming can't read", async () => {
    const { fetch } = answering(() => new Response('{"protocolSection":{}}', { status: 200 }));
    await expect(fetchStudy("NCT00106626", fetch)).rejects.toThrow(TrialFixtureError);
  });

  it("refuses a malformed ID without fetching", async () => {
    const { fetch, calls } = answering(() => new Response(sample));
    await expect(fetchStudy("NCT1/../../x", fetch)).rejects.toThrow("Not an NCT ID");
    expect(calls).toHaveLength(0);
  });
});
