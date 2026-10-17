import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { locateQuote, normalize, readCriteriaEnvelope } from "../../src/criteria/index.js";
import { getTrial } from "../../src/trials/index.js";

/**
 * Post-processing checked against output the model actually produced.
 *
 * Every other test in this directory feeds the parser a response written by
 * hand, which tests it against what we imagine a model says. These fixtures
 * were recorded from a real run — `npm run parse:criteria -- <id> --record
 * tests/criteria/fixtures/model-responses` — so they catch the case where our
 * idea of the output shape and the model's differ.
 *
 * Still deterministic: no model is called here. The fixtures are data.
 *
 * They are model output about published protocols and contain no patient data.
 */
const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/model-responses/", import.meta.url));

/** Recorded studies: the shortest numbered block, and one with compound sentences. */
const RECORDED = ["NCT07229729", "NCT00106626"] as const;

interface Fixture {
  nctId: string;
  model: string;
  quantization: string;
  temperature: number;
  seed: number | null;
  promptVersion: string;
  finishReason: string;
  response: unknown;
}

function load(nctId: string): Fixture {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${nctId}.json`, "utf8")) as Fixture;
}

describe.each(RECORDED)("recorded response for %s", (nctId) => {
  const fixture = load(nctId);
  const trial = getTrial(nctId);
  const normalized = normalize(trial.eligibility.criteriaText);

  // CLAUDE.md: a result without model, quantization, temperature and seed is
  // not a result. A fixture that has lost them cannot be reproduced.
  it("records what produced it", () => {
    expect(fixture.model).toBe("Qwen3.6-35B-A3B-MLX-8bit");
    expect(fixture.quantization).toBe("8bit");
    expect(fixture.temperature).toBe(0);
    expect(fixture.seed).toBe(20260921);
    expect(fixture.promptVersion).toMatch(/^[0-9a-f]{12}$/);
    expect(fixture.finishReason).toBe("stop");
  });

  it("is read without rejection by the validator", () => {
    const { valid, rejected } = readCriteriaEnvelope(fixture.response, nctId);

    expect(rejected).toEqual([]);
    expect(valid.length).toBeGreaterThan(5);
  });

  // The assertion that would have caught a schema drifting away from what the
  // model emits: every quote it returned still resolves to real source text.
  it("has every quote resolve to a span of the registry's own text", () => {
    const { valid } = readCriteriaEnvelope(fixture.response, nctId);
    let cursor = 0;

    for (const entry of valid) {
      const found = locateQuote(normalized, entry.quote, cursor);

      expect(found, `quote not found: ${entry.quote.slice(0, 60)}`).toBeDefined();
      expect(trial.eligibility.criteriaText.slice(found?.span.start, found?.span.end)).toBe(
        found?.span.text,
      );
      cursor = found?.nextFrom ?? cursor;
    }
  });

  it("classifies every criterion as one of the four types", () => {
    const { valid } = readCriteriaEnvelope(fixture.response, nctId);

    for (const entry of valid) {
      expect(["patient", "clinical", "definitional", "protocol"]).toContain(entry.type);
      expect(["inclusion", "exclusion"]).toContain(entry.polarity);
    }
  });

  it("finds both inclusion and exclusion criteria", () => {
    const { valid } = readCriteriaEnvelope(fixture.response, nctId);
    const polarities = new Set(valid.map((entry) => entry.polarity));

    expect(polarities).toEqual(new Set(["inclusion", "exclusion"]));
  });
});

/**
 * NCT00106626's opening sentence carries three requirements — age, diagnosis,
 * and no more than two prior systemic therapies — and the prompt asks for
 * those to be split. The first version of the parser rejected all but one as
 * duplicates, discarding five real criteria from this study alone. This is
 * that regression, pinned against the model output that exposed it.
 */
describe("compound sentences in NCT00106626", () => {
  const fixture = load("NCT00106626");

  it("returns several criteria quoting the same sentence", () => {
    const { valid } = readCriteriaEnvelope(fixture.response, "NCT00106626");
    const counts = new Map<string, number>();

    for (const entry of valid) {
      counts.set(entry.quote, (counts.get(entry.quote) ?? 0) + 1);
    }

    const shared = [...counts.values()].filter((count) => count > 1);
    expect(shared.length).toBeGreaterThan(0);
  });

  it("states each of those as a distinct requirement", () => {
    const { valid } = readCriteriaEnvelope(fixture.response, "NCT00106626");
    const statements = valid.map((entry) => entry.text.trim().toLowerCase());

    expect(new Set(statements).size).toBe(statements.length);
  });
});
