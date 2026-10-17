/**
 * The whole surface through which this project talks to a model.
 *
 * Nothing outside `src/models/` calls a model, and nothing inside this module
 * is specific to what the caller is doing with it. That split is what makes
 * slice 0008's comparison a configuration change: swapping a frontier model in
 * means constructing a different `ModelAdapter`, not editing the parser.
 *
 * Deliberately narrow. No streaming, no tool use, no multi-turn. Slice 0004
 * was expected to need multi-turn and did not: its code owns the conversation
 * loop, and each call renders the recent transcript into a single-turn prompt
 * (0004 spec §4.3). A surface that grows by accident is one that cannot be
 * swapped, so it stays this narrow until something genuinely needs more.
 */

/** Identifies the model behind an adapter, for recording on every result. */
export interface ModelDescriptor {
  /** As the runtime names it, e.g. "Qwen3.6-35B-A3B-MLX-8bit". */
  model: string;
  /** e.g. "8bit". "none" for an unquantized or hosted model. */
  quantization: string;
  /**
   * Null when the model does not accept a temperature, so the provider's
   * default applied. `unset.temperature` says why.
   *
   * Not defaulted to 0 for the same reason as `seed`: "ran at 0" and "could
   * not be set" are different facts about what the result means.
   */
  temperature: number | null;
  /**
   * Null when the runtime does not support seeding, or a seed was not sent.
   *
   * Not defaulted to 0: "this run was seeded with 0" and "this runtime cannot
   * be seeded" are different facts about reproducibility, and collapsing them
   * would put a number in a result that did not pin anything.
   */
  seed: number | null;
  /** Which implementation produced this, e.g. "omlx", "fake". */
  adapter: string;
  /**
   * Present, as "off", only when the model's reasoning mode was switched off
   * for this adapter. Absent means the runtime's default was used — which is
   * how every result before slice 0004 was produced, so those stay accurate.
   *
   * Part of what defines an experiment, like temperature: the same model with
   * and without reasoning is a different system, and a result must say which.
   */
  thinking?: "off";
  /**
   * Why `temperature` or `seed` is null, in words. Present only when one is.
   * A null with no reason would leave a reader guessing whether it was an
   * oversight.
   */
  unset?: { temperature?: string; seed?: string };
  /**
   * Present when a seed was sent but the provider promises only a best
   * effort at determinism. oMLX's seed pins the output; a best-effort one
   * does not, and a result must not read as if it did.
   */
  seedGuarantee?: "best-effort";
}

export interface CompletionRequest {
  system: string;
  user: string;
  /**
   * The adapter asks the endpoint for JSON and fails if what comes back does
   * not parse. Only mode there is, named rather than implied so that adding a
   * text mode later is a visible change.
   */
  responseFormat: "json";
  maxOutputTokens: number;
}

/**
 * Why generation stopped. `length` matters: it means the response was cut off,
 * and a caller that ignores it silently loses the end of its output.
 */
export type FinishReason = "stop" | "length" | "other";

export interface CompletionResponse {
  /** Parsed JSON. Checking it against an expected shape is the caller's job. */
  content: unknown;
  /** What the model actually emitted, kept for error messages and recording. */
  raw: string;
  finishReason: FinishReason;
  usage: TokenUsage;
  /**
   * The model id the provider says answered, when it returns one. Hosted
   * providers may answer an alias with a dated snapshot, and a result should
   * be traceable to what actually ran.
   */
  servedModel?: string;
}

export interface TokenUsage {
  /** Input billed at the full rate: excludes cache writes and reads. */
  inputTokens: number;
  outputTokens: number;
  /** Input written to a prompt cache. Anthropic only. */
  cacheWriteTokens?: number;
  /** Input served from a prompt cache. */
  cacheReadTokens?: number;
}

export interface ModelAdapter {
  readonly descriptor: ModelDescriptor;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

/**
 * Everything needed to reproduce a run, recorded on every result that gets
 * reported. `CLAUDE.md`: a result without model, quantization, temperature and
 * seed is not a result.
 */
export interface ModelRunMetadata extends ModelDescriptor {
  /**
   * Hash of the system prompt that produced the run.
   *
   * Here because a result compared across slices is meaningless if the prompt
   * changed underneath it, and the prompt is the one input most likely to be
   * edited without anyone thinking of it as a change to the experiment.
   */
  promptVersion: string;
  /** The month, as `monthStamp()` writes it. */
  timestamp: string;
}

/**
 * The month a record was made, `2026-10`. Anything that may be committed is
 * dated this way, never to the day or the minute: tracing a result needs its
 * model, quantization, temperature and seed, not when it ran.
 */
export function monthStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Raised for anything that goes wrong reaching or reading a model.
 *
 * Same shape as `TrialFixtureError` in `src/trials/types.ts`: a context line
 * plus every problem found, so one run diagnoses the whole fault rather than
 * the first of three.
 */
export class ModelError extends Error {
  readonly problems: readonly string[];
  /**
   * Set by the frontier adapters on failures worth retrying: a rate limit, an
   * overloaded or failing server, a connection that didn't open. The budget
   * wrapper retries these, and counts every attempt against the call cap.
   */
  readonly retryable: boolean;
  /** How long the provider asked to be left alone, from `retry-after`. */
  readonly retryAfterMs: number | undefined;

  constructor(
    context: string,
    problems: readonly string[],
    options: { retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    const detail = problems.map((p) => `  - ${p}`).join("\n");
    super(`${context}:\n${detail}`);
    this.name = "ModelError";
    this.problems = problems;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}
