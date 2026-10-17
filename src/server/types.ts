import type { CriterionType } from "../criteria/types.js";
import type { PlainDisplay } from "../plain/types.js";
import type {
  Progress,
  ScreeningCriterion,
  ScreeningResult,
  StudyContext,
} from "../screening/index.js";

/**
 * What the server is given to screen against. It never loads criteria itself:
 * the hand labels live under `evals/`, which `src/` may not import, so the
 * launcher in `scripts/` loads them and passes them in (spec D3).
 */
export interface ServedStudy {
  study: StudyContext;
  criteria: ScreeningCriterion[];
  /**
   * What to show under each criterion's protocol words, by criterion id
   * (slice 0006). Display only: it is never given to the agent, which asks and
   * reads from `criteria` alone.
   */
  plain?: Record<string, PlainDisplay>;
  /** Where this study's criteria came from. Absent: the app's source. */
  source?: CriteriaSource;
  /** Pinned in the corpus, or added by link on the Trials screen (slice 0013). Absent: pinned. */
  origin?: StudyOrigin;
  /** The registry's conditions, for the Trials screen. Display only: never given to the agent. */
  conditions?: string[];
  /** The eligibility text as published, for a trial's checklist page (slice 0014). Display only. */
  criteriaText?: string;
}

/** Which of 0004's two inputs the criteria came from. */
export type CriteriaSource = "labels" | "parse";

export type StudyOrigin = "pinned" | "added";

/** Where an added trial is: fetching, parsing, ready, or failed with a reason. */
export type TrialState = "fetching" | "parsing" | "ready" | "failed";

/** One row of the Trials screen (slice 0013). A pinned row is always ready. */
export interface TrialRow {
  nctId: string;
  origin: StudyOrigin;
  briefTitle: string | null;
  conditions: string[];
  state: TrialState;
  criteria: number | null;
  /**
   * What the parse left out (slice 0013's gate): criteria whose quote wasn't
   * found in the protocol text, and passages no criterion claimed. Null for a
   * pinned row or one with no parse yet.
   */
  dropped: { rejected: number; unclaimed: number } | null;
  problem: string | null;
  /** When the row entered its state (ISO), so the screen can show how long a job has run. Null for a pinned row. */
  since: string | null;
  /** How many criteria of each type, for "who can settle them" (slice 0014). Null with no parse yet. */
  byType: Record<CriterionType, number> | null;
  /**
   * Which model read its rules (slice 0017): `adapter` is "omlx", "fake" or a
   * hosted provider, and `hosted` names a hosted one for the card. Null for a
   * pinned row or no parse.
   */
  readBy: { adapter: string; model: string; hosted: string | null } | null;
}

/** A trial's checklist page (slice 0014): its row, the criteria the agent is given, and the published text. */
export interface TrialDetail {
  row: TrialRow;
  criteria: ScreeningCriterion[];
  /** Plain-language renderings by criterion id, for a labelled example; empty otherwise. */
  plain: Record<string, PlainDisplay>;
  criteriaText: string | null;
}

/**
 * A conversation as the tester panel reads it. Per-criterion progress, in the
 * agent's own vocabulary; nothing combines it into a verdict (spec §6.3).
 */
export interface ConversationInspection {
  id: string;
  study: StudyContext;
  source: CriteriaSource;
  criteria: ScreeningCriterion[];
  /** Plain-language renderings by criterion id; empty for parsed criteria. */
  plain: Record<string, PlainDisplay>;
  progress: Progress[];
  /** The criterion whose question is awaiting a reply, or null. */
  pending: string | null;
  done: boolean;
  calls: number;
  /** What this screening has spent on a hosted model, and its cap (slice 0017). Null when it's free. */
  spent: { usd: number; capUsd: number } | null;
  /** The hosted provider this screening started on, or null for the local model and the scripted agent. */
  hosted: { name: string; model: string } | null;
}

/** Where a reviewable conversation came from. */
export type ConversationOrigin = "conversation" | "eval-run";

/**
 * A finished conversation as the coordinator review reads it (slice 0007).
 * The result exactly as the session produced it, with the criteria it was
 * screened against, since findings carry only ids. Nothing here combines
 * findings into a verdict, and nothing comes from a vignette or a grade.
 */
export interface ConversationReview {
  id: string;
  /** The page or terminal (`chats/`), or 0004's committed eval run. */
  origin: ConversationOrigin;
  source: CriteriaSource;
  /** Every criterion the conversation was screened against, in protocol order. */
  criteria: ScreeningCriterion[];
  /** Plain-language renderings by criterion id; empty for parsed criteria. */
  plain: Record<string, PlainDisplay>;
  result: ScreeningResult;
}

/**
 * A conversation that finished elsewhere and is served for review only: the
 * eval run's, loaded by the launcher (0007 spec §5). The launcher passes on
 * these fields and nothing else, so a vignette, a simulated participant or a
 * grade has nowhere to go.
 */
export interface FinishedConversation {
  /** `eval <vignette>-<source>`. The space keeps it out of `CONVERSATION_ID`. */
  id: string;
  source: CriteriaSource;
  criteria: ScreeningCriterion[];
  result: ScreeningResult;
  plain: Record<string, PlainDisplay>;
}
