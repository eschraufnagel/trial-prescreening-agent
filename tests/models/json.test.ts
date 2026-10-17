import { describe, expect, it } from "vitest";
import { usageFrom } from "../../src/models/chat-completions.js";
import { describeSettings, unsetReasons } from "../../src/models/index.js";
import { parseModelJson } from "../../src/models/json.js";

/**
 * Every adapter reads a model's answer with `parseModelJson`, so what counts
 * as valid is the same for every provider. These pin exactly what it forgives.
 */
describe("parseModelJson", () => {
  it("parses a bare object, with surrounding whitespace", () => {
    expect(parseModelJson('  {"message":"hi"}\n')).toEqual({ message: "hi" });
  });

  it("forgives one Markdown fence, with or without a language", () => {
    expect(parseModelJson('```json\n{"message":"hi"}\n```')).toEqual({ message: "hi" });
    expect(parseModelJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("does not forgive prose around the JSON", () => {
    expect(() => parseModelJson('Here it is: {"a":1}')).toThrow(SyntaxError);
    expect(() => parseModelJson('```json\n{"a":1}\n```\nHope that helps.')).toThrow(SyntaxError);
  });

  it("leaves oMLX's one-element-array answers exactly as they were", () => {
    expect(parseModelJson('[{"a":1}]')).toEqual([{ a: 1 }]);
  });
});

describe("usageFrom", () => {
  it("reads oMLX's usage exactly as before, with no cache fields", () => {
    expect(usageFrom({ usage: { prompt_tokens: 11, completion_tokens: 22 } })).toEqual({
      inputTokens: 11,
      outputTokens: 22,
    });
  });

  // Cached tokens are inside prompt_tokens in this shape; inputTokens means
  // input billed at the full rate, so they come out of it.
  it("takes cached tokens out of the full-rate input", () => {
    const envelope = {
      usage: {
        prompt_tokens: 1500,
        completion_tokens: 40,
        prompt_tokens_details: { cached_tokens: 1024 },
      },
    };
    expect(usageFrom(envelope)).toEqual({
      inputTokens: 476,
      outputTokens: 40,
      cacheReadTokens: 1024,
    });
  });
});

describe("describeSettings", () => {
  const base = { model: "m", quantization: "none", adapter: "x" };

  it("prints a local run's settings as numbers", () => {
    expect(describeSettings({ ...base, temperature: 0, seed: 20260921, thinking: "off" })).toBe(
      "temperature 0, seed 20260921, thinking off",
    );
  });

  // "null" printed as-is reads like a bug, and a bare seed reads like a guarantee.
  it("says why a setting is missing, and when a seed is only best effort", () => {
    expect(
      describeSettings({
        ...base,
        temperature: null,
        seed: null,
        unset: { temperature: "rejected by the model", seed: "the API has no seed" },
      }),
    ).toBe(
      "temperature not settable (rejected by the model), seed none (the API has no seed), " +
        "thinking default",
    );
    expect(
      describeSettings({ ...base, temperature: 0, seed: 7, seedGuarantee: "best-effort" }),
    ).toBe("temperature 0, seed 7 (best effort), thinking default");
  });

  it("records nothing extra for a local run", () => {
    expect(unsetReasons({ ...base, temperature: 0, seed: 1 })).toEqual({});
  });
});
