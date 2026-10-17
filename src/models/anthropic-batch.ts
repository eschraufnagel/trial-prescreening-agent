import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANTHROPIC_API,
  anthropicBody,
  anthropicEntry,
  anthropicHeaders,
  readAnthropicMessage,
} from "./anthropic.js";
import type { CatalogEntry } from "./catalog.js";
import { descriptorFor } from "./catalog.js";
import { connectionFailure, httpFailure } from "./failures.js";
import { asRecord, truncate } from "./http.js";
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
 * Anthropic's Message Batches API behind the ordinary `ModelAdapter`
 * interface, at half the price of the same requests sent one by one.
 *
 * Callers don't know they're batched. `complete()` queues the request and
 * returns a promise; once no new request has arrived for a moment, the queue
 * goes as one batch, which is polled until it ends, and each promise is
 * settled from its own result line, matched by `custom_id`, never by
 * position. A runner that starts all its calls together (`runEval` with
 * `concurrency`) gets one batch.
 *
 * Most batches finish within an hour; the limit is 24. That suits the parser
 * eval, whose calls are independent, and not a conversation, whose turns are
 * not (0008 intent).
 *
 * **A ledger stops an interrupted batch from being paid for twice.** Each
 * submitted batch is written to `ledgerDir` with the ids of its requests. A
 * request whose id is in a batch submitted in the last 29 days (how long
 * results are kept) is collected from that batch, not submitted again. The
 * id is a hash of the request body, so only an identical request matches.
 *
 * `api.anthropic.com` is admitted here by name, as in `anthropic.ts`. The
 * results URL the API returns is fetched only after checking it is on that
 * host: this file never follows an address it was handed.
 */

const RESULTS_KEPT_MS = 29 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 120_000;

export interface AnthropicBatchOptions {
  model: string;
  /** Where submitted batches are recorded. Gitignored: `evals/results/batches/`. */
  ledgerDir: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** How long the queue waits for more requests before submitting. */
  quietMs?: number;
  /** How often a running batch is polled. */
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onProgress?: (message: string) => void;
}

interface Pending {
  customId: string;
  params: Record<string, unknown>;
  resolve: (response: CompletionResponse) => void;
  reject: (error: unknown) => void;
}

interface LedgerEntry {
  batchId: string;
  submittedAt: string;
  model: string;
  customIds: string[];
}

