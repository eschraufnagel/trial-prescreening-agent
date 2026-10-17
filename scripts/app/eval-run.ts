import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ConversationFile,
  conversationKey,
  type ScreeningRun,
} from "../../evals/screening-runner.js";
import { displayFor, loadPlainFile } from "../../src/plain/index.js";
import type { ScreeningCriterion, ScreeningResult } from "../../src/screening/index.js";
import type { CriteriaSource, FinishedConversation } from "../../src/server/index.js";

/**
 * The conversations of the committed eval run `EVAL_RUN` names, for the coordinator review
 * (0007 spec §5). Real results from the pinned model, readable with no model
 * running, from a review file committed beside the run (slice 0010).
 *
 * Only the result, the criteria and their renderings are passed on. The
 * vignette, the simulated participant's memory and replies, the timing and
 * every grade stay here: the review is blind to them, as a real handoff is,
 * and the reading gate depends on it.
 */

const SCREENING_DIR = fileURLToPath(new URL("../../evals/results/screening", import.meta.url));

/**
 * Where each served or scored run's review file is committed (slice 0010).
 * The conversation cache beside it is gitignored; this is what the review
 * reads, so the page and `npm test` work from a fresh clone.
 */
export const REVIEW_DIR = join(SCREENING_DIR, "review");

/** The run the page's review serves and the README's screening numbers come from. A new run changes this, visibly. */
export const EVAL_RUN = "02-2c46ada9a1d5.json";

/**
 * The run 0007's blind reading was made against. `review:sheet` and
 * `review:score` use this one, never `EVAL_RUN`, so the reading keeps being
 * scored against the conversations its reader saw after `EVAL_RUN` moves on.
 */
export const READING_RUN = "01-c5778afe9cbd.json";

/** The conversations of `READING_RUN`, the run 0007's reading was made against. */
export function loadReadingRun(dir = SCREENING_DIR): FinishedConversation[] {
  return loadEvalRun(dir, READING_RUN);
}

/**
 * Every conversation the run graded, in the run file's order, from the run's
 * committed review file (0010 spec §3.3). Nothing under the gitignored
 * conversation cache is read, so this works from a fresh clone.
 *
 * Throws if the review file is missing, or doesn't match the run file it
 * names: another run, or another prompt.
 */
export function loadEvalRun(dir = SCREENING_DIR, runFile = EVAL_RUN): FinishedConversation[] {
  const run = JSON.parse(readFileSync(join(dir, runFile), "utf8")) as ScreeningRun;
  const path = join(dir, "review", runFile);
  if (!existsSync(path)) {
    throw new Error(`${path} is missing: make it with npm run review:export -- ${runFile}`);
  }
  const review = JSON.parse(readFileSync(path, "utf8")) as ReviewFile;
  if (review.runFile !== runFile) {
    throw new Error(`${path} is the review of ${review.runFile}, not ${runFile}`);
  }
  if (review.promptVersion !== run.promptVersion) {
    throw new Error(
      `${path} was exported with prompt ${review.promptVersion}, but ${runFile} says ${run.promptVersion}`,
    );
  }
  return review.conversations.map((c) => ({
    id: c.id,
    source: c.source,
    criteria: c.criteria,
    result: c.result,
    plain: c.source === "labels" ? displayFor(c.criteria, loadPlainFile(c.nctId)) : {},
  }));
}

/** One conversation as the review reads it: what `loadEvalRun` passes on, less the renderings. */
export interface ReviewConversation {
  id: string;
  nctId: string;
  source: CriteriaSource;
  criteria: ScreeningCriterion[];
  result: ScreeningResult;
}

/**
 * What the review reads for one run, committed under `review/` (0010 spec
 * §3.1). Renderings are left out: they are rebuilt from `data/plain/` at load,
 * so a rendering fix needs no re-export.
 */
export interface ReviewFile {
  runFile: string;
  promptVersion: string;
  conversations: ReviewConversation[];
}

/**
 * The review file for a run, from the conversation cache (0010 spec §3.2).
 *
 * Files are found by the prompt and simulator versions the run recorded, not
 * this code's, so a run stays exportable after the agent changes (slice 0009).
 * Throws on a file that is missing, unfinished, or made with a different
 * prompt than its run says. Nothing from the vignette, the simulated
 * participant, the timing or the grades is copied.
 */
export function exportReview(dir: string, runFile: string): ReviewFile {
  const run = JSON.parse(readFileSync(join(dir, runFile), "utf8")) as ScreeningRun;
  const versions = { prompt: run.promptVersion, simulator: run.simulatorVersion };
  // Conversations from parses carry the parse's identity in their key when the
  // run recorded one (slice 0011). Runs before it recorded none.
  const versionsFor = (source: CriteriaSource) =>
    source === "parse" && run.parseIdentity !== undefined
      ? { ...versions, parse: run.parseIdentity }
      : versions;
  const descriptor = {
    model: run.model,
    quantization: run.quantization,
    temperature: run.temperature,
    seed: run.seed,
    adapter: run.adapter,
    ...(run.thinking === undefined ? {} : { thinking: run.thinking }),
  };

  const conversations = run.conversations.map((outcome): ReviewConversation => {
    const path = join(
      dir,
      "conversations",
      conversationKey(
        outcome.vignetteId,
        outcome.source,
        descriptor,
        {},
        versionsFor(outcome.source),
      ),
    );
    if (!existsSync(path)) {
      throw new Error(
        `${runFile} lists ${outcome.vignetteId} (${outcome.source}), but ${path} is missing`,
      );
    }
    const file = JSON.parse(readFileSync(path, "utf8")) as ConversationFile;
    if (file.state === null || file.result === undefined) {
      throw new Error(`${path} has no finished result`);
    }
    if (file.result.run.promptVersion !== run.promptVersion) {
      throw new Error(
        `${path} was made with prompt ${file.result.run.promptVersion}, ` +
          `but ${runFile} says ${run.promptVersion}`,
      );
    }
    return {
      id: `eval ${outcome.vignetteId}-${outcome.source}`,
      nctId: outcome.nctId,
      source: outcome.source,
      criteria: file.state.criteria,
      result: file.result,
    };
  });
  return { runFile, promptVersion: run.promptVersion, conversations };
}

/** A review file as committed: two-space JSON with a final newline, as the run files are. */
export function reviewText(file: ReviewFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
