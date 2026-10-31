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

export function openingMessage(study: StudyContext): string {
  return OPENING_TEMPLATE.replace("{title}", study.briefTitle);
}

export function closingMessage(): string {
  return CLOSING_TEMPLATE;
}
