import { firstChoice, usageFrom } from "./chat-completions.js";
import { readOmlxConfig } from "./config.js";
import { safeText, truncate } from "./http.js";
import { parseModelJson } from "./json.js";
import type {
  CompletionRequest,
  CompletionResponse,
  ModelAdapter,
  ModelDescriptor,
} from "./types.js";
import { ModelError } from "./types.js";

/**
 * Talks to a local oMLX server over its OpenAI-compatible endpoint.
 *
 * This is the only file in `src/` that opens a socket, and
 * `tests/boundary.test.ts` admits it by name under a loopback-only exception.
 * The rest of the application reaches a model through `ModelAdapter` and does
 * not know this file exists.
 *
 * Every failure throws `ModelError` naming the endpoint and the model. The
 * failures here are nearly all operator mistakes — server not running, key not
 * exported, wrong model name — and an error that does not say which one it was
 * costs more than the request did.
 */

/**
 * Pinned generation settings.
 *
 * Constants rather than configuration: they are part of what "the pinned local
 * model" means, and a result produced at a different temperature is a
 * different experiment. Slice 0008's comparison depends on this side being
 * fixed. Changing either of these is a deliberate edit to a committed file,
 * visible in a diff, not an environment variable someone set last week.
 */
export const TEMPERATURE = 0;
export const SEED = 20260921;

/**
 * Generous, because the thing at the other end is a 35B model on this machine
 * rather than a hosted API. A 16KB eligibility block can take well over five
 * minutes to answer, and a timeout that fires mid-generation surfaces as a
 * body that cannot be read — an error that says nothing about the cause.
 */
const REQUEST_TIMEOUT_MS = 1_200_000;

export interface OmlxAdapterOptions {
  env?: NodeJS.ProcessEnv;
  /**
   * Injected so failure paths can be tested without a server and without
   * mocking globals. Production callers leave it alone.
   */
  fetchImpl?: typeof fetch;
  /**
   * Whether to send `response_format: { type: "json_object" }`.
   *
   * Present because whether oMLX honors it is unverified (see the slice's
   * Gate 1). When false, the prompt carries the JSON instruction instead and
   * the adapter still fails loudly on output it cannot parse.
   */
  useResponseFormat?: boolean;
  /**
   * False to switch the model's reasoning mode off, by sending
   * `chat_template_kwargs: { enable_thinking: false }`.
   *
   * Added in slice 0004. The pinned Qwen model reasons before answering by
   * default, and in JSON mode it writes that reasoning into the object as an
   * extra key: 350-650 tokens and 15-30 s per call, where the answer alone is
   * under 100 tokens and about 5 s. A conversation is dozens of calls, so the
   * screening agent runs with it off. Omitted, nothing is sent and the
   * runtime's default applies, which keeps the parser and 0003's results
   * exactly as they were. Recorded in the descriptor either way.
   */
  thinking?: boolean;
}

