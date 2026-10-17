import { readdirSync } from "node:fs";

/**
 * The file a new run is written to: the next number in its folder, then the
 * prompt version, `03-e1e694b399d4.json`. Runs are numbered in the order they
 * were made, not named by when, so a committed result carries no day or time.
 * Chosen once when the run starts; every rewrite of a run in progress goes to
 * the same file.
 */
export function nextRunFile(dir: string, promptVersion: string): string {
  let last = 0;
  for (const name of readdirSync(dir)) {
    const n = /^(\d+)-[0-9a-f]+\.json$/.exec(name)?.[1];
    if (n !== undefined) last = Math.max(last, Number(n));
  }
  return `${String(last + 1).padStart(2, "0")}-${promptVersion}.json`;
}
