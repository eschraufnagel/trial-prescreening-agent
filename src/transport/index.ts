/**
 * Public surface of the transport module: the only place that knows how
 * messages reach a participant (CLAUDE.md, "Transport").
 */
export {
  ChannelLedger,
  type ChannelView,
  type LedgerMessage,
} from "./ledger.js";
export { MemoryTransport } from "./memory.js";
export {
  checkInbound,
  type InboundCheck,
  isUnprocessed,
  MAX_MESSAGE_CHARS,
  type Refusal,
} from "./rules.js";
export type {
  ChannelMessage,
  ChannelStatus,
  InboundMessage,
  MessageTransport,
} from "./types.js";
export { WebTransport } from "./web/transport.js";
