/**
 * Public surface of the criteria module.
 *
 * Nothing here calls a model. `parseCriteria` takes a `ModelAdapter` and that
 * is the only route to one, which `tests/boundary.test.ts` asserts by walking
 * this entry point and holding every file outside `src/models/` to the
 * absolute no-network rule.
 */
export { type LocateResult, locateQuote } from "./locate.js";
export {
  NORMALIZE_VERSION,
  type NormalizedText,
  normalize,
  toSourceSpan,
} from "./normalize.js";
export { type ParseOptions, parseCriteria } from "./parse.js";
export {
  buildUserPrompt,
  hashPrompt,
  PROMPT_VERSION,
  parseIdentity,
  SYSTEM_PROMPT,
} from "./prompt.js";
export {
  CriteriaParseError,
  type Criterion,
  type CriterionPolarity,
  type CriterionType,
  isPatientAnswerable,
  type ParsedCriteria,
  type RejectedCriterion,
  type SourceSpan,
} from "./types.js";
export {
  type EnvelopeReadResult,
  type RawCriterion,
  readCriteriaEnvelope,
} from "./validate.js";
