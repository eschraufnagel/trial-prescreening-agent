import { ModelError } from "./types.js";

/**
 * Whether a failure means the model could not be reached at all, as opposed to
 * answering badly.
 *
 * Here because this module is the one that produces the error: `OmlxAdapter`
 * reports a failed `fetch` as a problem starting "request failed". The eval
 * runner uses it to stop after two in a row; the local server uses it to tell
 * a person "the model isn't responding" rather than "something broke".
 */
export function isConnectionFailure(error: unknown): boolean {
  return error instanceof ModelError && error.problems.some((p) => p.startsWith("request failed"));
}

/**
 * Whether a provider declined to answer. Anthropic reports this as
 * `stop_reason: "refusal"`, and the adapter throws rather than returning empty
 * content, so a model declining to discuss, say, pregnancy is never mistaken
 * for a model producing malformed JSON.
 */
export function isRefusal(error: unknown): boolean {
  return error instanceof ModelError && error.problems.some((p) => p.startsWith("refused"));
}
