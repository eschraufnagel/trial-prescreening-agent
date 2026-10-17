import { ChannelLedger } from "./ledger.js";
import type { InboundCheck } from "./rules.js";

/**
 * A transport with no delivery at all: a test sends a message and reads what
 * came back. It exists so the conversation service can be shown to work
 * without HTTP, which is half of what makes the transport boundary real.
 */
export class MemoryTransport extends ChannelLedger {
  send(conversationId: string, text: string): InboundCheck {
    return this.accept(conversationId, text);
  }

  /** Agent messages delivered so far, in order. */
  delivered(conversationId: string): string[] {
    return (this.view(conversationId)?.messages ?? [])
      .filter((m) => m.from === "agent")
      .map((m) => m.text);
  }
}
