import { AnthropicAdapter } from "./anthropic.js";
import { AnthropicBatchAdapter } from "./anthropic-batch.js";
import type { Budget, BudgetPool, Spent } from "./budget.js";
import { BudgetedAdapter } from "./budget.js";
import { catalogEntry, PROVIDER_NAMES, type Provider } from "./catalog.js";
import { type LocalSettings, withLocalSettings } from "./config.js";
import { type SavedKeys, withSavedKeys } from "./keys.js";
import { OmlxAdapter } from "./omlx.js";
import { OpenAIAdapter } from "./openai.js";
import type { ModelSpec } from "./spec.js";
import { formatSpec, parseModelSpec } from "./spec.js";
import type { ModelAdapter } from "./types.js";
import { ModelError } from "./types.js";
import { XaiAdapter } from "./xai.js";

/**
 * The only way anything outside `src/models/` gets an adapter.
 *
 * Three functions, so which one a file calls says what it may reach:
 *
 * - `createLocalAdapter` builds oMLX and refuses any frontier provider. The
 *   terminal chat and the plain-language renderer use it.
 * - `createAppAdapter` (slice 0017) is the running app's: oMLX, or the
 *   provider a person chose in Settings with the key they saved there, always
 *   inside the budget wrapper. `tests/boundary.test.ts` names the files that
 *   may call it, and still fails if any app file names `createAdapter`.
 * - `createAdapter` builds anything, and a frontier adapter only inside the
 *   budget wrapper, which is why it needs a budget. The eval scripts use it,
 *   behind `--spend`. There's no export that returns an unwrapped frontier
 *   adapter.
 */

export interface LocalAdapterOptions {
  env?: NodeJS.ProcessEnv;
  /** Passed to oMLX exactly as the scripts passed it before slice 0008. */
  thinking?: boolean;
}

export function createLocalAdapter(
  spec: ModelSpec,
  options: LocalAdapterOptions = {},
): ModelAdapter {
  if (spec.provider !== "omlx") {
    throw new ModelError(`Cannot use ${formatSpec(spec)} here`, [
      "this command runs on the local model only; frontier providers are for the eval " +
        "scripts, with --spend",
    ]);
  }
  return omlx(spec, options);
}

export interface AdapterOptions extends LocalAdapterOptions {
  /** Required for a frontier provider; ignored for oMLX, which costs nothing. */
  budget?: Budget;
  /** Shared by every frontier adapter in one invocation, so the caps hold across roles. */
  pool?: BudgetPool;
  /** Injected so tests never reach the network. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (message: string) => void;
  /**
   * Send through Anthropic's batch API at half price. Anthropic only: this
   * project has no batch path for the others. Needs `ledgerDir`.
   */
  batch?: { ledgerDir: string; quietMs?: number; pollMs?: number; now?: () => number };
  /** Progress from a batch: submitted, polling, collected. */
  onProgress?: (message: string) => void;
}

export function createAdapter(spec: ModelSpec, options: AdapterOptions = {}): ModelAdapter {
  if (spec.provider === "omlx") {
    return omlx(spec, options);
  }

  const entry = catalogEntry(spec.provider, spec.model);
  if (entry === undefined) {
    throw new ModelError(`Cannot use ${formatSpec(spec)}`, ["not in src/models/catalog.ts"]);
  }
  if (options.budget === undefined) {
    throw new ModelError(`Cannot use ${formatSpec(spec)} without a budget`, [
      "a frontier adapter is only ever built inside the budget wrapper",
    ]);
  }

  if (options.batch !== undefined && entry.batch === null) {
    throw new ModelError(`Cannot batch ${formatSpec(spec)}`, [
      "this project's batch path is built for Anthropic only",
    ]);
  }

  const inner = { model: spec.model, ...pick(options) };
  const adapter =
    options.batch !== undefined
      ? new AnthropicBatchAdapter({
          ...inner,
          ...options.batch,
          ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
          ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
        })
      : spec.provider === "anthropic"
        ? new AnthropicAdapter(inner)
        : spec.provider === "openai"
          ? new OpenAIAdapter(inner)
          : new XaiAdapter(inner);

  return new BudgetedAdapter(adapter, {
    entry,
    budget: options.budget,
    batch: options.batch !== undefined,
    ...(options.pool === undefined ? {} : { pool: options.pool }),
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    ...(options.onRetry === undefined ? {} : { onRetry: options.onRetry }),
  });
}

/** What the app's Settings chose (slice 0017). For oMLX, `model` is the local model's name. */
export interface AppChoice {
  provider: "omlx" | Provider;
  model: string;
}

/** What Settings saved: the hosted keys, and the local model's address, name and key. */
export interface AppSaved {
  keys: SavedKeys;
  local: LocalSettings;
}

export interface AppAdapterOptions {
  /** The cap for this one use: a screening, a trial read or a connection test. */
  budget: Budget;
  pool?: BudgetPool;
  env?: NodeJS.ProcessEnv;
  /** Injected so tests never reach the network. */
  fetchImpl?: typeof fetch;
  /** Passed to oMLX; a hosted model always runs with reasoning off (the catalog's rule). */
  thinking?: boolean;
}

/**
 * The running app's adapter (slice 0017): the local model by default, or the
 * hosted provider a person chose in Settings, with the key they saved there.
 * A hosted adapter is built by `createAdapter`, so it's refused for a model
 * the catalog doesn't admit and always comes inside the budget wrapper.
 */
export function createAppAdapter(
  choice: AppChoice,
  saved: AppSaved,
  options: AppAdapterOptions,
): ModelAdapter {
  const env = options.env ?? process.env;
  if (choice.provider === "omlx") {
    return createLocalAdapter(parseModelSpec("omlx"), {
      env: withLocalSettings(env, { ...saved.local, model: choice.model }),
      ...(options.thinking === undefined ? {} : { thinking: options.thinking }),
    });
  }
  const name = PROVIDER_NAMES[choice.provider];
  if ((saved.keys[choice.provider]?.trim() ?? "").length === 0) {
    throw new ModelError(`Cannot use ${name}`, [`No key saved for ${name}. Add one in Settings.`]);
  }
  return createAdapter(
    { provider: choice.provider, model: choice.model },
    {
      budget: options.budget,
      env: withSavedKeys(env, saved.keys),
      ...(options.pool === undefined ? {} : { pool: options.pool }),
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    },
  );
}

/** What a frontier adapter has spent so far, or undefined for a local one. */
export function spentBy(adapter: ModelAdapter): Spent | undefined {
  return adapter instanceof BudgetedAdapter ? adapter.spent() : undefined;
}

function omlx(spec: ModelSpec, options: LocalAdapterOptions): ModelAdapter {
  const env = options.env ?? process.env;
  return new OmlxAdapter({
    env: spec.model === undefined ? env : { ...env, OMLX_MODEL: spec.model },
    ...(options.thinking === undefined ? {} : { thinking: options.thinking }),
  });
}

function pick(options: AdapterOptions): { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } {
  return {
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  };
}
