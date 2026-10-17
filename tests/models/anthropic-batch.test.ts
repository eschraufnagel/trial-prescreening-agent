import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anthropicBody } from "../../src/models/anthropic.js";
import { AnthropicBatchAdapter, customIdFor } from "../../src/models/anthropic-batch.js";
import { catalogEntry } from "../../src/models/catalog.js";
import type { CompletionRequest } from "../../src/models/index.js";
import { createAdapter, ModelError, parseModelSpec, spentBy } from "../../src/models/index.js";
import type { Fixture, SentRequest } from "./fixtures.js";
import {
  anthropicExpected,
  batchSucceededMessage,
  fixtureFetch,
  loadFixture,
  responseFor,
  SENTINEL_KEY,
} from "./fixtures.js";

/**
 * The batch path against fixtures written from the documentation. Clock,
 * sleep and fetch are injected, so a batch "takes" no time and nothing
 * reaches the network.
 */

const ENV = { ANTHROPIC_API_KEY: SENTINEL_KEY };
const HAIKU = (() => {
  const entry = catalogEntry("anthropic", "claude-haiku-4-5");
  if (entry === undefined) throw new Error("claude-haiku-4-5 missing from the catalog");
  return entry;
})();

function request(user: string): CompletionRequest {
  return { system: "system prompt", user, responseFormat: "json", maxOutputTokens: 64 };
}

const SUCCEEDED = batchSucceededMessage(loadFixture("anthropic", "batch-results"));

/**
 * Results for these requests: the first succeeds with the fixture's message,
 * the second errors (written from the documentation; a smoke recording has
 * no errored line), keyed to the requests' ids and in the given order.
 */
