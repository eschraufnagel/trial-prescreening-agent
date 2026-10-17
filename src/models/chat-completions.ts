import { asRecord, numberOr } from "./http.js";
import type { FinishReason, TokenUsage } from "./types.js";

/**
 * Reading an OpenAI-compatible `/chat/completions` response.
 *
 * oMLX, OpenAI and xAI all answer in this shape, so the three adapters read it
 * with the same functions. Moved here from `omlx.ts` unchanged in slice 0008,
 * except that `usageFrom` also reads cached tokens, which oMLX never reports.
 */

export interface Choice {
  content: string;
  finishReason: FinishReason;
}

export function firstChoice(envelope: unknown): Choice | undefined {
  const choices = asRecord(envelope)?.["choices"];
  if (!Array.isArray(choices)) {
    return undefined;
  }

  const first = asRecord(choices[0]);
  const content = asRecord(first?.["message"])?.["content"];
  if (typeof content !== "string") {
    return undefined;
  }

  return { content, finishReason: finishReasonFrom(first?.["finish_reason"]) };
}

export function finishReasonFrom(value: unknown): FinishReason {
  if (value === "stop") {
    return "stop";
  }
  // OpenAI-compatible servers vary here; both spellings mean truncation, and
  // this is the one value the caller must not misread.
  if (value === "length" || value === "max_tokens") {
    return "length";
  }
  return "other";
}

/**
 * Cached tokens are counted inside `prompt_tokens` in this shape, so they are
 * taken out of `inputTokens`, which means input billed at the full rate.
 * oMLX reports none, so its usage reads exactly as before.
 */
export function usageFrom(envelope: unknown): TokenUsage {
  const usage = asRecord(asRecord(envelope)?.["usage"]);
  const prompt = numberOr(usage?.["prompt_tokens"], 0);
  const cached = numberOr(asRecord(usage?.["prompt_tokens_details"])?.["cached_tokens"], 0);

  return {
    inputTokens: prompt - cached,
    outputTokens: numberOr(usage?.["completion_tokens"], 0),
    ...(cached > 0 ? { cacheReadTokens: cached } : {}),
  };
}

/** The model id the response says answered, if it carries one. */
export function servedModelFrom(envelope: unknown): string | undefined {
  const model = asRecord(envelope)?.["model"];
  return typeof model === "string" && model.length > 0 ? model : undefined;
}

/**
 * A refusal, where the provider reports one: OpenAI-compatible APIs put a
 * `refusal` string on the message when they decline, with `content` null.
 */
export function refusalFrom(envelope: unknown): string | undefined {
  const choices = asRecord(envelope)?.["choices"];
  const message = Array.isArray(choices) ? asRecord(asRecord(choices[0])?.["message"]) : undefined;
  const refusal = message?.["refusal"];
  return typeof refusal === "string" && refusal.length > 0 ? refusal : undefined;
}
