import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  choiceKey,
  choiceName,
  DEFAULT_CAPS,
  logAppSpend,
  SettingsError,
  SettingsStore,
} from "../../src/server/settings.js";

/** A value no code path may ever send back (slice 0017). */
const SENTINEL = "test-key-00000000";

function freshDir(): string {
  return join(mkdtempSync(join(tmpdir(), "prescreen-settings-")), "local");
}

describe("the settings store (slice 0017)", () => {
  it("with nothing saved, chooses the local model from the environment", () => {
    const store = new SettingsStore(freshDir(), { OMLX_MODEL: "Env-Model-8bit" });
    expect(store.current()).toEqual({ provider: "omlx", model: "Env-Model-8bit" });
    expect(store.caps()).toEqual(DEFAULT_CAPS);
    expect(store.ready()).toBe(false);
    expect(new SettingsStore(freshDir(), { OMLX_API_KEY: "k" }).ready()).toBe(true);
  });

  it("saves a choice, a key and caps, and reads them back after a restart", () => {
    const dir = freshDir();
    const store = new SettingsStore(dir, {});
    store.saveKey("anthropic", ` ${SENTINEL} `);
    store.update({
      choice: { provider: "anthropic", model: "claude-haiku-4-5" },
      caps: { screeningUsd: 1 },
    });
    const again = new SettingsStore(dir, {});
    expect(again.current()).toEqual({ provider: "anthropic", model: "claude-haiku-4-5" });
    expect(again.caps()).toEqual({ screeningUsd: 1, trialUsd: DEFAULT_CAPS.trialUsd });
    expect(again.saved().keys).toEqual({ anthropic: SENTINEL });
    expect(again.ready()).toBe(true);
    again.removeKey("anthropic");
    expect(new SettingsStore(dir, {}).ready()).toBe(false);
  });

  it("writes the file readable only by its owner, in a directory only they can open", () => {
    const dir = freshDir();
    new SettingsStore(dir, {}).saveKey("openai", SENTINEL);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "settings.json")).mode & 0o777).toBe(0o600);
  });

  it("never puts a key in the view", () => {
    const store = new SettingsStore(freshDir(), {});
    for (const provider of ["anthropic", "openai", "xai", "omlx"] as const) {
      store.saveKey(provider, SENTINEL);
    }
    const view = store.view("live", {});
    expect(JSON.stringify(view)).not.toContain(SENTINEL);
    expect(view.providers.every((p) => p.keySaved && p.keyHint === "…0000")).toBe(true);
    expect(view.local).toMatchObject({ keySaved: true, keyHint: "…0000" });
  });

  it("marks which models have met the live API, and each provider's cheapest", () => {
    const view = new SettingsStore(freshDir(), {}).view("live", {});
    const anthropic = view.providers.find((p) => p.provider === "anthropic");
    expect(anthropic?.models.find((m) => m.model === "claude-haiku-4-5")).toMatchObject({
      tested: "2026-10",
      cheapest: true,
    });
    const openai = view.providers.find((p) => p.provider === "openai");
    expect(openai?.models.every((m) => m.tested === null)).toBe(true);
  });

  it("refuses what can't be right, and never repeats a key", () => {
    const store = new SettingsStore(freshDir(), {});
    const refused = (act: () => void) => {
      try {
        act();
      } catch (error) {
        expect(error).toBeInstanceOf(SettingsError);
        expect((error as Error).message).not.toContain(SENTINEL);
        return (error as Error).message;
      }
      throw new Error("not refused");
    };
    expect(
      refused(() => store.update({ choice: { provider: "anthropic", model: "claude-opus-5-5" } })),
    ).toMatch(/no admitted model/);
    expect(refused(() => store.update({ local: { baseUrl: "https://example.com/v1" } }))).toMatch(
      /local\.baseUrl/,
    );
    expect(refused(() => store.update({ caps: { screeningUsd: 0.01 } }))).toMatch(/between/);
    expect(refused(() => store.update({ caps: { trialUsd: 6 } }))).toMatch(/between/);
    expect(refused(() => store.saveKey("anthropic", "  "))).toMatch(/empty/);
    expect(refused(() => store.saveKey("anthropic", `${SENTINEL} extra`))).toMatch(/space/);
    expect(refused(() => store.saveKey("anthropic", "x".repeat(501)))).toMatch(/longer/);
    expect(refused(() => store.saveKey("nobody" as "anthropic", SENTINEL))).toMatch(/No provider/);
  });

  it("reports a file it can't read rather than starting over", () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "settings.json"), "{ not json");
    expect(() => new SettingsStore(dir, {})).toThrow(/can't be read/);
    writeFileSync(join(dir, "settings.json"), '{"version": 2}');
    expect(() => new SettingsStore(dir, {})).toThrow(/version 1/);
  });

  it("names a choice by its key, the same for any local model", () => {
    expect(choiceKey({ provider: "omlx", model: "A" })).toBe("omlx");
    expect(choiceKey({ provider: "xai", model: "grok-4.3" })).toBe("xai:grok-4.3");
    expect(choiceName("anthropic:claude-haiku-4-5")).toBe("Anthropic · claude-haiku-4-5");
    expect(choiceName("omlx")).toBe("the local model");
    // A screening saved in fake mode isn't said to have run on a model.
    expect(choiceName("fixed")).toBe("the scripted stand-in (npm run app -- --fake)");
  });

  it("logs an app's spend in the committed ledger's shape, in its own file", () => {
    const dir = freshDir();
    logAppSpend(dir, "agent", "anthropic:claude-haiku-4-5", {
      calls: 3,
      inputTokens: 900,
      outputTokens: 90,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      usd: 0.0013,
      servedModels: ["claude-haiku-4-5-20251001"],
    });
    const line = JSON.parse(readFileSync(join(dir, "spend.jsonl"), "utf8").trim());
    expect(line).toMatchObject({ script: "app", role: "agent", calls: 3, usd: 0.0013 });
  });
});
