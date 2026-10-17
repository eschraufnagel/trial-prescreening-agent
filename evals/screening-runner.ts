import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIdentity } from "../src/criteria/index.js";
import type { ParsedCriteria } from "../src/criteria/types.js";
import type { ModelAdapter, ModelDescriptor, Spent } from "../src/models/index.js";
import {
  isBudgetStop,
  isConnectionFailure,
  monthStamp,
  spentBy,
  unsetReasons,
} from "../src/models/index.js";
import type {
  ScreeningCriterion,
  ScreeningResult,
  ScreeningState,
} from "../src/screening/index.js";
import { PROMPT_VERSION, ScreeningSession } from "../src/screening/index.js";
import { loadLabelSet } from "./cases/load.js";
import type { LabelSet, Vignette } from "./cases/types.js";
import { loadVignettes } from "./cases/vignettes.js";
import type { ConversationGrade, ParseRunGrade, ScreeningScore } from "./graders/screening.js";
import {
  gradeConversation,
  gradeParseRun,
  poolScores,
  SCREENING_GRADER_VERSION,
} from "./graders/screening.js";
import type { FidelityFlag } from "./participant/fidelity.js";
import { deterministicFlags, modelFidelityCheck } from "./participant/fidelity.js";
import { SIMULATOR_VERSION } from "./participant/prompt.js";
import type { ParticipantMemory } from "./participant/simulate.js";
import { freshMemory, simulate } from "./participant/simulate.js";
import { nextRunFile } from "./run-file.js";
import { cacheKey as parseCacheKey } from "./runner.js";
import { fromLabels, fromParse, studyContext } from "./screening-input.js";

/**
 * Plays vignettes against the screening agent and grades the result (spec §7).
 *
 * A conversation is dozens of local model calls, and the local model goes
 * down. So every conversation is a file, rewritten after every turn, holding
 * the agent's state and the participant's memory; a rerun picks up exactly
 * where the last one stopped. A failure ends that conversation's attempt and
 * the run moves on, except that two connection failures in a row stop the run:
 * if the server is down, forty more identical failures record nothing.
 *
 * Conversation files are a gitignored cache, like 0003's parses. What is
 * committed is the run result: numbers, and the quotes behind every
 * confidently wrong finding and every flagged turn.
 */

const DEFAULT_RESULTS_DIR = fileURLToPath(new URL("./results/screening", import.meta.url));
const DEFAULT_PARSES_DIR = fileURLToPath(new URL("./results/parses", import.meta.url));

export type Source = "labels" | "parse";

export interface ScreeningRunOptions {
  /** Which adapters to use. The agent's is required; the others default to it. */
  agent: ModelAdapter;
  participant?: ModelAdapter;
  fidelity?: ModelAdapter;
  /** Vignettes to run. Defaults to every scored vignette, or the dev ones with `dev`. */
  vignettes?: readonly Vignette[];
  /** Restrict to these studies. */
  studies?: readonly string[];
  sources?: readonly Source[];
  dev?: boolean;
  refresh?: boolean;
  resultsDir?: string;
  parsesDir?: string;
  labels?: (nctId: string) => LabelSet;
  onProgress?: (message: string) => void;
}

/** One conversation's file on disk. */
export interface ConversationFile {
  key: string;
  vignetteId: string;
  source: Source;
  status: "in-progress" | "complete" | "failed";
  state: ScreeningState | null;
  memory: ParticipantMemory;
  participant: ParticipantTurn[];
  /**
   * A simulated reply the agent has not yet taken, because its turn failed.
   * Saved so the failure can be diagnosed, and reused on resume so a resumed
   * conversation receives exactly what the failed attempt did.
   */
  pendingReply?: {
    message: string;
    usedFacts: string[];
    instruction: string | null;
    memory: ParticipantMemory;
  };
  /** Whether the model fidelity pass has run over every participant turn. */
  fidelityChecked: boolean;
  timing: Timing;
  result?: ScreeningResult;
  error?: string;
}

export interface ParticipantTurn {
  /** Transcript index of the participant's message. */
  turn: number;
  usedFacts: string[];
  instruction: string | null;
  flags: FidelityFlag[];
  modelChecked: boolean;
}

export interface Timing {
  agentMs: number;
  participantMs: number;
  fidelityMs: number;
  agentCalls: number;
  participantCalls: number;
  fidelityCalls: number;
}

