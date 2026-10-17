import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModelError } from "../../src/models/index.js";
import { ConversationService } from "../../src/server/index.js";
import {
  ConversationModel,
  settingsAgent,
  settingsParser,
  testConnection,
} from "../../src/server/models.js";
import { SettingsStore } from "../../src/server/settings.js";
import { MemoryTransport } from "../../src/transport/index.js";
import { SERVED } from "../fixtures/conversation.js";
import { fixtureFetch, loadFixture, SENTINEL_KEY } from "../models/fixtures.js";

/**
 * The app's models from Settings (slice 0017), over recorded responses: no
 * key but the sentinel, and no network.
 */
const HAIKU = { provider: "anthropic" as const, model: "claude-haiku-4-5" };
const REQUEST = { system: "s", user: "u", responseFormat: "json" as const, maxOutputTokens: 64 };

function storeWithKey(): SettingsStore {
  const store = new SettingsStore(
    join(mkdtempSync(join(tmpdir(), "prescreen-models-")), "local"),
    {},
  );
  store.saveKey("anthropic", SENTINEL_KEY);
  store.update({ choice: HAIKU });
  return store;
}

function recorded(times: number) {
  return fixtureFetch(...Array.from({ length: times }, () => loadFixture("anthropic", "ask-ok")));
}

function spendLines(store: SettingsStore): Array<{ role: string; spec: string; calls: number }> {
  const path = join(store.dir, "spend.jsonl");
  return existsSync(path)
    ? readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
}

describe("the agent from Settings (slice 0017)", () => {
  it("names a new screening's model by what Settings chose", () => {
    const store = storeWithKey();
    const agent = settingsAgent({ store, env: {} });
    expect(agent.current()).toBe("anthropic:claude-haiku-4-5");
    expect(agent.describe()).toEqual({ model: "claude-haiku-4-5", adapter: "anthropic" });
  });

  it("keeps one budget across a screening's turns, and logs its spend once it's released", async () => {
    const store = storeWithKey();
    const { fetchImpl } = recorded(2);
    const model = new ConversationModel("anthropic:claude-haiku-4-5", {
      store,
      env: {},
      fetchImpl,
    });
    await model.complete(REQUEST);
    const first = model.spending()?.usd ?? 0;
    await model.complete(REQUEST);
    expect(first).toBeGreaterThan(0);
    expect(model.spending()).toEqual({ usd: first * 2, capUsd: 0.5 });

    model.release();
    model.release();
    expect(spendLines(store)).toEqual([
      expect.objectContaining({ role: "agent", spec: "anthropic:claude-haiku-4-5", calls: 2 }),
    ]);
  });

  it("refuses to continue a screening on a model it didn't start on", async () => {
    const store = storeWithKey();
    const model = new ConversationModel("anthropic:claude-haiku-4-5", { store, env: {} });
    store.update({ choice: { provider: "openai", model: "gpt-6-luna" } });
    const error = await model.complete(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelError);
    expect((error as ModelError).problems[0]).toBe(
      "This screening started on Anthropic · claude-haiku-4-5. Choose it in Settings to continue.",
    );
  });

  it("stops at the screening's cap with words a person can act on", async () => {
    const store = storeWithKey();
    store.update({ caps: { screeningUsd: 0.05 } });
    const { fetchImpl, sent } = recorded(1);
    const model = new ConversationModel("anthropic:claude-haiku-4-5", {
      store,
      env: {},
      fetchImpl,
    });
    // Its worst case, 20,000 output tokens at $5 a million, is $0.10: over the cap before sending.
    const error = await model
      .complete({ ...REQUEST, maxOutputTokens: 20_000 })
      .catch((e: unknown) => e);
    expect((error as ModelError).problems[0]).toBe(
      "This screening reached its $0.05 limit. What's recorded so far is kept. Raise the limit in Settings to continue.",
    );
    expect(sent).toEqual([]);
  });

  it("costs nothing and says so for the local model", () => {
    const store = new SettingsStore(
      join(mkdtempSync(join(tmpdir(), "prescreen-models-")), "l"),
      {},
    );
    const model = new ConversationModel("omlx", { store, env: { OMLX_API_KEY: "local" } });
    expect(model.spending()).toBeNull();
  });
});

