// From the types module directly rather than `src/criteria/index.js`. The
// barrel re-exports `parseCriteria`, and although a type-only import is erased
// at runtime, `tests/boundary.test.ts` walks imports statically and cannot know
// that. Depending on a types file from a types file is the honest shape anyway.
import type { CriterionPolarity, CriterionType } from "../../src/criteria/types.js";

/**
 * Hand-authored ground truth for one protocol's eligibility criteria.
 *
 * This is the expensive artifact of slice 0003 and the reason the harness can
 * measure anything at all. Slice 0002 established that the parser's own
 * signals — source coverage, rejection count — do not discriminate: eleven of
 * twelve studies sat at 89-98% coverage with zero rejections, and a parser
 * dropping a third of every block would score the same.
 *
 * Labels are written by reading the protocol, never by editing parser output.
 * A label set seeded from a parse agrees with that parse by construction and
 * every number computed from it is circular. `tests/boundary.test.ts` asserts
 * the labelling tool cannot reach the parser or a model.
 */

export interface LabelSet {
  nctId: string;
  /** ISO date. Which day's reading this represents. */
  labelledAt: string;
  /**
   * SHA-256 of the fixture's `criteriaText` at labelling time.
   *
   * Every offset below indexes that exact string. A refetch that revises the
   * protocol shifts them all, and the failure would otherwise be silent — each
   * label would still point somewhere, just at the wrong words. Checked on
   * load, and by a test over every committed label set.
   */
  criteriaTextSha: string;
  /**
   * Who wrote these labels and what they had seen when writing them.
   *
   * Recorded per study because it varies and it bounds what the numbers mean.
   * `sawParse` is the one that matters: for two of the five studies the
   * drafter had already read the parser's output earlier in the project, so
   * those labels are anchored to the parser's answers in a way the others are
   * not. Left implicit, that difference would be invisible to anyone reading
   * a result file later.
   */
  provenance?: LabelProvenance;
  criteria: LabelledCriterion[];
  /**
   * Passages a reader saw and decided are not criteria, each with a reason.
   *
   * The load-bearing half of this format. Without it, source a parse did not
   * claim is ambiguous between "missed a requirement" and "correctly ignored
   * narrative" — the ambiguity that made 0002's coverage figure useless.
   * NCT04385368 is 46% unclaimed and is both things at once: ICF signing
   * windows and imaging recommendations correctly skipped, alongside a
   * resectability requirement genuinely dropped.
   *
   * Writing a reason per passage is deliberately the cheaper path than leaving
   * one unexplained, so a passage escapes the criteria list only on purpose.
   */
  notCriteria: NotCriterion[];
}

export interface LabelProvenance {
  /** Who authored the labels. */
  drafter: string;
  /** The conventions applied. */
  guide: string;
  /** Whether the drafter had seen this study's parser output beforehand. */
  sawParse: boolean;
  note?: string;
}

export interface LabelledCriterion {
  /** Stable within the file, e.g. "L1". Referenced by results and diagnostics. */
  id: string;
  /** Verbatim from `criteriaText`. Equals `criteriaText.slice(start, end)`. */
  quote: string;
  start: number;
  /** Exclusive. */
  end: number;
  polarity: CriterionPolarity;
  type: CriterionType;
  /**
   * Optional, for a judgment call worth defending — why this is `protocol`
   * rather than `clinical`, or why a sentence was read as one criterion rather
   * than two. Read by a person disagreeing with the label later.
   */
  note?: string;
}

export interface NotCriterion {
  quote: string;
  start: number;
  end: number;
  /** Why this is not a criterion. Empty in a freshly generated skeleton. */
  why: string;
}

/**
 * Raised when a label set does not have the shape the harness requires.
 *
 * Same shape as `TrialFixtureError` and `ModelError`: a context line plus every
 * problem found, so one run diagnoses the whole file rather than its first
 * fault. A label set is hand-edited JSON and will have several at once.
 */
