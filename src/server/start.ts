import Fastify from "fastify";
import { type AppOptions, configureApp } from "./app.js";

/**
 * The one place under `src/` that listens on a socket, and it listens on this
 * machine only. The host is a constant, not an option: there is no setting
 * that would put this server on a network (spec §8.1, §9.1).
 */
export const LOOPBACK_HOST = "127.0.0.1";

export type StartOptions = AppOptions;

export async function startServer(
  options: StartOptions,
): Promise<{ url: string; close: () => Promise<void> }> {
  // Fastify's request log records method, URL and status, never a body, so a
  // participant's words never reach the log (spec §6.3). At "warn" it records
  // only problems in any case.
  const app = Fastify({ logger: { level: "warn" } });
  configureApp(app, options);
  await app.listen({ host: LOOPBACK_HOST, port: options.port });
  return { url: `http://${LOOPBACK_HOST}:${options.port}`, close: () => app.close() };
}