describe("a screening keeps its model through the service (slice 0017)", () => {
  it("saves the model it started on, and won't continue after a switch", async () => {
    const store = storeWithKey();
    const { fetchImpl } = recorded(1);
    const transport = new MemoryTransport();
    const svc = new ConversationService({
      studies: SERVED,
      source: "labels",
      agent: settingsAgent({ store, env: {}, fetchImpl }),
      transport,
    });
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    expect(transport.view(id)?.status).toBe("idle");

    store.update({ choice: { provider: "openai", model: "gpt-6-luna" } });
    expect(transport.send(id, "I'm 54.").ok).toBe(true);
    await svc.settled(id);
    expect(transport.view(id)).toMatchObject({
      status: "failed",
      detail:
        "This screening started on Anthropic · claude-haiku-4-5. Choose it in Settings to continue.",
    });
  });
});

describe("the trial reader from Settings (slice 0017)", () => {
  it("builds a fresh capped reader each time, and logs a read's spend", async () => {
    const store = storeWithKey();
    const { fetchImpl } = recorded(1);
    const { parserFor, released } = settingsParser({ store, env: {}, fetchImpl });
    const parser = parserFor();
    expect(parserFor()).not.toBe(parser);
    await parser.complete(REQUEST);
    released(parser);
    expect(spendLines(store)).toEqual([
      expect.objectContaining({ role: "parser", spec: "anthropic:claude-haiku-4-5", calls: 1 }),
    ]);
  });

  it("refuses a hosted reader with no key, in words for the trial's card", () => {
    const store = storeWithKey();
    store.removeKey("anthropic");
    expect(() => settingsParser({ store, env: {} }).parserFor()).toThrow(
      /No key saved for Anthropic/,
    );
  });
});

describe("the connection test (slice 0017)", () => {
  it("asks one made-up question and says whether the answer has the agent's shape", async () => {
    const store = storeWithKey();
    const { fetchImpl, sent } = recorded(1);
    const result = await testConnection({ store, env: {}, fetchImpl }, HAIKU);
    expect(result).toMatchObject({ ok: true, servedModel: "claude-haiku-4-5-20251001" });
    expect(sent).toHaveLength(1);
    expect(spendLines(store)).toEqual([expect.objectContaining({ role: "check", calls: 1 })]);
  });

  it("never repeats the key, even when the provider's error does", async () => {
    const store = storeWithKey();
    const echoing = (async (_url: string, init: RequestInit = {}) => {
      const headers = init.headers as Record<string, string>;
      return new Response(
        JSON.stringify({ error: { message: `bad key ${headers["x-api-key"]}` } }),
        {
          status: 401,
        },
      );
    }) as unknown as typeof fetch;
    const result = await testConnection({ store, env: {}, fetchImpl: echoing }, HAIKU);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(SENTINEL_KEY);
  });
});

/**
 * Found at gate 2: a screening's spend was logged only when it finished or
 * was deleted, so stopping the app mid-screening lost it. Each turn logs
 * what it added, and the lines add up to what was spent, never more.
 */
describe("a screening's spend reaches the ledger as it goes (gate 2)", () => {
  it("logs after every turn, and the lines sum to the screening's spend", async () => {
    const store = storeWithKey();
    const { fetchImpl } = fixtureFetch(
      loadFixture("anthropic", "ask-ok"),
      loadFixture("anthropic", "read-ok"),
      loadFixture("anthropic", "ask-ok"),
    );
    const transport = new MemoryTransport();
    const svc = new ConversationService({
      studies: SERVED,
      source: "labels",
      agent: settingsAgent({ store, env: {}, fetchImpl }),
      transport,
    });
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    expect(spendLines(store).map((l) => l.calls)).toEqual([1]);

    expect(transport.send(id, "I'm 54.").ok).toBe(true);
    await svc.settled(id);
    const lines = spendLines(store);
    expect(lines.map((l) => l.calls)).toEqual([1, 2]);
    const total = svc.inspect(id)?.spent?.usd ?? 0;
    const logged = lines.reduce((sum, l) => sum + (l as unknown as { usd: number }).usd, 0);
    expect(logged).toBeCloseTo(total, 10);
  });
});
