import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { CatalogEntry } from "./catalog.js";
import type { TokenUsage } from "./types.js";

/**
 * What a paid invocation spent, one line per role in `evals/results/spend.jsonl`.
 *
 * Committed, so the project's running cost is in the repository beside the
 * results it paid for. There is no key, no request content and no response id
 * in it: only what was run and how much it cost at catalog prices.
 */
export interface SpendRecord {
  date: string;
  /** e.g. "eval:screening", "models:smoke". */
  script: string;
  /** e.g. "agent", "parser", "smoke". */
  role: string;
  /** As written on the command line, e.g. "anthropic:claude-haiku-4-5". */
  spec: string;
  /** Model ids the provider said answered. */
  servedModels: string[];
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  /** At catalog prices, not the provider's invoice. */
  usd: number;
  batch: boolean;
  pricesAsOf: string;
}

export function appendSpend(path: string, record: SpendRecord): void {
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

/** The total so far, for every estimate to print. Zero when nothing has been spent. */
export function spendSoFar(path: string): { usd: number; lines: number } {
  if (!existsSync(path)) {
    return { usd: 0, lines: 0 };
  }
  const records = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SpendRecord);
  return { usd: records.reduce((sum, r) => sum + r.usd, 0), lines: records.length };
}

/**
 * Dollars for one response's usage, at catalog prices. Batched requests are
 * priced at the batch multiplier, on every token including cache reads and
 * writes, which is how Anthropic bills them.
 */
export function priceOf(entry: CatalogEntry, usage: TokenUsage, batch: boolean): number {
  const p = entry.price;
  const perMillion =
    usage.inputTokens * p.input +
    usage.outputTokens * p.output +
    (usage.cacheWriteTokens ?? 0) * (p.cacheWrite ?? p.input) +
    (usage.cacheReadTokens ?? 0) * (p.cacheRead ?? p.input);
  return (perMillion / 1_000_000) * (batch ? (entry.batch ?? 1) : 1);
}