export class AnthropicBatchAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor;

  readonly #entry: CatalogEntry;
  readonly #key: string;
  readonly #fetch: typeof fetch;
  readonly #ledgerDir: string;
  readonly #quietMs: number;
  readonly #pollMs: number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #now: () => number;
  readonly #onProgress: (message: string) => void;

  #queue: Pending[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: AnthropicBatchOptions) {
    this.#entry = anthropicEntry(options.model);
    this.#key = readKey("anthropic", options.env ?? process.env);
    this.#fetch = options.fetchImpl ?? fetch;
    this.#ledgerDir = options.ledgerDir;
    this.#quietMs = options.quietMs ?? 500;
    this.#pollMs = options.pollMs ?? 60_000;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#now = options.now ?? Date.now;
    this.#onProgress = options.onProgress ?? (() => {});
    this.descriptor = descriptorFor(this.#entry, SEED);
  }

  complete(request: CompletionRequest): Promise<CompletionResponse> {
    const params = anthropicBody(this.#entry, request);
    const customId = customIdFor(params);
    return new Promise((resolve, reject) => {
      this.#queue.push({ customId, params, resolve, reject });
      if (this.#timer !== undefined) clearTimeout(this.#timer);
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        void this.#flush();
      }, this.#quietMs);
    });
  }

  async #flush(): Promise<void> {
    const pending = this.#queue;
    this.#queue = [];
    if (pending.length === 0) return;

    const ledger = this.#readLedger();
    const groups = new Map<string, Pending[]>();
    const fresh: Pending[] = [];
    for (const p of pending) {
      const known = ledger.find((e) => e.customIds.includes(p.customId));
      if (known === undefined) {
        fresh.push(p);
      } else {
        groups.set(known.batchId, [...(groups.get(known.batchId) ?? []), p]);
      }
    }

    for (const [batchId, items] of groups) {
      this.#onProgress(
        `collecting ${items.length} request(s) from batch ${batchId}, already paid for`,
      );
    }

    const work = [...groups].map(([batchId, items]) => this.#collect(batchId, items));
    if (fresh.length > 0) {
      work.push(this.#submitAndCollect(fresh));
    }
    await Promise.all(work);
  }

  async #submitAndCollect(items: Pending[]): Promise<void> {
    const url = `${ANTHROPIC_API}/v1/messages/batches`;
    const context = `Anthropic batch submission to ${url} (model ${this.#entry.model}) failed`;
    // One entry per distinct request: two callers asking the same thing share a result.
    const unique = [...new Map(items.map((p) => [p.customId, p])).values()];
    try {
      const body = await this.#request(context, url, {
        method: "POST",
        body: JSON.stringify({
          requests: unique.map((p) => ({ custom_id: p.customId, params: p.params })),
        }),
      });
      const batchId = stringField(body, "id");
      if (batchId === undefined) {
        throw new ModelError(context, ["response has no batch id", this.#show(body)]);
      }
      this.#writeLedger({
        batchId,
        submittedAt: new Date(this.#now()).toISOString(),
        model: this.#entry.model,
        customIds: unique.map((p) => p.customId),
      });
      this.#onProgress(`submitted batch ${batchId} with ${unique.length} request(s)`);
      await this.#collect(batchId, items);
    } catch (error) {
      for (const p of items) p.reject(error);
    }
  }

  async #collect(batchId: string, items: Pending[]): Promise<void> {
    const url = `${ANTHROPIC_API}/v1/messages/batches/${batchId}`;
    const context = `Anthropic batch ${batchId} (model ${this.#entry.model}) failed`;
    try {
      let batch = await this.#request(context, url, { method: "GET" });
      while (stringField(batch, "processing_status") !== "ended") {
        this.#onProgress(
          `batch ${batchId}: ${countsOf(batch)}; checking again in ${this.#pollMs / 1000}s`,
        );
        await this.#sleep(this.#pollMs);
        batch = await this.#request(context, url, { method: "GET" });
      }

      const resultsUrl = stringField(batch, "results_url");
      if (resultsUrl === undefined || !onAnthropicHost(resultsUrl)) {
        throw new ModelError(context, [
          `results_url is not on ${ANTHROPIC_API}: ${resultsUrl ?? "missing"}`,
          "refusing to fetch an address the API handed back from anywhere else",
        ]);
      }
      const lines = await this.#results(context, resultsUrl);
      for (const p of items) {
        const line = lines.get(p.customId);
        if (line === undefined) {
          this.#forget(batchId, p.customId);
          p.reject(new ModelError(context, [`no result for request ${p.customId}`]));
        } else {
          this.#settle(p, line, context, batchId);
        }
      }
    } catch (error) {
      for (const p of items) p.reject(error);
    }
  }

  #settle(p: Pending, line: unknown, context: string, batchId: string): void {
    const result = asRecord(asRecord(line)?.["result"]);
    const type = result?.["type"];
    if (type === "succeeded") {
      try {
        p.resolve(readAnthropicMessage(result?.["message"], context, this.#key));
      } catch (error) {
        p.reject(error);
      }
      return;
    }
    // Errored, canceled or expired: nothing worth collecting again, so the
    // next run submits it afresh rather than finding this result forever.
    this.#forget(batchId, p.customId);
    const detail = asRecord(asRecord(result?.["error"])?.["error"])?.["message"];
    p.reject(
      new ModelError(context, [
        `request ${p.customId} ${typeof type === "string" ? type : "failed"}`,
        ...(typeof detail === "string" ? [redact(truncate(detail, 300), this.#key)] : []),
      ]),
    );
  }

  async #results(context: string, url: string): Promise<Map<string, unknown>> {
    const response = await this.#send(context, url, { method: "GET" });
    const text = await response.text();
    const lines = new Map<string, unknown>();
    for (const raw of text.split("\n")) {
      if (raw.trim().length === 0) continue;
      let line: unknown;
      try {
        line = JSON.parse(raw);
      } catch {
        throw new ModelError(context, ["a results line is not JSON", this.#show(raw)]);
      }
      const id = stringField(line, "custom_id");
      if (id !== undefined) lines.set(id, line);
    }
    return lines;
  }

  async #request(context: string, url: string, init: RequestInit): Promise<unknown> {
    const response = await this.#send(context, url, init);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new ModelError(context, ["response body is not JSON", this.#show(text)]);
    }
  }

  async #send(context: string, url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.#fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: anthropicHeaders(this.#key),
      });
    } catch (error) {
      throw connectionFailure(context, error, this.#key);
    }
    if (!response.ok) {
      throw await httpFailure("anthropic", context, response, this.#key);
    }
    return response;
  }

  #readLedger(): LedgerEntry[] {
    if (!existsSync(this.#ledgerDir)) return [];
    const cutoff = this.#now() - RESULTS_KEPT_MS;
    return readdirSync(this.#ledgerDir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => {
        try {
          return [JSON.parse(readFileSync(join(this.#ledgerDir, f), "utf8")) as LedgerEntry];
        } catch {
          return [];
        }
      })
      .filter((e) => e.model === this.#entry.model && Date.parse(e.submittedAt) > cutoff);
  }

  /** Drops a request from a batch's ledger entry, so it is no longer collected from there. */
  #forget(batchId: string, customId: string): void {
    const path = join(this.#ledgerDir, `${batchId}.json`);
    if (!existsSync(path)) return;
    const entry = JSON.parse(readFileSync(path, "utf8")) as LedgerEntry;
    this.#writeLedger({ ...entry, customIds: entry.customIds.filter((id) => id !== customId) });
  }

  #writeLedger(entry: LedgerEntry): void {
    mkdirSync(this.#ledgerDir, { recursive: true });
    writeFileSync(
      join(this.#ledgerDir, `${entry.batchId}.json`),
      `${JSON.stringify(entry, null, 2)}\n`,
      "utf8",
    );
  }

  #show(value: unknown): string {
    return redact(
      truncate(typeof value === "string" ? value : JSON.stringify(value), 500),
      this.#key,
    );
  }
}

/** A request's id: a hash of its body, so an identical request always gets the same one. */
export function customIdFor(params: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 40);
}

function onAnthropicHost(url: string): boolean {
  try {
    return new URL(url).origin === ANTHROPIC_API;
  } catch {
    return false;
  }
}

function stringField(value: unknown, field: string): string | undefined {
  const v = asRecord(value)?.[field];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function countsOf(batch: unknown): string {
  const counts = asRecord(asRecord(batch)?.["request_counts"]);
  if (counts === undefined) return "in progress";
  return Object.entries(counts)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
}
