import type { ChannelStatus } from "./types.js";

/**
 * The short-message rules (spec §4.3), as one function the transports share.
 *
 * 1,600 characters is ten SMS segments. It also bounds the read prompt, and so
 * the time a turn takes. The agent's own messages are not capped: 0004 counts
 * turns over 320 characters as a discipline metric, and truncating them here
 * would change the agent this slice promises not to change.
 */
export const MAX_MESSAGE_CHARS = 1600;

export type Refusal =
  | { code: 400; reason: "empty" }
  | { code: 400; reason: "too-long" }
  | { code: 404; reason: "unknown-conversation" }
  /**
   * The agent is still on the last message. Refused rather than queued: a
   * message written before the next question would be read as its answer,
   * which the person never saw, and that is exactly what 0004's evidence check
   * exists to prevent.
   */
  | { code: 409; reason: "working" }
  | { code: 409; reason: "done" }
  /**
   * A message before the agent has said anything. After a failed opening
   * there is no question to answer; only "try again" makes sense.
   */
  | { code: 409; reason: "not-started" }
  /** "Try again" when nothing failed. */
  | { code: 409; reason: "nothing-to-retry" };

export type InboundCheck = { ok: true; text: string } | ({ ok: false } & Refusal);

/** Checks a participant message against the rules, given where the conversation stands. */
export function checkInbound(text: string, status: ChannelStatus | undefined): InboundCheck {
  if (status === undefined) {
    return { ok: false, code: 404, reason: "unknown-conversation" };
  }
  if (status === "working") {
    return { ok: false, code: 409, reason: "working" };
  }
  if (status === "done") {
    return { ok: false, code: 409, reason: "done" };
  }
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, code: 400, reason: "empty" };
  }
  if (trimmed.length > MAX_MESSAGE_CHARS) {
    return { ok: false, code: 400, reason: "too-long" };
  }
  return { ok: true, text: trimmed };
}

/** Whether the last participant message is waiting to be sent again. */
export function isUnprocessed(status: ChannelStatus): boolean {
  return status === "unavailable" || status === "failed";
}
