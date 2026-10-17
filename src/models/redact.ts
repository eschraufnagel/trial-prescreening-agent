/**
 * Replaces a secret wherever it appears, so an error message can carry a
 * provider's response body without carrying the key.
 *
 * A provider has no reason to echo a key back, but an error body, a proxy's
 * message or a `fetch` failure is text this project doesn't control, and it
 * ends up in a terminal and possibly a log. Every frontier adapter passes
 * every problem string through this.
 */
export function redact(text: string, secret: string): string {
  return secret.length === 0 ? text : text.split(secret).join("[key]");
}
