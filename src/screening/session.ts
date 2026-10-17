import { type ModelAdapter, monthStamp } from "../models/index.js";
import { initialProgress, nextCriterion, raisability } from "./agenda.js";
import { applyReadings, finalize } from "./apply.js";
import { ask, read } from "./calls.js";
import { type AnsweredCriterion, PROMPT_VERSION } from "./prompts.js";
import { closingMessage, openingMessage } from "./templates.js";
import type {
  Finding,
  Handoff,
  Progress,
  ScreeningCriterion,
  ScreeningResult,
  ScreeningState,
  StudyContext,
} from "./types.js";
import { ScreeningError } from "./types.js";

/**
 * One prescreening conversation.
 *
 * Push-driven: `start()` returns the agent's first message, `receive(text)`
 * takes one participant message and returns the next. It does not know where
 * messages come from — the eval runner calls it in this slice, a
 * `MessageTransport` in 0005, a person at a terminal in `screening:chat`.
 *
 * Every step is atomic. The work happens on a copy of the state and is kept
 * only if every model call succeeded, so a failure mid-turn — the local model
 * going down, a response that cannot be read twice — leaves the conversation
 * exactly where it was, and the same message can be received again.
 */

export type AgentReply =
  | { kind: "message"; text: string }
  | { kind: "done"; text: string; result: ScreeningResult };

export class ScreeningSession {
  #state: ScreeningState;
  readonly #adapter: ModelAdapter;

  private constructor(state: ScreeningState, adapter: ModelAdapter) {
    this.#state = state;
    this.#adapter = adapter;
  }

  static create(
    study: StudyContext,
    criteria: readonly ScreeningCriterion[],
    adapter: ModelAdapter,
  ): ScreeningSession {
    const ids = criteria.map((c) => c.id);
    const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
    if (duplicate !== undefined) {
      throw new ScreeningError(`Cannot screen ${study.nctId}`, [
        `duplicate criterion id ${duplicate}`,
      ]);
    }

    return new ScreeningSession(
      {
        version: 1,
        study,
        criteria: [...criteria],
        transcript: [],
        progress: initialProgress(criteria),
        pending: null,
        rejectedReadings: [],
        ignoredReadings: [],
        calls: 0,
        done: false,
      },
      adapter,
    );
  }

  /** Resumes a conversation from `state()`. */
  static fromState(state: ScreeningState, adapter: ModelAdapter): ScreeningSession {
    if (state.version !== 1) {
      throw new ScreeningError("Cannot resume a screening", [
        `state version ${String(state.version)} is not supported`,
      ]);
    }
    return new ScreeningSession(structuredClone(state), adapter);
  }

