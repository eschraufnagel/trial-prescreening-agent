import type { CompletionResponse, ModelAdapter } from "../models/index.js";
import { buildRetryPrompt, buildUserPrompt, SYSTEM_PROMPT } from "./prompt.js";
import type { Attempt } from "./types.js";

/**
 * The rendering call: one criterion in, one attempt out, through the adapter.
 *
 * A reply with no usable rendering is an attempt with `plain: null` and a
 * reason, not an exception, so one bad reply does not stop a run. An error
 * from the adapter itself is rethrown: the script has to tell "the model is
 * down" (stop, and point at /health) from "the model answered badly".
 */

const MAX_OUTPUT_TOKENS = 512;

export async function renderPlain(adapter: ModelAdapter, criterionText: string): Promise<Attempt> {
  return call(adapter, buildUserPrompt(criterionText));
}

/** The one retry: told the earlier rewording and what the check found in it. */
export async function retryPlain(
  adapter: ModelAdapter,
  criterionText: string,
  earlier: string,
  problems: readonly string[],
): Promise<Attempt> {
  return call(adapter, buildRetryPrompt(criterionText, earlier, problems));
}

async function call(adapter: ModelAdapter, user: string): Promise<Attempt> {
  const response = await adapter.complete({
    system: SYSTEM_PROMPT,
    user,
    responseFormat: "json",
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
  return attemptFrom(response);
}

export function attemptFrom(response: CompletionResponse): Attempt {
  if (response.finishReason === "length") {
    return {
      plain: null,
      reportAtGeneration: [`reply cut off at ${response.usage.outputTokens} tokens`],
    };
  }
  const content = response.content;
  const plain =
    typeof content === "object" && content !== null && !Array.isArray(content)
      ? (content as Record<string, unknown>)["plain"]
      : undefined;
  if (typeof plain !== "string" || plain.trim().length === 0) {
    return { plain: null, reportAtGeneration: [`no rendering in ${truncate(response.raw)}`] };
  }
  return { plain: plain.replace(/\s+/g, " ").trim() };
}

function truncate(raw: string): string {
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
}
