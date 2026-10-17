import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scrubForFixture } from "../../scripts/lib/scrub.js";
import { fixtureNameFor, planSmoke, SMOKE_BUDGET } from "../../scripts/models-smoke.js";
import { AnthropicAdapter } from "../../src/models/anthropic.js";
import { fixtureFetch, loadFixture, SENTINEL_KEY } from "../models/fixtures.js";

const ENV = { ANTHROPIC_API_KEY: SENTINEL_KEY };

/** A response as the API might send it: real-looking ids, one header. */
function raw(body: unknown, retryAfter: string | null = null) {
  return { status: 200, retryAfter, text: JSON.stringify(body) };
}

describe("scrubForFixture", () => {
  it("replaces ids with fixed placeholders, keeps retry-after, and says it was recorded", () => {
    const body = {
      ...(loadFixture("anthropic", "ask-ok").body as object),
      id: "msg_01XFDUDYJgAACzvnptvVoYEL",
    };
    const fixture = scrubForFixture(
      "anthropic",
      raw(body, "3"),
      "recorded 2000-01-24 from claude-haiku-4-5",
      ENV,
    );

    expect(fixture.provenance).toBe("recorded 2000-01-24 from claude-haiku-4-5");
    expect((fixture.body as { id: string }).id).toBe("msg_recorded");
    expect(fixture.headers).toEqual({ "retry-after": "3" });
    expect(JSON.stringify(fixture)).not.toContain("01XFDUDY");
  });

  it("replaces a batch id wherever it appears, including inside the results URL", () => {
    const text = JSON.stringify({
      id: "msgbatch_013Zva2CMHLNnXjNJJKqJ2EF",
      results_url:
        "https://api.anthropic.com/v1/messages/batches/msgbatch_013Zva2CMHLNnXjNJJKqJ2EF/results",
    });
    const fixture = scrubForFixture(
      "anthropic",
      { status: 200, retryAfter: null, text },
      "recorded",
      ENV,
    );
    expect(JSON.stringify(fixture.body)).not.toContain("013Zva2");
    expect((fixture.body as { results_url: string }).results_url).toContain("msgbatch_recorded");
  });

  it("keeps a JSONL body as text", () => {
    const text =
      '{"custom_id":"a","result":{"type":"succeeded"}}\n{"custom_id":"b","result":{"type":"succeeded"}}\n';
    expect(
      typeof scrubForFixture("anthropic", { status: 200, retryAfter: null, text }, "recorded", ENV)
        .body,
    ).toBe("string");
  });

  // Whatever else is true of a response, one carrying the key is never written.
  it("refuses a body in which the key appears", () => {
    expect(() =>
      scrubForFixture("anthropic", raw({ echo: SENTINEL_KEY }), "recorded", ENV),
    ).toThrow(/contains the API key/);
  });

  it("produces a fixture the adapter reads", async () => {
    const recorded = scrubForFixture(
      "anthropic",
      raw({ ...(loadFixture("anthropic", "ask-ok").body as object), id: "msg_01AbC" }),
      "recorded 2000-01-24 from claude-haiku-4-5",
      ENV,
    );
    const { fetchImpl } = fixtureFetch(recorded);
    const response = await new AnthropicAdapter({
      model: "claude-haiku-4-5",
      env: ENV,
      fetchImpl,
    }).complete({ system: "s", user: "u", responseFormat: "json", maxOutputTokens: 8 });
    expect(response.finishReason).toBe("stop");
  });
});

describe("the smoke script's plan", () => {
  const log = () => join(mkdtempSync(join(tmpdir(), "spend-")), "spend.jsonl");

  it("is dry without --spend, within its own small budget", () => {
    const planned = planSmoke(["anthropic"], log());
    expect(planned.plan.kind).toBe("estimate-only");
    expect(SMOKE_BUDGET).toEqual({ maxCalls: 4, maxUsd: 0.05 });
    expect(planSmoke(["anthropic", "--spend"], log()).plan).toMatchObject({
      kind: "spend",
      budget: SMOKE_BUDGET,
    });
  });

  it("refuses oMLX, a missing provider, and batch outside Anthropic", () => {
    expect(() => planSmoke([], log())).toThrow(/Name a provider/);
    expect(() => planSmoke(["omlx"], log())).toThrow(/oMLX is local/);
    expect(() => planSmoke(["xai", "--batch"], log())).toThrow(/Anthropic only/);
  });

  it("maps each successful response to the fixture it replaces, and skips failures", () => {
    const r = (label: string, url: string, text = "{}", status = 200) => ({
      label,
      url,
      status,
      retryAfter: null,
      text,
    });
    const messages = "https://api.anthropic.com/v1/messages";
    const batches = `${messages}/batches`;
    expect(fixtureNameFor(r("ask", messages), "anthropic", false)).toBe("ask-ok");
    expect(fixtureNameFor(r("ask", "x"), "openai", false)).toBe("ok");
    expect(fixtureNameFor(r("read", messages), "xai", false)).toBe("read-ok");
    expect(fixtureNameFor(r("ask", messages, "{}", 429), "anthropic", false)).toBeUndefined();
    expect(fixtureNameFor(r("ask", batches), "anthropic", true)).toBe("batch-created");
    expect(
      fixtureNameFor(
        r("ask", `${batches}/b`, '{"processing_status": "in_progress"}'),
        "anthropic",
        true,
      ),
    ).toBe("batch-in-progress");
    expect(
      fixtureNameFor(r("ask", `${batches}/b`, '{"processing_status":"ended"}'), "anthropic", true),
    ).toBe("batch-ended");
    expect(fixtureNameFor(r("ask", `${batches}/b/results`), "anthropic", true)).toBe(
      "batch-results",
    );
  });
});
