import { describe, expect, it } from "vitest";
import { isRefusal } from "../../src/models/errors.js";
import type { CompletionRequest } from "../../src/models/index.js";
import { ModelError } from "../../src/models/index.js";
import { OpenAIAdapter } from "../../src/models/openai.js";
import { XaiAdapter } from "../../src/models/xai.js";
import type { Fixture } from "./fixtures.js";
import { chatExpected, failingFetch, fixtureFetch, loadFixture, SENTINEL_KEY } from "./fixtures.js";

/**
 * OpenAI and xAI share one Chat Completions adapter and differ in host, model
 * and the fields the catalog decides. Both are proven here against fixtures
 * written from documentation until `npm run models:smoke` records real ones.
 */

const REQUEST: CompletionRequest = {
  system: "system prompt",
  user: "user prompt",
  responseFormat: "json",
  maxOutputTokens: 256,
};

const PROVIDERS = [
  {
    name: "openai",
    variable: "OPENAI_API_KEY",
    url: "https://api.openai.com/v1/chat/completions",
    make: (fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = { OPENAI_API_KEY: SENTINEL_KEY }) =>
      new OpenAIAdapter({ model: "gpt-6-luna", env, fetchImpl }),
  },
  {
    name: "xai",
    variable: "XAI_API_KEY",
    url: "https://api.x.ai/v1/chat/completions",
    make: (fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = { XAI_API_KEY: SENTINEL_KEY }) =>
      new XaiAdapter({ model: "grok-4.3", env, fetchImpl }),
  },
] as const;

async function failureOf(promise: Promise<unknown>): Promise<ModelError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ModelError) return error;
    throw error;
  }
  throw new Error("expected a ModelError");
}

for (const p of PROVIDERS) {
  describe(`${p.name} adapter`, () => {
    it("posts to its own host with the key as a bearer token, and nowhere else", async () => {
      const { fetchImpl, sent } = fixtureFetch(loadFixture(p.name, "ok"));
      await p.make(fetchImpl).complete(REQUEST);

      expect(sent[0]?.url).toBe(p.url);
      expect(sent[0]?.headers["authorization"]).toBe(`Bearer ${SENTINEL_KEY}`);
      expect(JSON.stringify(sent[0]?.body)).not.toContain(SENTINEL_KEY);
    });

    it("switches reasoning off and asks for JSON at temperature 0", async () => {
      const { fetchImpl, sent } = fixtureFetch(loadFixture(p.name, "ok"));
      await p.make(fetchImpl).complete(REQUEST);
      const body = sent[0]?.body as Record<string, unknown>;

      expect(body["reasoning_effort"]).toBe("none");
      expect(body["temperature"]).toBe(0);
      expect(body["response_format"]).toEqual({ type: "json_object" });
      expect(body["max_completion_tokens"]).toBe(256);
      expect(body["messages"]).toEqual([
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ]);
    });

    it("reads content, usage and the served model", async () => {
      const fixture = loadFixture(p.name, "ok");
      const { fetchImpl } = fixtureFetch(fixture);
      const response = await p.make(fetchImpl).complete(REQUEST);
      const expected = chatExpected(fixture.body);

      expect(response.content).toEqual(expected.content);
      expect(response.finishReason).toBe("stop");
      expect(response.usage.outputTokens).toBe(expected.usage.outputTokens);
      expect(response.servedModel).toBe(expected.servedModel);
    });

    it("takes cached tokens out of full-rate input", async () => {
      const { fetchImpl } = fixtureFetch(loadFixture(p.name, "cached"));
      expect((await p.make(fetchImpl).complete(REQUEST)).usage).toEqual({
        inputTokens: 476,
        outputTokens: 19,
        cacheReadTokens: 1024,
      });
    });

    it("returns truncated output as length", async () => {
      const { fetchImpl } = fixtureFetch(loadFixture(p.name, "truncated"));
      const response = await p.make(fetchImpl).complete(REQUEST);
      expect(response.finishReason).toBe("length");
      expect(response.content).toBeUndefined();
    });

    it("marks a rate limit retryable and a bad request not, and names the key on a 401", async () => {
      const { fetchImpl } = fixtureFetch(
        loadFixture(p.name, "error-429"),
        loadFixture(p.name, "error-400"),
        loadFixture(p.name, "error-401"),
      );
      const adapter = p.make(fetchImpl);

      const limited = await failureOf(adapter.complete(REQUEST));
      expect(limited.retryable).toBe(true);
      expect(limited.retryAfterMs).toBe(2000);
      expect((await failureOf(adapter.complete(REQUEST))).retryable).toBe(false);
      expect((await failureOf(adapter.complete(REQUEST))).message).toContain(`check ${p.variable}`);
    });

    it("refuses to exist without its key", () => {
      const { fetchImpl, sent } = fixtureFetch();
      expect(() => p.make(fetchImpl, {})).toThrow(new RegExp(`${p.variable} is not set`));
      expect(sent).toEqual([]);
    });

    it("never shows its key in an error", async () => {
      const echoing: Fixture = {
        ...loadFixture(p.name, "error-400"),
        body: { error: { message: `bad key ${SENTINEL_KEY}`, type: "invalid_request_error" } },
      };
      const errors = [
        await failureOf(p.make(failingFetch(`refused ${SENTINEL_KEY}`)).complete(REQUEST)),
        await failureOf(p.make(fixtureFetch(echoing).fetchImpl).complete(REQUEST)),
      ];
      for (const error of errors) {
        expect(error.message).not.toContain(SENTINEL_KEY);
        expect(error.message).toContain("[key]");
      }
      expect(JSON.stringify(p.make(fixtureFetch().fetchImpl).descriptor)).not.toContain(
        SENTINEL_KEY,
      );
    });
  });
}

describe("what each provider records", () => {
  // Luna documents no seed, so none is sent and the reason is recorded.
  it("sends OpenAI no seed", async () => {
    const { fetchImpl, sent } = fixtureFetch(loadFixture("openai", "ok"));
    const adapter = new OpenAIAdapter({
      model: "gpt-6-luna",
      env: { OPENAI_API_KEY: SENTINEL_KEY },
      fetchImpl,
    });
    await adapter.complete(REQUEST);

    expect(sent[0]?.body).not.toHaveProperty("seed");
    expect(adapter.descriptor.seed).toBeNull();
    expect(adapter.descriptor.unset?.seed).toMatch(/not documented/);
  });

  // A best-effort seed must not read as oMLX's, which pins the output.
  it("sends xAI the project's seed, recorded as best effort", async () => {
    const { fetchImpl, sent } = fixtureFetch(loadFixture("xai", "ok"));
    const adapter = new XaiAdapter({
      model: "grok-4.3",
      env: { XAI_API_KEY: SENTINEL_KEY },
      fetchImpl,
    });
    await adapter.complete(REQUEST);

    expect((sent[0]?.body as Record<string, unknown>)["seed"]).toBe(20260921);
    expect(adapter.descriptor).toMatchObject({ seed: 20260921, seedGuarantee: "best-effort" });
  });

  it("throws an OpenAI refusal as a refusal", async () => {
    const { fetchImpl } = fixtureFetch(loadFixture("openai", "refusal"));
    const adapter = new OpenAIAdapter({
      model: "gpt-6-luna",
      env: { OPENAI_API_KEY: SENTINEL_KEY },
      fetchImpl,
    });
    expect(isRefusal(await failureOf(adapter.complete(REQUEST)))).toBe(true);
  });
});