export class LabelError extends Error {
  readonly problems: readonly string[];

  constructor(context: string, problems: readonly string[]) {
    const detail = problems.map((p) => `  - ${p}`).join("\n");
    super(`${context}:\n${detail}`);
    this.name = "LabelError";
    this.problems = problems;
  }
}

/**
 * A simulated participant for the screening agent, with expected outcomes.
 *
 * Slice 0004's ground truth, as labels are 0003's. A vignette is written
 * against one study's labelled criteria: for every `patient` label, what the
 * person would say and what the agent should conclude from it. Expected
 * outcomes follow from the facts *by construction* — each fact restates or
 * plainly negates the criterion's words — so checking one means reading two
 * sentences side by side, never making a clinical judgment. See
 * `evals/cases/VIGNETTES.md`.
 *
 * Every fact here is invented. None may be adapted from a real case.
 */
export interface Vignette {
  /** `<nctId>-v<N>` for a scored vignette, `<nctId>-dev` for the dev one. */
  id: string;
  nctId: string;
  /**
   * SHA-256 of the label file's bytes when this vignette was written.
   *
   * Facts cite labels by id, and a label edited after the vignette was written
   * could change what a fact is evidence for without anything looking wrong.
   * Same reasoning as `criteriaTextSha` one level down.
   */
  labelSetSha: string;
  behavior: VignetteBehavior;
  /** Texture for the simulator: manner, not medical history. */
  persona: string;
  facts: VignetteFact[];
  provenance: VignetteProvenance;
  /**
   * True for the dev vignette, which is never scored. Prompts are iterated
   * against it so that tuning cannot leak into the headline. Set by the loader
   * from where the file lives, never written in the file.
   */
  dev: boolean;
}

/** How the participant plays the conversation overall. */
export type VignetteBehavior =
  /** Answers what is asked, plainly. */
  | "cooperative"
  /** Answers loosely: "a while ago", "some treatment". */
  | "vague"
  /** Offers facts before they are asked for. */
  | "volunteers"
  /** Says one thing and later the opposite. */
  | "contradicts"
  /** Declines some questions. */
  | "declines";

/**
 * What the agent should conclude about a `patient` criterion's statement.
 *
 * `defer` marks a criterion whose truth cannot be read off the fact without
 * interpretation. Any abstention is correct for it and any determination is
 * wrong — the grader never invents an answer to grade against.
 */
export type ExpectedOutcome = "holds" | "does-not-hold" | "unresolved" | "defer";

/** What the person is expected to report about a `clinical` criterion. */
export type ExpectedReport = "holds" | "does-not-hold" | "unknown";

export interface VignetteFact {
  /** Label id in the study's label set. */
  label: string;
  /** What the person says, in their own voice. Null when they decline. */
  says: string | null;
  /** A later statement reversing `says`. Makes the expected outcome `unresolved`. */
  laterSays?: string;
  /** The person declines to answer this one. */
  declines?: boolean;
  /** Required on `patient` facts, forbidden on `clinical` ones. */
  expected?: ExpectedOutcome;
  /**
   * Optional on `clinical` facts, forbidden on `patient` ones. Graded only
   * where present, which is only where the fact restates the criterion.
   */
  reported?: ExpectedReport;
}

export interface VignetteProvenance {
  drafter: string;
  guide: string;
  /**
   * Whether the drafter had seen the agent's prompts. False for every vignette
   * in slice 0004, which commits vignettes before the prompts exist.
   */
  sawAgentPrompt: boolean;
  note?: string;
}

/** Raised when a vignette does not have the shape the grader requires. Same shape as `LabelError`. */
export class VignetteError extends Error {
  readonly problems: readonly string[];

  constructor(context: string, problems: readonly string[]) {
    const detail = problems.map((p) => `  - ${p}`).join("\n");
    super(`${context}:\n${detail}`);
    this.name = "VignetteError";
    this.problems = problems;
  }
}
