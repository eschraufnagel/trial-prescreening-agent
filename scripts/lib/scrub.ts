import type { Provider } from "../../src/models/index.js";
import { keyAppearsIn } from "../../src/models/keys.js";

/**
 * Turns a provider's real response into a fixture fit to commit.
 *
 * Only the body is kept, and of the headers only `retry-after`, the one the
 * adapters read: response headers carry organisation and request ids, and
 * nothing in the tests needs them. Ids in the body are replaced with fixed
 * placeholders, so a recording diffs cleanly and carries nothing that points
 * back at an account. And a body in which the key appears is never written,
 * whatever else is true of it.
 */

const ID_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/msgbatch_[A-Za-z0-9]+/g, "msgbatch_recorded"],
  [/msg_[A-Za-z0-9]+/g, "msg_recorded"],
  [/chatcmpl-[A-Za-z0-9-]+/g, "chatcmpl-recorded"],
  [/req_[A-Za-z0-9]+/g, "req_recorded"],
];

export interface RecordedFixture {
  provenance: string;
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

export function scrubForFixture(
  provider: Provider,
  recorded: { status: number; retryAfter: string | null; text: string },
  provenance: string,
  env: NodeJS.ProcessEnv,
): RecordedFixture {
  if (keyAppearsIn(provider, recorded.text, env)) {
    throw new Error(
      `refusing to write a ${provider} fixture: the response contains the API key. ` +
        "Nothing was written.",
    );
  }
  let text = recorded.text;
  for (const [pattern, placeholder] of ID_PATTERNS) {
    text = text.replace(pattern, placeholder);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // JSONL (batch results) stays a string, one line per result.
    body = text;
  }
  return {
    provenance,
    status: recorded.status,
    ...(recorded.retryAfter === null ? {} : { headers: { "retry-after": recorded.retryAfter } }),
    body,
  };
}
