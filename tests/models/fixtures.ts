import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Recorded (or documentation-derived) provider responses, and a `fetch` that
 * serves them. The frontier adapters are proven here without the network and
 * without mocking a module or stubbing a global: the adapter is handed this
 * `fetch`, and it records every request so a test can check what was sent.
 */

export const FIXTURES_DIR = fileURLToPath(new URL("../fixtures/models/", import.meta.url));

/**
 * Not shaped like any provider's key, so the scan that fixtures carry no key
 * can't be satisfied or tripped by the tests' own sentinel.
 */
export const SENTINEL_KEY = "test-sentinel-key-7f3a9c";

export interface Fixture {
  /** Either "recorded <date> from <model>" or "written from <source> on <date>, …". */
  provenance: string;
  status: number;
  /** Only headers the adapter reads (`retry-after`). */
  headers?: Record<string, string>;
  /** A JSON body, or a string for a JSONL body. */
  body: unknown;
}

export function loadFixture(provider: string, name: string): Fixture {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}${provider}/${name}.json`, "utf8")) as Fixture;
}

export function fixtureNames(provider: string): string[] {
  return readdirSync(`${FIXTURES_DIR}${provider}`)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

export function responseFor(fixture: Fixture): Response {
  const body = typeof fixture.body === "string" ? fixture.body : JSON.stringify(fixture.body);
  return new Response(body, { status: fixture.status, headers: fixture.headers ?? {} });
}

export interface SentRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Serves the given fixtures in order, one per request, and records each
 * request. Running out is a test failure, not a hang.
 */
export function fixtureFetch(...fixtures: Fixture[]): {
  fetchImpl: typeof fetch;
  sent: SentRequest[];
} {
  const queue = [...fixtures];
  const sent: SentRequest[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    sent.push({
      url: String(url),
      method: init.method ?? "GET",
      headers: { ...(init.headers as Record<string, string> | undefined) },
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`fixtureFetch ran out: request ${sent.length} to ${url} had no fixture`);
    }
    return responseFor(next);
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

/** A `fetch` that fails the way a dropped connection does, echoing the key to prove redaction. */
export function failingFetch(message: string): typeof fetch {
  return (async () => {
    throw new TypeError(message);
  }) as unknown as typeof fetch;
}

/**
 * What an adapter should read out of a success fixture, taken from the
 * fixture itself rather than written into the test. The smoke script
 * replaces these fixtures with recordings; tests that compare against the
 * fixture's own content keep passing on a real response without an edit.
 */
export interface ExpectedRead {
  content: unknown;
  usage: { inputTokens: number; outputTokens: number };
  servedModel: string;
}

/** An Anthropic message body: text blocks, usage, model. */
export function anthropicExpected(message: unknown): ExpectedRead {
  const m = message as {
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };
  const text = m.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  return {
    content: JSON.parse(unfenced(text)),
    usage: { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens },
    servedModel: m.model,
  };
}

/**
 * The text inside one ```json fence, or the text itself. The first real
 * Haiku recording (slice 0017's smoke run) fenced its JSON, which the adapter
 * accepts; reading it here independently keeps the expectation from being
 * computed by the code under test.
 */
function unfenced(text: string): string {
  const m = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(text.trim());
  return (m?.[1] ?? text).trim();
}

/** A Chat Completions body with no cached tokens. */
export function chatExpected(envelope: unknown): ExpectedRead {
  const e = envelope as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
    model: string;
  };
  return {
    content: JSON.parse(e.choices[0]?.message.content ?? ""),
    usage: { inputTokens: e.usage.prompt_tokens, outputTokens: e.usage.completion_tokens },
    servedModel: e.model,
  };
}

/** The first succeeded line's message in a batch-results fixture. */
export function batchSucceededMessage(fixture: Fixture): unknown {
  return String(fixture.body)
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { result: { type: string; message?: unknown } })
    .find((l) => l.result.type === "succeeded")?.result.message;
}