export interface ConversationOutcome {
  vignetteId: string;
  nctId: string;
  source: Source;
  status: "graded" | "failed" | "not-run";
  timing?: Timing;
  questions?: number;
  labels?: ConversationGrade;
  parse?: ParseRunGrade;
  flaggedTurns?: Array<{ turn: number; text: string; flags: FidelityFlag[] }>;
  error?: string;
}

export interface ScreeningRun {
  startedAt: string;
  finishedAt: string;
  model: string;
  quantization: string;
  temperature: number | null;
  seed: number | null;
  adapter: string;
  /** "off" when the model's reasoning mode was switched off; absent means the runtime default. */
  thinking?: "off";
  /** Why temperature or seed is null, when one is (slice 0008). */
  unset?: NonNullable<ModelDescriptor["unset"]>;
  seedGuarantee?: NonNullable<ModelDescriptor["seedGuarantee"]>;
  promptVersion: string;
  simulatorVersion: string;
  /**
   * The identity of the parses conversations from parses were screened from
   * (slice 0011). Absent on runs made before it, and on runs from labels only.
   */
  parseIdentity?: string;
  graderVersion: string;
  vignetteSetHash: string;
  dev: boolean;
  conversations: ConversationOutcome[];
  pooled: {
    labels: ScreeningScore;
    parse: { scored: ScreeningScore; categories: Record<string, number> };
  };
  failed: string[];
  /** Present when the run stopped early, with why. */
  stopped?: string;
  /**
   * The simulated participant's and the fidelity check's models, when they
   * differ from the agent's (slice 0008). Absent means all three ran on the
   * agent's model, which is how every run before 0008 was made.
   */
  participantModel?: RoleModel;
  fidelityModel?: RoleModel;
  /** What each frontier role spent, at catalog prices. Absent for a local run. */
  spend?: Partial<Record<"agent" | "participant" | "fidelity", Spent>>;
}

/** The part of a descriptor a run records for a role other than the agent. */
export type RoleModel = Pick<
  ModelDescriptor,
  "model" | "quantization" | "temperature" | "seed" | "adapter"
> &
  Partial<Pick<ModelDescriptor, "thinking" | "unset" | "seedGuarantee">>;

