import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import type { ScriptedResponse } from "../../src/models/index.js";
import { FakeModelAdapter } from "../../src/models/index.js";
import { type App, configureApp } from "../../src/server/index.js";
import { fixedAgent } from "../../src/server/models.js";
import { SettingsStore } from "../../src/server/settings.js";
import { ADDED_ID, addedTrial, cannedParse } from "../fixtures/added-trial.js";
import { comparable, direct, REPLIES, SCRIPT, SERVED } from "../fixtures/conversation.js";
import { EVAL_ONLY_KEYS, evalRun, keysOf } from "../fixtures/eval-run.js";

/**
 * The whole app through Fastify's `inject`: every request is handled in
 * process, and no socket is opened. This is the only test file that imports
 * Fastify, so its import cost is paid once (spec §10).
 */

const webDir = mkdtempSync(join(tmpdir(), "prescreen-web-"));
mkdirSync(join(webDir, "assets"));
writeFileSync(join(webDir, "index.html"), "<!doctype html><title>page</title>");
writeFileSync(join(webDir, "assets", "index-abc.js"), "console.log('page');");
writeFileSync(join(webDir, "assets", "font-abc.woff2"), "wOF2");
writeFileSync(join(webDir, "manifest.webmanifest"), "{}");
afterAll(() => rmSync(webDir, { recursive: true, force: true }));

function build(script: ScriptedResponse[] = SCRIPT): { app: FastifyInstance; parts: App } {
  const app = Fastify();
  const parts = configureApp(app, {
    studies: SERVED,
    source: "labels",
    agent: fixedAgent(new FakeModelAdapter(script)),
    mode: "scripted",
    webDir,
    // inject addresses requests to localhost:80 unless told otherwise.
    port: 80,
    now: () => new Date("2000-01-23T15:00:00Z"),
  });
  return { app, parts };
}

async function startConversation(app: FastifyInstance, parts: App): Promise<string> {
  const started = await app.inject({
    method: "POST",
    url: "/api/conversations",
    payload: { nctId: "NCT04316364" },
  });
  expect(started.statusCode).toBe(201);
  const { id } = started.json() as { id: string };
  await parts.service.settled(id);
  return id;
}

async function say(app: FastifyInstance, parts: App, id: string, text: string) {
  const sent = await app.inject({
    method: "POST",
    url: `/api/conversations/${id}/messages`,
    payload: { text },
  });
  await parts.service.settled(id);
  return sent;
}

