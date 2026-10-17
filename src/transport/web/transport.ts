import type { FastifyInstance } from "fastify";
import { ChannelLedger } from "../ledger.js";
import { registerMessageRoutes } from "./routes.js";

/**
 * The web half of the transport: the ledger every transport shares, reached
 * over HTTP by `client.ts` in the browser. Constructed only by the server's
 * composition root (spec §9.2); everything else sees a `MessageTransport`.
 */
export class WebTransport extends ChannelLedger {
  /** Adds the three message routes (spec §6.2) to the app. Opens no socket. */
  register(app: FastifyInstance): void {
    registerMessageRoutes(app, this);
  }
}
