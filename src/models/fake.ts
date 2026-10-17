import type {
  CompletionRequest,
  CompletionResponse,
  ModelAdapter,
  ModelDescriptor,
} from "./types.js";
import { ModelError } from "./types.js";

/**
 * A `ModelAdapter` that returns scripted responses instead of calling a model.
 *
 * Shipped in `src/` rather than hidden in `tests/` on purpose. Slices 0003
 * through 0008 all need a way to exercise model-dependent code without a model
 * — the eval harness needs it to test its graders, the screening agent needs
 * it to test a conversation — and a fake that lives in one slice's test folder
 * gets reimplemented in the next.
 *
 * It records what it was asked, so a test can assert on the prompt that was
 * built without the prompt having to be returned to the caller.
 */

/** What the fake should do when `complete` is called. */
export type ScriptedResponse = (
  | { kind: "json"; content: unknown; finishReason?: CompletionResponse["finishReason"] }
  /** Raw text, for testing what happens when a model returns unparseable output. */
  | { kind: "raw"; raw: string }
  | { kind: "error"; message: string }
) & {
  /**
   * Settle this many milliseconds later instead of at once, like a model
   * that takes its time. For a page that must show the agent working
   * (slice 0010); without it the fake answers before anyone can see.
   */
  delayMs?: number;
};

export interface FakeModelOptions {
  descriptor?: Partial<ModelDescriptor>;
  /**
   * Answers a request once the script is used up. For conversations too open
   * to script in advance: the scripted agent behind `npm run app -- --fake`
   * answers whatever a person types. Without one, running dry is an error.
   */
  respond?: (request: CompletionRequest) => ScriptedResponse;
}

export class FakeModelAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor;
  /** Every request received, in order. */
  readonly requests: CompletionRequest[] = [];

  #script: ScriptedResponse[];
  readonly #responder: FakeModelOptions["respond"];

  constructor(script: ScriptedResponse[] = [], options: FakeModelOptions = {}) {
    this.#script = [...script];
    this.#responder = options.respond;
    this.descriptor = {
      model: "fake",
      quantization: "none",
      temperature: 0,
      seed: 0,
      adapter: "fake",
      ...options.descriptor,
    };
  }

  complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.requests.push(request);
    const next = this.#script.shift() ?? this.#responder?.(request);
    const delayMs = next?.delayMs ?? 0;
    if (delayMs <= 0) {
      return this.#settle(next);
    }
    // Settled inside the timer, so a scripted failure is never a rejected
    // promise left unhandled while it waits.
    return new Promise((resolve, reject) => {
      setTimeout(() => this.#settle(next).then(resolve, reject), delayMs);
    });
  }

  #settle(next: ScriptedResponse | undefined): Promise<CompletionResponse> {
    if (next === undefined) {
      // Running dry is a test bug, not a model failure. Saying so beats
      // returning an empty response that fails three assertions later.
      return Promise.reject(
        new ModelError("FakeModelAdapter has no scripted response left", [
          `received ${this.requests.length} request(s) but was given fewer responses`,
        ]),
      );
    }

    if (next.kind === "error") {
      return Promise.reject(new ModelError("FakeModelAdapter scripted failure", [next.message]));
    }

    if (next.kind === "raw") {
      let content: unknown;
      try {
        content = JSON.parse(next.raw);
      } catch {
        return Promise.reject(
          new ModelError("FakeModelAdapter scripted output is not JSON", [next.raw.slice(0, 500)]),
        );
      }
      return Promise.resolve(this.#respond(content, next.raw, "stop"));
    }

    const raw = JSON.stringify(next.content);
    return Promise.resolve(this.#respond(next.content, raw, next.finishReason ?? "stop"));
  }

  #respond(
    content: unknown,
    raw: string,
    finishReason: CompletionResponse["finishReason"],
  ): CompletionResponse {
    return {
      content,
      raw,
      finishReason,
      // Token counts a fake cannot know. Zero rather than an invented number:
      // anything else would put fiction into a recorded result.
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
