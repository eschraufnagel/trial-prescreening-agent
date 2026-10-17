import { describe, expect, it } from "vitest";
import type { CompletionRequest } from "../../src/models/index.js";
import { FakeModelAdapter, ModelError } from "../../src/models/index.js";

/**
 * The fake is shipped code, not a test helper, so it gets tested like shipped
 * code. Slices 0003 through 0008 build on it, and a fake that lies about what
 * it received would make their tests pass for the wrong reason.
 */
const REQUEST: CompletionRequest = {
  system: "system",
  user: "user",
  responseFormat: "json",
  maxOutputTokens: 512,
};

describe("FakeModelAdapter", () => {
  it("returns scripted responses in order", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { step: 1 } },
      { kind: "json", content: { step: 2 } },
    ]);

    expect((await adapter.complete(REQUEST)).content).toEqual({ step: 1 });
    expect((await adapter.complete(REQUEST)).content).toEqual({ step: 2 });
  });

  it("records every request it received, so a test can assert on the prompt", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: {} }]);
    await adapter.complete({ ...REQUEST, user: "criteria text here" });

    expect(adapter.requests).toHaveLength(1);
    expect(adapter.requests[0]?.user).toBe("criteria text here");
  });

  it("can script truncation, which is the case parsers must handle", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { partial: true }, finishReason: "length" },
    ]);

    expect((await adapter.complete(REQUEST)).finishReason).toBe("length");
  });

  it("can script a failure", async () => {
    const adapter = new FakeModelAdapter([{ kind: "error", message: "connection refused" }]);

    await expect(adapter.complete(REQUEST)).rejects.toThrow(/connection refused/);
  });

  it("can hold a response back, like a model that takes its time", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: { late: true }, delayMs: 40 }]);
    const started = Date.now();
    const pending = adapter.complete(REQUEST);

    const first = await Promise.race([pending.then(() => "response"), Promise.resolve("before")]);
    expect(first).toBe("before");
    expect((await pending).content).toEqual({ late: true });
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it("can hold a failure back too, and rejects once the delay is over", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "error", message: "request failed: slow and down", delayMs: 40 },
    ]);
    const started = Date.now();

    await expect(adapter.complete(REQUEST)).rejects.toThrow(/slow and down/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it("can script raw output that is not JSON", async () => {
    const adapter = new FakeModelAdapter([{ kind: "raw", raw: "Sure! Here you go:" }]);

    await expect(adapter.complete(REQUEST)).rejects.toThrow(/not JSON/);
  });

  // Running dry is a test bug, not a model failure, and saying so beats
  // returning an empty response that fails three assertions later.
  it("fails loudly when the script runs out", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: {} }]);
    await adapter.complete(REQUEST);

    await expect(adapter.complete(REQUEST)).rejects.toThrow(ModelError);
    await expect(adapter.complete(REQUEST)).rejects.toThrow(/no scripted response left/);
  });

  it("identifies itself as the fake, so a result cannot claim a real model produced it", () => {
    expect(new FakeModelAdapter().descriptor).toEqual({
      model: "fake",
      quantization: "none",
      temperature: 0,
      seed: 0,
      adapter: "fake",
    });
  });

  it("lets a test override the descriptor to stand in for a specific model", () => {
    const adapter = new FakeModelAdapter([], { descriptor: { model: "pretend-70b", seed: null } });

    expect(adapter.descriptor.model).toBe("pretend-70b");
    expect(adapter.descriptor.seed).toBeNull();
    expect(adapter.descriptor.adapter).toBe("fake");
  });

  it("reports zero usage rather than inventing token counts", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: {} }]);

    expect((await adapter.complete(REQUEST)).usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("uses the responder only once the script is used up", async () => {
    const seen: string[] = [];
    const adapter = new FakeModelAdapter([{ kind: "json", content: { from: "script" } }], {
      respond: (request) => {
        seen.push(request.user);
        return { kind: "json", content: { from: "responder" } };
      },
    });

    expect((await adapter.complete({ ...REQUEST, user: "first" })).content).toEqual({
      from: "script",
    });
    expect((await adapter.complete({ ...REQUEST, user: "second" })).content).toEqual({
      from: "responder",
    });
    expect(seen).toEqual(["second"]);
  });

  it("passes a responder's scripted failure through as a ModelError", async () => {
    const adapter = new FakeModelAdapter([], {
      respond: () => ({ kind: "error", message: "request failed: fetch failed" }),
    });

    await expect(adapter.complete(REQUEST)).rejects.toBeInstanceOf(ModelError);
  });
});
