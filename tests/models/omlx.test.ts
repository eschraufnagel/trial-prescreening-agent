import { describe, expect, it } from "vitest";
import type { CompletionRequest } from "../../src/models/index.js";
import {
  listLocalModels,
  ModelError,
  OmlxAdapter,
  quantizationFrom,
  SEED,
  TEMPERATURE,
} from "../../src/models/index.js";

/**
 * The adapter is the only thing in `src/` that opens a socket, and no test
 * here opens one: `fetchImpl` is injected. That keeps `tests/` deterministic
 * and offline while still exercising every failure path, which is the point —
 * these faults are nearly all operator mistakes, and they have to produce an
 * error that says which mistake it was.
 */
const ENV = { OMLX_API_KEY: "test-key" };

const REQUEST: CompletionRequest = {
  system: "system prompt",
  user: "user prompt",
  responseFormat: "json",
  maxOutputTokens: 1024,
};

/** An OpenAI-shaped success envelope wrapping `content`. */
function envelope(content: string, finishReason = "stop"): string {
  return JSON.stringify({
    choices: [{ message: { role: "assistant", content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 11, completion_tokens: 22 },
  });
}

function respondWith(body: string, init: ResponseInit = {}): typeof fetch {
  return (async () => new Response(body, { status: 200, ...init })) as unknown as typeof fetch;
}

/** Captures the request the adapter built, then returns a valid response. */
function capturing(): {
  calls: Array<{ url: string; init: RequestInit }>;
  fetchImpl: typeof fetch;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(envelope('{"ok":true}'));
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

describe("OmlxAdapter reasoning mode", () => {
  it("sends nothing about reasoning by default, and records nothing", async () => {
    const { calls, fetchImpl } = capturing();
    const adapter = new OmlxAdapter({ env: ENV, fetchImpl });
    await adapter.complete(REQUEST);

    expect(JSON.parse(String(calls[0]?.init.body))).not.toHaveProperty("chat_template_kwargs");
    expect(adapter.descriptor).not.toHaveProperty("thinking");
  });

  it("switches reasoning off when asked, and records that on the descriptor", async () => {
    const { calls, fetchImpl } = capturing();
    const adapter = new OmlxAdapter({ env: ENV, fetchImpl, thinking: false });
    await adapter.complete(REQUEST);

    expect(JSON.parse(String(calls[0]?.init.body)).chat_template_kwargs).toEqual({
      enable_thinking: false,
    });
    expect(adapter.descriptor.thinking).toBe("off");
  });
});

describe("OmlxAdapter request construction", () => {
  it("posts to the chat completions endpoint with the pinned settings", async () => {
    const { calls, fetchImpl } = capturing();
    await new OmlxAdapter({ env: ENV, fetchImpl }).complete(REQUEST);

    const call = calls[0];
    expect(call?.url).toBe("http://127.0.0.1:8000/v1/chat/completions");

    const body = JSON.parse(String(call?.init.body));
    expect(body.temperature).toBe(TEMPERATURE);
    expect(body.seed).toBe(SEED);
    expect(body.max_tokens).toBe(1024);
    expect(body.model).toBe("Qwen3.6-35B-A3B-MLX-8bit");
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" },
    ]);
  });

  it("sends the key from the environment as a bearer token", async () => {
    const { calls, fetchImpl } = capturing();
    await new OmlxAdapter({ env: ENV, fetchImpl }).complete(REQUEST);

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");
  });

  it("asks for JSON by default, and can be told not to", async () => {
    const withFormat = capturing();
    await new OmlxAdapter({ env: ENV, fetchImpl: withFormat.fetchImpl }).complete(REQUEST);
    expect(JSON.parse(String(withFormat.calls[0]?.init.body)).response_format).toEqual({
      type: "json_object",
    });

    const without = capturing();
    await new OmlxAdapter({
      env: ENV,
      fetchImpl: without.fetchImpl,
      useResponseFormat: false,
    }).complete(REQUEST);
    expect(JSON.parse(String(without.calls[0]?.init.body))).not.toHaveProperty("response_format");
  });

  it("does not double the slash when the base URL has a trailing one", async () => {
    const { calls, fetchImpl } = capturing();
    await new OmlxAdapter({
      env: { ...ENV, OMLX_BASE_URL: "http://127.0.0.1:8000/v1/" },
      fetchImpl,
    }).complete(REQUEST);

    expect(calls[0]?.url).toBe("http://127.0.0.1:8000/v1/chat/completions");
  });
});

describe("OmlxAdapter construction failures", () => {
  it("refuses to construct without a key, before any request is made", () => {
    const { calls, fetchImpl } = capturing();

    expect(() => new OmlxAdapter({ env: {}, fetchImpl })).toThrow(/OMLX_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  // The constraint enforced in code, not only in tests/boundary.test.ts. That
  // test reads source and cannot see a base URL arriving at runtime.
  it("refuses a base URL that is not on this machine", () => {
    expect(
      () => new OmlxAdapter({ env: { ...ENV, OMLX_BASE_URL: "https://api.openai.com/v1" } }),
    ).toThrow(/not on this machine/);
  });
});

describe("OmlxAdapter responses", () => {
  it("returns parsed content, the raw text, finish reason and usage", async () => {
    const adapter = new OmlxAdapter({
      env: ENV,
      fetchImpl: respondWith(envelope('{"criteria":[]}')),
    });

    const response = await adapter.complete(REQUEST);

    expect(response.content).toEqual({ criteria: [] });
    expect(response.raw).toBe('{"criteria":[]}');
    expect(response.finishReason).toBe("stop");
    expect(response.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
  });

  // Truncation must reach the caller. A parser that ignores it silently loses
  // the exclusion criteria at the end of every long block.
  it.each(["length", "max_tokens"])("surfaces truncation reported as %s", async (reason) => {
    const adapter = new OmlxAdapter({
      env: ENV,
      fetchImpl: respondWith(envelope('{"criteria":[]}', reason)),
    });

    expect((await adapter.complete(REQUEST)).finishReason).toBe("length");
  });

  it("reports an unrecognized finish reason as other, not as success", async () => {
    const adapter = new OmlxAdapter({
      env: ENV,
      fetchImpl: respondWith(envelope('{"criteria":[]}', "content_filter")),
    });

    expect((await adapter.complete(REQUEST)).finishReason).toBe("other");
  });

  it("defaults usage to zero when the server omits it", async () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
    });
    const adapter = new OmlxAdapter({ env: ENV, fetchImpl: respondWith(body) });

    expect((await adapter.complete(REQUEST)).usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("OmlxAdapter failure paths", () => {
  async function expectModelError(fetchImpl: typeof fetch, match: RegExp): Promise<void> {
    const adapter = new OmlxAdapter({ env: ENV, fetchImpl });

    await expect(adapter.complete(REQUEST)).rejects.toThrow(ModelError);
    await expect(adapter.complete(REQUEST)).rejects.toThrow(match);
  }

  it("says to check whether oMLX is running when the connection fails", async () => {
    const refused = (() => Promise.reject(new Error("fetch failed"))) as unknown as typeof fetch;

    await expectModelError(refused, /is oMLX running/);
  });

  it("reports a non-2xx with its status and body", async () => {
    const fetchImpl = respondWith('{"error":"model not found"}', {
      status: 404,
      statusText: "Not Found",
    });

    await expectModelError(fetchImpl, /HTTP 404 Not Found/);
    await expectModelError(fetchImpl, /model not found/);
  });

  it("reports a response body that is not JSON", async () => {
    await expectModelError(respondWith("<html>502 Bad Gateway</html>"), /body is not JSON/);
  });

  it("reports model output that is not JSON", async () => {
    await expectModelError(
      respondWith(envelope("Sure! Here are the criteria:")),
      /output is not JSON/,
    );
  });

  it("reports an envelope with no content", async () => {
    await expectModelError(respondWith(JSON.stringify({ choices: [] })), /no choices\[0\]/);
  });

  it("names the endpoint and the model in every failure", async () => {
    await expectModelError(respondWith("not json"), /127\.0\.0\.1:8000/);
    await expectModelError(respondWith("not json"), /Qwen3\.6-35B-A3B-MLX-8bit/);
  });

  // Long HTML error pages and stray model prose are common; an error that
  // pasted the whole body would be unreadable in a test runner.
  it("truncates a very long body in the error", async () => {
    const adapter = new OmlxAdapter({ env: ENV, fetchImpl: respondWith("x".repeat(5000)) });

    await expect(adapter.complete(REQUEST)).rejects.toThrow(/\(5000 chars\)/);
  });
});

describe("descriptor", () => {
  it("records what CLAUDE.md requires of a reported result", () => {
    const { descriptor } = new OmlxAdapter({ env: ENV, fetchImpl: capturing().fetchImpl });

    expect(descriptor).toEqual({
      model: "Qwen3.6-35B-A3B-MLX-8bit",
      quantization: "8bit",
      temperature: 0,
      seed: SEED,
      adapter: "omlx",
    });
  });

  it.each([
    ["Qwen3.6-35B-A3B-MLX-8bit", "8bit"],
    ["some-model-4bit", "4bit"],
    ["Model-MLX-6Bit", "6bit"],
  ])("reads quantization %s as %s", (model, expected) => {
    expect(quantizationFrom(model)).toBe(expected);
  });

  // An honest absence beats a guess: a wrong quantization in a committed
  // result is worse than one that says it does not know.
  it("says unknown rather than guessing when the name does not carry it", () => {
    expect(quantizationFrom("gpt-4o")).toBe("unknown");
  });
});

describe("truncated output", () => {
  // Incomplete JSON is what truncation looks like. Reporting it as malformed
  // would name the symptom and hide the cause, and would make the caller's
  // truncation handling unreachable for the case it exists to catch.
  it("reports truncation rather than malformed JSON when output is cut off", async () => {
    const cutOff = '{"criteria": [{"quote": "At least 18 years of ag';
    const adapter = new OmlxAdapter({
      env: ENV,
      fetchImpl: respondWith(envelope(cutOff, "length")),
    });

    const response = await adapter.complete(REQUEST);

    expect(response.finishReason).toBe("length");
    expect(response.content).toBeUndefined();
    expect(response.raw).toBe(cutOff);
  });

  it("still fails loudly on unparseable output that was not truncated", async () => {
    const adapter = new OmlxAdapter({
      env: ENV,
      fetchImpl: respondWith(envelope("Sure! Here are the criteria:", "stop")),
    });

    await expect(adapter.complete(REQUEST)).rejects.toThrow(/output is not JSON/);
  });
});

describe("listLocalModels (slice 0017)", () => {
  const ENV = { OMLX_API_KEY: "local-key" };

  function answering(status: number, body: unknown): { fetchImpl: typeof fetch; urls: string[] } {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { fetchImpl, urls };
  }

  it("lists what the local server serves, from its models route", async () => {
    const { fetchImpl, urls } = answering(200, { data: [{ id: "A-8bit" }, { id: "B-4bit" }] });
    expect(await listLocalModels(ENV, fetchImpl)).toEqual({
      reachable: true,
      models: ["A-8bit", "B-4bit"],
    });
    expect(urls).toEqual(["http://127.0.0.1:8000/v1/models"]);
  });

  it("says why it can't, and never throws", async () => {
    const refused = answering(401, {});
    expect(await listLocalModels(ENV, refused.fetchImpl)).toMatchObject({
      reachable: true,
      models: [],
      problem: "the server answered 401",
    });
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await listLocalModels(ENV, down)).toMatchObject({ reachable: false, models: [] });
    expect(await listLocalModels({}, down)).toMatchObject({
      reachable: false,
      problem: expect.stringMatching(/OMLX_API_KEY is not set/),
    });
  });

  it("refuses an address off this machine before asking it anything", async () => {
    const { fetchImpl, urls } = answering(200, { data: [] });
    const result = await listLocalModels(
      { ...ENV, OMLX_BASE_URL: "https://example.com/v1" },
      fetchImpl,
    );
    expect(result).toMatchObject({ reachable: false });
    expect(urls).toEqual([]);
  });
});
