import { hashPrompt } from "../criteria/prompt.js";
import {
  CLOSING_TEMPLATE,
  OPENING_TEMPLATE,
  STOP_AGAIN,
  STOP_NEXT,
  STOP_TEMPLATE,
  STUDY_FACTS_TEMPLATE,
  studyFacts,
} from "./templates.js";
import type { RequestKind, ScreeningCriterion, StudyContext, Turn } from "./types.js";

/**
 * The two things the model is asked to do: phrase one question, and read one
 * reply (spec §4.3). Nothing else — the order, the choice of criterion, what a
 * reading is allowed to settle and when the conversation ends are code.
 *
 * Written after Gate 1, once the vignettes were frozen, so that the prompts
 * could not be shaped to them.
 */

export const ASK_SYSTEM_PROMPT = `You write the next text message a research assistant sends in a clinical trial prescreening conversation.

You are given one criterion from the trial's eligibility list. Write ONE short question about that criterion only.

Rules:
- One question, one question mark, under 300 characters. It is a text message.
- Plain language a patient understands. Keep the criterion's key terms where a plain word would change the meaning, and explain them briefly if needed.
- Ask neutrally. For a criterion worded as a prohibition ("must not have received X"), ask whether they have received X.
- If KIND is clinical, the patient may not know the answer: make "I'm not sure" an easy, acceptable reply.
- If FOLLOW-UP is given, the person already answered part of this criterion. Ask only about the part that is still missing, and do not repeat what they already told you.
- If REQUEST is given, the person asked you something. Do what REQUEST says first, then ask. Explain the question, never the person's own situation or what an answer would mean for them. Give no medical advice. The whole message may then be up to 450 characters, still with only one question mark.
- Begin with "To clarify" or similar only when FOLLOW-UP or REQUEST is given. A new criterion is a new question: never present it as a follow-up.
- Never say or suggest whether the person is eligible, qualifies, or is a good or poor candidate. Never comment on what an answer means for them.
- You may begin with a brief acknowledgement such as "Thanks."

Return JSON only: { "message": "<the text message>" }`;

export const READ_SYSTEM_PROMPT = `You read one reply from a person in a clinical trial prescreening conversation and report what it says about the listed criteria.

A reply often answers the question and also says something about another criterion, open or already answered. Give a reading for every criterion the reply speaks to. Give none for a criterion the reply doesn't mention: a reading of "unclear" means the person said something about it that doesn't settle it. Return an empty list if the reply addresses none.

For each reading, write these fields in this order:

1. "statement": the whole criterion as one plain sentence about the person, which is either true or false of them. Use the criterion's own terms. Keep every requirement it has, never only the part the reply answers, and add nothing it doesn't say: no group of people, no condition, no definition of your own. When the criterion defines its term, keep the term and its definition the same way round: "Patients who are non-drinkers, defined as fewer than 10 drinks a year" becomes "The person is a non-drinker (fewer than 10 drinks a year)."
   - For an EXCLUSION criterion, the statement is the condition that would exclude the person, however it is worded. "Patients must not have received prior gemcitabine" becomes "The person has received gemcitabine." "Patients who have never had a blood transfusion" becomes "The person has never had a blood transfusion."
   - For an INCLUSION criterion, the statement is the requirement. "Aspirin is permitted if stopped at least 7 days before the first dose" becomes "The person stopped aspirin at least 7 days before the first dose."
2. "quote": words copied exactly from the person's reply, the shortest part that supports the reading: at most about 12 words, never a whole long sentence.
3. "outright": true only if the quoted words, read literally, say that the statement is true, or that it is false, or that the person is outside the group the criterion is about, with no hedging and nothing left to judge. false if the person is tentative, conditional or guessing ("I'd imagine so", "should be fine", "if they insist"), or if deciding would need a judgment about what a term covers ("significant", "active", whether a named drug or condition belongs to the criterion's category).
4. "reading":
   - "holds": the reply establishes that the statement is true.
   - "does-not-hold": the reply establishes that the statement is false.
   - "does-not-apply": the criterion is written about one group of people (for example only men, or only women), and the reply places the person outside that group. This is about who the criterion is for, never about its condition. "Pregnant" or "breastfeeding" names a condition, not a group, so it applies to everyone: a man who says he isn't pregnant gives "does-not-hold", like anyone who says they aren't taking a medicine. A criterion that names several groups ("women who could become pregnant and men must...") applies to anyone in any of them.
   - "partial": the criterion has several requirements and the reply answers some but not all. Put what is still unanswered in "missing".
   - "unclear": the reply is about the criterion but too vague to tell, or deciding would need interpretation.
   - "unknown": the person says they do not know.
   - "declined": the person declines to answer.

Never judge whether the answer is good or bad for the person. Only whether the statement is true.

Judge only from what the person said. Do not fill gaps with medical knowledge: if the criterion names a drug class and the person names only a drug, that is "unclear". A general denial ("I've never had an operation of any kind") does cover a specific question it plainly includes.

Judge an open criterion on everything the person has said about it: what is listed as "said so far" as well as this reply. A follow-up question is often narrower than its criterion, and an answer to the narrow question does not settle the whole of it.

Criteria listed as ALREADY ANSWERED show what was recorded and the person's words, most recent first. Give a reading for one only if this reply changes, qualifies or contradicts what was recorded, and quote the words that do. A correction often doesn't repeat what it corrects ("no, the other way round", "I got that date wrong"), so compare the reply with each recorded answer.

Then say whether the reply asks the research assistant for something, in "request":
- "explain": it asks what the question or a word in it means, or says they don't understand the question.
- "why": it asks why the question is asked.
- "study": it asks about the study, who sees their answers, or what happens next.
- "stop": it asks to stop or pause.
Give one kind, and quote the asking words exactly in "quote". Use null when the reply asks for nothing. Saying "I'm not sure" or "I don't know" answers the question: it is a reading of "unknown", not a request.

Return JSON only:
{ "readings": [ { "criterionId": "<id>", "statement": "<statement>", "quote": "<exact words>", "outright": true, "reading": "<reading>", "missing": "<only for partial>" } ], "request": null | { "kind": "<kind>", "quote": "<exact words>" } }`;

