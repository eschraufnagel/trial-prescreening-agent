import type {
  Finding,
  ScreeningCriterion,
  ScreeningResult,
  Turn,
} from "../../src/screening/index.js";
import type { ConversationReview } from "../../src/server/index.js";

/**
 * A finished conversation built by hand for the coordinator review's tests:
 * every status, every reported value, both polarities, a rejected reading, an
 * ignored one of each kind, a question never answered, and a criterion settled
 * by a reply to a question about something else. Made-up words only.
 */

const c = (
  id: string,
  polarity: ScreeningCriterion["polarity"],
  type: ScreeningCriterion["type"],
): ScreeningCriterion => ({ id, polarity, type, text: `criterion ${id}` });

export const REVIEW_CRITERIA: ScreeningCriterion[] = [
  c("C1", "inclusion", "patient"), // holds
  c("C2", "exclusion", "patient"), // does-not-hold, later ignored reading
  c("C3", "inclusion", "patient"), // does-not-hold, settled by a reply to C4's question
  c("C4", "inclusion", "clinical"), // chart-review, reported holds
  c("C5", "exclusion", "clinical"), // chart-review, reported does-not-hold
  c("C6", "inclusion", "clinical"), // chart-review, reported partial
  c("C7", "exclusion", "clinical"), // chart-review, reported unknown
  c("C8", "exclusion", "patient"), // unresolved, declined, rejected reading
  c("C9", "inclusion", "patient"), // unresolved, no answer: the question had no reply
  c("C10", "inclusion", "protocol"), // not raised, with an ignored not-raisable reading
  c("C11", "exclusion", "definitional"), // not raised
  c("C12", "inclusion", "clinical"), // not raised, a lab value
];

const agent = (index: number, text: string, criterionId?: string): Turn => ({
  index,
  speaker: "agent",
  kind: index === 0 ? "opening" : criterionId === undefined ? "closing" : "question",
  text,
  ...(criterionId === undefined ? {} : { criterionId }),
});
const reply = (index: number, text: string): Turn => ({
  index,
  speaker: "participant",
  kind: "reply",
  text,
});

export const REVIEW_TRANSCRIPT: Turn[] = [
  agent(0, "Hello."),
  agent(1, "How old are you?", "C1"),
  reply(2, "Yes, I am 64 and the paperwork is fine."),
  agent(3, "Do you smoke?", "C2"),
  reply(4, "No, never smoked. Well, I stopped last year."),
  agent(5, "Has a doctor checked your heart?", "C4"),
  reply(6, "Yes, it was checked. I have not had surgery."),
  agent(7, "Any liver problems?", "C5"),
  reply(8, "No liver problems."),
  agent(9, "Are your kidneys working well?", "C6"),
  reply(10, "One of them, I think."),
  agent(11, "Any infections now?", "C7"),
  reply(12, "I really don't know."),
  agent(13, "Are you on any other medicines?", "C8"),
  reply(14, "I'd rather not say."),
  agent(15, "Can you travel to the site?", "C9"),
  agent(16, "Thank you, that's all."),
];

const f = (finding: Partial<Finding> & Pick<Finding, "criterionId" | "status" | "reason">) => ({
  evidence: [],
  timesAsked: 0,
  ...finding,
});

export const REVIEW_FINDINGS: Finding[] = [
  f({
    criterionId: "C1",
    status: "holds",
    reason: "answered",
    timesAsked: 1,
    evidence: [{ turn: 2, quote: "I am 64", reading: "holds" }],
  }),
  f({
    criterionId: "C2",
    status: "does-not-hold",
    reason: "answered",
    timesAsked: 1,
    evidence: [{ turn: 4, quote: "never smoked", reading: "does-not-hold" }],
  }),
  f({
    criterionId: "C3",
    status: "does-not-hold",
    reason: "answered",
    evidence: [{ turn: 6, quote: "I have not had surgery", reading: "does-not-hold" }],
  }),
  f({
    criterionId: "C4",
    status: "chart-review",
    reason: "answered",
    reported: "holds",
    timesAsked: 1,
    evidence: [{ turn: 6, quote: "it was checked", reading: "holds" }],
  }),
  f({
    criterionId: "C5",
    status: "chart-review",
    reason: "answered",
    reported: "does-not-hold",
    timesAsked: 1,
    evidence: [{ turn: 8, quote: "No liver problems", reading: "does-not-hold" }],
  }),
  f({
    criterionId: "C6",
    status: "chart-review",
    reason: "partial",
    reported: "partial",
    timesAsked: 1,
    evidence: [
      { turn: 10, quote: "One of them", reading: "partial", missing: "the other kidney" },
    ],
  }),
  f({
    criterionId: "C7",
    status: "chart-review",
    reason: "unknown",
    reported: "unknown",
    timesAsked: 1,
    evidence: [{ turn: 12, quote: "I really don't know", reading: "unknown" }],
  }),
  f({ criterionId: "C8", status: "unresolved", reason: "declined", timesAsked: 1 }),
  f({ criterionId: "C9", status: "unresolved", reason: "no-answer", timesAsked: 1 }),
  f({ criterionId: "C10", status: "not-raised", reason: "protocol" }),
  f({ criterionId: "C11", status: "not-raised", reason: "definitional" }),
  f({ criterionId: "C12", status: "not-raised", reason: "lab-value" }),
];

export const REVIEW_RESULT: ScreeningResult = {
  study: { nctId: "NCT00000000", briefTitle: "A Made-Up Study" },
  findings: REVIEW_FINDINGS,
  transcript: REVIEW_TRANSCRIPT,
  handoff: {
    holds: ["C1"],
    doesNotHold: ["C2", "C3"],
    unresolved: ["C8", "C9"],
    chartReview: ["C4", "C5", "C6", "C7"],
    notRaised: ["C10", "C11", "C12"],
  },
  rejectedReadings: [
    { turn: 14, criterionId: "C8", reading: "declined", quote: "prefer not to discuss" },
  ],
  ignoredReadings: [
    { turn: 4, criterionId: "C2", reading: "holds", why: "already-settled" },
    { turn: 2, criterionId: "C10", reading: "holds", why: "not-raisable" },
    { turn: 8, criterionId: "C99", reading: "holds", why: "unknown-criterion" },
  ],
  calls: 17,
  run: {
    model: "Test-Model-8bit",
    quantization: "8bit",
    temperature: 0,
    seed: 20260921,
    adapter: "omlx",
    thinking: "off",
    promptVersion: "c5778afe9cbd",
    timestamp: "2000-01-23T12:00:00.000Z",
  },
};

export const REVIEW: ConversationReview = {
  id: "NCT00000000-20000123T120000",
  origin: "conversation",
  source: "labels",
  criteria: REVIEW_CRITERIA,
  plain: { C1: { state: "shown", text: "Is 64 or older.", attempt: 1 } },
  result: REVIEW_RESULT,
};
