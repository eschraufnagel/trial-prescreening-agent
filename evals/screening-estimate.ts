import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Workload } from "../src/models/index.js";
import { tokensFor } from "../src/models/index.js";
import { READ_MAX_OUTPUT_TOKENS } from "../src/screening/calls.js";
import type { ScreeningCriterion, Turn } from "../src/screening/index.js";
import {
  ASK_CONTEXT_TURNS,
  ASK_SYSTEM_PROMPT,
  buildAskPrompt,
  buildReadPrompt,
  READ_CONTEXT_TURNS,
  READ_SYSTEM_PROMPT,
} from "../src/screening/prompts.js";
import { loadLabelSet } from "./cases/load.js";
import type { Vignette } from "./cases/types.js";
import { FIDELITY_SYSTEM_PROMPT, PARTICIPANT_SYSTEM_PROMPT } from "./participant/prompt.js";
import type { TranscriptLine } from "./participant/simulate.js";
import { buildParticipantPrompt } from "./participant/simulate.js";
import { fromLabels, studyContext } from "./screening-input.js";
import type { Source } from "./screening-runner.js";

/**
 * The screening eval's workload per role, for the estimate printed before a
 * paid run. Only a role on a frontier model is estimated; a local role costs
 * nothing.
 *
 * How many calls a conversation takes comes from the committed run the review
 * serves, which recorded agent, participant and fidelity calls for every
 * vignette, plus a quarter for luck. Prompt sizes come from the real prompt builders, with a
 * made-up transcript at each call's context window and 150 characters a turn.
 * Outputs are guesses the first live run calibrates. Ceilings don't guess:
 * the largest prompt built, and each call's `max_tokens`.
 */

/**
 * The run whose call counts size the estimate. The same run the coordinator
 * review serves (`EVAL_RUN` in `scripts/app/eval-run.ts`), named here because
 * `evals/` doesn't import from `scripts/`.
 */
const REFERENCE_RUN = fileURLToPath(
  new URL("./results/screening/02-2c46ada9a1d5.json", import.meta.url),
);

const MARGIN = 1.25;
const TURN_CHARS = 150;

/**
 * `max_tokens` per call. The agent's ceiling is the read call's own, taken from
 * `src/screening/calls.ts` (the ask call's is 256). The participant's and the
 * fidelity check's are as set in `evals/participant/`.
 */
const PARTICIPANT_MAX_OUTPUT = 300;
const FIDELITY_MAX_OUTPUT = 200;

/** Expected output tokens per call. Guesses: short JSON answers. */
const ASK_OUTPUT = 60;
const READ_OUTPUT = 150;
const PARTICIPANT_OUTPUT = 60;
const FIDELITY_OUTPUT = 40;

export type ScreeningRole = "agent" | "participant" | "fidelity";

export interface ScreeningEstimateInput {
  vignettes: readonly Vignette[];
  sources: readonly Source[];
}

interface Counts {
  agentCalls: number;
  participantCalls: number;
  fidelityCalls: number;
}

export function screeningWorkloads(input: ScreeningEstimateInput): Record<ScreeningRole, Workload> {
  const counts = referenceCounts();
  const fallback = largestCounts(counts);

  const perConversation = input.sources.flatMap((source) =>
    input.vignettes.map((v) => ({
      vignette: v,
      counts: counts.get(`${v.id}|${source}`) ?? fallback,
    })),
  );

  const agent = perConversation.map(({ vignette, counts: c }) => {
    const sizes = agentPromptTokens(vignette);
    const calls = Math.ceil(c.agentCalls * MARGIN);
    // Half the agent's calls ask and half read, one of each per question.
    return {
      calls,
      input: Math.ceil((calls / 2) * (sizes.ask + sizes.read)),
      output: Math.ceil((calls / 2) * (ASK_OUTPUT + READ_OUTPUT)),
      largest: Math.max(sizes.ask, sizes.read),
    };
  });

  const participant = perConversation.map(({ vignette, counts: c }) => {
    const size = participantPromptTokens(vignette);
    const calls = Math.ceil(c.participantCalls * MARGIN);
    return { calls, input: calls * size, output: calls * PARTICIPANT_OUTPUT, largest: size };
  });

  const fidelity = perConversation.map(({ vignette, counts: c }) => {
    const size = fidelityPromptTokens(vignette);
    const calls = Math.ceil(c.fidelityCalls * MARGIN);
    return { calls, input: calls * size, output: calls * FIDELITY_OUTPUT, largest: size };
  });

  return {
    agent: toWorkload(agent, READ_MAX_OUTPUT_TOKENS),
    participant: toWorkload(participant, PARTICIPANT_MAX_OUTPUT),
    fidelity: toWorkload(fidelity, FIDELITY_MAX_OUTPUT),
  };
}

