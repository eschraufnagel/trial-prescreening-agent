import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BudgetedAdapter, BudgetPool, isBudgetStop } from "../../src/models/budget.js";
import { catalogEntry } from "../../src/models/catalog.js";
import { estimate, formatEstimate, formatUsd, tokensFor } from "../../src/models/estimate.js";
import type {
  CompletionRequest,
  CompletionResponse,
  ModelAdapter,
} from "../../src/models/index.js";
import { FakeModelAdapter, ModelError } from "../../src/models/index.js";
import { appendSpend, priceOf, spendSoFar } from "../../src/models/spend.js";

function entry(provider: "anthropic" | "openai", model: string) {
  const found = catalogEntry(provider, model);
  if (found === undefined) throw new Error(`${model} missing from the catalog`);
  return found;
}

const HAIKU = entry("anthropic", "claude-haiku-4-5");
const LUNA = entry("openai", "gpt-6-luna");

const REQUEST: CompletionRequest = {
  system: "s",
  user: "u",
  responseFormat: "json",
  maxOutputTokens: 100,
};

/** An inner adapter that answers with fixed usage, or fails as told. */
function scripted(
  steps: Array<{ usage?: CompletionResponse["usage"]; fail?: ModelError; servedModel?: string }>,
): ModelAdapter & { calls: number } {
  const queue = [...steps];
  const adapter = {
    calls: 0,
    descriptor: new FakeModelAdapter().descriptor,
    async complete(): Promise<CompletionResponse> {
      adapter.calls++;
      const step = queue.shift();
      if (step === undefined) throw new Error("scripted adapter ran out");
      if (step.fail !== undefined) throw step.fail;
      return {
        content: {},
        raw: "{}",
        finishReason: "stop",
        usage: step.usage ?? { inputTokens: 1000, outputTokens: 100 },
        ...(step.servedModel === undefined ? {} : { servedModel: step.servedModel }),
      };
    },
  };
  return adapter;
}

const noSleep = () => Promise.resolve();

function limited(): ModelError {
  return new ModelError("x", ["HTTP 429"], { retryable: true });
}

describe("BudgetedAdapter caps", () => {
  it("refuses the call past the cap, as a budget stop, without reaching the provider", async () => {
    const inner = scripted([{}, {}, {}]);
    const budgeted = new BudgetedAdapter(inner, {
      entry: HAIKU,
      budget: { maxCalls: 2, maxUsd: 100 },
    });
    await budgeted.complete(REQUEST);
    await budgeted.complete(REQUEST);

    const stop = await budgeted.complete(REQUEST).catch((e: unknown) => e);
    expect(isBudgetStop(stop)).toBe(true);
    expect(String(stop)).toMatch(/2 of 2 calls used/);
    expect(inner.calls).toBe(2);
  });

  it("stops once priced usage reaches the dollar limit", async () => {
    // One Haiku call at 100K input and 10K output: $0.10 + $0.05 = $0.15.
    const inner = scripted([{ usage: { inputTokens: 100_000, outputTokens: 10_000 } }, {}]);
    const budgeted = new BudgetedAdapter(inner, {
      entry: HAIKU,
      budget: { maxCalls: 100, maxUsd: 0.1 },
    });
    await budgeted.complete(REQUEST);
    expect(budgeted.spent().usd).toBeCloseTo(0.15, 10);

    const stop = await budgeted.complete(REQUEST).catch((e: unknown) => e);
    expect(isBudgetStop(stop)).toBe(true);
    expect(String(stop)).toMatch(/raise --max-usd/);
  });

  it("is not a budget stop for any other failure", () => {
    expect(isBudgetStop(new ModelError("x", ["HTTP 500"]))).toBe(false);
    expect(isBudgetStop(new Error("budget: not a ModelError"))).toBe(false);
  });
});

