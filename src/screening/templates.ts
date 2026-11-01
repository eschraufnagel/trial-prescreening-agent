import type { StudyContext } from "./types.js";

/**
 * What the agent says in its own voice, written by code, never by the model
 * (spec §4.4).
 *
 * The opening and closing are the two moments a model would be most tempted to
 * sum up — "you seem like a great fit", "unfortunately you may not qualify" —
 * and the agent is never allowed to. Fixed text makes that impossible rather
 * than unlikely, and a test checks this text against the grader's verdict
 * pattern.
 *
 * Real prescreening language is an IRB-approved artifact. This is not, and says
 * nothing a real study would need approved.
 */

/** The opening's last sentence, which the screening page also shows in its header (slice 0020). */
export const REASSURANCE =
  "A study coordinator will review everything you tell me and follow up with you.";

export const OPENING_TEMPLATE =
  'Hello, and thank you for your interest in the study "{title}". ' +
  "I'll ask you a short series of questions, one at a time. You can skip any question. " +
  REASSURANCE;

export const CLOSING_TEMPLATE =
  "Thank you, that's all my questions. A study coordinator will review your answers " +
  "and contact you about next steps.";

/**
 * Said when the person asks to stop or pause (slice 0021), followed by the
 * question again or the next one. Fixed text, so it can't drift into a summary.
 */
export const STOP_TEMPLATE =
  "Of course. You can stop at any time by closing this page, and a study coordinator " +
  "will still follow up on what you've told me so far.";
export const STOP_AGAIN = "If you'd like to keep going, here is the question again:";
export const STOP_NEXT = "If you'd like to keep going, here is the next question:";

/**
 * Everything the agent may say about the study and the process when asked
 * (slice 0021). Only the title is the study's own: no trial record carries a
 * summary. Anything else the person asks is for the coordinator.
 */
export const STUDY_FACTS_TEMPLATE = [
  'The study is called "{title}".',
  "This is a short prescreening, not enrolment in the study.",
  REASSURANCE,
  "They can skip any question.",
  "They can stop at any time.",
];

export function studyFacts(study: StudyContext): string[] {
  return STUDY_FACTS_TEMPLATE.map((f) => f.replace("{title}", study.briefTitle));
}

export function stopMessage(question: string, again: boolean): string {
  return `${STOP_TEMPLATE} ${again ? STOP_AGAIN : STOP_NEXT}\n\n${question}`;
}

export function openingMessage(study: StudyContext): string {
  return OPENING_TEMPLATE.replace("{title}", study.briefTitle);
}

export function closingMessage(): string {
  return CLOSING_TEMPLATE;
}