describe("the conversation over HTTP", () => {
  it("runs the agent exactly as ScreeningSession does (transparency, part 2)", async () => {
    const reference = await direct();
    const { app, parts } = build();
    const id = await startConversation(app, parts);

    for (const text of REPLIES) {
      expect((await say(app, parts, id, text)).statusCode).toBe(202);
    }

    expect(parts.service.state(id)).toEqual(reference.state);
    expect(comparable(parts.service.result(id))).toEqual(comparable(reference.result));
  });

  it("shows the participant the messages, and where the conversation stands", async () => {
    const { app, parts } = build();
    const id = await startConversation(app, parts);
    await say(app, parts, id, REPLIES[0] as string);

    const view = (
      await app.inject({ method: "GET", url: `/api/conversations/${id}/messages` })
    ).json() as { status: string; messages: Array<{ from: string; text: string; state?: string }> };

    expect(view.status).toBe("idle");
    expect(view.messages.map((m) => m.from)).toEqual(["agent", "participant", "agent"]);
    expect(view.messages[0]?.text).toMatch(/^Hello[\s\S]*anti-cancer therapy\?$/);
    expect(view.messages[1]).toMatchObject({ text: REPLIES[0], state: "processed" });
  });

  it("refuses an empty, an over-long, and an unknown-conversation message", async () => {
    const { app, parts } = build();
    const id = await startConversation(app, parts);

    expect((await say(app, parts, id, "  ")).statusCode).toBe(400);
    expect((await say(app, parts, id, "x".repeat(1601))).statusCode).toBe(400);
    const missing = await app.inject({
      method: "POST",
      url: `/api/conversations/${id}/messages`,
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
    expect((await say(app, parts, "NCT04316364-20990101T000000", "hi")).statusCode).toBe(404);
  });

  it("refuses a second message while the agent is working", async () => {
    // A model that does not answer until released, so the turn is really in flight.
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scripted = new FakeModelAdapter(SCRIPT);
    let calls = 0;
    const app = Fastify();
    const parts = configureApp(app, {
      studies: SERVED,
      source: "labels",
      mode: "scripted",
      port: 80,
      agent: fixedAgent({
        descriptor: scripted.descriptor,
        complete: async (request: Parameters<typeof scripted.complete>[0]) => {
          calls += 1;
          if (calls > 1) {
            await gate;
          }
          return scripted.complete(request);
        },
      }),
    });
    const id = await startConversation(app, parts);

    const first = await app.inject({
      method: "POST",
      url: `/api/conversations/${id}/messages`,
      payload: { text: REPLIES[0] },
    });
    expect(first.statusCode).toBe(202);
    const second = await app.inject({
      method: "POST",
      url: `/api/conversations/${id}/messages`,
      payload: { text: "and another thing" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: "working" });

    release();
    await parts.service.settled(id);
    const said = parts.service.state(id)?.transcript.filter((t) => t.speaker === "participant");
    expect(said?.map((t) => t.text)).toEqual([REPLIES[0]]);
  });

  it("refuses a message after the conversation is done", async () => {
    const { app, parts } = build();
    const id = await startConversation(app, parts);
    for (const text of REPLIES) {
      await say(app, parts, id, text);
    }

    const after = await say(app, parts, id, "one more thing");
    expect(after.statusCode).toBe(409);
    expect(after.json()).toEqual({ error: "done" });
  });

  it("takes a retry only after a failure", async () => {
    const [open, ...rest] = SCRIPT;
    const failure: ScriptedResponse = { kind: "error", message: "request failed: fetch failed" };
    const { app, parts } = build([open as ScriptedResponse, failure, ...rest]);
    const id = await startConversation(app, parts);
    const retry = () => app.inject({ method: "POST", url: `/api/conversations/${id}/retry` });

    expect((await retry()).statusCode).toBe(409);
    await say(app, parts, id, REPLIES[0] as string);
    const view = await app.inject({ method: "GET", url: `/api/conversations/${id}/messages` });
    expect(view.json()).toMatchObject({ status: "unavailable" });

    expect((await retry()).statusCode).toBe(202);
    await parts.service.settled(id);
    const after = await app.inject({ method: "GET", url: `/api/conversations/${id}/messages` });
    expect(after.json()).toMatchObject({ status: "idle" });
  });
});

describe("a conversation whose opening failed", () => {
  it("refuses a typed message, and recovers when the opening is tried again", async () => {
    const failure: ScriptedResponse = { kind: "error", message: "request failed: fetch failed" };
    const { app, parts } = build([failure, ...SCRIPT]);
    const id = await startConversation(app, parts);

    const typed = await say(app, parts, id, "hello?");
    expect(typed.statusCode).toBe(409);
    expect(typed.json()).toEqual({ error: "not-started" });

    const again = await app.inject({ method: "POST", url: `/api/conversations/${id}/retry` });
    expect(again.statusCode).toBe(202);
    await parts.service.settled(id);
    const view = (
      await app.inject({ method: "GET", url: `/api/conversations/${id}/messages` })
    ).json();
    expect(view).toMatchObject({ status: "idle" });
    expect(view.messages[0].text).toMatch(/^Hello/);
  });
});

describe("the inspection routes", () => {
  it("describe the mode, the model and the source", async () => {
    const { app } = build();
    const info = (await app.inject({ method: "GET", url: "/api/info" })).json();

    expect(info).toMatchObject({
      mode: "scripted",
      source: "labels",
      model: { adapter: "fake" },
      examples: true,
    });
  });

  it("list the served studies", async () => {
    const { app } = build();
    const studies = (await app.inject({ method: "GET", url: "/api/studies" })).json();

    expect(studies).toEqual([
      {
        nctId: "NCT04316364",
        briefTitle: "A Lung Cancer Study",
        criteria: 4,
        source: "labels",
        origin: "pinned",
      },
    ]);
  });

  it("list conversations and show one's progress", async () => {
    const { app, parts } = build();
    const id = await startConversation(app, parts);
    await say(app, parts, id, REPLIES[0] as string);

    const list = (await app.inject({ method: "GET", url: "/api/conversations" })).json();
    // Opening, first question, reply, next question.
    expect(list).toMatchObject([{ id, nctId: "NCT04316364", done: false, turns: 4 }]);

    const seen = (await app.inject({ method: "GET", url: `/api/conversations/${id}` })).json();
    expect(seen).toMatchObject({ id, pending: "L2", source: "labels", plain: {} });
    expect(seen.progress).toHaveLength(4);
  });

  it("refuse to start an unknown study, or one not named", async () => {
    const { app } = build();
    const start = (payload: object) =>
      app.inject({ method: "POST", url: "/api/conversations", payload });

    expect((await start({ nctId: "NCT99999999" })).statusCode).toBe(404);
    expect((await start({})).statusCode).toBe(400);
  });

  it("return 404 for a conversation that does not exist", async () => {
    const { app } = build();
    const seen = await app.inject({ method: "GET", url: "/api/conversations/NCT1-2" });
    expect(seen.statusCode).toBe(404);
  });
});

describe("serving the page", () => {
  it("serves a built file with its type", async () => {
    const { app } = build();
    const file = await app.inject({ method: "GET", url: "/assets/index-abc.js" });

    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toMatch(/^text\/javascript/);
    expect(file.body).toBe("console.log('page');");
  });

  it("serves the bundled fonts and the manifest with their types (slice 0020)", async () => {
    const { app } = build();
    const font = await app.inject({ method: "GET", url: "/assets/font-abc.woff2" });
    const manifest = await app.inject({ method: "GET", url: "/manifest.webmanifest" });

    expect(font.headers["content-type"]).toBe("font/woff2");
    expect(manifest.headers["content-type"]).toMatch(/^application\/manifest\+json/);
  });

  it("serves the page for any other path, so a reload on #/c/<id> works", async () => {
    const { app } = build();
    for (const url of ["/", "/anything", "/assets/../../etc/passwd"]) {
      const page = await app.inject({ method: "GET", url });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain("<title>page</title>");
    }
  });

  it("answers an unknown API path with JSON 404, not the page", async () => {
    const { app } = build();
    const unknown = await app.inject({ method: "GET", url: "/api/unknown" });

    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "not-found" });
  });
});

describe("the request guards", () => {
  it("refuses a request addressed to any name or port but this server's", async () => {
    const { app } = build();
    const as = (host: string) => app.inject({ method: "GET", url: "/api/info", headers: { host } });

    expect((await as("localhost:80")).statusCode).toBe(200);
    expect((await as("127.0.0.1:80")).statusCode).toBe(200);
    expect((await as("attacker.example:80")).statusCode).toBe(421);
    expect((await as("localhost:5005")).statusCode).toBe(421);
    expect((await as("127.0.0.1")).statusCode).toBe(421);
  });

  it("refuses a change requested from another page's origin", async () => {
    const { app } = build();
    const start = (origin?: string) =>
      app.inject({
        method: "POST",
        url: "/api/conversations",
        payload: { nctId: "NCT04316364" },
        ...(origin === undefined ? {} : { headers: { origin } }),
      });

    expect((await start("https://attacker.example")).statusCode).toBe(403);
    expect((await start("http://localhost:5005")).statusCode).toBe(403);
    expect((await start("http://localhost:80")).statusCode).toBe(201);
    expect((await start()).statusCode).toBe(201);
  });

  it("keeps a participant's words out of the log, even at the most detailed request level", async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const app = Fastify({ logger: { level: "trace", stream: sink } });
    const parts = configureApp(app, {
      studies: SERVED,
      source: "labels",
      mode: "scripted",
      port: 80,
      agent: fixedAgent(new FakeModelAdapter(SCRIPT)),
    });
    const id = await startConversation(app, parts);
    const marker = "MARKER-7f3a my made-up answer";

    await say(app, parts, id, marker);
    await app.inject({ method: "GET", url: `/api/conversations/${id}/messages` });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain("MARKER-7f3a");
  });

  it("never answers with anything shaped like a verdict, on any route", async () => {
    const { app, parts } = build();
    const id = await startConversation(app, parts);
    for (const text of REPLIES) {
      await say(app, parts, id, text);
    }

    const bodies = await Promise.all(
      [
        "/api/info",
        "/api/studies",
        "/api/conversations",
        `/api/conversations/${id}`,
        `/api/conversations/${id}/messages`,
        `/api/conversations/${id}/review`,
      ].map(async (url) => (await app.inject({ method: "GET", url })).json()),
    );
    const keys: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (typeof value === "object" && value !== null) {
        for (const [key, inner] of Object.entries(value)) {
          keys.push(key);
          walk(inner);
        }
      }
    };
    walk(bodies);

    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => /eligib|verdict|disposition|qualif/i.test(k))).toEqual([]);
  });
});

