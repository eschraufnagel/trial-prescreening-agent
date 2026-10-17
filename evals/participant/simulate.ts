import { normalize } from "../../src/criteria/normalize.js";
import type { ModelAdapter } from "../../src/models/index.js";
import { objectFrom } from "../../src/screening/calls.js";
import type { LabelSet, Vignette, VignetteFact } from "../cases/types.js";
import { PARTICIPANT_SYSTEM_PROMPT } from "./prompt.js";

/**
 * The simulated participant: the local model answering as a vignette.
 *
 * Deliberately blind to the agent. Its inputs are the vignette, the text of the
 * conversation so far, and a small memory of its own; it never receives the
 * agent's `ScreeningState`, so it cannot answer toward what the agent has or
 * has not settled. The signature enforces that, and a type test pins it.
 *
 * Two behaviors are too important to leave to the model's discretion, so code
 * triggers them:
 *
 * - **Contradiction.** Once a fact with `laterSays` has been used, the next
 *   reply is instructed to correct it. A model asked to "contradict yourself at
 *   some point" might never do it, and the vignette would then be graded as
 *   though it had.
 * - **Volunteering.** A `volunteers` vignette's first reply is instructed to
 *   mention specific facts unprompted, chosen deterministically from late in
 *   the protocol so the agent has not reached them yet. That is what makes it a
 *   test of out-of-order handling rather than a hope for one.
 */

export interface TranscriptLine {
  speaker: "agent" | "participant";
  text: string;
}

/** What the participant remembers between turns. Plain JSON, saved with the conversation. */
export interface ParticipantMemory {
  /** Fact ids used so far, in order. */
  used: string[];
  /** Fact ids whose `laterSays` has been delivered. */
  corrected: string[];
  /** Fact ids volunteered unprompted. */
  volunteered: string[];
  replies: number;
}

export interface ParticipantReply {
  message: string;
  usedFacts: string[];
  /** What code told the model to do this turn, if anything. Recorded for reading. */
  instruction: string | null;
  memory: ParticipantMemory;
}

/** How many facts a `volunteers` vignette offers in its first reply. */
const VOLUNTEERED_FACTS = 3;

const MAX_OUTPUT_TOKENS = 300;

export class SimulatorError extends Error {
  readonly problems: readonly string[];

  constructor(context: string, problems: readonly string[]) {
    const detail = problems.map((p) => `  - ${p}`).join("\n");
    super(`${context}:\n${detail}`);
    this.name = "SimulatorError";
    this.problems = problems;
  }
}

export function freshMemory(): ParticipantMemory {
  return { used: [], corrected: [], volunteered: [], replies: 0 };
}

export async function simulate(
  vignette: Vignette,
  labels: LabelSet,
  transcript: readonly TranscriptLine[],
  memory: ParticipantMemory,
  adapter: ModelAdapter,
): Promise<ParticipantReply> {
  const instruction = instructionFor(vignette, memory);
  const request = {
    system: PARTICIPANT_SYSTEM_PROMPT,
    user: buildParticipantPrompt(
      vignette,
      labels,
      transcript,
      memory.corrected,
      instruction?.text ?? null,
    ),
    responseFormat: "json" as const,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  };

  // One retry on an unusable reply, as the agent's own calls do. A local model
  // occasionally returns an empty message; failing the conversation for that
  // would cost a long run its progress over a formatting hiccup.
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await adapter.complete(request);
    const read = readReply(response.content);
    if (response.finishReason !== "length" && read.reply !== undefined) {
      const usedFacts = [
        ...new Set([...read.reply.usedFacts, ...(instruction?.facts ?? [])]),
      ].filter((id) => vignette.facts.some((f) => f.label === id));
      return {
        message: read.reply.message,
        usedFacts: read.reply.usedFacts,
        instruction: instruction?.text ?? null,
        memory: remember(memory, usedFacts, instruction),
      };
    }
    problems = response.finishReason === "length" ? ["reply was truncated"] : read.problems;
  }

  throw new SimulatorError(`Simulated participant ${vignette.id} gave no usable reply`, problems);
}

interface Instruction {
  text: string;
  kind: "correct" | "volunteer";
  facts: string[];
}

/**
 * What code requires of this reply. Corrections first: a pending contradiction
 * is owed from the moment its fact was used.
 */
