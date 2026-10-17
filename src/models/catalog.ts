/**
 * The frontier models this project may call, with their prices and what each
 * accepts. Committed and dated, because a price or a parameter rule that is
 * only in someone's memory is one that goes stale unnoticed.
 *
 * **The admission rule is that reasoning can be switched off.** The local
 * agent runs with it off (slice 0004), and a comparison has to hold that fixed
 * across models or explain the difference. Claude Opus 5.5 and Fable 5.1
 * cannot turn thinking off, so they are not here.
 *
 * **A model not listed is refused**, not estimated at zero. Adding one is a
 * one-entry diff with its price, in the open. That makes a mistyped model id
 * an error rather than a run at an unknown price.
 *
 * Prices are US dollars per million tokens, standard tier, for prompts under
 * 200K tokens (every prompt in this project is far below that).
 *
 * **`smokeTested` is the month a passing `npm run models:smoke` was made** on
 * that model, run by the owner with their key. Null means the adapter has
 * only met recorded documentation, never the live API, and the app's Settings
 * says so (slice 0017). A test requires every month to match a `models:smoke`
 * line in the committed `evals/results/spend.jsonl`.
 */

import type { ModelDescriptor } from "./types.js";

export type Provider = "anthropic" | "openai" | "xai";

export const PROVIDERS: readonly Provider[] = ["anthropic", "openai", "xai"];

/** How the page and its messages name each provider (slice 0017). */
export const PROVIDER_NAMES: Readonly<Record<Provider, string>> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
};

/** When the prices and rules below were last checked against the sources. */
export const PRICES_AS_OF = "2026-09";

export interface CatalogEntry {
  provider: Provider;
  model: string;
  price: {
    input: number;
    output: number;
    /** Writing to Anthropic's 5-minute prompt cache. Absent where writes aren't billed separately. */
    cacheWrite?: number;
    /** Reading from a prompt cache. */
    cacheRead?: number;
  };
  /**
   * The multiplier on every token when sent through this project's batch
   * path. Null where this project has no batch path for the provider, whatever
   * the provider offers.
   */
  batch: number | null;
  /** 0 when `temperature: 0` is sent; null when the model rejects it. */
  temperature: 0 | null;
  /** "send" when `SEED` is sent; null when it isn't. */
  seed: "send" | null;
  seedGuarantee?: "best-effort";
  /** How reasoning is switched off for this model. */
  reasoningOff: "omit-thinking" | "thinking-disabled" | "reasoning-effort-none";
  /** Below this many tokens a prompt is not cached at all. Null where caching is automatic and unstated. */
  cacheMinimumTokens: number | null;
  /** Why temperature or seed is null, recorded on every result. */
  unset: { temperature?: string; seed?: string };
  /**
   * Where the prices and rules came from. Citations, written without a
   * scheme: nothing fetches them, and `tests/boundary.test.ts` allows no host
   * in `src/models/` but loopback and the three API hosts in their own files.
   */
  sources: readonly string[];
  /** The date (UTC) of a passing smoke run on this model, or null if none was made. */
  smokeTested: string | null;
}

const ANTHROPIC_SOURCES = [
  "claude-api skill, model table cached 2026-06 (pricing, sampling, caching, batches)",
];

export const CATALOG: readonly CatalogEntry[] = [
  {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    price: { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
    batch: 0.5,
    temperature: 0,
    seed: null,
    // Haiku 4.5 does not think unless asked, so leaving `thinking` out is off.
    reasoningOff: "omit-thinking",
    cacheMinimumTokens: 4096,
    unset: { seed: "the Claude API has no seed parameter" },
    sources: ANTHROPIC_SOURCES,
    smokeTested: "2026-10",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-5",
    price: { input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.2 },
    batch: 0.5,
    temperature: null,
    seed: null,
    reasoningOff: "thinking-disabled",
    cacheMinimumTokens: 1024,
    unset: {
      temperature: "rejected by claude-sonnet-5; the provider's default applied",
      seed: "the Claude API has no seed parameter",
    },
    sources: ANTHROPIC_SOURCES,
    smokeTested: null,
  },
  {
    provider: "openai",
    model: "gpt-6-luna",
    // The pricing page also lists cache writes at $0.125, which Chat
    // Completions usage does not report separately. Unpriced here: at most
    // $0.025 per million tokens written, under-counted.
    price: { input: 0.1, output: 0.5, cacheRead: 0.01 },
    batch: null,
    // Accepted only while reasoning effort is "none", which it always is here.
    temperature: 0,
    seed: null,
    reasoningOff: "reasoning-effort-none",
    cacheMinimumTokens: null,
    unset: { seed: "not documented for gpt-6-luna; not sent" },
    sources: [
      "developers.openai.com/api/docs/pricing",
      "developers.openai.com/api/docs/models/gpt-6-luna",
      "developers.openai.com/api/docs/guides/latest-model",
    ],
    smokeTested: null,
  },
  {
    provider: "xai",
    model: "grok-4.3",
    price: { input: 1.25, output: 2.5, cacheRead: 0.2 },
    batch: null,
    temperature: 0,
    seed: "send",
    seedGuarantee: "best-effort",
    reasoningOff: "reasoning-effort-none",
    cacheMinimumTokens: null,
    unset: {},
    sources: [
      "docs.x.ai/docs/models/grok-4.3",
      "docs.x.ai/developers/rest-api-reference/inference/chat-completions",
    ],
    smokeTested: null,
  },
];

/** The cheapest admitted model per provider: what a bare provider name means. */
export const DEFAULT_MODEL_FOR: Readonly<Record<Provider, string>> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-6-luna",
  xai: "grok-4.3",
};

export function catalogEntry(provider: Provider, model: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.provider === provider && e.model === model);
}

export function admittedModels(provider: Provider): string[] {
  return CATALOG.filter((e) => e.provider === provider).map((e) => e.model);
}

/**
 * The descriptor every result from this model records. Seed is `SEED` when
 * the catalog says it's sent, and null with its reason otherwise. Reasoning
 * is always off, because that's the admission rule.
 */
export function descriptorFor(entry: CatalogEntry, seed: number): ModelDescriptor {
  const unset = entry.unset.temperature || entry.unset.seed ? entry.unset : undefined;
  return {
    model: entry.model,
    quantization: "none",
    temperature: entry.temperature,
    seed: entry.seed === "send" ? seed : null,
    adapter: entry.provider,
    thinking: "off",
    ...(unset === undefined ? {} : { unset }),
    ...(entry.seedGuarantee === undefined ? {} : { seedGuarantee: entry.seedGuarantee }),
  };
}
