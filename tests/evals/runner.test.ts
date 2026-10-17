import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { cacheKey, parseFileName, runEval } from "../../evals/runner.js";
import { NORMALIZE_VERSION, parseIdentity } from "../../src/criteria/index.js";
import { BudgetedAdapter } from "../../src/models/budget.js";
import { catalogEntry, FakeModelAdapter, type ScriptedResponse } from "../../src/models/index.js";
import { getTrial } from "../../src/trials/index.js";

/**
 * The runner is exercised with a scripted adapter, so no model is called and
 * nothing here depends on model behaviour.
 *
 * The properties under test are the ones a 45-minute run that degrades and can
 * fail late actually needs: a parse is kept the moment it arrives, a late
 * failure does not cost the studies before it, and the result says what is
 * missing rather than quietly covering less than it appears to.
 */
const STUDY = "NCT00077350";

/** A prediction quoting text that genuinely occurs in the fixture. */
function predictionFor(quote: string): unknown {
  return {
    quote,
    text: quote.replace(/\\/g, ""),
    polarity: "inclusion",
    type: "clinical",
    confidence: 1,
  };
}

function parseResponse(...quotes: string[]): ScriptedResponse {
  return { kind: "json", content: { criteria: quotes.map(predictionFor) } };
}

/**
 * Quotes as they appear in *normalized* text, which is what the parser
 * locates against: the registry's `\>=` escaping is gone by then. A quote
 * carrying the raw escaping is correctly rejected as not occurring, which is
 * the parser working, not a test fixture worth forcing through.

 */
const REAL_QUOTES = [
  "Patients must have an ECOG performance status of 0 or 1",
  "Life expectancy greater than 3 months",
  "Bilirubin < 1.5 x upper limit of normal",
];

let resultsDir: string;

beforeEach(() => {
  resultsDir = mkdtempSync(join(tmpdir(), "eval-run-"));
});

function runFiles(): string[] {
  return readdirSync(resultsDir).filter((name) => name.endsWith(".json"));
}

function cachedParses(): string[] {
  try {
    return readdirSync(join(resultsDir, "parses"));
  } catch {
    return [];
  }
}

