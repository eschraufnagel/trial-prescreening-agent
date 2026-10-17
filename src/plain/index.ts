/**
 * Public surface of the plain-language module.
 *
 * Renderings are display data. Nothing under `src/screening/` may import this
 * module (asserted in `tests/boundary.test.ts`), so the agent asks and reads
 * from the protocol's words whatever is rendered here.
 */

export {
  type CheckResult,
  checkPlain,
  describeProblem,
  type Problem,
  type ProblemCategory,
} from "./check.js";
export {
  type CriterionWords,
  DEFAULT_PLAIN_DIR,
  displayFor,
  loadPlainFile,
  plainPath,
  textSha,
} from "./load.js";
export {
  buildRetryPrompt,
  buildUserPrompt,
  EXAMPLES,
  PLAIN_PROMPT_VERSION,
  RETRY_TEMPLATE,
  SYSTEM_PROMPT,
} from "./prompt.js";
export { attemptFrom, renderPlain, retryPlain } from "./render.js";
export {
  type Attempt,
  type PlainDisplay,
  PlainError,
  type PlainFile,
  type Rendering,
} from "./types.js";
