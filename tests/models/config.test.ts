import { describe, expect, it } from "vitest";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  loopbackProblems,
  ModelError,
  normalizeBaseUrl,
  readOmlxConfig,
  withLocalSettings,
} from "../../src/models/index.js";

/**
 * Configuration is read from the environment and never from a committed file,
 * so these tests pass an explicit env rather than touching `process.env`.
 */
describe("readOmlxConfig", () => {
  it("defaults the base URL and model, and requires only the key", () => {
    const config = readOmlxConfig({ OMLX_API_KEY: "test-key" });

    expect(config).toEqual({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: "test-key",
      model: DEFAULT_MODEL,
    });
  });

  it("takes overrides from the environment", () => {
    const config = readOmlxConfig({
      OMLX_API_KEY: "test-key",
      OMLX_BASE_URL: "http://localhost:9000/v1",
      OMLX_MODEL: "some-other-model",
    });

    expect(config.baseUrl).toBe("http://localhost:9000/v1");
    expect(config.model).toBe("some-other-model");
  });

  it("names the variable when the key is missing", () => {
    expect(() => readOmlxConfig({})).toThrow(ModelError);
    expect(() => readOmlxConfig({})).toThrow(/OMLX_API_KEY is not set/);
  });

  it("says not to commit the key, because that is the mistake worth preventing", () => {
    expect(() => readOmlxConfig({})).toThrow(/committed/);
  });

  // An empty value is the same fault as an absent one. A blank .env line
  // should not produce an Authorization header reading "Bearer ".
  it("treats an empty key as missing", () => {
    expect(() => readOmlxConfig({ OMLX_API_KEY: "" })).toThrow(/OMLX_API_KEY is not set/);
  });

  it("reports every problem at once rather than the first", () => {
    try {
      readOmlxConfig({ OMLX_BASE_URL: "https://api.example.com/v1" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ModelError);
      expect((error as ModelError).problems).toHaveLength(2);
    }
  });
});

describe("loopbackProblems", () => {
  it.each([
    "http://127.0.0.1:8000/v1",
    "http://localhost:8000/v1",
    "http://[::1]:8000/v1",
  ])("accepts %s", (url) => {
    expect(loopbackProblems(url)).toEqual([]);
  });

  it.each([
    "https://api.openai.com/v1",
    "http://192.168.1.50:8000/v1",
    "https://api.anthropic.com",
    // Looks loopback, is not. The check is on the host, not on the string.
    "http://127.0.0.1.evil.com/v1",
  ])("rejects %s", (url) => {
    expect(loopbackProblems(url)).toHaveLength(1);
    expect(loopbackProblems(url)[0]).toMatch(/not on this machine/);
  });

  it("rejects a URL it cannot parse", () => {
    expect(loopbackProblems("not-a-url")[0]).toMatch(/not a valid URL/);
  });

  it("rejects a non-http protocol", () => {
    expect(loopbackProblems("file:///etc/passwd")[0]).toMatch(/must be http or https/);
  });
});

describe("normalizeBaseUrl", () => {
  // oMLX's settings pane reports the listen address as 127.0.0.1:8000 while
  // the OpenAI-compatible base is .../v1, so copying the former is the obvious
  // mistake. A 404 from /chat/completions is a confusing way to learn that.
  it.each([
    ["http://127.0.0.1:8000", "http://127.0.0.1:8000/v1"],
    ["http://127.0.0.1:8000/", "http://127.0.0.1:8000/v1"],
    ["http://localhost:8000", "http://localhost:8000/v1"],
  ])("completes the bare origin %s to %s", (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });

  it.each([
    ["http://127.0.0.1:8000/v1", "http://127.0.0.1:8000/v1"],
    ["http://127.0.0.1:8000/v1/", "http://127.0.0.1:8000/v1"],
    // Left alone: pointing at another prefix stays possible and explicit.
    ["http://127.0.0.1:8000/openai/v1", "http://127.0.0.1:8000/openai/v1"],
  ])("leaves %s alone", (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });

  it("is applied by readOmlxConfig", () => {
    const config = readOmlxConfig({
      OMLX_API_KEY: "test-key",
      OMLX_BASE_URL: "http://127.0.0.1:8000",
    });

    expect(config.baseUrl).toBe("http://127.0.0.1:8000/v1");
  });

  // A blank line in .env is an absent value, not an empty base URL.
  it("falls back to the default when the variable is set but empty", () => {
    const config = readOmlxConfig({ OMLX_API_KEY: "test-key", OMLX_BASE_URL: "", OMLX_MODEL: "" });

    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.model).toBe(DEFAULT_MODEL);
  });
});

describe("withLocalSettings (slice 0017)", () => {
  it("lays saved settings over the environment, field by field", () => {
    const env = { OMLX_API_KEY: "env-key", OMLX_MODEL: "Env-Model-8bit" };
    const config = readOmlxConfig(
      withLocalSettings(env, { baseUrl: "http://localhost:9000/v1", model: " ", apiKey: "saved" }),
    );
    expect(config).toEqual({
      baseUrl: "http://localhost:9000/v1",
      apiKey: "saved",
      model: "Env-Model-8bit",
    });
  });

  it("still refuses an address off this machine", () => {
    expect(() =>
      readOmlxConfig(withLocalSettings({ OMLX_API_KEY: "k" }, { baseUrl: "http://10.0.0.5/v1" })),
    ).toThrow(/not on this machine/);
  });
});