describe("the coordinator review over HTTP", () => {
  it("is 404 for an unknown conversation and 409 until it has finished", async () => {
    const { app, parts } = build();
    const unknown = await app.inject({
      method: "GET",
      url: "/api/conversations/NCT04316364-20260101T000000/review",
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "unknown-conversation" });

    const id = await startConversation(app, parts);
    const early = await app.inject({ method: "GET", url: `/api/conversations/${id}/review` });
    expect(early.statusCode).toBe(409);
    expect(early.json()).toEqual({ error: "not-finished" });
  });

  it("returns the finished result, with its criteria, renderings and source", async () => {
    const { app, parts } = build();
    const id = await startConversation(app, parts);
    for (const text of REPLIES) {
      await say(app, parts, id, text);
    }
    const done = await app.inject({ method: "GET", url: `/api/conversations/${id}/review` });
    expect(done.statusCode).toBe(200);
    const body = done.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["criteria", "id", "origin", "plain", "result", "source"].sort(),
    );
    expect(comparable(body["result"] as never)).toEqual(comparable((await direct()).result));
  });

  it("has no way to write to a review", async () => {
    const { app, parts } = build();
    const id = await startConversation(app, parts);
    for (const text of REPLIES) {
      await say(app, parts, id, text);
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const response = await app.inject({
        method,
        url: `/api/conversations/${id}/review`,
        payload: { decision: "anything" },
      });
      expect(response.statusCode, method).toBe(404);
    }
  });

  it("serves the eval run blind: nothing from a vignette, a simulated participant or a grade", async () => {
    const run = evalRun();
    const app = Fastify();
    configureApp(app, {
      studies: SERVED,
      source: "labels",
      agent: fixedAgent(new FakeModelAdapter([])),
      mode: "scripted",
      port: 80,
      finished: run,
    });
    const bodies = await Promise.all(
      run.map(async (c) => {
        const url = `/api/conversations/${encodeURIComponent(c.id)}/review`;
        const response = await app.inject({ method: "GET", url });
        expect(response.statusCode).toBe(200);
        return response.json();
      }),
    );
    const listed = (await app.inject({ method: "GET", url: "/api/conversations" })).json();
    const keys = keysOf([bodies, listed]);
    expect(keys.length).toBeGreaterThan(1000);
    expect(keys.filter((k) => EVAL_ONLY_KEYS.includes(k))).toEqual([]);
  });

  it("reaches a finished conversation from the eval run by its encoded id", async () => {
    const { result } = await direct();
    const app = Fastify();
    configureApp(app, {
      studies: SERVED,
      source: "labels",
      agent: fixedAgent(new FakeModelAdapter([])),
      mode: "scripted",
      port: 80,
      finished: [
        { id: "eval NCT04316364-v1-labels", source: "labels", criteria: [], result, plain: {} },
      ],
    });
    const found = await app.inject({
      method: "GET",
      url: `/api/conversations/${encodeURIComponent("eval NCT04316364-v1-labels")}/review`,
    });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({ origin: "eval-run", id: "eval NCT04316364-v1-labels" });
  });
});

