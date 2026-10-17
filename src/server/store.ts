import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ScreeningResult, ScreeningState } from "../screening/index.js";
import type { CriteriaSource } from "./types.js";

/**
 * Conversations on disk, one file each, in the format `npm run screening:chat`
 * already writes to `chats/` (spec §5.4). Sharing it means a browser
 * conversation renders with `screening:show --html` unchanged, and a terminal
 * chat can be continued in the browser.
 *
 * `chats/` is gitignored: what a person types there is never committed.
 */

/** The part of a message the agent has not taken yet, if any. */
export interface PendingMessage {
  text: string;
  status: "working" | "unavailable" | "failed";
  detail?: string;
}

export interface SavedConversation {
  /** "web NCT…" from the page, "chat NCT…" from the terminal. */
  vignetteId: string;
  source: CriteriaSource;
  /** The model it started on (slice 0017). Absent before it, which means the local model. */
  model?: string;
  state: ScreeningState;
  result?: ScreeningResult;
  /** Added in slice 0005. Absent when nothing is waiting. */
  pending?: PendingMessage;
}

/** The id `screening:chat` gives its files: `<nctId>-<yyyymmddThhmmss>`. */
export const CONVERSATION_ID = /^NCT\d{8}-\d{8}T\d{6}$/;

export class ConversationStore {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  /** Every saved conversation, with when it last changed. Unreadable files are skipped. */
  list(): Array<{ id: string; record: SavedConversation; updatedAt: Date }> {
    if (!existsSync(this.#dir)) {
      return [];
    }
    return readdirSync(this.#dir).flatMap((name) => {
      const id = name.replace(/\.json$/, "");
      if (!name.endsWith(".json") || !CONVERSATION_ID.test(id)) {
        return [];
      }
      const path = join(this.#dir, name);
      try {
        const record = JSON.parse(readFileSync(path, "utf8")) as SavedConversation;
        return record.state?.version === 1 ? [{ id, record, updatedAt: statSync(path).mtime }] : [];
      } catch {
        return [];
      }
    });
  }

  /**
   * Writes one conversation. To a temporary file first, then renamed over the
   * old one, so a crash mid-write never leaves a half-written conversation.
   */
  save(id: string, record: SavedConversation): void {
    const path = this.#path(id);
    mkdirSync(this.#dir, { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  }

  /** Deletes one conversation's file (slice 0014). One already gone is fine. */
  remove(id: string): void {
    rmSync(this.#path(id), { force: true });
  }

  /** Checked before any path is built, so no id can name a file outside the directory. */
  #path(id: string): string {
    if (!CONVERSATION_ID.test(id)) {
      throw new Error(`not a conversation id: ${JSON.stringify(id)}`);
    }
    return join(this.#dir, `${id}.json`);
  }
}