/**
 * Appended to the user prompt when retrying after a truncated response.
 *
 * At temperature 0 with a fixed seed, an identical retry decodes identically,
 * so a model caught in a repetition loop ("and an artery and an artery…", seen
 * in the dev conversation) would loop again. Changing the input changes the
 * path, deterministically, and tells the model what went wrong.
 */
export const RETRY_AFTER_TRUNCATION =
  "\n\nYour previous answer ran on without ending. Keep each quote to a few words, " +
  "and return the JSON object promptly.";

/** How much of the conversation each call sees. Enough for context, bounded for speed. */
export const ASK_CONTEXT_TURNS = 6;
export const READ_CONTEXT_TURNS = 4;

/**
 * Revision of how `buildAskPrompt` and `buildReadPrompt` lay out the per-turn
 * prompt. Code, not a string, so it cannot be hashed directly; bump it whenever
 * either builder changes what the model sees, so the change reaches
 * `PROMPT_VERSION` and cannot be mixed silently with earlier results.
 */
export const PROMPT_LAYOUT = 6;

/** Hash of everything the agent says or is told. Recorded on every result. */
export const PROMPT_VERSION = hashPrompt(
  [
    ASK_SYSTEM_PROMPT,
    READ_SYSTEM_PROMPT,
    OPENING_TEMPLATE,
    CLOSING_TEMPLATE,
    RETRY_AFTER_TRUNCATION,
    STOP_TEMPLATE,
    STOP_AGAIN,
    STOP_NEXT,
    ...STUDY_FACTS_TEMPLATE,
    `layout ${PROMPT_LAYOUT}`,
    `context ${ASK_CONTEXT_TURNS}/${READ_CONTEXT_TURNS}`,
  ].join("\n---\n"),
);

export interface AskContext {
  study: StudyContext;
  transcript: readonly Turn[];
  criterion: ScreeningCriterion;
  kind: "patient" | "clinical";
  /** Present on a follow-up: what the earlier answer left unanswered, or why it was unclear. */
  followUp?: string;
  /**
   * Present when the person's last message asked for something (slice 0021).
   * `again` when they asked to have a question explained, or why, and it
   * already had its one response.
   */
  request?: AskRequest;
}

export interface AskRequest {
  kind: Exclude<RequestKind, "stop">;
  quote: string;
  again?: true;
}

export function buildAskPrompt(context: AskContext): string {
  return [
    `STUDY: ${context.study.briefTitle}`,
    "",
    "Recent conversation, oldest first:",
    ...render(context.transcript.slice(-ASK_CONTEXT_TURNS)),
    "",
    `CRITERION (${context.criterion.polarity}): ${context.criterion.text}`,
    `KIND: ${context.kind}`,
    ...(context.followUp === undefined ? [] : [`FOLLOW-UP: ${context.followUp}`]),
    ...(context.request === undefined ? [] : requestLines(context.request, context.study)),
    "",
    'Respond with a JSON object of the form {"message": "..."} holding the next text message.',
  ].join("\n");
}

