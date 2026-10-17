import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { toView } from "../../scripts/show-conversation.js";
import type { ScriptedResponse } from "../../src/models/index.js";
import { FakeModelAdapter } from "../../src/models/index.js";
import {
  ConversationService,
  ConversationStore,
  channelHistory,
  type FinishedConversation,
  MODEL_UNAVAILABLE,
  RESTARTED,
  type SavedConversation,
} from "../../src/server/index.js";
import { fixedAgent } from "../../src/server/models.js";
import { MemoryTransport } from "../../src/transport/index.js";
import { CRITERIA, comparable, direct, REPLIES, SCRIPT, SERVED } from "../fixtures/conversation.js";

/**
 * Saving to `chats/` and coming back after a restart (spec §5.4). Each test
 * gets its own temporary directory; nothing touches the real `chats/`.
 */
const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prescreen-chats-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const CONNECTION_FAILURE: ScriptedResponse = {
  kind: "error",
  message: "request failed: fetch failed",
};

function service(dir: string, script: ScriptedResponse[], now = "2000-01-23T15:00:00Z") {
  const transport = new MemoryTransport();
  const svc = new ConversationService({
    studies: SERVED,
    source: "labels",
    agent: fixedAgent(new FakeModelAdapter(script)),
    transport,
    store: new ConversationStore(dir),
    now: () => new Date(now),
  });
  return { svc, transport };
}

function saved(dir: string, id: string): SavedConversation {
  return JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")) as SavedConversation;
}

