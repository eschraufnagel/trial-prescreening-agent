import type { CatalogEntry, Provider } from "./catalog.js";
import { catalogEntry, descriptorFor } from "./catalog.js";
import { firstChoice, refusalFrom, servedModelFrom, usageFrom } from "./chat-completions.js";
import { connectionFailure, httpFailure, readEnvelope } from "./failures.js";
import { truncate } from "./http.js";
import { parseModelJson } from "./json.js";
import { readKey } from "./keys.js";
import { SEED } from "./omlx.js";
import { redact } from "./redact.js";
import type {
  CompletionRequest,
  CompletionResponse,
  ModelAdapter,
  ModelDescriptor,
} from "./types.js";
import { ModelError } from "./types.js";

/**
 * A hosted provider's `/v1/chat/completions`, for OpenAI and xAI.
 *
 * The request shape is oMLX's, so the three differ only in host, model and the
 * fields the catalog decides: temperature, seed and how reasoning is switched
 * off. The host is not here. Each provider's file passes its own URL literal,
 * so `tests/boundary.test.ts` can require each host in exactly one file.
 *
 * Built by the factory only, inside the budget wrapper, which does the
 * retrying. Nothing here retries.
 */

const REQUEST_TIMEOUT_MS = 600_000;

export interface FrontierChatOptions {
  model: string;
  env?: NodeJS.ProcessEnv;
  /** Injected so tests use recorded responses and nothing reaches the network. */
  fetchImpl?: typeof fetch;
}

export class FrontierChatAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor;

  readonly #provider: Provider;
  readonly #label: string;
  readonly #url: string;
  readonly #entry: CatalogEntry;
  readonly #key: string;
  readonly #fetch: typeof fetch;

  protected constructor(
    provider: Provider,
    label: string,
    url: string,
    options: FrontierChatOptions,
  ) {
    const entry = catalogEntry(provider, options.model);
    if (entry === undefined) {
      throw new ModelError(`Cannot use ${provider}:${options.model}`, [
        "not in src/models/catalog.ts",
      ]);
    }
    this.#provider = provider;
    this.#label = label;
    this.#url = url;
    this.#entry = entry;
    this.#key = readKey(provider, options.env ?? process.env);
    this.#fetch = options.fetchImpl ?? fetch;
    this.descriptor = descriptorFor(entry, SEED);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const context = `${this.#label} request to ${this.#url} (model ${this.#entry.model}) failed`;

    let response: Response;
    try {
      response = await this.#fetch(this.#url, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.#key}`,
        },
        body: JSON.stringify(chatBody(this.#entry, request)),
      });
    } catch (error) {
      throw connectionFailure(context, error, this.#key);
    }

    if (!response.ok) {
      throw await httpFailure(this.#provider, context, response, this.#key);
    }

    const envelope = await readEnvelope(context, response, this.#key);
    return readChat(envelope, context, this.#key);
  }
}

export function chatBody(entry: CatalogEntry, request: CompletionRequest): Record<string, unknown> {
  return {
    model: entry.model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    max_completion_tokens: request.maxOutputTokens,
    reasoning_effort: "none",
    ...(entry.temperature === null ? {} : { temperature: entry.temperature }),
    ...(entry.seed === "send" ? { seed: SEED } : {}),
    response_format: { type: "json_object" },
  };
}

function readChat(envelope: unknown, context: string, key: string): CompletionResponse {
  const refusal = refusalFrom(envelope);
  if (refusal !== undefined) {
    throw new ModelError(context, [
      "refused: the model declined",
      redact(truncate(refusal, 300), key),
    ]);
  }

  const choice = firstChoice(envelope);
  if (choice === undefined) {
    throw new ModelError(context, [
      "response has no choices[0].message.content",
      redact(truncate(JSON.stringify(envelope), 500), key),
    ]);
  }

  const usage = usageFrom(envelope);
  const served = servedModelFrom(envelope);
  const servedModel = served === undefined ? {} : { servedModel: served };

  let content: unknown;
  try {
    content = parseModelJson(choice.content);
  } catch {
    if (choice.finishReason === "length") {
      return {
        content: undefined,
        raw: choice.content,
        finishReason: "length",
        usage,
        ...servedModel,
      };
    }
    throw new ModelError(context, [
      "model output is not JSON",
      redact(truncate(choice.content, 500), key),
    ]);
  }
  return { content, raw: choice.content, finishReason: choice.finishReason, usage, ...servedModel };
}