export function instructionFor(vignette: Vignette, memory: ParticipantMemory): Instruction | null {
  const pending = vignette.facts.find(
    (f) =>
      f.laterSays !== undefined &&
      memory.used.includes(f.label) &&
      !memory.corrected.includes(f.label),
  );
  if (pending?.laterSays !== undefined) {
    return {
      kind: "correct",
      facts: [pending.label],
      text:
        `Before answering, correct something you said earlier about fact ${pending.label}. ` +
        `Say, in your own words: "${pending.laterSays}". Then answer the question.`,
    };
  }

  if (vignette.behavior === "volunteers" && memory.replies === 0) {
    const offered = volunteerable(vignette);
    if (offered.length > 0) {
      return {
        kind: "volunteer",
        facts: offered.map((f) => f.label),
        text:
          `In this reply, besides answering, mention these facts without being asked: ` +
          `${offered.map((f) => f.label).join(", ")}.`,
      };
    }
  }

  return null;
}

/**
 * The facts a `volunteers` vignette offers unprompted: plain, settleable ones
 * from the end of the fact list, which follows the protocol's order, so the
 * agent will not have reached them.
 */
function volunteerable(vignette: Vignette): VignetteFact[] {
  return vignette.facts
    .filter(
      (f) =>
        typeof f.says === "string" &&
        f.laterSays === undefined &&
        (f.expected === "holds" || f.expected === "does-not-hold"),
    )
    .slice(-VOLUNTEERED_FACTS);
}

function remember(
  memory: ParticipantMemory,
  usedFacts: readonly string[],
  instruction: Instruction | null,
): ParticipantMemory {
  return {
    used: [...memory.used, ...usedFacts.filter((id) => !memory.used.includes(id))],
    corrected:
      instruction?.kind === "correct"
        ? [...memory.corrected, ...instruction.facts]
        : [...memory.corrected],
    volunteered:
      instruction?.kind === "volunteer"
        ? [...memory.volunteered, ...instruction.facts]
        : [...memory.volunteered],
    replies: memory.replies + 1,
  };
}

/**
 * The per-turn prompt. Facts are shown with the topic they answer — the
 * criterion's own text — so the model can tell which fact a question is about.
 * `laterSays` is never shown until code asks for the correction; after that it
 * replaces the original, so the simulator does not drift back to the first
 * version. Nothing graded (`expected`, `reported`) is ever shown at all.
 */
export function buildParticipantPrompt(
  vignette: Vignette,
  labels: LabelSet,
  transcript: readonly TranscriptLine[],
  corrected: readonly string[],
  instruction: string | null,
): string {
  const topics = new Map(labels.criteria.map((l) => [l.id, topicOf(l.quote)]));
  const facts = vignette.facts.map((f) => {
    const topic = topics.get(f.label) ?? "";
    const body =
      f.declines === true
        ? "DECLINE — you prefer not to discuss this."
        : corrected.includes(f.label) && f.laterSays !== undefined
          ? `${f.laterSays} (You corrected yourself about this earlier.)`
          : f.says;
    return `- ${f.label} (topic: ${topic}): ${body}`;
  });

  // Quoted and numbered, not `ASSISTANT:` lines: the local model reads a chat
  // log as something to continue rather than to answer (found at Gate 2).
  const lines = transcript.map(
    (t, i) =>
      `${i + 1}. ${t.speaker === "agent" ? "Research assistant" : "You"} said: ${JSON.stringify(t.text)}`,
  );

  return [
    `PERSONA: ${vignette.persona}`,
    "",
    "YOUR FACTS:",
    ...facts,
    "",
    "Conversation so far, oldest first:",
    ...lines,
    "",
    ...(instruction === null ? [] : [`INSTRUCTION FOR THIS REPLY: ${instruction}`, ""]),
    'Respond with a JSON object of the form {"message": "...", "usedFacts": [...]} holding your next reply.',
  ].join("\n");
}

function topicOf(quote: string): string {
  return normalize(quote).text.replace(/\s+/g, " ").trim();
}

function readReply(content: unknown): {
  reply?: { message: string; usedFacts: string[] };
  problems: string[];
} {
  const record = objectFrom(content);
  if (record === undefined) {
    return { problems: ["reply is not a JSON object"] };
  }
  const message = record["message"];
  const usedFacts = record["usedFacts"];

  const problems: string[] = [];
  if (typeof message !== "string" || message.trim().length === 0) {
    problems.push("message is missing or empty");
  }
  if (!Array.isArray(usedFacts) || !usedFacts.every((id) => typeof id === "string")) {
    problems.push("usedFacts is not an array of strings");
  }
  if (problems.length > 0) {
    return { problems };
  }

  // Unknown ids are kept, not filtered: citing a fact the vignette lacks is a
  // fidelity flag (fidelity.ts), and filtering here would hide it.
  return {
    reply: { message: (message as string).trim(), usedFacts: usedFacts as string[] },
    problems,
  };
}