function resultsFor(requests: CompletionRequest[], order: number[] = [0, 1]): Fixture {
  const results = [
    { type: "succeeded", message: SUCCEEDED },
    {
      type: "errored",
      error: { type: "error", error: { type: "invalid_request_error", message: "bad request" } },
    },
  ];
  const lines = order.map((i) => ({
    custom_id: customIdFor(anthropicBody(HAIKU, requests[i] as CompletionRequest)),
    result: results[i],
  }));
  return {
    ...loadFixture("anthropic", "batch-results"),
    body: `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
  };
}

function batchAdapter(fetchImpl: typeof fetch, ledgerDir = mkdtempSync(join(tmpdir(), "ledger-"))) {
  const progress: string[] = [];
  const adapter = new AnthropicBatchAdapter({
    model: "claude-haiku-4-5",
    env: ENV,
    fetchImpl,
    ledgerDir,
    quietMs: 0,
    sleep: () => Promise.resolve(),
    now: () => Date.parse("2000-01-23T12:00:00Z"),
    onProgress: (m) => progress.push(m),
  });
  return { adapter, ledgerDir, progress };
}

async function settled<T>(promise: Promise<T>): Promise<T | ModelError> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ModelError) return error;
    throw error;
  }
}

describe("AnthropicBatchAdapter", () => {
  it("submits queued requests as one batch, polls until it ends, and settles each by id", async () => {
    const requests = [request("first"), request("second")];
    const { fetchImpl, sent } = fixtureFetch(
      loadFixture("anthropic", "batch-created"),
      loadFixture("anthropic", "batch-in-progress"),
      loadFixture("anthropic", "batch-ended"),
      // Results come back in the opposite order: matched by id, not position.
      resultsFor(requests, [1, 0]),
    );
    const { adapter, ledgerDir } = batchAdapter(fetchImpl);

    const [first, second] = await Promise.all(requests.map((r) => settled(adapter.complete(r))));

    expect(first).toMatchObject({
      content: anthropicExpected(SUCCEEDED).content,
      finishReason: "stop",
    });
    expect(second).toBeInstanceOf(ModelError);
    expect(String(second)).toMatch(/errored/);

    const [submit, ...polls] = sent as [SentRequest, ...SentRequest[]];
    expect(submit.method).toBe("POST");
    expect(submit.url).toBe("https://api.anthropic.com/v1/messages/batches");
    expect(submit.headers["x-api-key"]).toBe(SENTINEL_KEY);
    expect(submit.body).toEqual({
      requests: requests.map((r) => ({
        custom_id: customIdFor(anthropicBody(HAIKU, r)),
        params: anthropicBody(HAIKU, r),
      })),
    });
    expect(polls.map((p) => p.url)).toEqual([
      "https://api.anthropic.com/v1/messages/batches/msgbatch_recorded",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_recorded",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_recorded/results",
    ]);

    const ledger = readdirSync(ledgerDir);
    expect(ledger).toEqual(["msgbatch_recorded.json"]);
    // Only the request worth collecting again stays: the errored one is
    // dropped so a later run can submit it afresh.
    expect(JSON.parse(readFileSync(join(ledgerDir, ledger[0] as string), "utf8"))).toMatchObject({
      batchId: "msgbatch_recorded",
      model: "claude-haiku-4-5",
      customIds: [customIdFor(anthropicBody(HAIKU, requests[0] as CompletionRequest))],
    });
  });

  // Stopping the script mid-batch must not mean paying for it again.
  it("collects a batch already in the ledger instead of submitting again", async () => {
    const requests = [request("first"), request("second")];
    const ledgerDir = mkdtempSync(join(tmpdir(), "ledger-"));
    writeFileSync(
      join(ledgerDir, "msgbatch_recorded.json"),
      JSON.stringify({
        batchId: "msgbatch_recorded",
        submittedAt: "2000-01-23T11:00:00Z",
        model: "claude-haiku-4-5",
        customIds: requests.map((r) => customIdFor(anthropicBody(HAIKU, r))),
      }),
    );
    const served = [loadFixture("anthropic", "batch-ended"), resultsFor(requests)];
    const posts: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      if (init.method === "POST") posts.push(String(url));
      const next = served.shift();
      if (next === undefined) throw new Error(`unexpected request to ${url}`);
      return responseFor(next);
    }) as unknown as typeof fetch;

    const { adapter, progress } = batchAdapter(fetchImpl, ledgerDir);
    const first = await settled(adapter.complete(requests[0] as CompletionRequest));

    expect(posts).toEqual([]);
    expect(first).toMatchObject({ content: anthropicExpected(SUCCEEDED).content });
    expect(progress.join("\n")).toMatch(/already paid for/);
  });

  it("refuses to fetch results from anywhere but the API's own host", async () => {
    const ended = loadFixture("anthropic", "batch-ended");
    const elsewhere: Fixture = {
      ...ended,
      body: { ...(ended.body as object), results_url: "https://files.example.com/results.jsonl" },
    };
    const { fetchImpl, sent } = fixtureFetch(loadFixture("anthropic", "batch-created"), elsewhere);
    const { adapter } = batchAdapter(fetchImpl);

    const result = await settled(adapter.complete(request("first")));

    expect(String(result)).toMatch(/refusing to fetch/);
    expect(sent.map((s) => s.url)).not.toContain("https://files.example.com/results.jsonl");
  });

  it("sends one entry for two identical requests, and gives both the result", async () => {
    const same = request("same");
    const { fetchImpl, sent } = fixtureFetch(
      loadFixture("anthropic", "batch-created"),
      loadFixture("anthropic", "batch-ended"),
      resultsFor([same, request("unused")], [0]),
    );
    const { adapter } = batchAdapter(fetchImpl);

    const [a, b] = await Promise.all([adapter.complete(same), adapter.complete(same)]);

    expect((sent[0]?.body as { requests: unknown[] }).requests).toHaveLength(1);
    expect(a.content).toEqual(b.content);
  });

  it("rejects every queued request when the submission fails, marked retryable on a 529", async () => {
    const { fetchImpl } = fixtureFetch(loadFixture("anthropic", "error-529"));
    const { adapter } = batchAdapter(fetchImpl);

    const results = await Promise.all([
      settled(adapter.complete(request("a"))),
      settled(adapter.complete(request("b"))),
    ]);
    for (const r of results) {
      expect(r).toBeInstanceOf(ModelError);
      expect((r as ModelError).retryable).toBe(true);
    }
  });
});

describe("batch through the factory", () => {
  it("is built for Anthropic only", () => {
    expect(() =>
      createAdapter(parseModelSpec("openai"), {
        env: { OPENAI_API_KEY: SENTINEL_KEY },
        budget: { maxCalls: 5, maxUsd: 1 },
        batch: { ledgerDir: mkdtempSync(join(tmpdir(), "ledger-")) },
      }),
    ).toThrow(/Anthropic only/);
  });

  it("is priced at half, inside the budget", async () => {
    const requests = [request("first"), request("second")];
    const { fetchImpl } = fixtureFetch(
      loadFixture("anthropic", "batch-created"),
      loadFixture("anthropic", "batch-ended"),
      resultsFor(requests),
    );
    const adapter = createAdapter(parseModelSpec("anthropic"), {
      env: ENV,
      budget: { maxCalls: 5, maxUsd: 1 },
      fetchImpl,
      sleep: () => Promise.resolve(),
      batch: { ledgerDir: mkdtempSync(join(tmpdir(), "ledger-")), quietMs: 0 },
    });

    await adapter.complete(requests[0] as CompletionRequest);
    // Input at $1 and output at $5 per million, halved.
    const { usage } = anthropicExpected(SUCCEEDED);
    expect(spentBy(adapter)?.usd).toBeCloseTo(
      ((usage.inputTokens + usage.outputTokens * 5) / 1_000_000) * 0.5,
      12,
    );
  });
});

describe("the ledger after a failed request (review of 0008)", () => {
  // The ledger is there so a batch isn't paid for twice. A request that came
  // back errored has nothing worth collecting again, and must be free to be
  // submitted afresh on the next run, or it could never succeed.
  it("submits a request again when its ledgered result was not a success", async () => {
    const requests = [request("first"), request("second")];
    const ledgerDir = mkdtempSync(join(tmpdir(), "ledger-"));

    const firstRun = fixtureFetch(
      loadFixture("anthropic", "batch-created"),
      loadFixture("anthropic", "batch-ended"),
      resultsFor(requests),
    );
    const one = batchAdapter(firstRun.fetchImpl, ledgerDir).adapter;
    await Promise.all(requests.map((r) => settled(one.complete(r))));

    // Next run, the errored request again: it must be submitted, not collected.
    const secondRun = fixtureFetch(
      loadFixture("anthropic", "batch-created"),
      loadFixture("anthropic", "batch-ended"),
      resultsFor([requests[1] as CompletionRequest, requests[0] as CompletionRequest], [1]),
    );
    const two = batchAdapter(secondRun.fetchImpl, ledgerDir).adapter;
    await settled(two.complete(requests[1] as CompletionRequest));

    expect(secondRun.sent[0]?.method).toBe("POST");
    expect(secondRun.sent[0]?.url).toBe("https://api.anthropic.com/v1/messages/batches");
  });
});
