import type { FrontierChatOptions } from "./frontier-chat.js";
import { FrontierChatAdapter } from "./frontier-chat.js";

/**
 * xAI, through Chat Completions.
 *
 * One of three files under `src/` allowed to address a host off this machine;
 * `tests/boundary.test.ts` admits `api.x.ai` here and nowhere else.
 *
 * xAI documents Chat Completions as the "stateless, OpenAI-compatible
 * predecessor" of its Responses API: legacy, with no removal date. If it goes,
 * the change is confined here.
 */
export const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";

export class XaiAdapter extends FrontierChatAdapter {
  constructor(options: FrontierChatOptions) {
    super("xai", "xAI", XAI_CHAT_URL, options);
  }
}
