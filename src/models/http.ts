/**
 * Small helpers every HTTP adapter shares. None of them opens a socket.
 */

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<response body could not be read>";
  }
}

export function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}… (${text.length} chars)`;
}

/** Statuses a frontier adapter marks retryable: rate limited, overloaded, or failing. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 529 || status >= 500;
}

/**
 * `retry-after` in milliseconds, when the provider sent one in seconds.
 * An HTTP date form is ignored: the wrapper's own backoff is fine for that.
 */
export function retryAfterMsFrom(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (value === null || !/^\d+(\.\d+)?$/.test(value.trim())) {
    return undefined;
  }
  return Math.round(Number(value) * 1000);
}