describe("BudgetedAdapter retries", () => {
  // A retry is paid for like any call, so it must count.
  it("retries a retryable failure twice, counting every attempt", async () => {
    const inner = scripted([{ fail: limited() }, { fail: limited() }, {}]);
    const waits: number[] = [];
    const budgeted = new BudgetedAdapter(inner, {
      entry: HAIKU,
      budget: { maxCalls: 10, maxUsd: 10 },
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await budgeted.complete(REQUEST);

    expect(inner.calls).toBe(3);
    expect(budgeted.spent().calls).toBe(3);
    expect(waits).toEqual([2000, 8000]);
  });

  it("gives up after two retries", async () => {
    const inner = scripted([{ fail: limited() }, { fail: limited() }, { fail: limited() }]);
    const budgeted = new BudgetedAdapter(inner, {
      entry: HAIKU,
      budget: { maxCalls: 10, maxUsd: 10 },
      sleep: noSleep,
    });
    await expect(budgeted.complete(REQUEST)).rejects.toThrow(/HTTP 429/);
    expect(inner.calls).toBe(3);
  });

  it("honours retry-after up to a minute, and fails now past that", async () => {
    const waits: number[] = [];
    const short = scripted([
      { fail: new ModelError("x", ["HTTP 429"], { retryable: true, retryAfterMs: 3000 }) },
      {},
    ]);
    await new BudgetedAdapter(short, {
      entry: HAIKU,
      budget: { maxCalls: 10, maxUsd: 10 },
      sleep: async (ms) => {
        waits.push(ms);
      },
    }).complete(REQUEST);
    expect(waits).toEqual([3000]);

    const long = scripted([
      { fail: new ModelError("x", ["HTTP 429"], { retryable: true, retryAfterMs: 120_000 }) },
    ]);
    await expect(
      new BudgetedAdapter(long, {
        entry: HAIKU,
        budget: { maxCalls: 10, maxUsd: 10 },
        sleep: noSleep,
      }).complete(REQUEST),
    ).rejects.toThrow(/HTTP 429/);
    expect(long.calls).toBe(1);
  });

  it("never retries a failure not marked retryable", async () => {
    const inner = scripted([{ fail: new ModelError("x", ["HTTP 400"]) }]);
    const budgeted = new BudgetedAdapter(inner, {
      entry: HAIKU,
      budget: { maxCalls: 10, maxUsd: 10 },
      sleep: noSleep,
    });
    await expect(budgeted.complete(REQUEST)).rejects.toThrow(/HTTP 400/);
    expect(inner.calls).toBe(1);
  });

  it("stops retrying at the cap", async () => {
    const inner = scripted([{ fail: limited() }, { fail: limited() }]);
    const budgeted = new BudgetedAdapter(inner, {
      entry: HAIKU,
      budget: { maxCalls: 2, maxUsd: 10 },
      sleep: noSleep,
    });
    const stop = await budgeted.complete(REQUEST).catch((e: unknown) => e);
    expect(isBudgetStop(stop)).toBe(true);
    expect(inner.calls).toBe(2);
  });
});

describe("pricing and the spend log", () => {
  it("prices cache writes and reads at their own rates, and batch at half", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    };
    // 1.00 + 5.00 + 1.25 + 0.10
    expect(priceOf(HAIKU, usage, false)).toBeCloseTo(7.35, 10);
    expect(priceOf(HAIKU, usage, true)).toBeCloseTo(3.675, 10);
    // Luna has no batch path here: batch pricing doesn't apply.
    expect(priceOf(LUNA, { inputTokens: 1_000_000, outputTokens: 0 }, true)).toBeCloseTo(0.1, 10);
  });

  it("records what was spent and which models answered", async () => {
    const inner = scripted([
      { servedModel: "claude-haiku-4-5" },
      { servedModel: "claude-haiku-4-5" },
    ]);
    const budgeted = new BudgetedAdapter(inner, {
      entry: HAIKU,
      budget: { maxCalls: 10, maxUsd: 10 },
    });
    await budgeted.complete(REQUEST);
    await budgeted.complete(REQUEST);

    expect(budgeted.spent()).toMatchObject({
      calls: 2,
      inputTokens: 2000,
      outputTokens: 200,
      servedModels: ["claude-haiku-4-5"],
    });
  });

  it("appends one line per record and totals them", () => {
    const path = join(mkdtempSync(join(tmpdir(), "spend-")), "spend.jsonl");
    expect(spendSoFar(path)).toEqual({ usd: 0, lines: 0 });

    const record = {
      date: "2000-01-23",
      script: "models:smoke",
      role: "smoke",
      spec: "anthropic:claude-haiku-4-5",
      servedModels: [],
      calls: 2,
      inputTokens: 1000,
      outputTokens: 50,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      usd: 0.00125,
      batch: false,
      pricesAsOf: "2000-01-23",
    };
    appendSpend(path, record);
    appendSpend(path, { ...record, usd: 0.5 });

    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(2);
    expect(spendSoFar(path).usd).toBeCloseTo(0.50125, 10);
  });
});