/** What the ask call is told to do before its question, by the kind of request. */
function requestLines(request: AskRequest, study: StudyContext): string[] {
  const words = JSON.stringify(request.quote);
  if (request.again === true) {
    return [
      `REQUEST: They asked again (${words}). Say briefly that the study coordinator can go over it with them, then ask the question.`,
    ];
  }
  switch (request.kind) {
    case "explain":
      return [
        `REQUEST: They asked what this question means (${words}). First explain the question in plain words, in one or two short sentences, using only the CRITERION's words: what it asks about, and what any medical term in it means. Then ask the question again.`,
      ];
    case "why":
      return [
        `REQUEST: They asked why you are asking (${words}). First say in one sentence why: the study can only include people who meet its requirements, and this is one of them. Then ask the question again.`,
      ];
    case "study":
      return [
        `REQUEST: They asked about the study or the process (${words}). First answer in one or two sentences, from STUDY FACTS only. If STUDY FACTS don't cover it, say the study coordinator can answer that. Then ask the question.`,
        "STUDY FACTS:",
        ...studyFacts(study).map((f) => `- ${f}`),
      ];
  }
}

export interface ReadContext {
  transcript: readonly Turn[];
  /** The participant's message being read. Also the last turn of the transcript. */
  message: string;
  /** The criterion the last question was about, if any. */
  askedAbout: string | null;
  /** Open raisable criteria the reply may address. */
  open: readonly ScreeningCriterion[];
  /**
   * What the person has already said about an open criterion, by id: the
   * latest reading and its words (slice 0009). A follow-up question is often
   * narrower than its criterion, and its answer has to be judged together
   * with what was said before, not alone.
   */
  saidSoFar?: Readonly<Record<string, { reading: string; quote: string }>>;
  /**
   * Raisable criteria already answered, each with what was recorded and the
   * words it came from. Shown so that a correction can be noticed at all: a
   * contradiction of a settled answer is invisible to a read that only sees
   * open criteria, and "does this change that answer" needs the answer
   * (slice 0009; before it, only the criterion was shown).
   */
  answered: readonly AnsweredCriterion[];
}

/** An answered criterion as the read call is shown it. */
export interface AnsweredCriterion {
  criterion: ScreeningCriterion;
  /** "recorded" for a settled patient criterion, "reported" for a clinical one awaiting the chart. */
  kind: "recorded" | "reported";
  /** What was recorded or reported, in the reading vocabulary. */
  value: string;
  /** The person's words behind it, if any were kept. */
  quote?: string;
}

export function buildReadPrompt(context: ReadContext): string {
  return [
    "Recent conversation, oldest first:",
    ...render(context.transcript.slice(-READ_CONTEXT_TURNS)),
    "",
    `THE REPLY TO READ: ${context.message}`,
    "",
    ...(context.askedAbout === null ? [] : [`THE QUESTION WAS ABOUT: ${context.askedAbout}`, ""]),
    "CRITERIA THE REPLY MAY ADDRESS:",
    ...context.open.flatMap((c) => {
      const said = context.saidSoFar?.[c.id];
      return said === undefined
        ? [line(c)]
        : [line(c), `    said so far: ${said.reading}, from ${JSON.stringify(said.quote)}`];
    }),
    ...(context.answered.length === 0
      ? []
      : [
          "",
          "ALREADY ANSWERED, most recent first, with what was recorded. Report one of these only if this reply changes or contradicts what was recorded:",
          ...context.answered.flatMap((a) => [
            line(a.criterion),
            `    ${a.kind}: ${a.value}${a.quote === undefined ? "" : `, from ${JSON.stringify(a.quote)}`}`,
          ]),
        ]),
    "",
    'Respond with a JSON object of the form {"readings": [...]}.',
  ].join("\n");
}

function line(c: ScreeningCriterion): string {
  return `- ${c.id} [${c.polarity.toUpperCase()}]: ${c.text}`;
}

/**
 * The conversation as quoted, numbered lines rather than `ASSISTANT:` /
 * `PERSON:` lines. Found at Gate 2: the local model read the chat-log form as a
 * conversation to continue, and in JSON mode returned the transcript itself as
 * an array of chat messages instead of an answer.
 */
export function render(turns: readonly Turn[]): string[] {
  return turns.map(
    (t) =>
      `${t.index}. ${t.speaker === "agent" ? "Research assistant" : "Person"} said: ${JSON.stringify(t.text)}`,
  );
}
