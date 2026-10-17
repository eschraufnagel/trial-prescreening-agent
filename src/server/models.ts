import {
  type AppChoice,
  BudgetPool,
  createAppAdapter,
  isBudgetStop,
  type LocalModels,
  listLocalModels,
  type ModelAdapter,
  ModelError,
  redact,
  type Spent,
  spentBy,
  withLocalSettings,
} from "../models/index.js";
import { ask } from "../screening/calls.js";
import { CHECK_ASK_CONTEXT } from "../screening/check.js";
import { choiceKey, choiceName, logAppSpend, type SettingsStore } from "./settings.js";

/**
 * Where the app's models come from (slice 0017). Every hosted adapter the
 * running app builds is built here, from what a person chose and saved in
 * Settings, through `createAppAdapter`, which always wraps a hosted model in
 * the budget. `tests/boundary.test.ts` holds that this is the only app file
 * that names it.
 *
 * A screening gets its own adapter and its own budget pool, so its cap holds
 * across its turns, and it keeps the model it started on: a screening started
 * on one model and continued on another would be a result nobody could read.
 */

/** What the conversation service sees. */
export interface AgentSource {
  /** The key a new screening records: `"omlx"`, `"anthropic:claude-haiku-4-5"`, or `"fixed"`. */
  current(): string;
  /** What `/api/info` shows. */
  describe(): { model: string; adapter: string };
  /** The adapter one screening uses, for the model it started on. */
  forConversation(key: string): ModelAdapter;
  /** What a screening has spent on a hosted model so far, and its cap. Null when it's free. */
  spending(adapter: ModelAdapter): { usd: number; capUsd: number } | null;
  /** A screening ended or was deleted: log what it spent. */
  release(adapter: ModelAdapter): void;
}

/** One adapter for every screening, whatever it started on: the scripted agent, and tests. */
export function fixedAgent(adapter: ModelAdapter): AgentSource {
  return {
    current: () => "fixed",
    describe: () => ({ model: adapter.descriptor.model, adapter: adapter.descriptor.adapter }),
    forConversation: () => adapter,
    spending: () => null,
    release: () => {},
  };
}

export interface SettingsModelsOptions {
  store: SettingsStore;
  env?: NodeJS.ProcessEnv;
  /** Injected so tests never reach the network. */
  fetchImpl?: typeof fetch;
}

/** The agent as Settings chose it. */
export function settingsAgent(options: SettingsModelsOptions): AgentSource {
  const { store } = options;
  return {
    current: () => choiceKey(store.current()),
    describe: () => {
      const choice = store.current();
      return { model: choice.model, adapter: choice.provider };
    },
    forConversation: (key) => new ConversationModel(key, options),
    spending: (adapter) => (adapter instanceof ConversationModel ? adapter.spending() : null),
    release: (adapter) => {
      if (adapter instanceof ConversationModel) {
        adapter.release();
      }
    },
  };
}

const NOTHING: Spent = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  usd: 0,
  servedModels: [],
};

/** A screening's limit for calls. Its dollar limit is the person's, in Settings. */
const SCREENING_MAX_CALLS = 200;
const TRIAL_MAX_CALLS = 4;
/** The connection test: one call, and room for the one retry `ask` makes on bad output. */
const CHECK_BUDGET = { maxCalls: 2, maxUsd: 0.02 };

/**
 * One screening's model. It's built on its first call, so a screening
 * restored at startup needs no key until someone continues it, and rebuilt
 * after a stop at its cap, keeping its pool, so raising the cap in Settings
 * lets it continue with what it has spent still counted.
 */
export class ConversationModel implements ModelAdapter {
  readonly #key: string;
  readonly #options: SettingsModelsOptions;
  readonly #pool = new BudgetPool();
  #inner: ModelAdapter | undefined;
  #capUsd = 0;
  /** What was last logged, and from which adapter: each one counts from zero. */
  #logged: { from: ModelAdapter | undefined; spent: Spent } = { from: undefined, spent: NOTHING };

  constructor(key: string, options: SettingsModelsOptions) {
    this.#key = key;
    this.#options = options;
  }

  get descriptor(): ModelAdapter["descriptor"] {
    return this.#build().descriptor;
  }

  async complete(request: Parameters<ModelAdapter["complete"]>[0]) {
    const inner = this.#build();
    try {
      return await inner.complete(request);
    } catch (error) {
      if (isBudgetStop(error)) {
        // Rebuilt on the next call under the current cap, keeping the pool;
        // what this one spent is logged before it goes.
        this.release();
        this.#inner = undefined;
        throw new ModelError("This screening reached its limit", [
          `This screening reached its $${this.#capUsd.toFixed(2)} limit. What's recorded so far ` +
            "is kept. Raise the limit in Settings to continue.",
        ]);
      }
      throw error;
    }
  }