  /** Everything needed to resume, as plain JSON. A copy; changing it changes nothing here. */
  state(): ScreeningState {
    return structuredClone(this.#state);
  }

  get done(): boolean {
    return this.#state.done;
  }

  /** The opening, followed by the first question. */
  async start(): Promise<AgentReply> {
    if (this.#state.transcript.length > 0) {
      throw new ScreeningError("Cannot start a screening", ["it has already started"]);
    }
    const draft = structuredClone(this.#state);
    const opening = openingMessage(draft.study);
    draft.transcript.push({ index: 0, speaker: "agent", kind: "opening", text: opening });

    const next = await this.#advance(draft);
    this.#state = draft;
    return next.kind === "done"
      ? { ...next, text: `${opening}\n\n${next.text}` }
      : { kind: "message", text: `${opening}\n\n${next.text}` };
  }

  /** One participant message in, the next agent message out. */
  async receive(text: string): Promise<AgentReply> {
    if (this.#state.transcript.length === 0) {
      throw new ScreeningError("Cannot receive a message", ["the screening has not started"]);
    }
    if (this.#state.done) {
      throw new ScreeningError("Cannot receive a message", ["the screening has finished"]);
    }

    const draft = structuredClone(this.#state);
    const turn = draft.transcript.length;
    draft.transcript.push({ index: turn, speaker: "participant", kind: "reply", text });

    const { open, answered, saidSoFar } = this.#readable(draft);
    const readings = await read(this.#adapter, {
      transcript: draft.transcript,
      message: text,
      askedAbout: draft.pending,
      open,
      answered,
      saidSoFar,
    });
    draft.calls += readings.calls;

    const applied = applyReadings(
      { criteria: draft.criteria, progress: draft.progress, turn, message: text },
      readings.value,
    );
    draft.progress = applied.progress;
    draft.rejectedReadings.push(...applied.rejected);
    draft.ignoredReadings.push(...applied.ignored);

    const next = await this.#advance(draft);
    this.#state = draft;
    return next;
  }

  /** Asks the next question on `draft`, or closes it. Mutates `draft`. */
  async #advance(draft: ScreeningState): Promise<AgentReply> {
    const criterion = nextCriterion(draft.criteria, draft.progress);

    if (criterion === null) {
      const text = closingMessage();
      draft.transcript.push({
        index: draft.transcript.length,
        speaker: "agent",
        kind: "closing",
        text,
      });
      draft.pending = null;
      draft.done = true;
      return { kind: "done", text, result: this.#result(draft) };
    }

    const progress = draft.progress.find((p) => p.criterionId === criterion.id);
    const r = raisability(criterion);
    if (progress === undefined || !r.raise) {
      // nextCriterion only returns open, raisable criteria; reaching here is a bug.
      throw new ScreeningError("Cannot choose the next question", [`${criterion.id} is not open`]);
    }

    const followUp = progress.timesAsked > 0 ? describeFollowUp(progress) : undefined;
    const question = await ask(this.#adapter, {
      study: draft.study,
      transcript: draft.transcript,
      criterion,
      kind: r.as,
      ...(followUp === undefined ? {} : { followUp }),
    });
    draft.calls += question.calls;

    progress.timesAsked += 1;
    draft.pending = criterion.id;
    draft.transcript.push({
      index: draft.transcript.length,
      speaker: "agent",
      kind: "question",
      text: question.value,
      criterionId: criterion.id,
    });
    return { kind: "message", text: question.value };
  }

  /**
   * Raisable criteria split by whether they still await an answer. Answered
   * ones carry what was recorded and the words behind it, so the read call
   * can tell whether a reply changes it.
   */
  #readable(state: ScreeningState): {
    open: ScreeningCriterion[];
    answered: AnsweredCriterion[];
    saidSoFar: Record<string, { reading: string; quote: string }>;
  } {
    const progress = new Map(state.progress.map((p) => [p.criterionId, p]));
    const raisable = state.criteria.filter((c) => raisability(c).raise);
    const answered: Array<{ record: AnsweredCriterion; turn: number }> = [];
    const saidSoFar: Record<string, { reading: string; quote: string }> = {};
    for (const c of raisable) {
      const p = progress.get(c.id);
      if (p === undefined) {
        continue;
      }
      const turn = p.evidence.at(-1)?.turn ?? -1;
      if (p.status === "holds" || p.status === "does-not-hold") {
        answered.push({ record: recordOf(c, "recorded", p.status, p), turn });
      } else if (p.status === "chart-review") {
        answered.push({ record: recordOf(c, "reported", p.reported ?? "nothing", p), turn });
      } else if (p.status === "open") {
        const last = p.evidence.at(-1);
        if (last !== undefined) {
          saidSoFar[c.id] = { reading: last.reading, quote: last.quote };
        }
      }
    }
    return {
      open: raisable.filter((c) => progress.get(c.id)?.status === "open"),
      // Most recently answered first: a correction usually follows closely
      // on what it corrects, and a long list otherwise buries it (slice 0009).
      // A stable sort keeps protocol order among answers from one turn.
      answered: answered.sort((a, b) => b.turn - a.turn).map((a) => a.record),
      saidSoFar,
    };
  }

  #result(state: ScreeningState): ScreeningResult {
    const findings = finalize(state.criteria, state.progress, state.rejectedReadings);
    return {
      study: state.study,
      findings,
      transcript: state.transcript,
      handoff: handoff(findings),
      rejectedReadings: state.rejectedReadings,
      ignoredReadings: state.ignoredReadings,
      calls: state.calls,
      run: {
        ...this.#adapter.descriptor,
        promptVersion: PROMPT_VERSION,
        timestamp: monthStamp(),
      },
    };
  }
}

const DETERMINATE_READINGS: readonly string[] = ["holds", "does-not-hold", "does-not-apply"];

/** An answered criterion with the words behind its last determinate reading, or its last words. */
function recordOf(
  criterion: ScreeningCriterion,
  kind: AnsweredCriterion["kind"],
  value: string,
  progress: Progress,
): AnsweredCriterion {
  const evidence =
    progress.evidence.findLast((e) => DETERMINATE_READINGS.includes(e.reading)) ??
    progress.evidence.at(-1);
  return { criterion, kind, value, ...(evidence === undefined ? {} : { quote: evidence.quote }) };
}

/** What the follow-up question should target. */
function describeFollowUp(progress: Progress): string {
  const last = progress.evidence.at(-1);
  if (last?.reading === "partial") {
    return (
      `They said: "${last.quote}". Still missing: ` +
      `${last.missing ?? "the rest of the criterion"}. Ask only about that.`
    );
  }
  if (last?.reading === "unclear") {
    return `Their answer was unclear: "${last.quote}". Ask again, more specifically.`;
  }
  return "Their last reply did not answer this. Ask again, simply.";
}

function handoff(findings: readonly Finding[]): Handoff {
  const ids = (status: Finding["status"]) =>
    findings.filter((f) => f.status === status).map((f) => f.criterionId);
  return {
    holds: ids("holds"),
    doesNotHold: ids("does-not-hold"),
    unresolved: ids("unresolved"),
    chartReview: ids("chart-review"),
    notRaised: ids("not-raised"),
  };
}
