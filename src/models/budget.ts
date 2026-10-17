import type { CatalogEntry } from "./catalog.js";
import { tokensFor } from "./estimate.js";
import { priceOf } from "./spend.js";
import type { CompletionRequest, CompletionResponse, ModelAdapter } from "./types.js";
import { ModelError } from "./types.js";

/**
 * The wrapper every frontier adapter is built inside, so no caller can reach a
 * paid API around it.
 *
 * Two hard stops, per invocation: a number of calls, and a number of dollars
 * computed from the usage each response reports. Every attempt counts,
 * retries included, because a retry is paid for like any other call. Once
 * either is reached, the next call throws a budget stop, which the runners
 * treat as "stop the run now", leaving a conversation resumable exactly as an
 * oMLX outage does.
 *
 * Retrying lives here rather than in the adapters so that it is visible to
 * the cap. Only failures an adapter marks retryable are retried: rate
 * limits, overload, server errors and dropped connections. Never a refusal,
 * a 400, a 401 or output that isn't JSON.
 */

export interface Budget {
  maxCalls: number;
  maxUsd: number;
}

/**
 * What every frontier adapter in one invocation has used between them. The
 * caps are per invocation, not per role: a run with the agent and the
 * fidelity check both on a frontier model shares one budget, so two roles
 * can't spend twice the limit.
 */
export class BudgetPool {
  calls = 0;
  usd = 0;
  /**
   * The worst case of every call still in flight. Usage is only known when a
   * response arrives, so calls sent together (a batch, or roles at once)
   * would otherwise all pass a check made before any came back.
   */
  reserved = 0;
}

export interface Spent {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  usd: number;
  servedModels: string[];
}

export interface BudgetedAdapterOptions {
  entry: CatalogEntry;
  budget: Budget;
  /** Shared with the invocation's other frontier adapters. A fresh pool when absent. */
  pool?: BudgetPool;
  /** Priced at the catalog's batch multiplier. */
  batch?: boolean;
  /** Injected so tests don't wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Told about each retry, for the person watching. */
  onRetry?: (message: string) => void;
}

/** Retries after the first attempt, and the waits when the provider gives no `retry-after`. */
const BACKOFF_MS: readonly number[] = [2_000, 8_000];
/** The longest `retry-after` honoured. A longer one fails now rather than stalling a run. */
const MAX_RETRY_AFTER_MS = 60_000;

export class BudgetedAdapter implements ModelAdapter {
  readonly descriptor: ModelAdapter["descriptor"];

  readonly #inner: ModelAdapter;
  readonly #entry: CatalogEntry;
  readonly #budget: Budget;
  readonly #pool: BudgetPool;
  readonly #batch: boolean;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #onRetry: (message: string) => void;
  readonly #spent: Spent = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    usd: 0,
    servedModels: [],
  };

  constructor(inner: ModelAdapter, options: BudgetedAdapterOptions) {
    this.#inner = inner;
    this.descriptor = inner.descriptor;
    this.#entry = options.entry;
    this.#budget = options.budget;
    this.#pool = options.pool ?? new BudgetPool();
    this.#batch = options.batch ?? false;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#onRetry = options.onRetry ?? (() => {});
  }

  /** What this adapter has spent so far, for the spend log and the run record. */
  spent(): Spent {
    return { ...this.#spent, servedModels: [...this.#spent.servedModels] };
  }

  get batch(): boolean {
    return this.#batch;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // The most this call can cost: its prompt, estimated generously, and its
    // full `max_tokens`. Admitted models run with reasoning off, so there are
    // no hidden thinking tokens beyond that.
    const worstCase = priceOf(
      this.#entry,
      {
        inputTokens: tokensFor(request.system) + tokensFor(request.user),
        outputTokens: request.maxOutputTokens,
      },
      this.#batch,
    );
    for (let attempt = 0; ; attempt++) {
      this.#checkBudget(worstCase);
      this.#spent.calls++;
      this.#pool.calls++;
      this.#pool.reserved += worstCase;
      try {
        const response = await this.#inner.complete(request);
        this.#pool.reserved -= worstCase;
        this.#record(response);
        return response;
      } catch (error) {
        this.#pool.reserved -= worstCase;
        const wait = retryWait(error, attempt);
        if (wait === undefined) {
          throw error;
        }
        this.#onRetry(
          `retrying after ${Math.round(wait / 1000)}s (${firstProblem(error)}); ` +
            `${this.#pool.calls} of ${this.#budget.maxCalls} calls used`,
        );
        await this.#sleep(wait);
      }
    }
  }

  #checkBudget(worstCase: number): void {
    if (this.#pool.calls >= this.#budget.maxCalls) {
      throw budgetStop(
        `${this.#pool.calls} of ${this.#budget.maxCalls} calls used`,
        "raise --max-calls to go further",
      );
    }
    if (this.#pool.usd + this.#pool.reserved + worstCase > this.#budget.maxUsd) {
      throw budgetStop(
        `$${this.#pool.usd.toFixed(4)} spent and $${this.#pool.reserved.toFixed(4)} in flight; ` +
          `this call could cost up to $${worstCase.toFixed(4)}, which would pass ` +
          `$${this.#budget.maxUsd.toFixed(2)}`,
        "raise --max-usd to go further",
      );
    }
  }

  #record(response: CompletionResponse): void {
    const u = response.usage;
    this.#spent.inputTokens += u.inputTokens;
    this.#spent.outputTokens += u.outputTokens;
    this.#spent.cacheWriteTokens += u.cacheWriteTokens ?? 0;
    this.#spent.cacheReadTokens += u.cacheReadTokens ?? 0;
    const usd = priceOf(this.#entry, u, this.#batch);
    this.#spent.usd += usd;
    this.#pool.usd += usd;
    if (
      response.servedModel !== undefined &&
      !this.#spent.servedModels.includes(response.servedModel)
    ) {
      this.#spent.servedModels.push(response.servedModel);
    }
  }
}

/** The wait before the next attempt, or undefined when this failure isn't retried. */
function retryWait(error: unknown, attempt: number): number | undefined {
  if (!(error instanceof ModelError) || !error.retryable || attempt >= BACKOFF_MS.length) {
    return undefined;
  }
  if (error.retryAfterMs !== undefined) {
    return error.retryAfterMs > MAX_RETRY_AFTER_MS ? undefined : error.retryAfterMs;
  }
  return BACKOFF_MS[attempt];
}

function budgetStop(what: string, remedy: string): ModelError {
  return new ModelError("Budget reached", [
    `budget: ${what}`,
    `${remedy}; finished and partial work is kept and resumes on the next run`,
  ]);
}

/** Whether a failure was the budget stopping a run, which the runners treat as "stop now". */
export function isBudgetStop(error: unknown): boolean {
  return error instanceof ModelError && error.problems.some((p) => p.startsWith("budget:"));
}

function firstProblem(error: unknown): string {
  return error instanceof ModelError ? (error.problems[0] ?? "failed") : String(error);
}
