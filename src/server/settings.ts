import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AppChoice,
  type AppSaved,
  admittedModels,
  appendSpend,
  catalogEntry,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_MODEL_FOR,
  keyHint,
  loopbackProblems,
  PRICES_AS_OF,
  PROVIDER_NAMES,
  PROVIDERS,
  type Provider,
  type Spent,
} from "../models/index.js";

/**
 * The app's Settings (slice 0017): which model the agent and the trial reader
 * use, the keys for it, and the cost caps. Kept in `local/settings.json`,
 * gitignored, beside `chats/` and `added-trials/` in spirit: one person's
 * state on one machine.
 *
 * The file holds keys, so it's written 0600 in a 0700 directory, through a
 * temporary file and a rename, so a crash never leaves half a key. Nothing
 * this module returns to a caller outside the server's model-building code
 * carries a key: `view()` builds a type with no field for one.
 *
 * The saved file wins over the environment, field by field. With nothing
 * saved, the app runs on oMLX from `.env`, exactly as before this slice.
 */

export type ProviderChoice = "omlx" | Provider;

export interface Caps {
  /** Dollars one screening may spend on a hosted model. */
  screeningUsd: number;
  /** Dollars reading one added trial's rules may spend. */
  trialUsd: number;
}

export const DEFAULT_CAPS: Caps = { screeningUsd: 0.5, trialUsd: 0.25 };
const CAP_RANGE = { min: 0.05, max: 5 };
const MAX_KEY_CHARS = 500;

interface SettingsFile {
  version: 1;
  choice?: AppChoice;
  local?: { baseUrl?: string; model?: string };
  caps?: Partial<Caps>;
  keys?: Partial<Record<ProviderChoice, string>>;
}

export interface ModelView {
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
  /** The date of a passing smoke run, or null: "Not yet tested against the live API". */
  tested: string | null;
  cheapest: boolean;
}

export interface ProviderView {
  provider: Provider;
  name: string;
  keySaved: boolean;
  keyHint: string | null;
  models: ModelView[];
}

/** Estimated dollars for one screening and one trial read, by `provider:model`. */
export type Estimates = Record<string, { screeningUsd: number; trialUsd: number }>;

/** Everything the page may know about the settings. No key: there's no field to put one in. */
export interface SettingsView {
  mode: "live" | "scripted";
  choice: AppChoice;
  providers: ProviderView[];
  local: {
    baseUrl: string;
    model: string;
    keySaved: boolean;
    keyHint: string | null;
    /** Whether `OMLX_API_KEY` is set in the environment, for "using the key from .env". */
    keyFromEnv: boolean;
  };
  caps: Caps;
  estimates: Estimates;
  pricesAsOf: string;
}

export interface SettingsPatch {
  choice?: AppChoice;
  local?: { baseUrl?: string; model?: string };
  caps?: Partial<Caps>;
}

/** A setting refused, with which field and why. Never carries a key's value. */
export class SettingsError extends Error {}

/** `"omlx"` for the local model, whichever it is, or `"anthropic:claude-haiku-4-5"`. */
export function choiceKey(choice: AppChoice): string {
  return choice.provider === "omlx" ? "omlx" : `${choice.provider}:${choice.model}`;
}

/** How a choice key reads on the page: "Anthropic · claude-haiku-4-5" or "the local model". */
export function choiceName(key: string): string {
  if (key === "fixed") {
    // Saved in fake mode, or by a test: the agent was a stand-in, not a model.
    return "the scripted stand-in (npm run app -- --fake)";
  }
  const colon = key.indexOf(":");
  if (key === "omlx" || colon === -1) {
    return "the local model";
  }
  const provider = key.slice(0, colon) as Provider;
  return `${PROVIDER_NAMES[provider] ?? provider} · ${key.slice(colon + 1)}`;
}

/** The hosted provider a model key names, for the page's words, or null for the local model and the scripted agent. */
export function hostedOf(key: string): { name: string; model: string } | null {
  const colon = key.indexOf(":");
  const provider = key.slice(0, colon) as Provider;
  return colon === -1 || !PROVIDERS.includes(provider)
    ? null
    : { name: PROVIDER_NAMES[provider], model: key.slice(colon + 1) };
}

export function isProviderChoice(value: unknown): value is ProviderChoice {
  return value === "omlx" || PROVIDERS.includes(value as Provider);
}

