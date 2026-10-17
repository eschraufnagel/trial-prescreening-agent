import { describe, expect, it } from "vitest";
import { AnthropicAdapter } from "../../src/models/anthropic.js";
import { isConnectionFailure, isRefusal } from "../../src/models/errors.js";
import type { CompletionRequest } from "../../src/models/index.js";
import { ModelError } from "../../src/models/index.js";
import type { Fixture } from "./fixtures.js";
import {
  anthropicExpected,
  failingFetch,
  fixtureFetch,
  loadFixture,
  SENTINEL_KEY,
} from "./fixtures.js";

/**
 * The Anthropic adapter against its fixtures, which are written from the
 * documentation until `npm run models:smoke` records real ones. Every request
 * is served by an injected `fetch`; nothing here reaches the network.
 */

const ENV = { ANTHROPIC_API_KEY: SENTINEL_KEY };

const REQUEST: CompletionRequest = {
  system: "system prompt",
  user: "user prompt",
  responseFormat: "json",
  maxOutputTokens: 256,
};

function adapter(model: string, ...fixtures: Fixture[]) {
  const { fetchImpl, sent } = fixtureFetch(...fixtures);
  return { adapter: new AnthropicAdapter({ model, env: ENV, fetchImpl }), sent };
}

async function failureOf(promise: Promise<unknown>): Promise<ModelError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ModelError) return error;
    throw error;
  }
  throw new Error("expected a ModelError");
}