export async function runScreening(options: ScreeningRunOptions): Promise<ScreeningRun> {
  const dev = options.dev === true;
  const resultsDir = join(options.resultsDir ?? DEFAULT_RESULTS_DIR, dev ? "dev" : "");
  const conversationsDir = join(options.resultsDir ?? DEFAULT_RESULTS_DIR, "conversations");
  mkdirSync(conversationsDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  const report = options.onProgress ?? (() => {});
  const labelsFor = options.labels ?? ((nctId: string) => loadLabelSet(nctId));
  const sources = options.sources ?? ["labels", "parse"];
  const vignettes = (options.vignettes ?? loadVignettes())
    .filter((v) => v.dev === dev)
    .filter((v) => options.studies === undefined || options.studies.includes(v.nctId));

  const roles: Roles = {
    agent: options.agent,
    participant: options.participant ?? options.agent,
    fidelity: options.fidelity ?? options.agent,
  };
  const agent = timed(roles.agent);
  const participant = timed(roles.participant);
  const fidelity = timed(roles.fidelity);

  const startedAt = monthStamp();
  const runFile = join(resultsDir, nextRunFile(resultsDir, PROMPT_VERSION));
  const outcomes: ConversationOutcome[] = [];
  let consecutiveConnectionFailures = 0;
  let stopped: string | undefined;

  for (const source of sources) {
    for (const vignette of vignettes) {
      if (stopped !== undefined) {
        outcomes.push({
          vignetteId: vignette.id,
          nctId: vignette.nctId,
          source,
          status: "not-run",
        });
        continue;
      }

      const outcome = await runConversation(vignette, source, {
        agent,
        participant,
        fidelity,
        labels: labelsFor(vignette.nctId),
        conversationsDir,
        parsesDir: options.parsesDir ?? DEFAULT_PARSES_DIR,
        refresh: options.refresh === true,
        report,
      });
      outcomes.push(outcome.outcome);

      consecutiveConnectionFailures = outcome.connectionFailure
        ? consecutiveConnectionFailures + 1
        : 0;
      if (outcome.budgetStop === true) {
        // The budget is spent: every further call would be refused. Stop now,
        // leaving this conversation resumable as an outage would.
        stopped =
          `the budget was reached (${outcome.outcome.error?.split("\n")[1]?.trim() ?? "cap"}). ` +
          "Finished and partial conversations resume from where they stopped on the next run.";
        report(`STOPPING: ${stopped}`);
      } else if (consecutiveConnectionFailures >= 2) {
        stopped =
          "two consecutive connection failures reaching the model. Check the server's health " +
          "endpoint (for oMLX, http://127.0.0.1:8000/health) and rerun; finished and partial " +
          "conversations resume from where they stopped.";
        report(`STOPPING: ${stopped}`);
      }

      // Written after every conversation, so a crash costs nothing already done.
      writeRun(runFile, buildRun(startedAt, roles, vignettes, outcomes, dev, stopped));
    }
  }

  const run = buildRun(startedAt, roles, vignettes, outcomes, dev, stopped);
  writeRun(runFile, run);
  return run;
}

interface ConversationContext {
  agent: TimedAdapter;
  participant: TimedAdapter;
  fidelity: TimedAdapter;
  labels: LabelSet;
  conversationsDir: string;
  parsesDir: string;
  refresh: boolean;
  report: (message: string) => void;
}

async function runConversation(
  vignette: Vignette,
  source: Source,
  ctx: ConversationContext,
): Promise<{ outcome: ConversationOutcome; connectionFailure: boolean; budgetStop?: boolean }> {
  const base = { vignetteId: vignette.id, nctId: vignette.nctId, source };
  const key = conversationKey(
    vignette.id,
    source,
    ctx.agent.descriptor,
    { participant: ctx.participant.descriptor, fidelity: ctx.fidelity.descriptor },
    {
      prompt: PROMPT_VERSION,
      simulator: SIMULATOR_VERSION,
      ...(source === "parse" ? { parse: parseIdentity({}) } : {}),
    },
  );
  const path = join(ctx.conversationsDir, key);

  let parsedInput: ReturnType<typeof fromParse> | undefined;
  let parsed: ParsedCriteria | undefined;
  let criteria: ScreeningCriterion[];
  try {
    if (source === "parse") {
      parsed = readParse(vignette.nctId, ctx.parsesDir, ctx.agent.descriptor);
      parsedInput = fromParse(parsed);
      criteria = parsedInput.criteria;
    } else {
      criteria = fromLabels(ctx.labels);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.report(`${vignette.id} (${source}): FAILED — ${message.split("\n")[0]}`);
    return { outcome: { ...base, status: "failed", error: message }, connectionFailure: false };
  }

  const file: ConversationFile =
    (ctx.refresh ? undefined : readConversation(path)) ?? freshConversation(key, vignette, source);
  ctx.agent.reset();
  ctx.participant.reset();
  ctx.fidelity.reset();

  try {
    if (file.status !== "complete") {
      ctx.report(`${vignette.id} (${source}): ${file.state === null ? "starting" : "resuming"}`);
      await converse(vignette, criteria, file, path, ctx);
    }
    if (!file.fidelityChecked) {
      await checkFidelity(vignette, file, path, ctx);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    file.status = file.status === "complete" ? "complete" : "failed";
    file.error = message;
    addTiming(file, ctx);
    writeConversation(path, file);
    ctx.report(`${vignette.id} (${source}): FAILED — ${message.split("\n")[0]}`);
    return {
      outcome: { ...base, status: "failed", error: message, timing: file.timing },
      connectionFailure: isConnectionFailure(error),
      budgetStop: isBudgetStop(error),
    };
  }

  const result = file.result;
  if (result === undefined) {
    return {
      outcome: { ...base, status: "failed", error: "conversation finished without a result" },
      connectionFailure: false,
    };
  }

  const flagged = file.participant.filter((p) => p.flags.length > 0);
  const flaggedTurns = new Map(flagged.map((p) => [p.turn, new Set(p.usedFacts)]));
  const outcome: ConversationOutcome = {
    ...base,
    status: "graded",
    timing: file.timing,
    questions: result.transcript.filter((t) => t.kind === "question").length,
    flaggedTurns: flagged.map((p) => ({
      turn: p.turn,
      text: result.transcript[p.turn]?.text ?? "",
      flags: p.flags,
    })),
  };

  if (source === "labels") {
    outcome.labels = gradeConversation(result.findings, result.transcript, vignette, flaggedTurns);
  } else if (parsed !== undefined && parsedInput !== undefined) {
    outcome.parse = gradeParseRun(
      parsed,
      parsedInput.ids,
      ctx.labels,
      result.findings,
      result.transcript,
      vignette,
      flaggedTurns,
    );
  }

  const s = outcome.labels?.score ?? outcome.parse?.scored.score;
  ctx.report(
    `${vignette.id} (${source}): ${outcome.questions} questions, ` +
      `${Math.round((file.timing.agentMs + file.timing.participantMs) / 1000)}s` +
      (s === undefined
        ? ""
        : `, confidently wrong ${s.confidentlyWrong}/${s.determinations}, ` +
          `abstained ${s.abstained}/${s.answerable}`),
  );
  return { outcome, connectionFailure: false };
}

/** Runs the conversation to its end, saving after every turn. Mutates `file`. */
async function converse(
  vignette: Vignette,
  criteria: readonly ScreeningCriterion[],
  file: ConversationFile,
  path: string,
  ctx: ConversationContext,
): Promise<void> {
  let session: ScreeningSession;
  if (file.state === null || file.state.transcript.length === 0) {
    session = ScreeningSession.create(studyContext(vignette.nctId), criteria, ctx.agent);
    await session.start();
    file.state = session.state();
    file.status = "in-progress";
    save(file, path, ctx);
  } else {
    session = ScreeningSession.fromState(file.state, ctx.agent);
  }

  while (!session.done) {
    const transcript = session
      .state()
      .transcript.map((t) => ({ speaker: t.speaker, text: t.text }));
    const reply =
      file.pendingReply ??
      (await simulate(vignette, ctx.labels, transcript, file.memory, ctx.participant));
    file.pendingReply = reply;
    save(file, path, ctx);
    const turn = session.state().transcript.length;

    const next = await session.receive(reply.message);
    delete file.pendingReply;

    // Kept only once the agent has taken the reply: a failure above leaves the
    // participant's memory unchanged, so a resumed run asks it again cleanly.
    file.memory = reply.memory;
    file.participant.push({
      turn,
      usedFacts: reply.usedFacts,
      instruction: reply.instruction,
      flags: deterministicFlags(vignette, reply.message, reply.usedFacts),
      modelChecked: false,
    });
    file.state = session.state();
    if (next.kind === "done") {
      file.result = next.result;
      file.status = "complete";
    }
    save(file, path, ctx);
  }
}

/** The local-model read of every participant turn, saved as it goes. Mutates `file`. */
async function checkFidelity(
  vignette: Vignette,
  file: ConversationFile,
  path: string,
  ctx: ConversationContext,
): Promise<void> {
  const transcript = file.result?.transcript ?? [];
  for (const p of file.participant) {
    if (p.modelChecked) {
      continue;
    }
    const flag = await modelFidelityCheck(vignette, transcript[p.turn]?.text ?? "", ctx.fidelity);
    if (flag !== null) {
      p.flags.push(flag);
    }
    p.modelChecked = true;
    save(file, path, ctx);
  }
  file.fidelityChecked = true;
  save(file, path, ctx);
}

function save(file: ConversationFile, path: string, ctx: ConversationContext): void {
  addTiming(file, ctx);
  writeConversation(path, file);
}

function addTiming(file: ConversationFile, ctx: ConversationContext): void {
  const t = file.timing;
  const take = (a: TimedAdapter) => a.drain();
  const agent = take(ctx.agent);
  const participant = take(ctx.participant);
  const fidelity = take(ctx.fidelity);
  t.agentMs += agent.ms;
  t.agentCalls += agent.calls;
  t.participantMs += participant.ms;
  t.participantCalls += participant.calls;
  t.fidelityMs += fidelity.ms;
  t.fidelityCalls += fidelity.calls;
}

function freshConversation(key: string, vignette: Vignette, source: Source): ConversationFile {
  return {
    key,
    vignetteId: vignette.id,
    source,
    status: "in-progress",
    state: null,
    memory: freshMemory(),
    participant: [],
    fidelityChecked: false,
    timing: {
      agentMs: 0,
      participantMs: 0,
      fidelityMs: 0,
      agentCalls: 0,
      participantCalls: 0,
      fidelityCalls: 0,
    },
  };
}

/**
 * A conversation is keyed by everything that shapes it: the vignette, the
 * input, the model, both prompt versions and the seed. A change to any of
 * them is a different experiment and misses the cache.
 */
export function conversationKey(
  vignetteId: string,
  source: Source,
  descriptor: ModelAdapter["descriptor"],
  others: { participant?: ModelDescriptor; fidelity?: ModelDescriptor } = {},
  /**
   * The versions a conversation was made with. Defaults to this code's, which
   * is what the runner wants; a reader of an older run passes that run's
   * recorded versions to find its files (slice 0009).
   *
   * `parse` names the parse a conversation from a parse was screened from
   * (slice 0011). Without it, a parser change left the key unchanged, and a
   * finished conversation from the old parse was reused and graded against the
   * new one. It's added only when given, so runs recorded before 0011, which
   * have none, are found under the names they were made with.
   */
  versions: { prompt: string; simulator: string; parse?: string } = {
    prompt: PROMPT_VERSION,
    simulator: SIMULATOR_VERSION,
  },
): string {
  // Added only when a role ran on a different model from the agent (slice
  // 0008), so every key made before stays exactly as it was, and a
  // conversation simulated by another participant is never resumed as if it
  // were the same one.
  const other = (role: string, d: ModelDescriptor | undefined) =>
    d === undefined || d.model === descriptor.model ? [] : [`${role}-${d.model}`];
  const parts = [
    vignetteId,
    source,
    descriptor.model,
    versions.prompt,
    versions.simulator,
    String(descriptor.seed),
    ...(descriptor.thinking === undefined ? [] : [`thinking-${descriptor.thinking}`]),
    ...other("participant", others.participant),
    ...other("fidelity", others.fidelity),
    ...(source === "parse" && versions.parse !== undefined ? [`parse-${versions.parse}`] : []),
  ];
  return `${parts.map((p) => p.replace(/[^A-Za-z0-9._-]/g, "_")).join("-")}.json`;
}

function readConversation(path: string): ConversationFile | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, "utf8")) as ConversationFile;
}

