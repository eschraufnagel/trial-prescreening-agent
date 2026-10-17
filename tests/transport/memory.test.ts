import { describe, expect, it } from "vitest";
import { MemoryTransport } from "../../src/transport/index.js";

function opened(): { transport: MemoryTransport; received: string[] } {
  const transport = new MemoryTransport();
  const received: string[] = [];
  transport.onMessage((m) => received.push(m.text));
  transport.open("c1", [], "working");
  transport.deliver("c1", "Hello. How old are you?");
  transport.setStatus("c1", "idle");
  return { transport, received };
}

describe("MemoryTransport", () => {
  it("hands an accepted message to the handler and records it as pending", () => {
    const { transport, received } = opened();

    expect(transport.send("c1", "64").ok).toBe(true);
    expect(received).toEqual(["64"]);
    expect(transport.view("c1")?.messages.at(-1)).toEqual({
      seq: 1,
      from: "participant",
      text: "64",
      state: "pending",
    });
  });

  it("becomes working the moment it accepts, so an immediate second message is refused", () => {
    const transport = new MemoryTransport();
    transport.open("c1", [], "idle");

    expect(transport.send("c1", "64").ok).toBe(true);
    expect(transport.view("c1")?.status).toBe("working");
    expect(transport.send("c1", "and I never smoked")).toMatchObject({ ok: false, code: 409 });
  });

  it("changes nothing when it refuses a message", () => {
    const { transport, received } = opened();
    transport.send("c1", "64");
    transport.setStatus("c1", "working");

    expect(transport.send("c1", "and I never smoked")).toMatchObject({ ok: false, code: 409 });
    expect(received).toEqual(["64"]);
    expect(transport.view("c1")?.messages).toHaveLength(2);
  });

  it("marks the message processed once the agent replies", () => {
    const { transport } = opened();
    transport.send("c1", "64");
    transport.setStatus("c1", "working");
    transport.deliver("c1", "Have you had chemotherapy?");
    transport.setStatus("c1", "idle");

    expect(transport.view("c1")?.messages.map((m) => m.state)).toEqual([
      undefined,
      "processed",
      undefined,
    ]);
    expect(transport.delivered("c1")).toEqual([
      "Hello. How old are you?",
      "Have you had chemotherapy?",
    ]);
  });

  it("marks the message unprocessed after a failure, and replaces it when sent again", () => {
    const { transport, received } = opened();
    transport.send("c1", "64");
    transport.setStatus("c1", "unavailable", "The model isn't responding.");

    expect(transport.unprocessed("c1")).toBe("64");
    expect(transport.view("c1")).toMatchObject({
      status: "unavailable",
      detail: "The model isn't responding.",
    });
    expect(transport.view("c1")?.messages.at(-1)?.state).toBe("unprocessed");

    expect(transport.send("c1", "I'm 64").ok).toBe(true);
    expect(received).toEqual(["64", "I'm 64"]);
    const texts = transport.view("c1")?.messages.map((m) => m.text);
    expect(texts).toEqual(["Hello. How old are you?", "I'm 64"]);
    expect(transport.unprocessed("c1")).toBeUndefined();
  });

  it("keeps sequence numbers increasing, even across a replaced message", () => {
    const { transport } = opened();
    transport.send("c1", "64");
    transport.setStatus("c1", "failed");
    transport.send("c1", "64");

    expect(transport.view("c1")?.messages.map((m) => m.seq)).toEqual([0, 2]);
  });

  it("opens a conversation with its history, the last message unprocessed after a failure", () => {
    const transport = new MemoryTransport();
    transport.open(
      "c2",
      [
        { from: "agent", text: "How old are you?" },
        { from: "participant", text: "64" },
      ],
      "failed",
      "The server restarted before this message was processed.",
    );

    expect(transport.view("c2")?.messages.map((m) => m.state)).toEqual([undefined, "unprocessed"]);
    expect(transport.unprocessed("c2")).toBe("64");
  });

  it("refuses to deliver to a conversation it never opened", () => {
    expect(() => new MemoryTransport().deliver("nope", "hi")).toThrow(/no conversation nope/);
  });

  it("takes a retry without text only after a failure, and signals it", () => {
    const { transport } = opened();
    const retried: string[] = [];
    transport.onRetry((id) => retried.push(id));

    expect(transport.retry("c1")).toMatchObject({ ok: false, code: 409 });
    transport.send("c1", "64");
    transport.setStatus("c1", "unavailable");

    expect(transport.retry("c1")).toEqual({ ok: true });
    expect(retried).toEqual(["c1"]);
    expect(transport.view("c1")?.status).toBe("working");
    expect(transport.view("c1")?.messages.at(-1)).toMatchObject({ text: "64", state: "pending" });
  });

  it("takes a retry with edited text as a new message replacing the old", () => {
    const { transport, received } = opened();
    transport.send("c1", "64");
    transport.setStatus("c1", "failed");

    expect(transport.retry("c1", "I'm 64 years old")).toEqual({ ok: true });
    expect(received).toEqual(["64", "I'm 64 years old"]);
    expect(transport.view("c1")?.messages.map((m) => m.text)).toEqual([
      "Hello. How old are you?",
      "I'm 64 years old",
    ]);
  });

  it("refuses a message before the agent has said anything, even after the opening failed", () => {
    const transport = new MemoryTransport();
    const received: string[] = [];
    const retried: string[] = [];
    transport.onMessage((m) => received.push(m.text));
    transport.onRetry((id) => retried.push(id));
    transport.open("c1", [], "working");
    transport.setStatus("c1", "unavailable");

    expect(transport.send("c1", "hello?")).toMatchObject({
      ok: false,
      code: 409,
      reason: "not-started",
    });
    expect(transport.retry("c1", "hello?")).toMatchObject({
      ok: false,
      code: 409,
      reason: "not-started",
    });
    expect(received).toEqual([]);
    expect(transport.view("c1")?.messages).toEqual([]);

    expect(transport.retry("c1")).toEqual({ ok: true });
    expect(retried).toEqual(["c1"]);
  });
});

describe("closing a conversation (slice 0014)", () => {
  it("forgets it, and ignores one it never had", () => {
    const { transport } = opened();
    transport.close("c1");
    expect(transport.view("c1")).toBeUndefined();
    expect(() => transport.close("nobody")).not.toThrow();
  });
});