describe("the Trials screen's routes (slice 0013)", () => {
  function withTrials() {
    const app = Fastify();
    const parts = configureApp(app, {
      studies: SERVED,
      source: "labels",
      agent: fixedAgent(new FakeModelAdapter([])),
      mode: "scripted",
      port: 80,
      trials: {
        fetchStudy: async (nctId) => addedTrial(undefined, nctId),
        // Slow enough that a request made straight after an add finds it busy.
        parserFor: () =>
          new FakeModelAdapter([], { respond: (r) => ({ ...cannedParse(r), delayMs: 20 }) }),
      },
    });
    return { app, library: parts.trials };
  }
  const add = (app: FastifyInstance, payload: object, origin?: string) =>
    app.inject({
      method: "POST",
      url: "/api/trials",
      payload,
      ...(origin === undefined ? {} : { headers: { origin } }),
    });

  it("adds a trial by link, then lists it and offers it as a study from its parse", async () => {
    const { app, library } = withTrials();
    const added = await add(app, { reference: `https://clinicaltrials.gov/study/${ADDED_ID}` });
    expect(added.statusCode).toBe(202);
    expect(added.json()).toEqual({ nctId: ADDED_ID });
    await library?.whenIdle();

    const rows = (await app.inject({ method: "GET", url: "/api/trials" })).json();
    expect(
      rows.map((r: { nctId: string; origin: string; state: string }) => [
        r.nctId,
        r.origin,
        r.state,
      ]),
    ).toEqual([
      ["NCT04316364", "pinned", "ready"],
      [ADDED_ID, "added", "ready"],
    ]);
    const studies = (await app.inject({ method: "GET", url: "/api/studies" })).json();
    expect(studies[1]).toMatchObject({
      nctId: ADDED_ID,
      source: "parse",
      origin: "added",
      criteria: 3,
    });
  });

  it("refuses an unreadable reference, a missing one, and a trial already listed", async () => {
    const { app, library } = withTrials();
    expect((await add(app, { reference: "lung" })).statusCode).toBe(400);
    expect((await add(app, {})).statusCode).toBe(400);
    expect((await add(app, { reference: "NCT04316364" })).statusCode).toBe(409);
    await add(app, { reference: ADDED_ID });
    const again = await add(app, { reference: ADDED_ID });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: `${ADDED_ID} is already listed.` });
    await library?.whenIdle();
  });

  it("refreshes and removes an added trial, and refuses a pinned, unknown, busy or malformed one", async () => {
    const { app, library } = withTrials();
    const refresh = (id: string) =>
      app.inject({ method: "POST", url: `/api/trials/${id}/refresh` });
    const remove = (id: string) => app.inject({ method: "DELETE", url: `/api/trials/${id}` });

    await add(app, { reference: ADDED_ID });
    expect((await remove(ADDED_ID)).statusCode).toBe(409);
    expect((await refresh(ADDED_ID)).statusCode).toBe(409);
    await library?.whenIdle();

    expect((await refresh(ADDED_ID)).statusCode).toBe(202);
    await library?.whenIdle();
    expect((await refresh("NCT04316364")).statusCode).toBe(409);
    expect((await remove("NCT04316364")).statusCode).toBe(409);
    expect((await refresh("NCT09999999")).statusCode).toBe(404);
    expect((await remove("NCT09999999")).statusCode).toBe(404);
    expect((await remove("..%2Fescape")).statusCode).toBe(404);

    expect((await remove(ADDED_ID)).statusCode).toBe(204);
    const studies = (await app.inject({ method: "GET", url: "/api/studies" })).json();
    expect(studies).toHaveLength(1);
  });

  it("refuses an add or a removal from another page's origin", async () => {
    const { app, library } = withTrials();
    expect((await add(app, { reference: ADDED_ID }, "https://attacker.example")).statusCode).toBe(
      403,
    );
    expect((await add(app, { reference: ADDED_ID }, "http://localhost:80")).statusCode).toBe(202);
    await library?.whenIdle();
    const removal = await app.inject({
      method: "DELETE",
      url: `/api/trials/${ADDED_ID}`,
      headers: { origin: "https://attacker.example" },
    });
    expect(removal.statusCode).toBe(403);
  });

  it("lists the served studies and refuses to add when trials weren't configured", async () => {
    const { app } = build();
    const rows = (await app.inject({ method: "GET", url: "/api/trials" })).json();
    expect(rows).toEqual([
      {
        nctId: "NCT04316364",
        origin: "pinned",
        briefTitle: "A Lung Cancer Study",
        conditions: [],
        state: "ready",
        criteria: 4,
        dropped: null,
        problem: null,
        since: null,
        byType: { patient: 2, clinical: 1, protocol: 1, definitional: 0 },
        readBy: null,
      },
    ]);
    expect((await add(app, { reference: ADDED_ID })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: "DELETE", url: `/api/trials/${ADDED_ID}` })).statusCode,
    ).toBe(404);
  });

  it("serves a trial's checklist read-only, and 404 for an unknown or malformed ID", async () => {
    const { app, library } = withTrials();
    await add(app, { reference: ADDED_ID });
    await library?.whenIdle();
    const get = (id: string) => app.inject({ method: "GET", url: `/api/trials/${id}` });

    const added = await get(ADDED_ID);
    expect(added.statusCode).toBe(200);
    expect(added.json()).toMatchObject({
      row: { nctId: ADDED_ID, origin: "added", byType: { patient: 3 } },
      criteriaText: expect.stringContaining("Inclusion Criteria:"),
    });
    expect(added.json().criteria).toHaveLength(3);

    const pinned = await get("NCT04316364");
    expect(pinned.statusCode).toBe(200);
    expect(pinned.json()).toMatchObject({ row: { origin: "pinned" }, criteriaText: null });

    expect((await get("NCT09999999")).statusCode).toBe(404);
    expect((await get("..%2Fescape")).statusCode).toBe(404);
  });

  it("serves a pinned trial's checklist when adding trials isn't configured", async () => {
    const { app } = build();
    const found = await app.inject({ method: "GET", url: "/api/trials/NCT04316364" });
    expect(found.statusCode).toBe(200);
    expect(found.json().criteria).toHaveLength(4);
  });
});