export class OmlxAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor;

  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetch: typeof fetch;
  readonly #useResponseFormat: boolean;
  readonly #thinkingOff: boolean;

  constructor(options: OmlxAdapterOptions = {}) {
    const config = readOmlxConfig(options.env ?? process.env);

    this.#baseUrl = config.baseUrl.replace(/\/$/, "");
    this.#apiKey = config.apiKey;
    this.#model = config.model;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#useResponseFormat = options.useResponseFormat ?? true;
    this.#thinkingOff = options.thinking === false;

    this.descriptor = {
      model: config.model,
      quantization: quantizationFrom(config.model),
      temperature: TEMPERATURE,
      seed: SEED,
      adapter: "omlx",
      ...(this.#thinkingOff ? { thinking: "off" as const } : {}),
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const url = `${this.#baseUrl}/chat/completions`;
    const body = this.#buildBody(request);

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.#apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new ModelError(this.#context(url), [
        `request failed: ${error instanceof Error ? error.message : String(error)}`,
        "is oMLX running and listening on this address?",
      ]);
    }

    if (!response.ok) {
      throw new ModelError(this.#context(url), [
        `HTTP ${response.status} ${response.statusText}`,
        truncate(await safeText(response), 500),
      ]);
    }

    return this.#readResponse(await this.#readBody(response, url), url);
  }

  #buildBody(request: CompletionRequest): Record<string, unknown> {
    return {
      model: this.#model,
      temperature: TEMPERATURE,
      seed: SEED,
      max_tokens: request.maxOutputTokens,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      ...(this.#useResponseFormat ? { response_format: { type: "json_object" } } : {}),
      ...(this.#thinkingOff ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    };
  }

  #readResponse(text: string, url: string): CompletionResponse {
    let envelope: unknown;
    try {
      envelope = JSON.parse(text);
    } catch {
      throw new ModelError(this.#context(url), ["response body is not JSON", truncate(text, 500)]);
    }

    const choice = firstChoice(envelope);
    if (choice === undefined) {
      throw new ModelError(this.#context(url), [
        "response has no choices[0].message.content",
        truncate(text, 500),
      ]);
    }

    // Parsed here rather than by the caller so that "the endpoint returned
    // something unusable" is one failure with the raw text attached, wherever
    // in the project the call came from.
    let content: unknown;
    try {
      content = parseModelJson(choice.content);
    } catch {
      // Truncated output is incomplete JSON by definition, and reporting it as
      // malformed would name the symptom instead of the cause. The caller is
      // told what happened and decides — it is the one that knows whether a
      // cut-off answer is fatal, and which trial it was reading.
      if (choice.finishReason === "length") {
        return {
          content: undefined,
          raw: choice.content,
          finishReason: "length",
          usage: usageFrom(envelope),
        };
      }

      throw new ModelError(this.#context(url), [
        "model output is not JSON",
        truncate(choice.content, 500),
      ]);
    }

    return {
      content,
      raw: choice.content,
      finishReason: choice.finishReason,
      usage: usageFrom(envelope),
    };
  }

  /**
   * Reads the body, reporting a read that fails for what it usually is: the
   * request timing out while the model was still generating.
   */
  async #readBody(response: Response, url: string): Promise<string> {
    try {
      return await response.text();
    } catch (error) {
      throw new ModelError(this.#context(url), [
        `response body could not be read: ${error instanceof Error ? error.message : String(error)}`,
        `the request timeout is ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s; a long generation can ` +
          "outrun it. Lower maxOutputTokens or raise the timeout.",
      ]);
    }
  }

  #context(url: string): string {
    return `oMLX request to ${url} (model ${this.#model}) failed`;
  }
}

/**
 * Reads the quantization out of the model name, which is where MLX builds put
 * it. Falls back to "unknown" rather than guessing: a wrong value in a
 * recorded result is worse than an honest absence.
 */
export function quantizationFrom(model: string): string {
  return /(\d+)bit/i.exec(model)?.[0]?.toLowerCase() ?? "unknown";
}

/** What the local server says it serves, for Settings' model list (slice 0017). */
export interface LocalModels {
  reachable: boolean;
  models: string[];
  /** Why it couldn't be read: not configured, unreachable, or refused. */
  problem?: string;
}

/** A model list is a quick read, not a generation. */
const LIST_TIMEOUT_MS = 3_000;

/**
 * Asks the local server which models it serves (`GET /models`), through the
 * same config check as every call, so the address must be on this machine.
 * Never throws: Settings shows a text field when this can't answer.
 */
export async function listLocalModels(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<LocalModels> {
  let config: ReturnType<typeof readOmlxConfig>;
  try {
    config = readOmlxConfig(env);
  } catch (error) {
    const problem =
      error instanceof ModelError ? (error.problems[0] ?? error.message) : String(error);
    return { reachable: false, models: [], problem };
  }
  const url = `${config.baseUrl.replace(/\/$/, "")}/models`;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      headers: { authorization: `Bearer ${config.apiKey}` },
    });
    if (!response.ok) {
      return { reachable: true, models: [], problem: `the server answered ${response.status}` };
    }
    const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const models = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string");
    return { reachable: true, models };
  } catch (error) {
    return {
      reachable: false,
      models: [],
      problem: `no answer from ${url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
