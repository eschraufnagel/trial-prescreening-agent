import type { ModelRunMetadata } from "../models/types.js";

/**
 * Plain-language renderings of criteria, and what the page shows for each.
 *
 * A rendering restates one criterion in plainer words and is shown beside the
 * protocol's own, never instead of it (spec §3). It is display data: the agent
 * never sees one, which `tests/boundary.test.ts` asserts, so nothing here can
 * change what the agent asks or how it reads a reply.
 *
 * Imported by the page, so this file imports types only and nothing from Node.
 */

/** One call's output for one criterion. */
export interface Attempt {
  /** Null when the model's reply held no usable rendering. */
  plain: string | null;
  /**
   * What the check said when this attempt was made, which is what drove a
   * retry. Absent on attempts made before the check existed. Informational
   * only: whether a rendering is shown is decided by the check as it is now.
   */
  reportAtGeneration?: string[];
}

export interface Rendering {
  criterionId: string;
  /** SHA-256 of the exact criterion text it was made from. A mismatch means stale. */
  textSha: string;
  /** The first attempt, and a retry if there was one. Never more than two. */
  attempts: Attempt[];
}

/** `data/plain/<NCT ID>.json`. */
export interface PlainFile {
  nctId: string;
  /** Only labelled criteria are rendered in this slice. */
  source: "labels";
  /** One prompt version per file; `plain:render` refuses to mix them. */
  run: ModelRunMetadata;
  renderings: Rendering[];
}

/** What the page shows under a criterion's protocol words. */
export type PlainDisplay =
  | { state: "shown"; text: string; attempt: 1 | 2 }
  /** No attempt passed the check. The lines say why. */
  | { state: "failed"; problems: string[] }
  /** Made from wording the criterion no longer has. */
  | { state: "stale" }
  | { state: "missing" };

/**
 * A committed renderings file that cannot be used. Same shape as
 * `TrialFixtureError`: a context line plus every problem found.
 */
export class PlainError extends Error {
  readonly problems: readonly string[];

  constructor(context: string, problems: readonly string[]) {
    const detail = problems.map((p) => `  - ${p}`).join("\n");
    super(`${context}:\n${detail}`);
    this.name = "PlainError";
    this.problems = problems;
  }
}
