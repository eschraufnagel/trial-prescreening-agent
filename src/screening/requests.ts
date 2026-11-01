import type { Reading } from "./apply.js";
import { locateEvidence } from "./evidence.js";
import type { IgnoredReading, ParticipantRequest, Progress, RejectedRequest } from "./types.js";

/**
 * What a participant's request is allowed to do (spec 0021 §3.2).
 *
 * The read call reports that a reply asks for something; code decides what
 * that changes, the same split as readings. A request may keep the pending
 * criterion open and earn it one respond-then-ask turn. It never settles a
 * criterion, never chooses which one comes next, and is capped, so the
 * conversation still always ends: a criterion is asked at most
 * `MAX_ASKS + MAX_RESPONSES` times.
 */

/** Respond-then-ask turns a criterion may have, beside its `MAX_ASKS` asks. */
export const MAX_RESPONSES = 1;

/** Whether the pending criterion may still have a respond-then-ask turn. */
export function hasResponseLeft(progress: Progress | undefined): boolean {
  return progress !== undefined && (progress.responses ?? 0) < MAX_RESPONSES;
}

/**
 * The request if its words are in the message, as rule 1 requires of a
 * reading's quote. A request the person didn't make never changes the flow.
 */
export function locateRequest(
  message: string,
  turn: number,
  request: ParticipantRequest | null,
): { request: ParticipantRequest | null; rejected?: RejectedRequest } {
  if (request === null) {
    return { request: null };
  }
  if (locateEvidence(message, request.quote) === undefined) {
    return { request: null, rejected: { turn, kind: request.kind, quote: request.quote } };
  }
  return { request };
}

/**
 * Splits off the readings of the criterion the person asked to have explained.
 *
 * An answer given in the same breath as "what does that mean?" was given
 * before they understood the question, so it isn't recorded. The criterion is
 * asked again after the explanation, and that answer is the evidence. Readings
 * about other criteria in the same reply still apply.
 */
export function setAside(
  readings: readonly Reading[],
  criterionId: string,
  turn: number,
): { kept: Reading[]; ignored: IgnoredReading[] } {
  const kept: Reading[] = [];
  const ignored: IgnoredReading[] = [];
  for (const r of readings) {
    if (r.criterionId === criterionId) {
      ignored.push({ turn, criterionId, reading: r.reading, why: "asked-to-explain" });
    } else {
      kept.push(r);
    }
  }
  return { kept, ignored };
}
