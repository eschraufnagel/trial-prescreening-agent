import type { ModelAdapter } from "../../src/models/index.js";
import { objectFrom } from "../../src/screening/calls.js";
import type { Vignette } from "../cases/types.js";
import { FIDELITY_SYSTEM_PROMPT } from "./prompt.js";

/**
 * Checks on whether the simulated participant stayed faithful to its vignette.
 *
 * A finding whose evidence comes from an unfaithful turn is not the agent's
 * fault, so it is excluded from scoring and counted (spec §8.4). Two checks,
 * because each misses things the other catches:
 *
 * - **Deterministic**, from what the simulator said it used. Cheap, exact, and
 *   blind to a reply that cites the right fact while saying something else.
 * - **A local-model read** of each reply against the facts. Catches invented
 *   history, but is itself a model and can be wrong, so its output is a flag
 *   for a person to read at Gate 3, never a score.
 */

export type FidelityFlag =
  | { kind: "unknown-fact"; facts: string[] }
  | { kind: "uncited-assertion"; length: number }
  | { kind: "model"; reason: string };

/**
 * A reply citing no fact but longer than this is probably asserting something.
 *
 * "I don't know", "Sure, go ahead" and "What do you mean?" all sit well under
 * it; a sentence of invented medical history does not. Set by reading what
 * short uncited replies look like, and deliberately loose: a false flag costs a
 * person thirty seconds at Gate 3, and a missed one puts a simulator error in
 * the agent's score.
 */
export const UNCITED_LENGTH = 80;

/**
 * Saying you don't know asserts nothing, however long it takes to say. At
 * Gate 2 the uncited-length rule fired on eight honest "I don't know…"
 * replies; this exempts them (approved at Gate 2).
 */
export const NOT_KNOWING =
  /\b(don'?t know|do not know|not sure|unsure|can'?t say|cannot say|no idea)\b/i;

export function deterministicFlags(
  vignette: Vignette,
  message: string,
  usedFacts: readonly string[],
): FidelityFlag[] {
  const flags: FidelityFlag[] = [];
  const known = new Set(vignette.facts.map((f) => f.label));

  const unknown = usedFacts.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    flags.push({ kind: "unknown-fact", facts: unknown });
  }
  if (usedFacts.length === 0 && message.length > UNCITED_LENGTH && !NOT_KNOWING.test(message)) {
    flags.push({ kind: "uncited-assertion", length: message.length });
  }

  return flags;
}

/**
 * Asks the local model whether one reply stays within the vignette's facts.
 *
 * Returns a flag, or nothing. A malformed answer from the checker is reported
 * as a flag too, because "the check could not run" must not read as "the
 * check passed".
 */
export async function modelFidelityCheck(
  vignette: Vignette,
  message: string,
  adapter: ModelAdapter,
): Promise<FidelityFlag | null> {
  const facts = vignette.facts.map((f) => {
    if (f.declines === true) {
      return `- ${f.label}: (declines to discuss)`;
    }
    const later = f.laterSays === undefined ? "" : ` Later corrects this to: ${f.laterSays}`;
    return `- ${f.label}: ${f.says}${later}`;
  });

  const response = await adapter.complete({
    system: FIDELITY_SYSTEM_PROMPT,
    user: [
      `PERSONA: ${vignette.persona}`,
      "",
      "FACTS:",
      ...facts,
      "",
      `MESSAGE: ${JSON.stringify(message)}`,
      "",
      'Respond with a JSON object of the form {"faithful": true | false, "reason": "..."}.',
    ].join("\n"),
    responseFormat: "json",
    maxOutputTokens: 200,
  });

  const record = objectFrom(response.content);
  if (record === undefined) {
    return { kind: "model", reason: "fidelity check returned no usable answer" };
  }
  if (record["faithful"] === true) {
    return null;
  }
  if (record["faithful"] === false) {
    const reason = record["reason"];
    return { kind: "model", reason: typeof reason === "string" && reason ? reason : "unfaithful" };
  }
  return { kind: "model", reason: "fidelity check returned no usable answer" };
}
