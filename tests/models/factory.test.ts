import { describe, expect, it } from "vitest";
import {
  createAdapter,
  createAppAdapter,
  createLocalAdapter,
  isBudgetStop,
  parseModelSpec,
  spentBy,
} from "../../src/models/index.js";
import { anthropicExpected, fixtureFetch, loadFixture, SENTINEL_KEY } from "./fixtures.js";

const OMLX_ENV = { OMLX_API_KEY: "local-key" };
const BUDGET = { maxCalls: 1, maxUsd: 1 };
const REQUEST = {
  system: "s",
  user: "u",
  responseFormat: "json" as const,
  maxOutputTokens: 64,
};

describe("createLocalAdapter", () => {
  it("builds oMLX, with the spec's model when it names one", () => {
    expect(createLocalAdapter(parseModelSpec("omlx"), { env: OMLX_ENV }).descriptor.adapter).toBe(
      "omlx",
    );
    expect(
      createLocalAdapter(parseModelSpec("omlx:Other-Model-4bit"), { env: OMLX_ENV }).descriptor,
    ).toMatchObject({ model: "Other-Model-4bit", quantization: "4bit" });
  });

  it("passes reasoning off through, as the scripts did before", () => {
    expect(
      createLocalAdapter(parseModelSpec("omlx"), { env: OMLX_ENV, thinking: false }).descriptor
        .thinking,
    ).toBe("off");
  });

  // The page, the server, the chat and the renderer use this. A frontier spec
  // reaching it is refused before any key is looked at.
  it("refuses every frontier provider, even with a key set", () => {
    for (const spec of ["anthropic", "openai", "xai"]) {
      expect(() =>
        createLocalAdapter(parseModelSpec(spec), {
          env: {
            ANTHROPIC_API_KEY: SENTINEL_KEY,
            OPENAI_API_KEY: SENTINEL_KEY,
            XAI_API_KEY: SENTINEL_KEY,
          },
        }),
      ).toThrow(/local model only/);
    }
  });
});

describe("createAdapter", () => {
  it("builds oMLX with no budget, and reports no spend for it", () => {
    const adapter = createAdapter(parseModelSpec("omlx"), { env: OMLX_ENV });
    expect(adapter.descriptor.adapter).toBe("omlx");
    expect(spentBy(adapter)).toBeUndefined();
  });

  it("refuses a frontier provider without a budget", () => {
    expect(() =>
      createAdapter(parseModelSpec("anthropic"), { env: { ANTHROPIC_API_KEY: SENTINEL_KEY } }),
    ).toThrow(/without a budget/);
  });

  it("refuses a frontier provider without its key", () => {
    expect(() => createAdapter(parseModelSpec("xai"), { env: {}, budget: BUDGET })).toThrow(
      /XAI_API_KEY is not set/,
    );
  });

  // The only way to a frontier adapter is through the wrapper, so the cap holds.
  it("always wraps a frontier adapter in the budget", async () => {
    const fixture = loadFixture("anthropic", "ask-ok");
    const { fetchImpl } = fixtureFetch(fixture);
    const adapter = createAdapter(parseModelSpec("anthropic"), {
      env: { ANTHROPIC_API_KEY: SENTINEL_KEY },
      budget: BUDGET,
      fetchImpl,
    });

    expect(adapter.descriptor).toMatchObject({ model: "claude-haiku-4-5", adapter: "anthropic" });
    await adapter.complete(REQUEST);
    expect(spentBy(adapter)).toMatchObject({ calls: 1, ...anthropicExpected(fixture.body).usage });
    expect(isBudgetStop(await adapter.complete(REQUEST).catch((e: unknown) => e))).toBe(true);
  });

  it("builds each provider's adapter", () => {
    const env = { OPENAI_API_KEY: SENTINEL_KEY, XAI_API_KEY: SENTINEL_KEY };
    expect(
      createAdapter(parseModelSpec("openai"), { env, budget: BUDGET }).descriptor.adapter,
    ).toBe("openai");
    expect(createAdapter(parseModelSpec("xai"), { env, budget: BUDGET }).descriptor.adapter).toBe(
      "xai",
    );
  });
});

describe("createAppAdapter (slice 0017)", () => {
  const NONE = { keys: {}, local: {} };

  it("builds the local model with what Settings saved over the environment", () => {
    const adapter = createAppAdapter(
      { provider: "omlx", model: "Saved-Model-4bit" },
      { keys: {}, local: { apiKey: "saved-local-key" } },
      { budget: BUDGET, env: {}, thinking: false },
    );
    expect(adapter.descriptor).toMatchObject({
      adapter: "omlx",
      model: "Saved-Model-4bit",
      thinking: "off",
    });
    expect(spentBy(adapter)).toBeUndefined();
  });

  it("builds a hosted provider with the saved key, inside the budget", async () => {
    const fixture = loadFixture("anthropic", "ask-ok");
    const { fetchImpl, sent } = fixtureFetch(fixture);
    const adapter = createAppAdapter(
      { provider: "anthropic", model: "claude-haiku-4-5" },
      { keys: { anthropic: SENTINEL_KEY }, local: {} },
      { budget: BUDGET, env: {}, fetchImpl },
    );
    await adapter.complete(REQUEST);
    expect(sent[0]?.headers["x-api-key"]).toBe(SENTINEL_KEY);
    expect(spentBy(adapter)?.calls).toBe(1);
    expect(isBudgetStop(await adapter.complete(REQUEST).catch((e: unknown) => e))).toBe(true);
  });

  it("refuses a hosted provider with no saved key, even with one in the environment", () => {
    expect(() =>
      createAppAdapter({ provider: "openai", model: "gpt-6-luna" }, NONE, {
        budget: BUDGET,
        env: { OPENAI_API_KEY: SENTINEL_KEY },
      }),
    ).toThrow(/No key saved for OpenAI\. Add one in Settings\./);
  });

  it("refuses a model the catalog doesn't admit", () => {
    expect(() =>
      createAppAdapter(
        { provider: "anthropic", model: "claude-opus-5-5" },
        { keys: { anthropic: SENTINEL_KEY }, local: {} },
        { budget: BUDGET, env: {} },
      ),
    ).toThrow(/not in src\/models\/catalog\.ts/);
  });
});
