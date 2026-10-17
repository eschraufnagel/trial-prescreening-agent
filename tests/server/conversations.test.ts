import { describe, expect, it } from "vitest";
import type { ScriptedResponse } from "../../src/models/index.js";
import { FakeModelAdapter } from "../../src/models/index.js";
import { ConversationService, MODEL_UNAVAILABLE } from "../../src/server/index.js";
import { fixedAgent } from "../../src/server/models.js";
import { MemoryTransport } from "../../src/transport/index.js";
import {
  askR,
  comparable,
  direct,
  REPLIES,
  readR,
  SCRIPT,
  SERVED,
} from "../fixtures/conversation.js";

/**
 * The conversation service over a memory transport: no HTTP, no socket. What
 * reaches a person through the page is tested in `app.test.ts`; this file is
 * about the service doing exactly what `ScreeningSession` does, and handling
 * the model going away.
 */
const CONNECTION_FAILURE: ScriptedResponse = {
  kind: "error",
  message: "request failed: fetch failed",
};
const MALFORMED: ScriptedResponse = { kind: "raw", raw: '{"nothing": "useful"}' };

function service(script: ScriptedResponse[]) {
  const transport = new MemoryTransport();
  const svc = new ConversationService({
    studies: SERVED,
    source: "labels",
    agent: fixedAgent(new FakeModelAdapter(script)),
    transport,
    now: () => new Date("2000-01-23T15:00:00Z"),
  });
  return { svc, transport };
}

async function send(
  svc: ConversationService,
  transport: MemoryTransport,
  id: string,
  text: string,
): Promise<void> {
  expect(transport.send(id, text).ok).toBe(true);
  await svc.settled(id);
}

