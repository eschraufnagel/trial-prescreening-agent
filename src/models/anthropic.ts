import type { CatalogEntry } from "./catalog.js";
import { catalogEntry, descriptorFor } from "./catalog.js";
import { connectionFailure, httpFailure, readEnvelope } from "./failures.js";
import { asRecord, numberOr, truncate } from "./http.js";
import { parseModelJson } from "./json.js";
import { readKey } from "./keys.js";
import { SEED } from "./omlx.js";
import { redact } from "./redact.js";
import type {
  CompletionRequest,
  CompletionResponse,
  FinishReason,
  ModelAdapter,
  ModelDescriptor,
  TokenUsage,
} from "./types.js";
import { ModelError } from "./types.js";

/**
 * Talks to Anthropic's Messages API.
 *
 * One of three files under `src/` allowed to address a host off this machine,
 * and `tests/boundary.test.ts` admits `api.anthropic.com` here by name. The
 * host is a literal, not configuration: a base URL from the environment could
 * point anywhere, and the boundary test reads source, so it couldn't see it.
 *
 * Built by the factory only, and always inside the budget wrapper, which
 * caps calls and dollars and does the retrying. Nothing here retries.
 *
 * Plain `fetch`, injected, rather than the Anthropic SDK (slice 0008 intent,
 * decision 1): the host stays visible to the boundary test, retries stay
 * visible to the call cap, and the key comes from exactly one variable.
 */

export const ANTHROPIC_API = "https://api.anthropic.com";
export const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Generous for a hosted API. The parser asks for up to 16K output tokens, which
 * can take minutes, and a timeout mid-generation surfaces as an unreadable body.
 */
const REQUEST_TIMEOUT_MS = 600_000;

export interface AnthropicAdapterOptions {
  model: string;
  env?: NodeJS.ProcessEnv;
  /** Injected so tests use recorded responses and nothing reaches the network. */
  fetchImpl?: typeof fetch;
}

export class AnthropicAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor;

  readonly #entry: CatalogEntry;
  readonly #key: string;
  readonly #fetch: typeof fetch;

  constructor(options: AnthropicAdapterOptions) {
    this.#entry = anthropicEntry(options.model);
    // Read before anything else can happen: an adapter without its key refuses
    // to exist, so no request is ever built without one.
    this.#key = readKey("anthropic", options.env ?? process.env);
    this.#fetch = options.fetchImpl ?? fetch;
    this.descriptor = descriptorFor(this.#entry, SEED);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const url = `${ANTHROPIC_API}/v1/messages`;
    const context = `Anthropic request to ${url} (model ${this.#entry.model}) failed`;

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: anthropicHeaders(this.#key),
        body: JSON.stringify(anthropicBody(this.#entry, request)),
      });
    } catch (error) {
      throw connectionFailure(context, error, this.#key);
    }

    if (!response.ok) {
      throw await httpFailure("anthropic", context, response, this.#key);
    }

    const envelope = await readEnvelope(context, response, this.#key);
    return readAnthropicMessage(envelope, context, this.#key);
  }
}

export function anthropicEntry(model: string): CatalogEntry {
  const entry = catalogEntry("anthropic", model);
  if (entry === undefined) {
    throw new ModelError(`Cannot use anthropic:${model}`, ["not in src/models/catalog.ts"]);
  }
  return entry;
}

export function anthropicHeaders(key: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

/**
 * The request body, shared with the batch path so a batched request is
 * byte-for-byte the request that would have been sent on its own.
 *
 * The system prompt is marked cacheable. On today's prompts that saves nothing
 * on Haiku 4.5, whose floor is 4,096 tokens; it costs nothing either, and the
 * spend log records cache writes and reads, so the saving is measured rather
 * than assumed.
 */
export function anthropicBody(
  entry: CatalogEntry,
  request: CompletionRequest,
): Record<string, unknown> {
  return {
    model: entry.model,
    max_tokens: request.maxOutputTokens,
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: request.user }],
    ...(entry.temperature === null ? {} : { temperature: entry.temperature }),
    ...(entry.reasoningOff === "thinking-disabled" ? { thinking: { type: "disabled" } } : {}),
  };
}

/** Reads a Messages API response, from a direct call or one line of a batch. */
export function readAnthropicMessage(
  envelope: unknown,
  context: string,
  key: string,
): CompletionResponse {
  const message = asRecord(envelope);
  const stopReason = message?.["stop_reason"];

  if (stopReason === "refusal") {
    const details = asRecord(message?.["stop_details"]);
    const category = details?.["category"];
    const explanation = details?.["explanation"];
    throw new ModelError(context, [
      `refused: the model declined (category ${typeof category === "string" ? category : "not given"})`,
      ...(typeof explanation === "string" ? [redact(truncate(explanation, 300), key)] : []),
    ]);
  }

  const blocks = message?.["content"];
  if (!Array.isArray(blocks)) {
    throw new ModelError(context, [
      "response has no content array",
      redact(truncate(JSON.stringify(envelope), 500), key),
    ]);
  }
  const raw = blocks
    .map((b) => asRecord(b))
    .filter((b) => b?.["type"] === "text" && typeof b["text"] === "string")
    .map((b) => b?.["text"] as string)
    .join("");

  const finishReason = finishReasonFrom(stopReason);
  const usage = usageFrom(message?.["usage"]);
  const model = message?.["model"];
  const servedModel = typeof model === "string" && model.length > 0 ? { servedModel: model } : {};

  let content: unknown;
  try {
    content = parseModelJson(raw);
  } catch {
    // As in oMLX: truncated output is incomplete JSON by definition, and the
    // caller is the one that knows whether a cut-off answer is fatal.
    if (finishReason === "length") {
      return { content: undefined, raw, finishReason, usage, ...servedModel };
    }
    throw new ModelError(context, ["model output is not JSON", redact(truncate(raw, 500), key)]);
  }

  return { content, raw, finishReason, usage, ...servedModel };
}

function finishReasonFrom(value: unknown): FinishReason {
  if (value === "end_turn" || value === "stop_sequence") {
    return "stop";
  }
  if (value === "max_tokens") {
    return "length";
  }
  return "other";
}

/**
 * Anthropic reports input already split: `input_tokens` excludes what was
 * written to or read from the cache, which is what `inputTokens` means here.
 */
function usageFrom(value: unknown): TokenUsage {
  const usage = asRecord(value);
  const write = numberOr(usage?.["cache_creation_input_tokens"], 0);
  const read = numberOr(usage?.["cache_read_input_tokens"], 0);
  return {
    inputTokens: numberOr(usage?.["input_tokens"], 0),
    outputTokens: numberOr(usage?.["output_tokens"], 0),
    ...(write > 0 ? { cacheWriteTokens: write } : {}),
    ...(read > 0 ? { cacheReadTokens: read } : {}),
  };
}
