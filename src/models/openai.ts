import type { FrontierChatOptions } from "./frontier-chat.js";
import { FrontierChatAdapter } from "./frontier-chat.js";

/**
 * OpenAI, through Chat Completions.
 *
 * One of three files under `src/` allowed to address a host off this machine;
 * `tests/boundary.test.ts` admits `api.openai.com` here and nowhere else.
 *
 * OpenAI recommends its Responses API for new work, but documents Chat
 * Completions as supported for gpt-6-luna. Chat Completions keeps one request
 * shape across oMLX, OpenAI and xAI. If it goes, the change is confined here.
 */
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAIAdapter extends FrontierChatAdapter {
  constructor(options: FrontierChatOptions) {
    super("openai", "OpenAI", OPENAI_CHAT_URL, options);
  }
}
