import { PROVIDERS, type Provider } from "./catalog.js";
import { ModelError } from "./types.js";

/**
 * The one place in this project that knows which environment variable holds
 * each provider's key. `tests/boundary.test.ts` fails if the names appear in
 * any other source file.
 *
 * Exactly one variable per provider, and nothing else. The Anthropic SDK
 * would also look for `ANTHROPIC_AUTH_TOKEN` and CLI profiles on disk; this
 * does not, so "refuses to start without its key" means that key, set on
 * purpose, in `.env` or the shell.
 */
const KEY_VARIABLE: Readonly<Record<Provider, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
};

export function keyVariable(provider: Provider): string {
  return KEY_VARIABLE[provider];
}

/** The key, or a `ModelError` naming the variable. Never returns an empty string. */
export function readKey(provider: Provider, env: NodeJS.ProcessEnv): string {
  const key = env[KEY_VARIABLE[provider]]?.trim() ?? "";
  if (key.length === 0) {
    throw new ModelError(`Cannot configure the ${provider} adapter`, [
      `${KEY_VARIABLE[provider]} is not set. Put it in a local .env (which is gitignored) or ` +
        "export it in your shell. Do not add the value to any file that is committed.",
    ]);
  }
  return key;
}

/**
 * Whether the provider's key appears anywhere in `text`. For the smoke script,
 * which checks a response before writing it as a fixture, so that no script
 * ever holds a key's value itself. False when no key is set.
 */
export function keyAppearsIn(provider: Provider, text: string, env: NodeJS.ProcessEnv): boolean {
  const key = env[KEY_VARIABLE[provider]]?.trim() ?? "";
  return key.length > 0 && text.includes(key);
}

/** Keys a person saved in the app's Settings (slice 0017), by provider. */
export type SavedKeys = Partial<Record<Provider, string>>;

/**
 * What the page may show of a saved key: its last four characters, so two
 * keys can be told apart. A short value shows nothing, since four characters
 * of it would be most of it.
 */
export function keyHint(key: string): string {
  const trimmed = key.trim();
  return trimmed.length < 12 ? "…" : `…${trimmed.slice(-4)}`;
}

/**
 * The environment an adapter reads, with each saved key under its provider's
 * variable (slice 0017). The adapters keep reading keys through `readKey`, so
 * a saved key goes through the same check as one in `.env`, and the variable
 * names stay in this file. Nothing else in `env` changes.
 */
export function withSavedKeys(env: NodeJS.ProcessEnv, keys: SavedKeys): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  for (const provider of PROVIDERS) {
    const key = keys[provider]?.trim() ?? "";
    if (key.length > 0) {
      out[KEY_VARIABLE[provider]] = key;
    }
  }
  return out;
}