function toWorkload(
  rows: ReadonlyArray<{ calls: number; input: number; output: number; largest: number }>,
  maxOutput: number,
): Workload {
  return {
    expected: {
      calls: rows.reduce((a, r) => a + r.calls, 0),
      inputTokens: rows.reduce((a, r) => a + r.input, 0),
      outputTokens: rows.reduce((a, r) => a + r.output, 0),
    },
    perCallCeiling: {
      inputTokens: Math.max(0, ...rows.map((r) => r.largest)),
      outputTokens: maxOutput,
    },
  };
}

/** Call counts per vignette and source from the reference run. */
export function referenceCounts(path: string = REFERENCE_RUN): Map<string, Counts> {
  const run = JSON.parse(readFileSync(path, "utf8")) as {
    conversations: Array<{ vignetteId: string; source: string; timing?: Counts }>;
  };
  return new Map(
    run.conversations.flatMap((c) =>
      c.timing === undefined ? [] : [[`${c.vignetteId}|${c.source}`, c.timing] as const],
    ),
  );
}

/** For a vignette the reference run doesn't have: the largest counts it does have. */
function largestCounts(counts: Map<string, Counts>): Counts {
  const all = [...counts.values()];
  return {
    agentCalls: Math.max(0, ...all.map((c) => c.agentCalls)),
    participantCalls: Math.max(0, ...all.map((c) => c.participantCalls)),
    fidelityCalls: Math.max(0, ...all.map((c) => c.fidelityCalls)),
  };
}

function madeUpTurns(count: number): Turn[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    speaker: index % 2 === 0 ? ("agent" as const) : ("participant" as const),
    kind: index % 2 === 0 ? ("question" as const) : ("reply" as const),
    text: "x".repeat(TURN_CHARS),
  }));
}

/**
 * The ask prompt for the longest criterion, and the read prompt with every
 * criterion shown and what was said about each under it (slice 0009): the
 * largest each can be for this vignette's study. A quote is part of one reply,
 * so no longer than a turn.
 */
function agentPromptTokens(vignette: Vignette): { ask: number; read: number } {
  const criteria: ScreeningCriterion[] = fromLabels(loadLabelSet(vignette.nctId));
  const longest = criteria.reduce(
    (a, b) => (b.text.length > a.text.length ? b : a),
    criteria[0] ?? { id: "L0", polarity: "inclusion", type: "patient", text: "" },
  );
  const ask = buildAskPrompt({
    study: studyContext(vignette.nctId),
    transcript: madeUpTurns(ASK_CONTEXT_TURNS),
    criterion: longest,
    kind: "patient",
  });
  const read = buildReadPrompt({
    transcript: madeUpTurns(READ_CONTEXT_TURNS),
    message: "x".repeat(TURN_CHARS),
    askedAbout: longest.id,
    open: criteria,
    answered: [],
    saidSoFar: Object.fromEntries(
      criteria.map((c) => [c.id, { reading: "does-not-hold", quote: "x".repeat(TURN_CHARS) }]),
    ),
  });
  return {
    ask: tokensFor(ASK_SYSTEM_PROMPT) + tokensFor(ask),
    read: tokensFor(READ_SYSTEM_PROMPT) + tokensFor(read),
  };
}

function participantPromptTokens(vignette: Vignette): number {
  const lines: TranscriptLine[] = madeUpTurns(ASK_CONTEXT_TURNS).map((t) => ({
    speaker: t.speaker,
    text: t.text,
  }));
  const prompt = buildParticipantPrompt(vignette, loadLabelSet(vignette.nctId), lines, [], null);
  return tokensFor(PARTICIPANT_SYSTEM_PROMPT) + tokensFor(prompt);
}

/** Approximates `modelFidelityCheck`'s prompt: persona, every fact, one message. */
function fidelityPromptTokens(vignette: Vignette): number {
  const facts = vignette.facts.map((f) => `- ${f.label}: ${f.says ?? ""} ${f.laterSays ?? ""}`);
  return (
    tokensFor(FIDELITY_SYSTEM_PROMPT) +
    tokensFor([vignette.persona, ...facts, "x".repeat(TURN_CHARS)].join("\n")) +
    40
  );
}
