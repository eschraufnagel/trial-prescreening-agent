import { ModelError } from "./types.js";

/**
 * Where the local model lives, and how to authenticate to it.
 *
 * Read from the environment rather than from a committed file. `CLAUDE.md`
 * forbids secrets in the repository including in example config, so
 * `.env.example` documents the variable names and carries no values.
 *
 * The loopback restriction is enforced here, in code, and not only by
 * `tests/boundary.test.ts`. The test inspects source and cannot see a base URL
 * that arrives at runtime through an environment variable; this can. Both
 * exist because they catch different mistakes.
 */

export const DEFAULT_BASE_URL = "http://127.0.0.1:8000/v1";
export const DEFAULT_MODEL = "Qwen3.6-35B-A3B-MLX-8bit";

/**
 * Hosts the adapter is allowed to address.
 *
 * The product constraint is that the running application depends on no remote
 * service. A model runtime on this machine is not a remote service; anything
 * off-box is, whatever it is called. Widening this list is how that constraint
 * would be lost, so it is a literal rather than a pattern.
 */
const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "[::1]", "::1"];

export interface OmlxConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function readOmlxConfig(env: NodeJS.ProcessEnv = process.env): OmlxConfig {
  const problems: string[] = [];

  // An empty value is the same as an absent one. `??` alone would take the
  // empty string from a blank `.env` line and produce an unusable config.
  const baseUrl = orDefault(env["OMLX_BASE_URL"], DEFAULT_BASE_URL);
  const model = orDefault(env["OMLX_MODEL"], DEFAULT_MODEL);
  const apiKey = env["OMLX_API_KEY"] ?? "";

  if (apiKey.length === 0) {
    problems.push(
      "OMLX_API_KEY is not set. Export it in your shell or put it in a local .env " +
        "(which is gitignored). Do not add the value to any file that is committed.",
    );
  }

  problems.push(...loopbackProblems(baseUrl));

  if (problems.length > 0) {
    throw new ModelError("Cannot configure the oMLX adapter", problems);
  }

  return { baseUrl: normalizeBaseUrl(baseUrl), apiKey, model };
}

/** The local model as saved in the app's Settings (slice 0017). Every field optional. */
export interface LocalSettings {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

/**
 * The environment `readOmlxConfig` reads, with saved settings over it. An
 * empty saved field leaves the environment's value, so `.env` keeps working
 * for whatever Settings doesn't set. The loopback check still runs on the
 * result, in `readOmlxConfig`.
 */
export function withLocalSettings(env: NodeJS.ProcessEnv, local: LocalSettings): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  const set = (name: string, value: string | undefined) => {
    if (value !== undefined && value.trim().length > 0) {
      out[name] = value.trim();
    }
  };
  set("OMLX_BASE_URL", local.baseUrl);
  set("OMLX_MODEL", local.model);
  set("OMLX_API_KEY", local.apiKey);
  return out;
}

function orDefault(value: string | undefined, fallback: string): string {
  return value === undefined || value.trim().length === 0 ? fallback : value.trim();
}

/**
 * Accepts the server's origin as well as its full OpenAI-compatible base.
 *
 * oMLX displays the base as `http://127.0.0.1:8000/v1`, but its settings pane
 * shows the listen address as `127.0.0.1:8000`, and copying the latter into
 * `OMLX_BASE_URL` is the obvious mistake to make. The symptom would be a 404
 * from `/chat/completions` — technically a clear error, practically a
 * confusing one, since the address looks exactly like what the app reported.
 *
 * Only the bare origin is completed. A URL that already carries a path is left
 * alone, so pointing at some other prefix stays possible and explicit.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/$/, "");

  return path.length === 0 ? `${url.origin}/v1` : `${url.origin}${path}`;
}

/**
 * Rejects any base URL that is not on this machine.
 *
 * Separate from `readOmlxConfig` so the rule can be tested directly, and so a
 * caller that builds a config another way cannot skip it.
 */
export function loopbackProblems(baseUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return [`OMLX_BASE_URL is not a valid URL: ${baseUrl}`];
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return [`OMLX_BASE_URL must be http or https, got ${url.protocol}`];
  }

  if (!LOOPBACK_HOSTS.includes(url.hostname)) {
    return [
      `OMLX_BASE_URL host ${url.hostname} is not on this machine. The application ` +
        "may not depend on a remote service at runtime; only " +
        `${LOOPBACK_HOSTS.join(", ")} are allowed.`,
    ];
  }

  return [];
}
