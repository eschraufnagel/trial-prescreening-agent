import { describe, expect, it } from "vitest";
import { checkInbound, isUnprocessed, MAX_MESSAGE_CHARS } from "../../src/transport/index.js";

describe("checkInbound", () => {
  it("accepts free text, trimmed", () => {
    expect(checkInbound("  I'm 64  ", "idle")).toEqual({ ok: true, text: "I'm 64" });
  });

  it("refuses an empty or whitespace-only message", () => {
    expect(checkInbound("", "idle")).toMatchObject({ ok: false, code: 400, reason: "empty" });
    expect(checkInbound(" \n\t", "idle")).toMatchObject({ ok: false, reason: "empty" });
  });

  it("accepts exactly the cap and refuses one character more", () => {
    expect(checkInbound("x".repeat(MAX_MESSAGE_CHARS), "idle").ok).toBe(true);
    expect(checkInbound("x".repeat(MAX_MESSAGE_CHARS + 1), "idle")).toMatchObject({
      ok: false,
      code: 400,
      reason: "too-long",
    });
  });

  it("refuses a message while the agent is working, rather than queueing it", () => {
    expect(checkInbound("and another thing", "working")).toMatchObject({
      ok: false,
      code: 409,
      reason: "working",
    });
  });

  it("refuses a message after the conversation is done", () => {
    expect(checkInbound("wait", "done")).toMatchObject({ ok: false, code: 409, reason: "done" });
  });

  it("accepts a message after a failure, which is how it is sent again", () => {
    expect(checkInbound("again", "unavailable").ok).toBe(true);
    expect(checkInbound("again", "failed").ok).toBe(true);
  });

  it("refuses a conversation it has never seen", () => {
    expect(checkInbound("hi", undefined)).toMatchObject({ ok: false, code: 404 });
  });

  it("treats only the two failure statuses as unprocessed", () => {
    expect(
      ["idle", "working", "unavailable", "failed", "done"].filter((s) => isUnprocessed(s as never)),
    ).toEqual(["unavailable", "failed"]);
  });
});