describe("runEval", () => {
  it("grades a study and records what produced the numbers", async () => {
    const adapter = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);

    const run = await runEval(adapter, { studies: [STUDY], resultsDir });

    expect(run.studies).toHaveLength(1);
    expect(run.studies[0]?.status).toBe("graded");
    expect(run.model).toBe("fake");
    expect(run.promptVersion).toMatch(/^[0-9a-f]{12}$/);
    expect(run.matcher.version).toBeDefined();
    expect(run.failed).toEqual([]);
  });

  // Slice 0011: the net's firing, the parse's identity and the reasoning mode
  // are on the record, not implied by missing fields.
  it("records quote counts, the parse identity and the reasoning mode", async () => {
    const adapter = new FakeModelAdapter([
      parseResponse(...REAL_QUOTES, "a quote that is nowhere in the protocol"),
    ]);

    const run = await runEval(adapter, { studies: [STUDY], resultsDir });

    expect(run.studies[0]?.quotes).toEqual({ rejected: 1, loose: 0 });
    expect(run.quotes).toEqual({ rejected: 1, loose: 0 });
    expect(run.parseIdentity).toBe(parseIdentity({}));
    expect(run.normalizeVersion).toBe(NORMALIZE_VERSION);
    expect(run.thinking).toBe("default");
    expect(run.dev).toBeUndefined();
  });

  it("caches a later sample beside the first, and names it in the run", async () => {
    const first = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);
    const second = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);

    await runEval(first, { studies: [STUDY], resultsDir });
    const run = await runEval(second, { studies: [STUDY], resultsDir, sample: 2 });

    expect(second.requests).toHaveLength(1);
    expect(run.sample).toBe(2);
    expect(run.parseIdentity).toBe(`${parseIdentity({})}-s2`);
    expect(readdirSync(join(resultsDir, "parses")).sort()).toEqual(
      [cacheKey(STUDY, first.descriptor), cacheKey(STUDY, first.descriptor, 2)].sort(),
    );
  });

  it("writes a dev run under dev/, with its parses in the shared cache", async () => {
    const adapter = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);

    const run = await runEval(adapter, { studies: [STUDY], resultsDir, dev: true });

    expect(run.dev).toBe(true);
    expect(runFiles()).toEqual([]);
    expect(readdirSync(join(resultsDir, "dev"))).toHaveLength(1);
    expect(readdirSync(join(resultsDir, "parses"))).toEqual([cacheKey(STUDY, adapter.descriptor)]);
  });

  it("writes the run to disk", async () => {
    const adapter = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);
    await runEval(adapter, { studies: [STUDY], resultsDir });

    expect(runFiles()).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(resultsDir, runFiles()[0] as string), "utf8"));
    expect(written.pooled.labels).toBeGreaterThan(0);
  });

  describe("the parse cache", () => {
    it("keeps a parse the moment it arrives", async () => {
      const adapter = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);
      await runEval(adapter, { studies: [STUDY], resultsDir });

      expect(cachedParses()).toHaveLength(1);
    });

    // The property that makes a 45-minute run survivable: a second run costs
    // nothing and cannot call the model again.
    it("reuses a cached parse rather than calling the model", async () => {
      const first = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);
      await runEval(first, { studies: [STUDY], resultsDir });

      // Scripted with nothing: any model call would reject.
      const second = new FakeModelAdapter([]);
      const run = await runEval(second, { studies: [STUDY], resultsDir });

      expect(second.requests).toHaveLength(0);
      expect(run.studies[0]?.parseSource).toBe("cache");
      expect(run.studies[0]?.status).toBe("graded");
    });

    it("calls the model again when asked to refresh", async () => {
      const first = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);
      await runEval(first, { studies: [STUDY], resultsDir });

      const second = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);
      const run = await runEval(second, { studies: [STUDY], resultsDir, refresh: true });

      expect(second.requests).toHaveLength(1);
      expect(run.studies[0]?.parseSource).toBe("model");
    });

    // A parse from a different prompt or seed is a different experiment, and
    // reusing one across that boundary would silently compare two things.
    it("keys the cache by model, prompt and seed", () => {
      const base = new FakeModelAdapter([]);
      const otherSeed = new FakeModelAdapter([], { descriptor: { seed: 999 } });
      const otherModel = new FakeModelAdapter([], { descriptor: { model: "other" } });

      expect(cacheKey(STUDY, base.descriptor)).not.toBe(cacheKey(STUDY, otherSeed.descriptor));
      expect(cacheKey(STUDY, base.descriptor)).not.toBe(cacheKey(STUDY, otherModel.descriptor));
      expect(cacheKey(STUDY, base.descriptor)).toBe(
        cacheKey(STUDY, new FakeModelAdapter([]).descriptor),
      );
    });

    // Slice 0011: reasoning mode is part of the experiment, so a parse made
    // with it off sits beside the default one instead of replacing it.
    it("keys a parse with reasoning off apart from the default", () => {
      const pinned = { model: "Qwen3.6-35B-A3B-MLX-8bit", seed: 20260921 };

      expect(cacheKey(STUDY, { ...pinned, thinking: "off" })).not.toBe(cacheKey(STUDY, pinned));
    });

    // The parses 0003 cached keep their names, so the committed ones are found.
    it("names a parse made before 0011 exactly as 0003 named it", () => {
      expect(
        parseFileName("NCT04385368", "Qwen3.6-35B-A3B-MLX-8bit", "73c3b301c4a9", 20260921),
      ).toBe("NCT04385368-Qwen3.6-35B-A3B-MLX-8bit-73c3b301c4a9-20260921.json");
    });

    it("produces a filename safe to write", () => {
      const awkward = new FakeModelAdapter([], { descriptor: { model: "Qwen/3.6 35B:8bit" } });

      expect(cacheKey(STUDY, awkward.descriptor)).not.toMatch(/[/\\:]/);
    });

    it("treats a corrupt cache file as a miss rather than a failure", async () => {
      const first = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);
      await runEval(first, { studies: [STUDY], resultsDir });

      const cached = join(resultsDir, "parses", cachedParses()[0] as string);
      writeFileSync(cached, "{ truncated", "utf8");

      const second = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);
      const run = await runEval(second, { studies: [STUDY], resultsDir });

      expect(run.studies[0]?.status).toBe("graded");
      expect(run.studies[0]?.parseSource).toBe("model");
    });
  });

  describe("failures", () => {
    // 0002 measured a study blowing a twenty-minute timeout that parsed in 78
    // seconds alone. Losing the earlier studies to that would be a lost
    // afternoon and an invitation to grade whatever finished.
    it("keeps the studies that succeeded when a later one fails", async () => {
      const adapter = new FakeModelAdapter([
        parseResponse(...REAL_QUOTES),
        { kind: "error", message: "connection refused" },
      ]);

      const run = await runEval(adapter, {
        studies: [STUDY, "NCT04316364"],
        resultsDir,
      });

      expect(run.studies[0]?.status).toBe("graded");
      expect(run.studies[1]?.status).toBe("failed");
      expect(run.pooled.studies).toBe(1);
    });

    it("names what failed, so a partial run cannot read as a whole one", async () => {
      const adapter = new FakeModelAdapter([{ kind: "error", message: "connection refused" }]);

      const run = await runEval(adapter, { studies: [STUDY], resultsDir });

      expect(run.failed).toEqual([STUDY]);
      expect(run.studies[0]?.error).toMatch(/connection refused/);
    });

    it("writes a result after every study, not only at the end", async () => {
      const adapter = new FakeModelAdapter([
        parseResponse(...REAL_QUOTES),
        { kind: "error", message: "died partway" },
      ]);

      await runEval(adapter, { studies: [STUDY, "NCT04316364"], resultsDir });
      const written = JSON.parse(readFileSync(join(resultsDir, runFiles()[0] as string), "utf8"));

      expect(written.studies).toHaveLength(2);
      expect(written.failed).toEqual(["NCT04316364"]);
    });

    it("refuses an unlabelled study rather than scoring it as a total failure", async () => {
      const adapter = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);

      const run = await runEval(adapter, { studies: ["NCT00106626"], resultsDir });

      expect(run.studies[0]?.status).toBe("failed");
      expect(run.studies[0]?.error).toMatch(/no labels|not finished/);
    });
  });

  it("grades against the real label set, not an invented one", async () => {
    const trial = getTrial(STUDY);
    const adapter = new FakeModelAdapter([parseResponse(...REAL_QUOTES)]);

    const run = await runEval(adapter, { studies: [STUDY], resultsDir });
    const metrics = run.studies[0]?.metrics;

    expect(trial.eligibility.criteriaText.length).toBeGreaterThan(0);
    expect(metrics?.labels).toBeGreaterThan(30);
    expect(metrics?.predictions).toBe(REAL_QUOTES.length);
    // Three predictions against thirty-odd labels: low recall, high precision.
    expect(metrics?.coverageRecall).toBeLessThan(0.2);
    expect(metrics?.precision).toBe(1);
  });
});

