import type { Provider } from "./catalog.js";
import { isRetryableStatus, retryAfterMsFrom, safeText, truncate } from "./http.js";
import { keyVariable } from "./keys.js";
import { redact } from "./redact.js";
import { ModelError } from "./types.js";

/**
 * How the frontier adapters report a request that failed. Shared so all three
 * say the same things the same way, and so every string passes through
 * `redact` on its way out.
 */

/**
 * A request that never got a response. Worded to start "request failed", as
 * oMLX's is, so `isConnectionFailure` recognises it wherever it's checked.
 */
export function connectionFailure(context: string, error: unknown, key: string): ModelError {
  return new ModelError(context, [redact(`request failed: ${messageOf(error)}`, key)], {
    retryable: true,
  });
}

/** An HTTP error status, with the provider's body redacted, and whether to retry. */
export async function httpFailure(
  provider: Provider,
  context: string,
  response: Response,
  key: string,
): Promise<ModelError> {
  const body = redact(truncate(await safeText(response), 500), key);
  const retryAfterMs = retryAfterMsFrom(response);
  const authFailed = response.status === 401 || response.status === 403;
  return new ModelError(
    context,
    [
      `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
      body,
      ...(authFailed ? [`check ${keyVariable(provider)}`] : []),
    ],
    {
      retryable: isRetryableStatus(response.status),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    },
  );
}

/** A body that arrived but couldn't be read, or isn't JSON. */
export async function readEnvelope(
  context: string,
  response: Response,
  key: string,
): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new ModelError(context, [
      redact(`response body could not be read: ${messageOf(error)}`, key),
    ]);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ModelError(context, ["response body is not JSON", redact(truncate(text, 500), key)]);
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