describe("deleting a screening over HTTP (slice 0014)", () => {
  it("deletes the person's own, refuses the eval run's, and 404s an unknown one", async () => {
    const { result } = await direct();
    const app = Fastify();
    const parts = configureApp(app, {
      studies: SERVED,
      source: "labels",
      agent: fixedAgent(new FakeModelAdapter(SCRIPT)),
      mode: "scripted",
      port: 80,
      now: () => new Date("2000-01-23T15:00:00Z"),
      finished: [
        { id: "eval NCT04316364-v1-labels", source: "labels", criteria: [], result, plain: {} },
      ],
    });
    const id = await startConversation(app, parts);
    const del = (conversationId: string, origin?: string) =>
      app.inject({
        method: "DELETE",
        url: `/api/conversations/${encodeURIComponent(conversationId)}`,
        ...(origin === undefined ? {} : { headers: { origin } }),
      });

    expect((await del(id, "https://attacker.example")).statusCode).toBe(403);
    expect((await del("eval NCT04316364-v1-labels")).statusCode).toBe(409);
    expect((await del(id)).statusCode).toBe(204);
    expect((await del(id)).statusCode).toBe(404);
    const list = (await app.inject({ method: "GET", url: "/api/conversations" })).json();
    expect(list.map((c: { id: string; title: string }) => [c.id, c.title])).toEqual([
      ["eval NCT04316364-v1-labels", "A Lung Cancer Study"],
    ]);
  });
});

