import type { AskContext, ReadContext } from "./prompts.js";
import type { ScreeningCriterion } from "./types.js";

/**
 * A made-up criterion and reply for checking that a model adapter works end
 * to end: the real agent's `ask` and `read`, on nothing anyone said. Used by
 * `npm run models:smoke` (slice 0008) and by the app's connection test in
 * Settings (slice 0017), so both check the same thing.
 */

const CRITERION: ScreeningCriterion = {
  id: "L1",
  polarity: "inclusion",
  type: "patient",
  text: "Age 18 years or older",
};

export const CHECK_ASK_CONTEXT: AskContext = {
  study: { nctId: "NCT00000000", briefTitle: "A made-up study for checking a model adapter" },
  transcript: [],
  criterion: CRITERION,
  kind: "patient",
};

export const CHECK_READ_CONTEXT: ReadContext = {
  transcript: [
    { index: 0, speaker: "agent", kind: "question", text: "How old are you?", criterionId: "L1" },
    { index: 1, speaker: "participant", kind: "reply", text: "I'm 54." },
  ],
  message: "I'm 54.",
  askedAbout: "L1",
  open: [CRITERION],
  answered: [],
};
