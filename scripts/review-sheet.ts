/**
 * Writes the answer sheet for 0007's blind reading (spec §9).
 *
 *   npm run review:sheet            work/0007-coordinator-review-pane/reading.md
 *   npm run review:sheet -- --force overwrite an existing sheet
 *
 * The sheet names ten eval-run conversations, v1 and v3 of each labelled
 * study, in a fixed shuffled order, and lists the rows to answer in each: every
 * settled row, in the order the review shows them. Chart-review rows are left
 * out: 211 of them in this set, 21 graded and none known wrong, so they would
 * double the reading without measuring anything (plan, change table). It shows a row's id and nothing else: no finding, no
 * expectation, no grade. The reader brings the page; the sheet only records.
 *
 * Deterministic, and no model. `npm run review:score` reads the filled sheet.
 */

import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FinishedConversation } from "../src/server/index.js";
import { reviewHash } from "../src/web/logic.js";
import { reviewModel } from "../src/web/review.js";
import { loadReadingRun } from "./app/eval-run.js";
import { LEAST_SEEN } from "./lib/least-seen.js";

export const SHEET_PATH = fileURLToPath(
  new URL("../work/0007-coordinator-review-pane/reading.md", import.meta.url),
);

/** The order the reader meets the conversations in. The pinned seed, not a new one. */
export const READING_SEED = 20260921;

/** Where `npm run app` serves the page. */
const PAGE = "http://127.0.0.1:5005/";

/**
 * v1 and v3 of each labelled study, from labels. v2 is held back: two of the
 * five were read at 0004's Gate 2, and the other three are the reserve for a
 * second reading (spec §9.2, §9.5).
 */
export function readingSet(run: readonly FinishedConversation[]): FinishedConversation[] {
  return run.filter((c) => c.source === "labels" && /-v[13]-labels$/.test(c.id));
}

/**
 * The v2 conversations nobody read in the review: the second reading's
 * material, and since 0009 the least-seen subset it reports apart.
 */
export function reserveSet(run: readonly FinishedConversation[]): FinishedConversation[] {
  const ids = LEAST_SEEN.map((id) => `eval ${id}-labels`);
  return run.filter((c) => ids.includes(c.id));
}

/** Fisher–Yates with a small seeded generator (mulberry32), so the order is fixed. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The rows a reader answers: the settled group, in the order the review shows it. */
export function rowsToAnswer(conversation: FinishedConversation): string[] {
  const model = reviewModel({ ...conversation, origin: "eval-run" });
  return model.frame.groups.find((g) => g.key === "settled")?.rows ?? [];
}

export function sheetText(conversations: readonly FinishedConversation[]): string {
  const parts = [
    "# reading: 0007 coordinator review, Gate 2",
    "",
    "Written by `npm run review:sheet`. Fill it in by hand; `npm run review:score` reads it.",
    "",
    "## Before you start",
    "",
    "- Run `npm run app -- --fake` and open each review by its link below, in this order. The fake mode is fine: these conversations were made by the real model and need none to show.",
    "- **Open nothing else.** Not other eval-run conversations, not `evals/`, not the vignettes, not 0004's results. If you did, say so at the end; it's reported.",
    "- For each conversation, write the clock time when you open it and when you finish (`14:05`).",
    "",
    "## The question",
    "",
    "For each row listed, find it on the page (the id is on the left of each row) and answer:",
    "",
    "> Does what the participant said, as shown on this page, say what this row says about this criterion?",
    "",
    "- `answer:` **yes**, **no**, or **can't tell**.",
    "- `where:` only after a **no**: **row** if the words in the row show it, **transcript** if you found it elsewhere in the conversation.",
    "- **can't tell** is the right answer when judging would take medical knowledge. It is reported on its own and is not a miss.",
    "",
    "Only rows under *Settled from the participant's words* are listed. You can read the rest of the page as you like.",
    "",
  ];
  conversations.forEach((c, i) => {
    parts.push(`## ${i + 1}. ${c.id}`, "");
    parts.push(`Review: ${PAGE}${reviewHash(c.id)}`, "");
    parts.push("Started: ", "Finished: ", "");
    for (const id of rowsToAnswer(c)) {
      parts.push(`- ${id} · answer: · where:`);
    }
    parts.push("");
  });
  parts.push("## At the end", "", "Did you open anything the instructions said not to? ", "");
  parts.push("Anything the page didn't show that you needed? ", "");
  return parts.join("\n");
}

function main(): void {
  const force = process.argv.includes("--force");
  if (existsSync(SHEET_PATH) && !force) {
    console.error(
      `${SHEET_PATH} exists. A filled sheet is the reading; pass --force to replace it.`,
    );
    process.exitCode = 1;
    return;
  }
  const set = shuffled(readingSet(loadReadingRun()), READING_SEED);
  writeFileSync(SHEET_PATH, sheetText(set));
  const rows = set.reduce((n, c) => n + rowsToAnswer(c).length, 0);
  console.log(`Wrote ${SHEET_PATH}: ${set.length} conversations, ${rows} rows to answer.`);
}

if (import.meta.main) {
  main();
}