describe("AnthropicAdapter requests", () => {
  it("sends Haiku 4.5 at temperature 0, with no thinking field and a cacheable system prompt", async () => {
    const { adapter: a, sent } = adapter("claude-haiku-4-5", loadFixture("anthropic", "ask-ok"));
    await a.complete(REQUEST);

    expect(sent[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent[0]?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(sent[0]?.body).toEqual({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: [{ type: "text", text: "system prompt", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "user prompt" }],
      temperature: 0,
    });
  });

  // Sonnet 5 returns a 400 on temperature. The one thing a fixture written from
  // a wrong assumption would miss, so it's pinned here.
  it("sends Sonnet 5 no temperature, and thinking disabled", async () => {
    const { adapter: a, sent } = adapter("claude-sonnet-5", loadFixture("anthropic", "ask-ok"));
    await a.complete(REQUEST);

    const body = sent[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("temperature");
    expect(body["thinking"]).toEqual({ type: "disabled" });
  });

  it("puts the key in one header and nowhere else in the request", async () => {
    const { adapter: a, sent } = adapter("claude-haiku-4-5", loadFixture("anthropic", "ask-ok"));
    await a.complete(REQUEST);

    expect(sent[0]?.headers["x-api-key"]).toBe(SENTINEL_KEY);
    expect(JSON.stringify(sent[0]?.body)).not.toContain(SENTINEL_KEY);
    expect(sent[0]?.url).not.toContain(SENTINEL_KEY);
  });
});

describe("AnthropicAdapter responses", () => {
  it("reads content, finish reason, usage and the served model", async () => {
    const fixture = loadFixture("anthropic", "read-ok");
    const { adapter: a } = adapter("claude-haiku-4-5", fixture);
    const response = await a.complete(REQUEST);
    const expected = anthropicExpected(fixture.body);

    expect(response.content).toEqual(expected.content);
    expect(response.finishReason).toBe("stop");
    expect(response.usage).toMatchObject(expected.usage);
    expect(response.servedModel).toBe(expected.servedModel);
  });

  it("reports cache reads apart from full-rate input", async () => {
    const { adapter: a } = adapter("claude-haiku-4-5", loadFixture("anthropic", "cached"));
    expect((await a.complete(REQUEST)).usage).toEqual({
      inputTokens: 120,
      outputTokens: 18,
      cacheReadTokens: 4200,
    });
  });

  it("forgives one Markdown fence, as every adapter does", async () => {
    const { adapter: a } = adapter("claude-haiku-4-5", loadFixture("anthropic", "fenced"));
    expect((await a.complete(REQUEST)).content).toEqual({ message: "How old are you?" });
  });

  it("returns truncated output as length, for the caller to decide", async () => {
    const { adapter: a } = adapter("claude-haiku-4-5", loadFixture("anthropic", "truncated"));
    const response = await a.complete(REQUEST);

    expect(response.finishReason).toBe("length");
    expect(response.content).toBeUndefined();
  });

  // A refusal must never read as a parser bug.
  it("throws a refusal as a refusal, not retryable", async () => {
    const { adapter: a } = adapter("claude-haiku-4-5", loadFixture("anthropic", "refusal"));
    const error = await failureOf(a.complete(REQUEST));

    expect(isRefusal(error)).toBe(true);
    expect(error.retryable).toBe(false);
    expect(error.message).not.toMatch(/not JSON/);
  });
});

describe("AnthropicAdapter failures", () => {
  it("marks rate limits and overload retryable, with retry-after", async () => {
    const limited = await failureOf(
      adapter("claude-haiku-4-5", loadFixture("anthropic", "error-429")).adapter.complete(REQUEST),
    );
    expect(limited.retryable).toBe(true);
    expect(limited.retryAfterMs).toBe(3000);

    const overloaded = await failureOf(
      adapter("claude-haiku-4-5", loadFixture("anthropic", "error-529")).adapter.complete(REQUEST),
    );
    expect(overloaded.retryable).toBe(true);
  });

  it("does not mark a bad request retryable, and says which variable a 401 means", async () => {
    const bad = await failureOf(
      adapter("claude-haiku-4-5", loadFixture("anthropic", "error-400")).adapter.complete(REQUEST),
    );
    expect(bad.retryable).toBe(false);
    expect(bad.message).toMatch(/HTTP 400/);

    const unauthorised = await failureOf(
      adapter("claude-haiku-4-5", loadFixture("anthropic", "error-401")).adapter.complete(REQUEST),
    );
    expect(unauthorised.message).toMatch(/check ANTHROPIC_API_KEY/);
  });

  it("reports a dropped connection as a connection failure", async () => {
    const a = new AnthropicAdapter({
      model: "claude-haiku-4-5",
      env: ENV,
      fetchImpl: failingFetch("fetch failed"),
    });
    const error = await failureOf(a.complete(REQUEST));

    expect(isConnectionFailure(error)).toBe(true);
    expect(error.retryable).toBe(true);
  });

  it("refuses to exist without its key, before any request", () => {
    const { fetchImpl, sent } = fixtureFetch();
    expect(() => new AnthropicAdapter({ model: "claude-haiku-4-5", env: {}, fetchImpl })).toThrow(
      /ANTHROPIC_API_KEY is not set/,
    );
    expect(sent).toEqual([]);
  });
});

describe("AnthropicAdapter never shows its key", () => {
  // Every failure path, with the key echoed wherever text comes back.
  it("redacts the key from a connection error, an echoing error body and bad output", async () => {
    const echoing: Fixture = {
      ...loadFixture("anthropic", "error-400"),
      body: {
        type: "error",
        error: { type: "invalid_request_error", message: `key ${SENTINEL_KEY}` },
      },
    };
    const leakyOutput: Fixture = {
      ...loadFixture("anthropic", "ask-ok"),
      body: {
        ...(loadFixture("anthropic", "ask-ok").body as object),
        content: [{ type: "text", text: `not json ${SENTINEL_KEY}` }],
      },
    };

    const errors = [
      await failureOf(
        new AnthropicAdapter({
          model: "claude-haiku-4-5",
          env: ENV,
          fetchImpl: failingFetch(`connect failed with ${SENTINEL_KEY}`),
        }).complete(REQUEST),
      ),
      await failureOf(adapter("claude-haiku-4-5", echoing).adapter.complete(REQUEST)),
      await failureOf(adapter("claude-haiku-4-5", leakyOutput).adapter.complete(REQUEST)),
      ...(await Promise.all(
        ["error-401", "error-429", "error-529", "refusal"].map((name) =>
          failureOf(
            adapter("claude-haiku-4-5", loadFixture("anthropic", name)).adapter.complete(REQUEST),
          ),
        ),
      )),
    ];

    for (const error of errors) {
      expect(error.message).not.toContain(SENTINEL_KEY);
    }
    expect(errors[0]?.message).toContain("[key]");
    expect(errors[1]?.message).toContain("[key]");
  });

  it("keeps the key out of the descriptor", () => {
    const { adapter: a } = adapter("claude-haiku-4-5");
    expect(JSON.stringify(a.descriptor)).not.toContain(SENTINEL_KEY);
    expect(a.descriptor).toEqual({
      model: "claude-haiku-4-5",
      quantization: "none",
      temperature: 0,
      seed: null,
      adapter: "anthropic",
      thinking: "off",
      unset: { seed: "the Claude API has no seed parameter" },
    });
  });
});
