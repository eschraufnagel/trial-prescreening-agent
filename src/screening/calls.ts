import type { CompletionResponse, ModelAdapter } from "../models/index.js";
import type { Reading } from "./apply.js";
import type { AskContext, ReadContext } from "./prompts.js";
import {
  ASK_SYSTEM_PROMPT,
  buildAskPrompt,
  buildReadPrompt,
  READ_SYSTEM_PROMPT,
  RETRY_AFTER_TRUNCATION,
} from "./prompts.js";
import type { ParticipantRequest, ReadingValue, RequestKind } from "./types.js";
import { ScreeningError } from "./types.js";

export { RETRY_AFTER_TRUNCATION };

/**
 * The agent's two model calls, through the adapter and nothing else.
 *
 * Each validates what came back by hand, in the style of
 * `src/criteria/validate.ts`, and retries once on a truncated or malformed
 * response before failing. A failure throws `ScreeningError`; the session has
 * not changed state by then, so the turn can simply be retried later — which is
 * what makes an oMLX outage cost a pause rather than a conversation.
 */

const ASK_MAX_OUTPUT_TOKENS = 256;
/**
 * Room for a reply that speaks to many criteria. Raised from 1,024 during
 * 0009's scored run: every reading now carries a full statement, and a reply
 * touching a dozen surgical criteria ran past 1,024 on both attempts. Not part
 * of `PROMPT_VERSION`: it changes only a call that would otherwise fail.
 */
export const READ_MAX_OUTPUT_TOKENS = 2048;
const ATTEMPTS = 2;

const READINGS: readonly ReadingValue[] = [
  "holds",
  "does-not-hold",
  "partial",
  "unclear",
  "unknown",
  "declined",
  "does-not-apply",
];

const REQUESTS: readonly RequestKind[] = ["explain", "why", "study", "stop"];

/** What the read call reports about one reply: its readings, and what it asked for (slice 0021). */
export interface ReadResult {
  readings: Reading[];
  request: ParticipantRequest | null;
}

export interface CallResult<T> {
  value: T;
  /** Model calls made, including a retry. */
  calls: number;
}

export async function ask(adapter: ModelAdapter, context: AskContext): Promise<CallResult<string>> {
  return withRetry(
    adapter,
    {
      system: ASK_SYSTEM_PROMPT,
      user: buildAskPrompt(context),
      responseFormat: "json",
      maxOutputTokens: ASK_MAX_OUTPUT_TOKENS,
    },
    readAsk,
    `Cannot phrase a question about ${context.criterion.id}`,
  );
}

export async function read(
  adapter: ModelAdapter,
  context: ReadContext,
): Promise<CallResult<ReadResult>> {
  return withRetry(
    adapter,
    {
      system: READ_SYSTEM_PROMPT,
      user: buildReadPrompt(context),
      responseFormat: "json",
      maxOutputTokens: READ_MAX_OUTPUT_TOKENS,
    },
    readRead,
    "Cannot read the participant's reply",
  );
}

async function withRetry<T>(
  adapter: ModelAdapter,
  request: Parameters<ModelAdapter["complete"]>[0],
  parse: (response: CompletionResponse) => { value?: T; problems: string[] },
  context: string,
): Promise<CallResult<T>> {
  let problems: string[] = [];
  let current = request;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const response = await adapter.complete(current);
    if (response.finishReason === "length") {
      current = { ...request, user: request.user + RETRY_AFTER_TRUNCATION };
      // The tail is what says why: a repetition loop, a runaway list.
      problems = [
        `response truncated at ${response.usage.outputTokens} tokens`,
        `ends: …${response.raw.slice(-300)}`,
      ];
      continue;
    }
    const parsed = parse(response);
    if (parsed.value !== undefined) {
      return { value: parsed.value, calls: attempt };
    }
    problems = parsed.problems;
  }
  throw new ScreeningError(context, [...problems, `gave up after ${ATTEMPTS} attempts`]);
}

export function readAsk(response: CompletionResponse): { value?: string; problems: string[] } {
  const record = objectFrom(response.content);
  const message = record?.["message"];
  if (typeof message !== "string" || message.trim().length === 0) {
    return { problems: [`no message in ${truncate(response.raw)}`] };
  }
  return { value: message.trim(), problems: [] };
}

export function readRead(response: CompletionResponse): {
  value?: ReadResult;
  problems: string[];
} {
  const record = objectFrom(response.content);
  const readings = record?.["readings"];
  if (!Array.isArray(readings)) {
    return { problems: [`no readings array in ${truncate(response.raw)}`] };
  }

  const problems: string[] = [];
  const out: Reading[] = [];
  readings.forEach((entry, index) => {
    const r = asRecord(entry);
    const criterionId = r?.["criterionId"];
    const reading = r?.["reading"];
    const quote = r?.["quote"];
    const missing = r?.["missing"];
    const statement = r?.["statement"];
    const outright = r?.["outright"];

    if (typeof criterionId !== "string" || criterionId.length === 0) {
      problems.push(`readings[${index}]: criterionId missing`);
      return;
    }
    if (typeof reading !== "string" || !READINGS.includes(reading as ReadingValue)) {
      problems.push(`readings[${index}]: reading ${JSON.stringify(reading)} is not recognised`);
      return;
    }
    // A reading with no quote rests on nothing the person said, and rule 1 in
    // apply.ts rejects it as a rejected reading. Refusing the whole response
    // for it lost the reply's valid readings, and at temperature 0 the retry
    // repeats it exactly: one of 0009's scored conversations failed that way.
    // Changed after the freeze, by the owner's decision; it changes only a response
    // that would otherwise fail.
    const cited = typeof quote === "string" ? quote : "";
    // Required since slice 0009: the statement is what the reading judges,
    // and outright decides whether a determination may stand.
    if (typeof statement !== "string" || statement.trim() === "") {
      problems.push(`readings[${index}]: statement missing`);
      return;
    }
    if (typeof outright !== "boolean") {
      problems.push(`readings[${index}]: outright is not true or false`);
      return;
    }
    out.push({
      criterionId,
      reading: reading as ReadingValue,
      quote: cited,
      statement: statement.trim(),
      outright,
      ...(typeof missing === "string" && missing.trim() !== "" ? { missing: missing.trim() } : {}),
    });
  });

  return problems.length > 0
    ? { problems }
    : { value: { readings: out, request: requestFrom(record?.["request"]) }, problems };
}

/**
 * The reply's request, or null. Lenient on purpose (slice 0021): a request is
 * optional, so a malformed one is dropped rather than failing the turn and
 * losing its readings, as 0009 found a missing quote could.
 */
function requestFrom(value: unknown): ParticipantRequest | null {
  const r = asRecord(value);
  const kind = r?.["kind"];
  const quote = r?.["quote"];
  if (typeof kind !== "string" || !REQUESTS.includes(kind as RequestKind)) {
    return null;
  }
  if (typeof quote !== "string" || quote.trim() === "") {
    return null;
  }
  return { kind: kind as RequestKind, quote: quote.trim() };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * The JSON object a model answered with, unwrapping a one-element array.
 *
 * oMLX's JSON mode was found at Gate 2 to wrap the requested object in an
 * array — `[{"message": "..."}]` — every time. Unwrapping exactly that shape
 * changes no content; anything else is still refused.
 */
export function objectFrom(content: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(content) && content.length === 1) {
    return asRecord(content[0]);
  }
  return asRecord(content);
}

function truncate(text: string, limit = 200): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}
