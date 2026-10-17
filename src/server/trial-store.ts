import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ParsedCriteria } from "../criteria/types.js";
import { NCT_ID } from "../trials/reference.js";
import type { Trial } from "../trials/types.js";
import type { TrialState } from "./types.js";

/**
 * Trials added by link on the Trials screen (slice 0013), one file each,
 * written like `ConversationStore`'s: to a temporary file, then renamed.
 *
 * The directory is `added-trials/` by default, gitignored like `chats/`.
 * What's in it came from the public registry and the local model, never from
 * a participant.
 */

export interface AddedTrialRecord {
  version: 1;
  nctId: string;
  state: TrialState;
  /** Null until the first fetch succeeds. */
  trial: Trial | null;
  /** The parse being served, if any. */
  parsed: ParsedCriteria | null;
  /** Why the last add or refresh failed. */
  problem: string | null;
  addedAt: string;
  updatedAt: string;
}

export const RESTARTED_JOB = "The app restarted before this finished. Refresh to try again.";

export class TrialStore {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  /**
   * Every saved trial. A record left mid-job by a restart comes back failed,
   * keeping any parse it already had. Unreadable files are skipped.
   */
  list(): AddedTrialRecord[] {
    if (!existsSync(this.#dir)) {
      return [];
    }
    return readdirSync(this.#dir).flatMap((name) => {
      const nctId = name.replace(/\.json$/, "");
      if (!name.endsWith(".json") || !NCT_ID.test(nctId)) {
        return [];
      }
      try {
        const record = JSON.parse(readFileSync(join(this.#dir, name), "utf8")) as AddedTrialRecord;
        if (record.version !== 1 || record.nctId !== nctId) {
          return [];
        }
        return record.state === "fetching" || record.state === "parsing"
          ? [{ ...record, state: "failed" as const, problem: RESTARTED_JOB }]
          : [record];
      } catch {
        return [];
      }
    });
  }

  save(record: AddedTrialRecord): void {
    const path = this.#path(record.nctId);
    mkdirSync(this.#dir, { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  }

  remove(nctId: string): void {
    rmSync(this.#path(nctId), { force: true });
  }

  /** Checked before any path is built, so no id can name a file outside the directory. */
  #path(nctId: string): string {
    if (!NCT_ID.test(nctId)) {
      throw new Error(`not an NCT ID: ${JSON.stringify(nctId)}`);
    }
    return join(this.#dir, `${nctId}.json`);
  }
}
