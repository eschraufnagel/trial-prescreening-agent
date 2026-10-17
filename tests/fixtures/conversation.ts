import type { ScriptedResponse } from "../../src/models/index.js";
import { FakeModelAdapter } from "../../src/models/index.js";
import type {
  AgentReply,
  ScreeningCriterion,
  ScreeningResult,
  ScreeningState,
} from "../../src/screening/index.js";
import { ScreeningSession } from "../../src/screening/index.js";

/**
 * One scripted conversation, shared by the tests that drive it three ways:
 * through `ScreeningSession` directly, through the conversation service over a
 * memory transport, and through the HTTP API. If all three agree, the page
 * runs the agent 0004 measured (spec §10, "Transparency").
 *
 * The script is in the order the session asks for it: an ask to open, then
 * for every reply a read followed by an ask, or nothing once it closes.
 */
export const STUDY = { nctId: "NCT04316364", briefTitle: "A Lung Cancer Study" };

export const CRITERIA: ScreeningCriterion[] = [
  { id: "L8", polarity: "exclusion", type: "patient", text: "Previous anti-cancer therapy" },
  { id: "L4", polarity: "inclusion", type: "protocol", text: "Adequate tissue for PD-L1 testing" },
  { id: "L2", polarity: "inclusion", type: "clinical", text: "Untreated, resectable stage II" },
  { id: "L19", polarity: "exclusion", type: "patient", text: "Pregnant" },
];

export const SERVED = [{ study: STUDY, criteria: CRITERIA }];

export const askR = (message: string): ScriptedResponse => ({
  kind: "json",
  content: { message },
});
/**
 * A scripted read response. Every reading carries the fields the read call
 * requires since slice 0009, outright unless the script says otherwise.
 */
export const readR = (
  readings: Array<{ criterionId: string; reading: string; quote: string; outright?: boolean }>,
): ScriptedResponse => ({
  kind: "json",
  content: {
    readings: readings.map((r) => ({ statement: "The criterion's statement.", outright: true, ...r })),
  },
});

export const SCRIPT: ScriptedResponse[] = [
  askR("Have you had any anti-cancer therapy?"),
  readR([{ criterionId: "L8", reading: "does-not-hold", quote: "No treatment" }]),
  askR("Has a surgeon said it can be removed?"),
  // Volunteered out of order: L19 is settled before it is asked.
  readR([
    { criterionId: "L2", reading: "holds", quote: "stage II, removable" },
    { criterionId: "L19", reading: "does-not-hold", quote: "not pregnant" },
  ]),
];

export const REPLIES = ["No treatment at all.", "It's stage II, removable, and I'm not pregnant."];

/** Drives the script through a session directly: the reference the other two must match. */
export async function direct(): Promise<{ state: ScreeningState; result: ScreeningResult }> {
  const session = ScreeningSession.create(STUDY, CRITERIA, new FakeModelAdapter(SCRIPT));
  let reply: AgentReply = await session.start();
  for (const text of REPLIES) {
    reply = await session.receive(text);
  }
  if (reply.kind !== "done") {
    throw new Error("the scripted conversation should be done");
  }
  return { state: session.state(), result: reply.result };
}

/** A result with the one field that must differ between runs, its timestamp, removed. */
export function comparable(result: ScreeningResult | undefined): unknown {
  if (result === undefined) {
    return undefined;
  }
  const { timestamp: _, ...run } = result.run;
  return { ...result, run };
}
