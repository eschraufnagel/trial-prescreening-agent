/**
 * How messages reach the participant and come back, as the conversation layer
 * sees it: not at all (CLAUDE.md, "Transport").
 *
 * The conversation service holds a `MessageTransport` and nothing more
 * specific. Whether the participant is a browser tab, a test, or one day
 * something else, is decided in `src/transport/` and nowhere else. The
 * short-message rules in `rules.ts` are enforced here too, so the service and
 * `ScreeningSession` never see a message that breaks them.
 */

/** A participant message, as the transport accepted it. */
export interface InboundMessage {
  conversationId: string;
  text: string;
}

/** Where a conversation stands, from the participant's side. */
export type ChannelStatus =
  /** Waiting for the participant. */
  | "idle"
  /** A message was accepted, or the conversation is opening; the agent is on it. */
  | "working"
  /** The last message was not processed because the model could not be reached. */
  | "unavailable"
  /** The last message was not processed, for any other reason. */
  | "failed"
  /** The closing message has been sent. */
  | "done";

/** One message on the channel, either direction. */
export interface ChannelMessage {
  from: "agent" | "participant";
  text: string;
}

export interface MessageTransport {
  /**
   * Registers the one handler for inbound messages. Called synchronously when a
   * message is accepted, and never while the conversation's status is
   * `working`, so a handler that sets `working` first cannot be re-entered.
   */
  onMessage(handler: (message: InboundMessage) => void): void;
  /**
   * Registers the handler for "try again" after a failure, with no new text:
   * the participant asks for the unprocessed message, or the opening, to be
   * taken again. Called only when the status is `unavailable` or `failed`,
   * after the status has become `working`.
   */
  onRetry(handler: (conversationId: string) => void): void;
  /** Opens a conversation on the channel, with whatever it already holds. */
  open(
    conversationId: string,
    history: readonly ChannelMessage[],
    status: ChannelStatus,
    detail?: string,
  ): void;
  /** Delivers an agent message to the participant. */
  deliver(conversationId: string, text: string): void;
  /** Tells the participant's side what the agent is doing. */
  setStatus(conversationId: string, status: ChannelStatus, detail?: string): void;
  /**
   * Forgets a conversation: its messages and status leave the channel (slice
   * 0014, a screening deleted by the coordinator). Unknown ids are ignored.
   */
  close(conversationId: string): void;
}