function writeConversation(path: string, file: ConversationFile): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

function readParse(
  nctId: string,
  parsesDir: string,
  descriptor: ModelAdapter["descriptor"],
): ParsedCriteria {
  // The parse this model makes at the parser's default reasoning mode, not the
  // agent's: the agent runs with reasoning off, the parser doesn't.
  const path = join(
    parsesDir,
    parseCacheKey(nctId, { model: descriptor.model, seed: descriptor.seed }),
  );
  if (!existsSync(path)) {
    throw new Error(
      `no cached parse for ${nctId} at ${path}. This runner never parses; ` +
        `run \`npm run eval -- ${nctId}\` to create it.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as ParsedCriteria;
}

interface Roles {
  agent: ModelAdapter;
  participant: ModelAdapter;
  fidelity: ModelAdapter;
}

function buildRun(
  startedAt: string,
  roles: Roles,
  vignettes: readonly Vignette[],
  outcomes: readonly ConversationOutcome[],
  dev: boolean,
  stopped: string | undefined,
): ScreeningRun {
  const adapter = roles.agent;
  const graded = outcomes.filter((o) => o.status === "graded");
  const categories: Record<string, number> = {};
  for (const o of graded) {
    for (const [k, v] of Object.entries(o.parse?.categories ?? {})) {
      categories[k] = (categories[k] ?? 0) + v;
    }
  }

  return {
    startedAt,
    finishedAt: monthStamp(),
    model: adapter.descriptor.model,
    quantization: adapter.descriptor.quantization,
    temperature: adapter.descriptor.temperature,
    seed: adapter.descriptor.seed,
    adapter: adapter.descriptor.adapter,
    ...(adapter.descriptor.thinking === undefined ? {} : { thinking: adapter.descriptor.thinking }),
    ...unsetReasons(adapter.descriptor),
    promptVersion: PROMPT_VERSION,
    simulatorVersion: SIMULATOR_VERSION,
    ...(outcomes.some((o) => o.source === "parse") ? { parseIdentity: parseIdentity({}) } : {}),
    graderVersion: SCREENING_GRADER_VERSION,
    vignetteSetHash: vignetteSetHash(vignettes),
    dev,
    conversations: [...outcomes],
    pooled: {
      labels: poolScores(graded.flatMap((o) => (o.labels === undefined ? [] : [o.labels.score]))),
      parse: {
        scored: poolScores(
          graded.flatMap((o) => (o.parse === undefined ? [] : [o.parse.scored.score])),
        ),
        categories,
      },
    },
    failed: outcomes
      .filter((o) => o.status !== "graded")
      .map((o) => `${o.vignetteId} (${o.source}): ${o.status}`),
    ...(stopped === undefined ? {} : { stopped }),
    ...otherRole("participantModel", roles.participant, adapter),
    ...otherRole("fidelityModel", roles.fidelity, adapter),
    ...spendOf(roles),
  };
}

function otherRole(
  field: "participantModel" | "fidelityModel",
  role: ModelAdapter,
  agent: ModelAdapter,
): Partial<Record<typeof field, RoleModel>> {
  if (role.descriptor.model === agent.descriptor.model) {
    return {};
  }
  const d = role.descriptor;
  return {
    [field]: {
      model: d.model,
      quantization: d.quantization,
      temperature: d.temperature,
      seed: d.seed,
      adapter: d.adapter,
      ...(d.thinking === undefined ? {} : { thinking: d.thinking }),
      ...unsetReasons(d),
    },
  };
}

function spendOf(roles: Roles): Pick<ScreeningRun, "spend"> {
  const spend: NonNullable<ScreeningRun["spend"]> = {};
  for (const role of ["agent", "participant", "fidelity"] as const) {
    const spent = spentBy(roles[role]);
    // A role sharing the agent's adapter is the same spend; count it once.
    if (spent !== undefined && (role === "agent" || roles[role] !== roles.agent)) {
      spend[role] = spent;
    }
  }
  return Object.keys(spend).length === 0 ? {} : { spend };
}

/** Pins a result to the exact vignettes it was graded against. */
export function vignetteSetHash(vignettes: readonly Vignette[]): string {
  const hash = createHash("sha256");
  for (const v of [...vignettes].sort((a, b) => a.id.localeCompare(b.id))) {
    hash.update(JSON.stringify(v));
  }
  return hash.digest("hex").slice(0, 12);
}

function writeRun(path: string, run: ScreeningRun): void {
  writeFileSync(path, `${JSON.stringify(forCommit(run), null, 2)}\n`, "utf8");
}

/**
 * The run as committed: every number, and every finding that was not correct
 * with the words behind it, but not the hundreds of correct outcomes and
 * flagged-turn texts nobody reads. The full run came to 344 KB; 0003 trimmed
 * its results for the same reason. Everything dropped is reproducible from
 * the local conversation cache with `npm run screening:show`.
 */
export function forCommit(run: ScreeningRun): unknown {
  const trimGrade = (g: ConversationGrade | undefined) =>
    g === undefined
      ? undefined
      : {
          score: g.score,
          reported: g.reported,
          discipline: g.discipline,
          notCorrect: g.outcomes.filter(
            (o) => o.outcome !== "correct" && o.outcome !== "correct-abstention",
          ),
        };

  return {
    ...run,
    conversations: run.conversations.map((c) => ({
      vignetteId: c.vignetteId,
      nctId: c.nctId,
      source: c.source,
      status: c.status,
      ...(c.timing === undefined ? {} : { timing: c.timing }),
      ...(c.questions === undefined ? {} : { questions: c.questions }),
      ...(c.labels === undefined ? {} : { labels: trimGrade(c.labels) }),
      ...(c.parse === undefined
        ? {}
        : {
            parse: {
              categories: c.parse.categories,
              entries: c.parse.entries.filter((e) => e.category !== "scored"),
              scored: trimGrade(c.parse.scored),
            },
          }),
      flaggedTurns: c.flaggedTurns?.length ?? 0,
      ...(c.error === undefined ? {} : { error: c.error }),
    })),
  };
}

/** An adapter that records how long its calls took. */
interface TimedAdapter extends ModelAdapter {
  reset(): void;
  drain(): { ms: number; calls: number };
}

function timed(inner: ModelAdapter): TimedAdapter {
  let ms = 0;
  let calls = 0;
  return {
    descriptor: inner.descriptor,
    async complete(request) {
      const started = performance.now();
      try {
        return await inner.complete(request);
      } finally {
        ms += performance.now() - started;
        calls += 1;
      }
    },
    reset() {
      ms = 0;
      calls = 0;
    },
    drain() {
      const out = { ms: Math.round(ms), calls };
      ms = 0;
      calls = 0;
      return out;
    },
  };
}