export class SettingsStore {
  readonly #file: string;
  readonly #dir: string;
  readonly #env: NodeJS.ProcessEnv;
  #saved: SettingsFile;

  /** Reads `<dir>/settings.json` if it's there. A file that can't be read is an error, not a reset. */
  constructor(dir: string, env: NodeJS.ProcessEnv = process.env) {
    this.#dir = dir;
    this.#file = join(dir, "settings.json");
    this.#env = env;
    this.#saved = existsSync(this.#file) ? read(this.#file) : { version: 1 };
  }

  get dir(): string {
    return this.#dir;
  }

  /** The model chosen, or the local model from the environment when nothing is saved. */
  current(): AppChoice {
    return (
      this.#saved.choice ?? {
        provider: "omlx",
        model: this.#saved.local?.model ?? orUndefined(this.#env["OMLX_MODEL"]) ?? DEFAULT_MODEL,
      }
    );
  }

  caps(): Caps {
    return { ...DEFAULT_CAPS, ...this.#saved.caps };
  }

  /** What the app's factory needs. Server code only: never sent to the page. */
  saved(): AppSaved {
    const keys = this.#saved.keys ?? {};
    return {
      keys: Object.fromEntries(
        PROVIDERS.flatMap((p) => (keys[p] === undefined ? [] : [[p, keys[p]]])),
      ),
      local: {
        ...this.#saved.local,
        ...(keys.omlx === undefined ? {} : { apiKey: keys.omlx }),
      },
    };
  }

  /** Whether the chosen model has a key: saved, or `OMLX_API_KEY` for the local one. */
  ready(): boolean {
    const choice = this.current();
    if (choice.provider === "omlx") {
      return this.#hasKey("omlx") || orUndefined(this.#env["OMLX_API_KEY"]) !== undefined;
    }
    return this.#hasKey(choice.provider);
  }

  view(mode: "live" | "scripted", estimates: Estimates): SettingsView {
    const keys = this.#saved.keys ?? {};
    const hint = (k: ProviderChoice) => (keys[k] === undefined ? null : keyHint(keys[k]));
    return {
      mode,
      choice: this.current(),
      providers: PROVIDERS.map((provider) => ({
        provider,
        name: PROVIDER_NAMES[provider],
        keySaved: this.#hasKey(provider),
        keyHint: hint(provider),
        models: admittedModels(provider).map((model) => {
          const entry = catalogEntry(provider, model);
          return {
            model,
            inputPerMillion: entry?.price.input ?? 0,
            outputPerMillion: entry?.price.output ?? 0,
            tested: entry?.smokeTested ?? null,
            cheapest: DEFAULT_MODEL_FOR[provider] === model,
          };
        }),
      })),
      local: {
        baseUrl:
          this.#saved.local?.baseUrl ?? orUndefined(this.#env["OMLX_BASE_URL"]) ?? DEFAULT_BASE_URL,
        model: this.#saved.local?.model ?? orUndefined(this.#env["OMLX_MODEL"]) ?? DEFAULT_MODEL,
        keySaved: this.#hasKey("omlx"),
        keyHint: hint("omlx"),
        keyFromEnv: orUndefined(this.#env["OMLX_API_KEY"]) !== undefined,
      },
      caps: this.caps(),
      estimates,
      pricesAsOf: PRICES_AS_OF,
    };
  }

  update(patch: SettingsPatch): void {
    const next: SettingsFile = { ...this.#saved };
    if (patch.choice !== undefined) {
      next.choice = checkChoice(patch.choice);
    }
    if (patch.local !== undefined) {
      next.local = { ...next.local, ...checkLocal(patch.local) };
    }
    if (patch.caps !== undefined) {
      next.caps = { ...next.caps, ...checkCaps(patch.caps) };
    }
    this.#write(next);
  }

  saveKey(provider: ProviderChoice, key: unknown): void {
    if (!isProviderChoice(provider)) {
      throw new SettingsError(`No provider called ${String(provider)}`);
    }
    this.#write({ ...this.#saved, keys: { ...this.#saved.keys, [provider]: checkKey(key) } });
  }

  removeKey(provider: ProviderChoice): void {
    if (!isProviderChoice(provider)) {
      throw new SettingsError(`No provider called ${String(provider)}`);
    }
    const keys = { ...this.#saved.keys };
    delete keys[provider];
    this.#write({ ...this.#saved, keys });
  }

  #hasKey(provider: ProviderChoice): boolean {
    return (this.#saved.keys?.[provider]?.length ?? 0) > 0;
  }

  #write(next: SettingsFile): void {
    mkdirSync(this.#dir, { recursive: true, mode: 0o700 });
    chmodSync(this.#dir, 0o700);
    const tmp = `${this.#file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.#file);
    this.#saved = next;
  }
}

/**
 * One line in `<dir>/spend.jsonl` for what a screening, a trial read or a
 * connection test spent on a hosted model, in the committed ledger's shape.
 * Gitignored: the committed `evals/results/spend.jsonl` is the eval's.
 */
export function logAppSpend(dir: string, role: string, spec: string, spent: Spent): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  appendSpend(join(dir, "spend.jsonl"), {
    date: new Date().toISOString(),
    script: "app",
    role,
    spec,
    servedModels: spent.servedModels,
    calls: spent.calls,
    inputTokens: spent.inputTokens,
    outputTokens: spent.outputTokens,
    cacheWriteTokens: spent.cacheWriteTokens,
    cacheReadTokens: spent.cacheReadTokens,
    usd: spent.usd,
    batch: false,
    pricesAsOf: PRICES_AS_OF,
  });
}

function read(file: string): SettingsFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new SettingsError(
      `${file} can't be read (${error instanceof Error ? error.message : String(error)}). ` +
        "Fix it or remove it; it isn't reset automatically, because it holds your keys.",
    );
  }
  const f = parsed as SettingsFile;
  if (typeof f !== "object" || f === null || f.version !== 1) {
    throw new SettingsError(`${file} isn't a version 1 settings file`);
  }
  return {
    version: 1,
    ...(f.choice === undefined ? {} : { choice: checkChoice(f.choice) }),
    ...(f.local === undefined ? {} : { local: checkLocal(f.local) }),
    ...(f.caps === undefined ? {} : { caps: checkCaps(f.caps) }),
    ...(f.keys === undefined ? {} : { keys: f.keys }),
  };
}

function checkChoice(choice: AppChoice): AppChoice {
  if (!isProviderChoice(choice?.provider)) {
    throw new SettingsError("choice.provider must be omlx, anthropic, openai or xai");
  }
  if (typeof choice.model !== "string" || choice.model.trim().length === 0) {
    throw new SettingsError("choice.model must name a model");
  }
  const model = choice.model.trim();
  if (choice.provider !== "omlx" && catalogEntry(choice.provider, model) === undefined) {
    throw new SettingsError(
      `${PROVIDER_NAMES[choice.provider]} has no admitted model ${model}: choose one of ` +
        admittedModels(choice.provider).join(", "),
    );
  }
  return { provider: choice.provider, model };
}

function checkLocal(local: { baseUrl?: string; model?: string }): {
  baseUrl?: string;
  model?: string;
} {
  const out: { baseUrl?: string; model?: string } = {};
  if (local.baseUrl !== undefined) {
    const baseUrl = String(local.baseUrl).trim();
    const problems = loopbackProblems(baseUrl);
    if (problems.length > 0) {
      throw new SettingsError(`local.baseUrl: ${problems[0]}`);
    }
    out.baseUrl = baseUrl;
  }
  if (local.model !== undefined) {
    const model = String(local.model).trim();
    if (model.length === 0 || model.length > 200) {
      throw new SettingsError("local.model must name a model");
    }
    out.model = model;
  }
  return out;
}

function checkCaps(caps: Partial<Caps>): Partial<Caps> {
  const out: Partial<Caps> = {};
  for (const name of ["screeningUsd", "trialUsd"] as const) {
    const value = caps[name];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "number" || !(value >= CAP_RANGE.min && value <= CAP_RANGE.max)) {
      throw new SettingsError(
        `caps.${name} must be between $${CAP_RANGE.min.toFixed(2)} and $${CAP_RANGE.max.toFixed(2)}`,
      );
    }
    out[name] = value;
  }
  return out;
}

/** Refuses a key that can't be one, without ever repeating it. */
function checkKey(key: unknown): string {
  if (typeof key !== "string") {
    throw new SettingsError("key must be text");
  }
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new SettingsError("key is empty");
  }
  if (trimmed.length > MAX_KEY_CHARS) {
    throw new SettingsError(`key is longer than ${MAX_KEY_CHARS} characters`);
  }
  if (/\s/.test(trimmed)) {
    throw new SettingsError("key contains a space or line break; paste it again on its own");
  }
  return trimmed;
}

function orUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value.trim();
}