describe("runEval under a budget (slice 0008)", () => {
  // Every further call would be refused, so the run stops rather than
  // recording a failure per study, and says why.
  it("stops at the budget, keeps what was parsed, and records the spend", async () => {
    const adapter = new BudgetedAdapter(new FakeModelAdapter([parseResponse(...REAL_QUOTES)]), {
      entry: haiku(),
      budget: { maxCalls: 1, maxUsd: 1 },
    });

    const run = await runEval(adapter, {
      studies: [STUDY, "NCT04316364", "NCT06728852"],
      resultsDir,
    });

    expect(run.studies.map((s) => s.status)).toEqual(["graded", "failed", "failed"]);
    expect(run.studies[1]?.error).toMatch(/budget: 1 of 1 calls used/);
    expect(run.studies[2]?.error).toMatch(/^not run: the budget was reached/);
    expect(run.stopped).toMatch(/budget/);
    expect(run.spend).toMatchObject({ calls: 1 });
    expect(cachedParses()).toHaveLength(1);
  });

  it("records no spend and no stop for a local run", async () => {
    const run = await runEval(new FakeModelAdapter([parseResponse(...REAL_QUOTES)]), {
      studies: [STUDY],
      resultsDir,
    });
    expect(run).not.toHaveProperty("spend");
    expect(run).not.toHaveProperty("stopped");
  });
});

function haiku() {
  const entry = catalogEntry("anthropic", "claude-haiku-4-5");
  if (entry === undefined) throw new Error("claude-haiku-4-5 missing from the catalog");
  return entry;
}

describe("runEval concurrency (slice 0008)", () => {
  // A batched adapter needs every study's request queued at once; the result
  // must still read in study order.
  it("starts a group's studies together and keeps their order", async () => {
    let inFlight = 0;
    let most = 0;
    const inner = new FakeModelAdapter([], {
      respond: () => parseResponse(...REAL_QUOTES),
    });
    const adapter = {
      descriptor: inner.descriptor,
      async complete(r: Parameters<typeof inner.complete>[0]) {
        inFlight++;
        most = Math.max(most, inFlight);
        await Promise.resolve();
        const response = await inner.complete(r);
        inFlight--;
        return response;
      },
    };

    const run = await runEval(adapter, {
      studies: [STUDY, "NCT04316364", "NCT06728852"],
      resultsDir,
      concurrency: 3,
    });

    expect(most).toBe(3);
    expect(run.studies.map((s) => s.nctId)).toEqual([STUDY, "NCT04316364", "NCT06728852"]);
  });
});