describe("saving a conversation", () => {
  it("writes on start, on accepting a message, and on finishing, in screening:chat's format", async () => {
    const dir = tempDir();
    const { svc, transport } = service(dir, SCRIPT);
    const id = svc.start("NCT04316364");
    expect(saved(dir, id)).toMatchObject({ vignetteId: "web NCT04316364", source: "labels" });

    await svc.settled(id);
    transport.send(id, REPLIES[0] as string);
    expect(saved(dir, id).pending).toEqual({ text: REPLIES[0], status: "working" });

    await svc.settled(id);
    expect(saved(dir, id).pending).toBeUndefined();
    transport.send(id, REPLIES[1] as string);
    await svc.settled(id);

    const file = saved(dir, id);
    expect(file.state).toEqual((await direct()).state);
    expect(file.result?.findings).toHaveLength(4);
    expect(readdirSync(dir)).toEqual([`${id}.json`]);
  });

  it("records a failed message with why, so it survives a restart", async () => {
    const dir = tempDir();
    const { svc, transport } = service(dir, [SCRIPT[0] as ScriptedResponse, CONNECTION_FAILURE]);
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    transport.send(id, "No treatment at all.");
    await svc.settled(id);

    expect(saved(dir, id).pending).toEqual({
      text: "No treatment at all.",
      status: "unavailable",
      detail: MODEL_UNAVAILABLE,
    });
  });

  it("renders with screening:show, unchanged", async () => {
    const dir = tempDir();
    const { svc, transport } = service(dir, SCRIPT);
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    for (const text of REPLIES) {
      transport.send(id, text);
      await svc.settled(id);
    }

    const view = toView(saved(dir, id), id);
    expect(view.title).toBe("web NCT04316364 (labels)");
    expect(view.complete).toBe(true);
    expect(view.findings.map((f) => f.criterionId)).toEqual(["L8", "L4", "L2", "L19"]);
  });

  it("refuses an id that is not a conversation id before touching the filesystem", () => {
    const dir = tempDir();
    const store = new ConversationStore(dir);
    const record = { vignetteId: "x", source: "labels" } as SavedConversation;

    expect(() => store.save("../../etc/passwd", record)).toThrow(/not a conversation id/);
    expect(() => store.save("NCT04316364-20000123T150000/x", record)).toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("after a restart", () => {
  it("carries on where it stopped, ending as an uninterrupted run would", async () => {
    const dir = tempDir();
    const [open, read1, ask1, ...rest] = SCRIPT;
    const first = service(dir, [open, read1, ask1] as ScriptedResponse[]);
    const id = first.svc.start("NCT04316364");
    await first.svc.settled(id);
    first.transport.send(id, REPLIES[0] as string);
    await first.svc.settled(id);

    const second = service(dir, rest);
    expect(second.transport.view(id)?.status).toBe("idle");
    expect(second.transport.view(id)?.messages.map((m) => m.from)).toEqual([
      "agent",
      "participant",
      "agent",
    ]);
    second.transport.send(id, REPLIES[1] as string);
    await second.svc.settled(id);

    expect(second.svc.state(id)).toEqual((await direct()).state);
    expect(second.transport.view(id)?.status).toBe("done");
  });

  it("brings a message that was being worked on back as not processed, and never retries it silently", async () => {
    const dir = tempDir();
    const first = service(dir, [SCRIPT[0] as ScriptedResponse]);
    const id = first.svc.start("NCT04316364");
    await first.svc.settled(id);
    // Simulate the server stopping mid-turn: accepted and saved, never answered.
    const record = saved(dir, id);
    writeFileSync(
      join(dir, `${id}.json`),
      JSON.stringify({ ...record, pending: { text: "No treatment at all.", status: "working" } }),
    );

    const adapter = SCRIPT.slice(1);
    const second = service(dir, adapter);
    expect(second.transport.view(id)).toMatchObject({ status: "failed", detail: RESTARTED });
    expect(second.transport.unprocessed(id)).toBe("No treatment at all.");
    expect(second.svc.state(id)?.transcript).toHaveLength(2);

    expect(second.transport.retry(id)).toEqual({ ok: true });
    await second.svc.settled(id);
    expect(
      second.svc.state(id)?.transcript.filter((t) => t.speaker === "participant"),
    ).toHaveLength(1);
  });

  it("retries the opening of a conversation whose opening never arrived", async () => {
    const dir = tempDir();
    const first = service(dir, [CONNECTION_FAILURE]);
    const id = first.svc.start("NCT04316364");
    await first.svc.settled(id);

    const second = service(dir, SCRIPT);
    expect(second.transport.view(id)?.status).toBe("failed");
    second.transport.retry(id);
    await second.svc.settled(id);
    expect(second.transport.delivered(id)[0]).toMatch(/^Hello/);
  });

  it("continues a conversation started in the terminal with screening:chat", async () => {
    const dir = tempDir();
    const [open, ...rest] = SCRIPT;
    const terminal = service(tempDir(), [open as ScriptedResponse]);
    const started = terminal.svc.start("NCT04316364");
    await terminal.svc.settled(started);
    // What scripts/chat.ts writes: no pending field, vignetteId "chat …".
    const id = "NCT04316364-20260101T090000";
    writeFileSync(
      join(dir, `${id}.json`),
      JSON.stringify({
        vignetteId: "chat NCT04316364",
        source: "labels",
        state: terminal.svc.state(started),
      }),
    );

    const web = service(dir, rest);
    expect(web.svc.list().map((c) => c.id)).toEqual([id]);
    web.transport.send(id, REPLIES[0] as string);
    await web.svc.settled(id);
    expect(saved(dir, id).vignetteId).toBe("chat NCT04316364");
    expect(web.svc.state(id)?.transcript).toHaveLength(4);
  });

  it("gives a new conversation the next free second rather than overwrite a saved one", async () => {
    const dir = tempDir();
    const first = service(dir, SCRIPT);
    const a = first.svc.start("NCT04316364");
    await first.svc.settled(a);

    const second = service(dir, SCRIPT);
    const b = second.svc.start("NCT04316364");
    await second.svc.settled(b);

    expect(b).not.toBe(a);
    expect(existsSync(join(dir, `${a}.json`))).toBe(true);
    expect(existsSync(join(dir, `${b}.json`))).toBe(true);
  });

  it("skips files that are not conversations", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "NCT04316364-20000123T150000.json.html"), "<html>");
    writeFileSync(join(dir, "notes.json"), "{}");
    writeFileSync(join(dir, "NCT04316364-20000123T150001.json"), "{ not json");

    expect(new ConversationStore(dir).list()).toEqual([]);
  });
});

describe("when saving fails", () => {
  it("still delivers a reply the agent gave, and never offers its message to be taken twice", async () => {
    class FullDisk extends ConversationStore {
      saves = 0;
      override save(id: string, record: SavedConversation): void {
        this.saves += 1;
        // Start, opening, accepted message: saved. The finished turn: not.
        if (this.saves >= 4) {
          throw new Error("ENOSPC: no space left on device");
        }
        super.save(id, record);
      }
    }
    const logged: unknown[] = [];
    const transport = new MemoryTransport();
    const svc = new ConversationService({
      studies: SERVED,
      source: "labels",
      agent: fixedAgent(new FakeModelAdapter(SCRIPT)),
      transport,
      store: new FullDisk(tempDir()),
      logError: (error) => logged.push(error),
    });
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    transport.send(id, REPLIES[0] as string);
    await svc.settled(id);

    expect(transport.view(id)?.status).toBe("idle");
    expect(transport.unprocessed(id)).toBeUndefined();
    expect(transport.delivered(id)).toHaveLength(2);
    expect(String(logged[0])).toMatch(/ENOSPC/);
  });
});

describe("the channel rebuilt from a transcript", () => {
  it("joins the opening and first question into one message, as start() delivered them", async () => {
    const { state } = await direct();
    const history = channelHistory(state.transcript);

    expect(history.map((m) => m.from)).toEqual([
      "agent",
      "participant",
      "agent",
      "participant",
      "agent",
    ]);
    expect(history[0]?.text).toMatch(/^Hello[\s\S]*\n\nHave you had any anti-cancer therapy\?$/);
  });
});

/**
 * Plain-language renderings are display data (0006 spec §7.1): shown with a
 * labels conversation, never with a parse one, and never saved with the
 * conversation, which belongs to the agent.
 */
describe("plain language beside a conversation", () => {
  const PLAIN = { L19: { state: "shown" as const, text: "Is pregnant.", attempt: 1 as const } };
  const withPlain = SERVED.map((s) => ({ ...s, plain: PLAIN }));

  function serve(dir: string, source: "labels" | "parse", script: ScriptedResponse[]) {
    const transport = new MemoryTransport();
    const svc = new ConversationService({
      studies: withPlain,
      source,
      agent: fixedAgent(new FakeModelAdapter(script)),
      transport,
      store: new ConversationStore(dir),
      now: () => new Date("2000-01-23T15:00:00Z"),
    });
    return svc;
  }

  it("is shown with a labels conversation and not saved with it", async () => {
    const dir = tempDir();
    const svc = serve(dir, "labels", SCRIPT);
    const id = svc.start("NCT04316364");
    await svc.settled(id);

    expect(svc.inspect(id)?.plain).toEqual(PLAIN);
    expect(readFileSync(join(dir, `${id}.json`), "utf8")).not.toContain("Is pregnant.");
  });

  it("is not shown with a parse conversation, even one restored beside label renderings", async () => {
    const dir = tempDir();
    const parse = serve(dir, "parse", SCRIPT);
    const id = parse.start("NCT04316364");
    await parse.settled(id);
    expect(parse.inspect(id)?.plain).toEqual({});

    // Restarted with labels: the saved conversation keeps its own source.
    const labels = serve(dir, "labels", []);
    expect(labels.inspect(id)?.source).toBe("parse");
    expect(labels.inspect(id)?.plain).toEqual({});
  });
});

describe("the coordinator review of a conversation", () => {
  const PLAIN = { L19: { state: "shown" as const, text: "Is pregnant.", attempt: 1 as const } };

  function serve(dir: string, script: ScriptedResponse[], finished: FinishedConversation[] = []) {
    const transport = new MemoryTransport();
    const svc = new ConversationService({
      studies: SERVED.map((s) => ({ ...s, plain: PLAIN })),
      source: "labels",
      agent: fixedAgent(new FakeModelAdapter(script)),
      transport,
      store: new ConversationStore(dir),
      now: () => new Date("2000-01-23T15:00:00Z"),
      finished,
    });
    return { svc, transport };
  }

  async function finish(svc: ConversationService, transport: MemoryTransport): Promise<string> {
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    for (const text of REPLIES) {
      transport.send(id, text);
      await svc.settled(id);
    }
    return id;
  }

  it("is refused for an unknown id and for a conversation still going", async () => {
    const { svc } = serve(tempDir(), SCRIPT);
    expect(svc.review("NCT04316364-20260101T000000")).toEqual({ kind: "unknown" });
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    expect(svc.review(id)).toEqual({ kind: "not-finished" });
  });

  it("returns the result exactly as the session produced it, with its criteria and renderings", async () => {
    const { svc, transport } = serve(tempDir(), SCRIPT);
    const id = await finish(svc, transport);
    const found = svc.review(id);
    expect(found.kind).toBe("ok");
    if (found.kind !== "ok") {
      return;
    }
    expect(Object.keys(found.review).sort()).toEqual(
      ["criteria", "id", "origin", "plain", "result", "source"].sort(),
    );
    expect(found.review).toMatchObject({ id, origin: "conversation", source: "labels" });
    expect(found.review.criteria).toEqual(CRITERIA);
    expect(found.review.plain).toEqual(PLAIN);
    expect(comparable(found.review.result)).toEqual(comparable((await direct()).result));
  });

  it("refuses a finished conversation saved without its result, rather than rebuild one", async () => {
    const dir = tempDir();
    const { svc, transport } = serve(dir, SCRIPT);
    const id = await finish(svc, transport);
    const file = saved(dir, id);
    delete file.result;
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(file));

    const { svc: restarted } = serve(dir, []);
    expect(restarted.review(id)).toEqual({ kind: "no-result" });
  });

  it("serves a finished conversation from elsewhere for review only, and never saves it", async () => {
    const dir = tempDir();
    const { result } = await direct();
    const finished: FinishedConversation = {
      id: "eval NCT04316364-v1-labels",
      source: "labels",
      criteria: CRITERIA,
      result,
      plain: PLAIN,
    };
    const { svc } = serve(dir, [], [finished]);

    expect(svc.review(finished.id)).toEqual({
      kind: "ok",
      review: { ...finished, origin: "eval-run" },
    });
    expect(svc.inspect(finished.id)).toBeUndefined();
    expect(svc.state(finished.id)).toBeUndefined();
    expect(svc.has(finished.id)).toBe(false);
    expect(svc.list()).toEqual([
      {
        id: finished.id,
        nctId: "NCT04316364",
        title: result.study.briefTitle,
        source: "labels",
        origin: "eval-run",
        turns: result.transcript.length,
        done: true,
        updatedAt: result.run.timestamp,
      },
    ]);
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });
});

describe("deleting a conversation (slice 0014)", () => {
  it("removes it from memory, disk and the channel, once no turn is in flight", async () => {
    const dir = tempDir();
    const { svc, transport } = service(dir, SCRIPT);
    const id = svc.start("NCT04316364");
    expect(svc.remove(id)).toEqual({ kind: "busy" });
    await svc.settled(id);

    expect(svc.remove(id)).toEqual({ kind: "removed" });
    expect(existsSync(join(dir, `${id}.json`))).toBe(false);
    expect(svc.list().map((c) => c.id)).not.toContain(id);
    expect(transport.view(id)).toBeUndefined();
    expect(svc.remove(id)).toEqual({ kind: "unknown" });
    // A restart over the same directory doesn't bring it back.
    expect(service(dir, []).svc.list()).toEqual([]);
  });
});