/**
 * Settings (slice 0017). Every route that changes something needs this app's
 * own Origin and a JSON body, and no answer ever carries a saved key.
 */
describe("the Settings routes", () => {
  const OWN = { origin: "http://localhost:80", "content-type": "application/json" };
  const KEY = "test-key-00000000";

  function withSettings(mode: "scripted" | "local-model" = "local-model") {
    const store = new SettingsStore(
      join(mkdtempSync(join(tmpdir(), "prescreen-set-")), "local"),
      {},
    );
    const tested: unknown[] = [];
    const app = Fastify();
    configureApp(app, {
      studies: SERVED,
      source: "labels",
      agent: fixedAgent(new FakeModelAdapter([])),
      mode,
      port: 80,
      settings: {
        store,
        estimates: { "anthropic:claude-haiku-4-5": { screeningUsd: 0.29, trialUsd: 0.03 } },
        test: async (choice) => {
          tested.push(choice);
          return { ok: true, usd: 0.0005, servedModel: "claude-haiku-4-5-20251001" };
        },
        localModels: async () => ({ reachable: true, models: ["Local-8bit"] }),
      },
    });
    return { app, store, tested };
  }

  it("save a key and a choice, and answer with the view, never the key", async () => {
    const { app, store } = withSettings();
    const bodies: string[] = [];
    const call = async (
      method: "GET" | "PUT" | "POST" | "DELETE",
      url: string,
      payload?: object,
    ) => {
      const res = await app.inject({
        method,
        url,
        headers: method === "GET" ? {} : method === "DELETE" ? { origin: OWN.origin } : OWN,
        ...(payload === undefined ? {} : { payload }),
      });
      bodies.push(res.body);
      return res;
    };

    expect((await call("PUT", "/api/settings/keys/anthropic", { key: KEY })).json()).toMatchObject({
      providers: expect.arrayContaining([
        expect.objectContaining({ provider: "anthropic", keySaved: true, keyHint: "…0000" }),
      ]),
    });
    const chosen = await call("PUT", "/api/settings", {
      choice: { provider: "anthropic", model: "claude-haiku-4-5" },
    });
    expect(chosen.json()).toMatchObject({ mode: "live", choice: { provider: "anthropic" } });
    expect(
      (
        await call("POST", "/api/settings/test", {
          provider: "anthropic",
          model: "claude-haiku-4-5",
        })
      ).json(),
    ).toMatchObject({ ok: true });
    expect((await call("GET", "/api/settings")).statusCode).toBe(200);
    expect((await call("GET", "/api/settings/local-models")).json()).toEqual({
      reachable: true,
      models: ["Local-8bit"],
    });
    expect(store.saved().keys.anthropic).toBe(KEY);
    expect((await call("DELETE", "/api/settings/keys/anthropic")).json()).toMatchObject({
      providers: expect.arrayContaining([
        expect.objectContaining({ provider: "anthropic", keySaved: false }),
      ]),
    });

    expect(bodies.length).toBe(6);
    expect(bodies.filter((b) => b.includes(KEY))).toEqual([]);
  });

  it("refuse a change without this app's Origin, or without a JSON body", async () => {
    const { app, store } = withSettings();
    const put = (headers: Record<string, string>, payload: string) =>
      app.inject({ method: "PUT", url: "/api/settings/keys/anthropic", headers, payload });

    expect(
      (await put({ "content-type": "application/json" }, JSON.stringify({ key: KEY }))).statusCode,
    ).toBe(403);
    expect(
      (await put({ ...OWN, origin: "https://elsewhere.example" }, JSON.stringify({ key: KEY })))
        .statusCode,
    ).toBe(403);
    expect(
      (await put({ origin: OWN.origin, "content-type": "text/plain" }, `key=${KEY}`)).statusCode,
    ).toBe(403);
    expect(
      (await put({ ...OWN, origin: "http://127.0.0.1:80" }, JSON.stringify({ key: KEY })))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "DELETE", url: "/api/settings/keys/anthropic" })).statusCode,
    ).toBe(403);
    expect(store.saved().keys.anthropic).toBe(KEY);
  });

  it("refuse what can't be right with the reason, and never echo a key", async () => {
    const { app, tested } = withSettings();
    const bad = await app.inject({
      method: "PUT",
      url: "/api/settings/keys/anthropic",
      headers: OWN,
      payload: { key: `${KEY} x` },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).not.toContain(KEY);
    const model = await app.inject({
      method: "POST",
      url: "/api/settings/test",
      headers: OWN,
      payload: { provider: "anthropic", model: "claude-opus-5-5" },
    });
    expect(model.statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/settings/keys/nobody",
          headers: OWN,
          payload: { key: KEY },
        })
      ).statusCode,
    ).toBe(400);
    expect(tested).toEqual([]);
  });

  it("tell the page where answers go, and whether a model is set up", async () => {
    const { app, store } = withSettings();
    const info = async () => (await app.inject({ method: "GET", url: "/api/info" })).json();
    expect(await info()).toMatchObject({ hosted: null, ready: false });
    store.saveKey("anthropic", KEY);
    store.update({ choice: { provider: "anthropic", model: "claude-haiku-4-5" } });
    expect(await info()).toMatchObject({
      hosted: { provider: "anthropic", name: "Anthropic", model: "claude-haiku-4-5" },
      ready: true,
    });

    const scripted = withSettings("scripted");
    scripted.store.update({ choice: { provider: "anthropic", model: "claude-haiku-4-5" } });
    expect((await scripted.app.inject({ method: "GET", url: "/api/info" })).json()).toMatchObject({
      hosted: null,
      ready: true,
    });
  });
});