describe("the conversation service", () => {
  it("runs the agent exactly as ScreeningSession does (transparency, part 1)", async () => {
    const reference = await direct();
    const { svc, transport } = service(SCRIPT);

    const id = svc.start("NCT04316364");
    await svc.settled(id);
    for (const text of REPLIES) {
      await send(svc, transport, id, text);
    }

    expect(svc.state(id)).toEqual(reference.state);
    expect(comparable(svc.result(id))).toEqual(comparable(reference.result));
    expect(transport.view(id)?.status).toBe("done");
    expect(transport.delivered(id)).toEqual(
      reference.state.transcript
        .filter((t) => t.speaker === "agent" && t.kind !== "opening")
        .map((t, i) => (i === 0 ? `${reference.state.transcript[0]?.text}\n\n${t.text}` : t.text)),
    );
  });

  it("opens in the working state, before the opening has arrived", () => {
    const { svc, transport } = service(SCRIPT);
    const id = svc.start("NCT04316364");

    expect(transport.view(id)).toMatchObject({ status: "working", messages: [] });
  });

  it("names conversations like screening:chat does, and never reuses one", () => {
    const { svc } = service([...SCRIPT, ...SCRIPT]);

    expect(svc.start("NCT04316364")).toBe("NCT04316364-20000123T150000");
    expect(svc.start("NCT04316364")).toBe("NCT04316364-20000123T150001");
  });

  // Slice 0013: a study served after startup, with its own source.
  it("starts a conversation from a study served later, recording that study's source", async () => {
    const { svc, transport } = service(SCRIPT);
    svc.serve({
      ...(SERVED[0] as (typeof SERVED)[number]),
      study: { nctId: "NCT00000001", briefTitle: "Added" },
      source: "parse",
      origin: "added",
    });
    const id = svc.start("NCT00000001");
    await svc.settled(id);
    expect(svc.list().find((c) => c.id === id)?.source).toBe("parse");

    // Unserved, it can't be started again, but the conversation carries on.
    svc.unserve("NCT00000001");
    expect(() => svc.start("NCT00000001")).toThrow(/no study NCT00000001/);
    await send(svc, transport, id, REPLIES[0] as string);
    expect(svc.state(id)?.transcript.length).toBeGreaterThan(2);
  });

  it("refuses a study it was not given", () => {
    const { svc } = service(SCRIPT);
    expect(() => svc.start("NCT99999999")).toThrow(/no study NCT99999999/);
  });

  it("reports the model being unreachable, and leaves the conversation where it was", async () => {
    const { svc, transport } = service([SCRIPT[0] as ScriptedResponse, CONNECTION_FAILURE]);
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    const before = svc.state(id);

    await send(svc, transport, id, "No treatment at all.");

    expect(transport.view(id)).toMatchObject({ status: "unavailable", detail: MODEL_UNAVAILABLE });
    expect(transport.unprocessed(id)).toBe("No treatment at all.");
    expect(svc.state(id)).toEqual(before);
  });

  it("reports a model that answers badly as failed, not as unavailable", async () => {
    // A malformed read is retried once, so it takes two.
    const { svc, transport } = service([SCRIPT[0] as ScriptedResponse, MALFORMED, MALFORMED]);
    const id = svc.start("NCT04316364");
    await svc.settled(id);

    await send(svc, transport, id, "No treatment at all.");

    expect(transport.view(id)?.status).toBe("failed");
    expect(transport.view(id)?.detail).not.toBe(MODEL_UNAVAILABLE);
  });

  it("takes the same message again after a failure, ending as an uninterrupted run would", async () => {
    const reference = await direct();
    const [open, ...rest] = SCRIPT;
    const { svc, transport } = service([open as ScriptedResponse, CONNECTION_FAILURE, ...rest]);
    const id = svc.start("NCT04316364");
    await svc.settled(id);

    await send(svc, transport, id, REPLIES[0] as string);
    expect(transport.retry(id)).toEqual({ ok: true });
    await svc.settled(id);
    await send(svc, transport, id, REPLIES[1] as string);

    expect(svc.state(id)).toEqual(reference.state);
    expect(transport.view(id)?.messages.filter((m) => m.from === "participant")).toHaveLength(2);
  });

  it("takes an edited message in place of the one that failed", async () => {
    const [open, ...rest] = SCRIPT;
    const { svc, transport } = service([open as ScriptedResponse, CONNECTION_FAILURE, ...rest]);
    const id = svc.start("NCT04316364");
    await svc.settled(id);

    await send(svc, transport, id, "No treatment");
    expect(transport.retry(id, "No treatment at all.")).toEqual({ ok: true });
    await svc.settled(id);

    const said = svc.state(id)?.transcript.filter((t) => t.speaker === "participant");
    expect(said?.map((t) => t.text)).toEqual(["No treatment at all."]);
  });

  it("retries the opening when the opening is what failed", async () => {
    const { svc, transport } = service([CONNECTION_FAILURE, ...SCRIPT]);
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    expect(transport.view(id)?.status).toBe("unavailable");

    transport.retry(id);
    await svc.settled(id);

    expect(transport.view(id)?.status).toBe("idle");
    expect(transport.delivered(id)[0]).toMatch(/^Hello[\s\S]*anti-cancer therapy\?$/);
  });

  it("never runs two turns of one conversation at once", async () => {
    const { svc, transport } = service([askR("Q1"), readR([]), askR("Q2")]);
    const id = svc.start("NCT04316364");
    await svc.settled(id);

    expect(transport.send(id, "first").ok).toBe(true);
    // The transport refuses the second, so the service never sees it.
    expect(transport.send(id, "second")).toMatchObject({ ok: false, code: 409 });
    await svc.settled(id);
    expect(svc.state(id)?.transcript.filter((t) => t.speaker === "participant")).toHaveLength(1);
  });

  it("throws rather than fork a session if a second turn ever reached it", async () => {
    // A transport that fails to refuse: calls the handler whatever the status.
    const handlers: Array<(m: { conversationId: string; text: string }) => void> = [];
    const leaky = new MemoryTransport();
    const originalOnMessage = leaky.onMessage.bind(leaky);
    leaky.onMessage = (h) => {
      handlers.push(h);
      originalOnMessage(h);
    };
    const svc = new ConversationService({
      studies: SERVED,
      source: "labels",
      agent: fixedAgent(new FakeModelAdapter(SCRIPT)),
      transport: leaky,
    });
    const id = svc.start("NCT04316364");

    expect(() => handlers[0]?.({ conversationId: id, text: "too soon" })).toThrow(
      /already has a turn in flight/,
    );
    await svc.settled(id);
  });

  it("gives the tester panel progress and nothing that reads as a verdict", async () => {
    const { svc, transport } = service(SCRIPT);
    const id = svc.start("NCT04316364");
    await svc.settled(id);
    await send(svc, transport, id, REPLIES[0] as string);

    const seen = svc.inspect(id);
    expect(seen?.pending).toBe("L2");
    expect(seen?.progress.find((p) => p.criterionId === "L8")?.status).toBe("does-not-hold");
    expect(JSON.stringify(seen)).not.toMatch(/eligib|verdict|disposition|qualif/i);
  });
});
