import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  admittedModels,
  CATALOG,
  catalogEntry,
  DEFAULT_MODEL_FOR,
  PROVIDERS,
} from "../../src/models/catalog.js";
import { keyAppearsIn, keyVariable, readKey } from "../../src/models/keys.js";
import { redact } from "../../src/models/redact.js";
import { formatSpec, isFrontier, parseModelSpec } from "../../src/models/spec.js";
import { ModelError } from "../../src/models/types.js";
import { SENTINEL_KEY } from "./fixtures.js";

describe("the catalog", () => {
  it("has a default for every provider, and the default is admitted", () => {
    for (const provider of PROVIDERS) {
      expect(catalogEntry(provider, DEFAULT_MODEL_FOR[provider])).toBeDefined();
    }
  });

  // The admission rule. A model that can't run with reasoning off would make a
  // comparison with the local agent explain a difference in reasoning.
  it("admits only models that can run with reasoning off", () => {
    expect(CATALOG.every((e) => e.reasoningOff !== undefined)).toBe(true);
    expect(admittedModels("anthropic")).not.toContain("claude-opus-5-5");
    expect(admittedModels("anthropic")).not.toContain("claude-fable-5-1");
  });

  // A null with no reason would leave a result's reader guessing.
  it("gives a reason for every setting it can't send", () => {
    for (const e of CATALOG) {
      if (e.temperature === null) expect(e.unset.temperature).toBeTruthy();
      if (e.seed === null) expect(e.unset.seed).toBeTruthy();
      if (e.seed === "send") expect(e.seedGuarantee).toBe("best-effort");
    }
  });

  it("builds batch only where this project has a batch path", () => {
    expect(CATALOG.filter((e) => e.batch !== null).map((e) => e.provider)).toEqual([
      "anthropic",
      "anthropic",
    ]);
  });
});

describe("parseModelSpec", () => {
  it("reads oMLX with and without a model", () => {
    expect(parseModelSpec("omlx")).toEqual({ provider: "omlx" });
    expect(parseModelSpec("omlx:Some-Model-4bit")).toEqual({
      provider: "omlx",
      model: "Some-Model-4bit",
    });
  });

  it("takes a bare provider to mean its cheapest admitted model", () => {
    expect(parseModelSpec("anthropic")).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });
    expect(parseModelSpec("openai")).toEqual({ provider: "openai", model: "gpt-6-luna" });
    expect(parseModelSpec("xai")).toEqual({ provider: "xai", model: "grok-4.3" });
    expect(parseModelSpec("anthropic:claude-sonnet-5").model).toBe("claude-sonnet-5");
  });

  // A mistyped id must be an error, not a run at an unknown price.
  it("refuses a model outside the catalog and names the admitted ones", () => {
    expect(() => parseModelSpec("anthropic:claude-opus-5-5")).toThrow(/claude-haiku-4-5/);
    expect(() => parseModelSpec("anthropic:claude-haiku-4-5-20251001")).toThrow(ModelError);
  });

  it("refuses an unknown provider and an empty model", () => {
    expect(() => parseModelSpec("gemini")).toThrow(/unknown provider/);
    expect(() => parseModelSpec("anthropic:")).toThrow(/nothing after the colon/);
  });

  it("formats and classifies a spec", () => {
    expect(formatSpec(parseModelSpec("xai"))).toBe("xai:grok-4.3");
    expect(formatSpec(parseModelSpec("omlx"))).toBe("omlx");
    expect(isFrontier(parseModelSpec("omlx"))).toBe(false);
    expect(isFrontier(parseModelSpec("openai"))).toBe(true);
  });
});

describe("keys", () => {
  const SENTINEL = SENTINEL_KEY;

  it("reads exactly one variable per provider", () => {
    expect(readKey("anthropic", { ANTHROPIC_API_KEY: SENTINEL })).toBe(SENTINEL);
    expect(keyVariable("openai")).toBe("OPENAI_API_KEY");
    expect(keyVariable("xai")).toBe("XAI_API_KEY");
  });

  // "Refuses to start without its key" means that key, set on purpose.
  it("refuses a missing or empty key, naming the variable, and takes no substitute", () => {
    expect(() => readKey("anthropic", {})).toThrow(/ANTHROPIC_API_KEY is not set/);
    expect(() => readKey("openai", { OPENAI_API_KEY: "  " })).toThrow(/OPENAI_API_KEY/);
    expect(() => readKey("anthropic", { ANTHROPIC_AUTH_TOKEN: SENTINEL })).toThrow(ModelError);
  });

  it("finds a key in text, and finds nothing when no key is set", () => {
    const env = { XAI_API_KEY: SENTINEL };
    expect(keyAppearsIn("xai", `{"echo":"${SENTINEL}"}`, env)).toBe(true);
    expect(keyAppearsIn("xai", '{"ok":true}', env)).toBe(false);
    expect(keyAppearsIn("xai", "anything", {})).toBe(false);
  });

  it("redacts a key wherever it appears, and leaves text alone without one", () => {
    expect(redact(`bad key ${SENTINEL}; again ${SENTINEL}`, SENTINEL)).toBe(
      "bad key [key]; again [key]",
    );
    expect(redact("nothing here", "")).toBe("nothing here");
  });
});

/**
 * Slice 0017: a model is marked tested only by the run that tested it. The
 * app's Settings says "Not yet tested against the live API" for the rest.
 */
describe("which models have met the live API", () => {
  const SPEND = new URL("../../evals/results/spend.jsonl", import.meta.url);
  const smokeRuns = readFileSync(SPEND, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as { date: string; script: string; spec: string })
    .filter((line) => line.script === "models:smoke");

  function tested(spec: string, date: string): boolean {
    return smokeRuns.some((run) => run.spec === spec && run.date.slice(0, 7) === date);
  }

  it("dates every tested model by a committed smoke run on that model and month", () => {
    const dated = CATALOG.filter((e) => e.smokeTested !== null);
    expect(dated.length).toBeGreaterThan(0);
    for (const entry of dated) {
      expect(tested(`${entry.provider}:${entry.model}`, entry.smokeTested as string)).toBe(true);
    }
  });

  it("would catch a model dated without its run", () => {
    expect(tested("openai:gpt-6-luna", "2026-10")).toBe(false);
    expect(tested("anthropic:claude-haiku-4-5", "2026-09")).toBe(false);
  });
});
