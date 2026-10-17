import { checkInbound, type InboundCheck, isUnprocessed, type Refusal } from "./rules.js";
import type { ChannelMessage, ChannelStatus, InboundMessage, MessageTransport } from "./types.js";

/** One message as the participant's side shows it. */
export interface LedgerMessage extends ChannelMessage {
  /** Position on the channel, from 0. Stable for the life of the message. */
  seq: number;
  /** On a participant message: whether the agent has taken it. */
  state?: "processed" | "pending" | "unprocessed";
}

export interface ChannelView {
  messages: LedgerMessage[];
  status: ChannelStatus;
  detail?: string;
}

interface Channel {
  messages: LedgerMessage[];
  status: ChannelStatus;
  detail: string | undefined;
  nextSeq: number;
}

/**
 * The bookkeeping every transport shares: what each conversation holds, where
 * it stands, and the rules a message must pass to be accepted. The memory and
 * web transports differ only in how a message arrives and how the view leaves.
 */
export class ChannelLedger implements MessageTransport {
  readonly #channels = new Map<string, Channel>();
  #handler: ((message: InboundMessage) => void) | undefined;
  #retryHandler: ((conversationId: string) => void) | undefined;

  onMessage(handler: (message: InboundMessage) => void): void {
    this.#handler = handler;
  }

  onRetry(handler: (conversationId: string) => void): void {
    this.#retryHandler = handler;
  }

  open(
    conversationId: string,
    history: readonly ChannelMessage[],
    status: ChannelStatus,
    detail?: string,
  ): void {
    const channel: Channel = { messages: [], status, detail, nextSeq: 0 };
    for (const m of history) {
      channel.messages.push({
        seq: channel.nextSeq++,
        ...m,
        ...(m.from === "participant" ? { state: "processed" as const } : {}),
      });
    }
    this.#channels.set(conversationId, channel);
    this.#markLast(channel);
  }

  deliver(conversationId: string, text: string): void {
    const channel = this.#require(conversationId);
    const answered = this.#lastParticipant(channel);
    if (answered !== undefined) {
      answered.state = "processed";
    }
    channel.messages.push({ seq: channel.nextSeq++, from: "agent", text });
  }

  close(conversationId: string): void {
    this.#channels.delete(conversationId);
  }

  setStatus(conversationId: string, status: ChannelStatus, detail?: string): void {
    const channel = this.#require(conversationId);
    channel.status = status;
    channel.detail = detail;
    this.#markLast(channel);
  }

  /**
   * Offers a participant message. Accepted, it is recorded, the conversation
   * becomes `working`, and the message is handed to the handler; refused,
   * nothing changes. Setting `working` here, before the handler runs, is what
   * makes a second message refused however quickly it follows. A message sent
   * after a failure replaces the one that was not processed, so the channel
   * never shows both.
   */
  accept(conversationId: string, text: string): InboundCheck {
    const channel = this.#channels.get(conversationId);
    const check = checkInbound(text, channel?.status);
    if (!check.ok || channel === undefined) {
      return check;
    }
    // The opening failed: there is no question to answer, only one to retry.
    if (isUnprocessed(channel.status) && !channel.messages.some((m) => m.from === "agent")) {
      return { ok: false, code: 409, reason: "not-started" };
    }
    const last = channel.messages.at(-1);
    if (isUnprocessed(channel.status) && last?.from === "participant") {
      channel.messages.pop();
    }
    channel.messages.push({
      seq: channel.nextSeq++,
      from: "participant",
      text: check.text,
      state: "pending",
    });
    channel.status = "working";
    channel.detail = undefined;
    this.#handler?.({ conversationId, text: check.text });
    return check;
  }

  /**
   * "Try again" after a failure. With text, the text is offered as a new
   * message and replaces the unprocessed one. Without, the conversation goes
   * back to `working` and the service takes whatever failed again: the last
   * message, or the opening if there was none.
   */
  retry(conversationId: string, text?: string): { ok: true } | ({ ok: false } & Refusal) {
    const channel = this.#channels.get(conversationId);
    if (channel === undefined) {
      return { ok: false, code: 404, reason: "unknown-conversation" };
    }
    if (!isUnprocessed(channel.status)) {
      return { ok: false, code: 409, reason: "nothing-to-retry" };
    }
    if (text !== undefined) {
      // After a failed opening there is nothing to replace; accept() refuses it.
      const accepted = this.accept(conversationId, text);
      return accepted.ok ? { ok: true } : accepted;
    }
    channel.status = "working";
    channel.detail = undefined;
    this.#markLast(channel);
    this.#retryHandler?.(conversationId);
    return { ok: true };
  }

  /** The unprocessed message, if the last one was not taken. */
  unprocessed(conversationId: string): string | undefined {
    const channel = this.#channels.get(conversationId);
    const last = channel?.messages.at(-1);
    return channel !== undefined && isUnprocessed(channel.status) && last?.from === "participant"
      ? last.text
      : undefined;
  }

  view(conversationId: string): ChannelView | undefined {
    const channel = this.#channels.get(conversationId);
    if (channel === undefined) {
      return undefined;
    }
    return {
      messages: channel.messages.map((m) => ({ ...m })),
      status: channel.status,
      ...(channel.detail === undefined ? {} : { detail: channel.detail }),
    };
  }

  /**
   * A participant message not yet answered follows the channel's status. Once
   * an agent message follows it, it is processed and stays so.
   */
  #markLast(channel: Channel): void {
    const last = channel.messages.at(-1);
    if (last?.from !== "participant") {
      return;
    }
    last.state =
      channel.status === "working"
        ? "pending"
        : isUnprocessed(channel.status)
          ? "unprocessed"
          : "processed";
  }

  #lastParticipant(channel: Channel): LedgerMessage | undefined {
    const last = channel.messages.at(-1);
    return last?.from === "participant" ? last : undefined;
  }

  #require(conversationId: string): Channel {
    const channel = this.#channels.get(conversationId);
    if (channel === undefined) {
      throw new Error(`no conversation ${conversationId} is open on this transport`);
    }
    return channel;
  }
}