  spending(): { usd: number; capUsd: number } | null {
    return this.#key === "omlx"
      ? null
      : { usd: this.#pool.usd, capUsd: this.#options.store.caps().screeningUsd };
  }

  /**
   * Logs what was spent since the last log, if anything (slice 0017, gate 2):
   * called after every turn, so stopping the app loses nothing, and each line
   * is that turn's spend, so the lines add up to the screening's.
   */
  release(): void {
    const inner = this.#inner;
    const spent = inner === undefined ? undefined : spentBy(inner);
    if (spent === undefined) {
      return;
    }
    const before = this.#logged.from === inner ? this.#logged.spent : NOTHING;
    const added: Spent = {
      calls: spent.calls - before.calls,
      inputTokens: spent.inputTokens - before.inputTokens,
      outputTokens: spent.outputTokens - before.outputTokens,
      cacheWriteTokens: spent.cacheWriteTokens - before.cacheWriteTokens,
      cacheReadTokens: spent.cacheReadTokens - before.cacheReadTokens,
      usd: spent.usd - before.usd,
      servedModels: spent.servedModels,
    };
    if (added.calls <= 0) {
      return;
    }
    logAppSpend(this.#options.store.dir, "agent", this.#key, added);
    this.#logged = { from: inner, spent };
  }

  #build(): ModelAdapter {
    const { store } = this.#options;
    if (choiceKey(store.current()) !== this.#key) {
      throw new ModelError("This screening can't continue on another model", [
        `This screening started on ${choiceName(this.#key)}. Choose it in Settings to continue.`,
      ]);
    }
    if (this.#inner === undefined) {
      this.#capUsd = store.caps().screeningUsd;
      this.#inner = createAppAdapter(store.current(), store.saved(), {
        budget: { maxCalls: SCREENING_MAX_CALLS, maxUsd: this.#capUsd },
        pool: this.#pool,
        thinking: false,
        ...envAndFetch(this.#options),
      });
    }
    return this.#inner;
  }
}

/**
 * The trial reader as Settings chose it: a fresh adapter for each read, under
 * the trial cap, at the parser's own reasoning mode for the local model.
 */
export function settingsParser(options: SettingsModelsOptions): {
  parserFor: () => ModelAdapter;
  released: (adapter: ModelAdapter) => void;
} {
  const { store } = options;
  return {
    parserFor: () =>
      createAppAdapter(store.current(), store.saved(), {
        budget: { maxCalls: TRIAL_MAX_CALLS, maxUsd: store.caps().trialUsd },
        ...envAndFetch(options),
      }),
    released: (adapter) => {
      const spent = spentBy(adapter);
      if (spent !== undefined && spent.calls > 0) {
        logAppSpend(store.dir, "parser", choiceKey(store.current()), spent);
      }
    },
  };
}

export type ConnectionResult =
  | { ok: true; usd: number; servedModel: string }
  | { ok: false; problem: string };

/**
 * Settings' Test: one agent question on a made-up criterion, through the
 * chosen model, capped at two cents. It answers whether the reply has the
 * shape the agent accepts, which is what "the key works" has to mean here.
 * A provider's error comes back with the key taken out.
 */
export async function testConnection(
  options: SettingsModelsOptions,
  choice: AppChoice,
): Promise<ConnectionResult> {
  const { store } = options;
  const saved = store.saved();
  const secrets = [
    ...Object.values(saved.keys).filter((k): k is string => k !== undefined),
    ...(saved.local.apiKey === undefined ? [] : [saved.local.apiKey]),
  ];
  let adapter: ModelAdapter | undefined;
  try {
    adapter = createAppAdapter(choice, saved, {
      budget: CHECK_BUDGET,
      thinking: false,
      ...envAndFetch(options),
    });
    await ask(adapter, CHECK_ASK_CONTEXT);
    const spent = spentBy(adapter);
    return {
      ok: true,
      usd: spent?.usd ?? 0,
      servedModel: spent?.servedModels[0] ?? adapter.descriptor.model,
    };
  } catch (error) {
    const text =
      error instanceof ModelError
        ? [error.message, ...error.problems].join(": ")
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, problem: secrets.reduce((t, s) => redact(t, s), text) };
  } finally {
    const spent = adapter === undefined ? undefined : spentBy(adapter);
    if (spent !== undefined && spent.calls > 0) {
      logAppSpend(store.dir, "check", choiceKey(choice), spent);
    }
  }
}

/** The local server's models, with the saved address and key over the environment. */
export function localModels(options: SettingsModelsOptions): Promise<LocalModels> {
  const saved = options.store.saved();
  return listLocalModels(
    withLocalSettings(options.env ?? process.env, saved.local),
    options.fetchImpl,
  );
}

function envAndFetch(options: SettingsModelsOptions): {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} {
  return {
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  };
}