describe("estimate", () => {
  const workload = {
    expected: { calls: 70, inputTokens: 70_000, outputTokens: 7_000 },
    perCallCeiling: { inputTokens: 2_000, outputTokens: 1_024 },
  };

  it("prices the expected run and bounds it by the cap, to the cent", () => {
    const e = estimate(HAIKU, workload, { maxCalls: 100, batch: false });
    // 70K × $1 + 7K × $5 per million = 0.07 + 0.035
    expect(e.expected.usd).toBeCloseTo(0.105, 10);
    // 100 × 2,000 × $1 + 100 × 1,024 × $5 per million = 0.2 + 0.512
    expect(e.ceiling).toEqual({
      calls: 100,
      inputTokens: 200_000,
      outputTokens: 102_400,
      usd: expect.closeTo(0.712, 10),
    });
  });

  it("halves a batched run where there's a batch path", () => {
    expect(estimate(HAIKU, workload, { maxCalls: 100, batch: true }).expected.usd).toBeCloseTo(
      0.0525,
      10,
    );
  });

  it("overestimates tokens on purpose", () => {
    expect(tokensFor("x".repeat(3000))).toBe(1000);
    expect(tokensFor("x".repeat(3001))).toBe(1001);
  });

  it("prints the model, the scope, both figures, the price date and the total so far", () => {
    const text = formatEstimate(
      {
        role: "agent",
        spec: "anthropic:claude-haiku-4-5",
        scope: "1 conversation (NCT00077350-v1, labels)",
        maxUsd: 1,
        batch: false,
        spentSoFar: { usd: 0.25, lines: 3 },
      },
      estimate(HAIKU, workload, { maxCalls: 100, batch: false }),
    );
    expect(text).toContain("agent on anthropic:claude-haiku-4-5: 1 conversation");
    expect(text).toContain("about $0.10");
    expect(text).toContain("at most   $0.71: 100 calls (the cap)");
    expect(text).toContain("stops at $1.00 (--max-usd)");
    expect(text).toContain("prices as of 2026-09");
    expect(text).toContain("$0.25 over 3 paid run(s)");
  });

  it("formats small amounts to a tenth of a cent", () => {
    expect(formatUsd(0.0012)).toBe("$0.001");
    expect(formatUsd(3.456)).toBe("$3.46");
  });
});

describe("one budget per invocation", () => {
  // Two paid roles must not spend twice the limit between them.
  it("shares the call cap across adapters drawing on one pool", async () => {
    const pool = new BudgetPool();
    const budget = { maxCalls: 3, maxUsd: 100 };
    const agent = new BudgetedAdapter(scripted([{}, {}]), { entry: HAIKU, budget, pool });
    const fidelity = new BudgetedAdapter(scripted([{}, {}]), { entry: HAIKU, budget, pool });

    await agent.complete(REQUEST);
    await fidelity.complete(REQUEST);
    await agent.complete(REQUEST);
    expect(isBudgetStop(await fidelity.complete(REQUEST).catch((e: unknown) => e))).toBe(true);
    expect(agent.spent().calls + fidelity.spent().calls).toBe(3);
  });
});

describe("the dollar cap holds for calls in flight (review of 0008)", () => {
  // Usage is only known when a response arrives. Calls sent together (a
  // batch, or roles running at once) would all pass a check made before any
  // of them came back, and the run could overshoot --max-usd by their cost.
  it("refuses a call whose worst case would take calls in flight past the limit", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = scripted([{}, {}]);
    const slow: ModelAdapter = {
      descriptor: inner.descriptor,
      async complete(r) {
        await gate;
        return inner.complete(r);
      },
    };
    // A call's worst case here: 1,000 output tokens at $5 per million, $0.005,
    // plus a few input tokens. The limit fits one call in flight, not two.
    const budgeted = new BudgetedAdapter(slow, {
      entry: HAIKU,
      budget: { maxCalls: 10, maxUsd: 0.008 },
    });
    const request = { ...REQUEST, maxOutputTokens: 1000 };

    const first = budgeted.complete(request);
    const second = budgeted.complete(request).catch((e: unknown) => e);
    release();

    await first;
    expect(isBudgetStop(await second)).toBe(true);
    expect(inner.calls).toBe(1);
  });
});
