import type { ModelAdapter } from "../models/index.js";
import { isConnectionFailure, ModelError } from "../models/index.js";
import type { PlainDisplay } from "../plain/types.js";
import type { AgentReply, ScreeningResult, ScreeningState, Turn } from "../screening/index.js";
import { ScreeningError, ScreeningSession } from "../screening/index.js";
import type { ChannelMessage, ChannelStatus, MessageTransport } from "../transport/index.js";
import type { AgentSource } from "./models.js";
import { hostedOf } from "./settings.js";
import type { ConversationStore, PendingMessage, SavedConversation } from "./store.js";
import type {
  ConversationInspection,
  ConversationOrigin,
  ConversationReview,
  CriteriaSource,
  FinishedConversation,
  ServedStudy,
} from "./types.js";

/**
 * The running conversations, and the only code that calls `ScreeningSession`.
 *
 * It holds a `MessageTransport` and nothing more specific (spec §9.2). A turn
 * runs in the background: the transport has already told the participant the
 * agent is working, and the reply is delivered when it is ready. The session
 * is atomic, so a turn that fails leaves the conversation exactly where it
 * was, and the same message can be taken again.
 *
 * With a store, every change is saved as it happens (when a message is
 * accepted, and when a turn ends either way), and whatever was saved is back
 * on the channel when the server starts again.
 */

export const MODEL_UNAVAILABLE =
  "The model isn't responding. Check that oMLX is running " +
  "(http://127.0.0.1:8000/health), then send again.";

export const RESTARTED = "The server restarted before this message was processed. Send it again.";

const UNEXPECTED = "Something went wrong on the server.";

interface Live {
  id: string;
  vignetteId: string;
  source: CriteriaSource;
  session: ScreeningSession;
  /** The model it started on (slice 0017): `"omlx"`, `"anthropic:claude-haiku-4-5"`, or `"fixed"`. */
  model: string;
  /** Its adapter, from `agent.forConversation(model)`, kept so its spend can be read. */
  adapter: ModelAdapter;
  /** The participant message the agent has not taken yet, and what happened to it. */
  pending: PendingMessage | null;
  /** The turn in flight, if any. */
  turn: Promise<void> | null;
  result: ScreeningResult | undefined;
  updatedAt: Date;
}

/** One line of the start page's list. */
export interface ConversationSummary {
  id: string;
  nctId: string;
  /** The trial's title, kept by the conversation itself, so it outlives a removed trial (slice 0014). */
  title: string;
  source: CriteriaSource;
  origin: ConversationOrigin;
  turns: number;
  done: boolean;
  updatedAt: string;
}

/** What deleting a conversation did (slice 0014). */
export type RemoveOutcome =
  | { kind: "removed" }
  | { kind: "unknown" }
  /** An eval-run conversation: the project's committed test material. */
  | { kind: "read-only" }
  /** The agent is working on it; delete once it has replied. */
  | { kind: "busy" };

/** What `review(id)` found. Never a partial result. */
export type ReviewLookup =
  | { kind: "ok"; review: ConversationReview }
  | { kind: "unknown" }
  | { kind: "not-finished" }
  /** Done, but saved by a build that did not keep the result. */
  | { kind: "no-result" };

export interface ConversationServiceOptions {
  studies: readonly ServedStudy[];
  source: CriteriaSource;
  /**
   * Where each screening's model comes from (slice 0017): Settings' choice,
   * or one fixed adapter for the scripted agent and tests. A screening keeps
   * the model it started on.
   */
  agent: AgentSource;
  transport: MessageTransport;
  /** Where conversations are saved. Without one, they live only as long as the process. */
  store?: ConversationStore;
  /** For ids. Injected so tests can pin the clock. */
  now?: () => Date;
  /** Where unexpected errors go. The participant sees only a generic line. */
  logError?: (error: unknown) => void;
  /**
   * Conversations that finished elsewhere, served for review only (0007 spec
   * §5.3): never on the transport, never saved, never continued.
   */
  finished?: readonly FinishedConversation[];
}

export class ConversationService {
  readonly #studies: Map<string, ServedStudy>;
  readonly #live = new Map<string, Live>();
  readonly #finished: Map<string, FinishedConversation>;
  readonly #options: ConversationServiceOptions;

  constructor(options: ConversationServiceOptions) {
    this.#options = options;
    this.#studies = new Map(options.studies.map((s) => [s.study.nctId, s]));
    this.#finished = new Map((options.finished ?? []).map((f) => [f.id, f]));
    options.transport.onMessage(({ conversationId, text }) => {
      this.#take(conversationId, text);
    });
    options.transport.onRetry((conversationId) => {
      this.#takeAgain(conversationId);
    });
    for (const saved of options.store?.list() ?? []) {
      this.#restore(saved.id, saved.record, saved.updatedAt);
    }
  }

  get source(): CriteriaSource {
    return this.#options.source;
  }

  studies(): ServedStudy[] {
    return [...this.#studies.values()];
  }

  /**
   * Serves a study, or replaces the one served under its ID (slice 0013: a
   * trial added by link, or refreshed). A conversation already started keeps
   * the criteria it was created with, which live in its own state.
   */
  serve(study: ServedStudy): void {
    this.#studies.set(study.study.nctId, study);
  }

  /** Stops offering a study. Conversations made from it carry on and stay reviewable. */
  unserve(nctId: string): void {
    this.#studies.delete(nctId);
  }

  /** Starts a conversation; the opening arrives through the transport. */
  start(nctId: string): string {
    const served = this.#studies.get(nctId);
    if (served === undefined) {
      throw new ScreeningError("Cannot start a conversation", [`no study ${nctId} is served`]);
    }
    const id = this.#newId(nctId);
    const model = this.#options.agent.current();
    const adapter = this.#options.agent.forConversation(model);
    const live: Live = {
      id,
      vignetteId: `web ${nctId}`,
      source: served.source ?? this.#options.source,
      session: ScreeningSession.create(served.study, served.criteria, adapter),
      model,
      adapter,
      pending: null,
      turn: null,
      result: undefined,
      updatedAt: this.#now(),
    };
    this.#live.set(id, live);
    this.#options.transport.open(id, [], "working");
    this.#save(live);
    this.#run(live, () => live.session.start());
    return id;
  }

  /**
   * Every conversation, saved or new, most recently changed first, then the
   * finished ones served for review only.
   */
  list(): ConversationSummary[] {
    const live = [...this.#live.values()]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((live) => {
        const state = live.session.state();
        return {
          id: live.id,
          nctId: state.study.nctId,
          title: state.study.briefTitle,
          source: live.source,
          origin: "conversation" as const,
          turns: state.transcript.length,
          done: state.done,
          updatedAt: live.updatedAt.toISOString(),
        };
      });
    const finished = [...this.#finished.values()].map((f) => ({
      id: f.id,
      nctId: f.result.study.nctId,
      title: f.result.study.briefTitle,
      source: f.source,
      origin: "eval-run" as const,
      turns: f.result.transcript.length,
      done: true,
      updatedAt: f.result.run.timestamp,
    }));
    return [...live, ...finished];
  }

  has(id: string): boolean {
    return this.#live.has(id);
  }

  inspect(id: string): ConversationInspection | undefined {
    const live = this.#live.get(id);
    if (live === undefined) {
      return undefined;
    }
    const state = live.session.state();
    return {
      id,
      study: state.study,
      source: live.source,
      criteria: state.criteria,
      plain: this.#plainFor(live),
      progress: state.progress,
      pending: state.pending,
      done: state.done,
      calls: state.calls,
      spent: this.#options.agent.spending(live.adapter),
      hosted: hostedOf(live.model),
    };
  }

  /**
   * A finished conversation for the coordinator review (0007 spec §4): the
   * result as the session produced it, with the criteria and renderings it
   * needs to be read. Before the end, only that it has not finished.
   */
  review(id: string): ReviewLookup {
    const finished = this.#finished.get(id);
    if (finished !== undefined) {
      const { source, criteria, plain, result } = finished;
      return { kind: "ok", review: { id, origin: "eval-run", source, criteria, plain, result } };
    }
    const live = this.#live.get(id);
    if (live === undefined) {
      return { kind: "unknown" };
    }
    const state = live.session.state();
    if (!state.done) {
      return { kind: "not-finished" };
    }
    if (live.result === undefined) {
      return { kind: "no-result" };
    }
    return {
      kind: "ok",
      review: {
        id,
        origin: "conversation",
        source: live.source,
        criteria: state.criteria,
        plain: this.#plainFor(live),
        result: live.result,
      },
    };
  }

  /** Everything needed to resume, as plain JSON. */
  state(id: string): ScreeningState | undefined {
    return this.#live.get(id)?.session.state();
  }

  /** The finished result, once the conversation is done. */
  result(id: string): ScreeningResult | undefined {
    return this.#live.get(id)?.result;
  }

  /**
   * Deletes one of the person's own conversations: from memory, from disk
   * and from the channel (slice 0014). Not one in the middle of a turn, and
   * never an eval-run conversation, which is served read-only.
   */
  remove(id: string): RemoveOutcome {
    if (this.#finished.has(id)) {
      return { kind: "read-only" };
    }
    const live = this.#live.get(id);
    if (live === undefined) {
      return { kind: "unknown" };
    }
    if (live.turn !== null) {
      return { kind: "busy" };
    }
    this.#options.agent.release(live.adapter);
    this.#live.delete(id);
    this.#options.store?.remove(id);
    this.#options.transport.close(id);
    return { kind: "removed" };
  }

  /** Resolves when no turn is in flight. For tests, and for shutting down cleanly. */
  async settled(id: string): Promise<void> {
    await this.#live.get(id)?.turn;
  }

  #take(id: string, text: string): void {
    const live = this.#require(id);
    live.pending = { text, status: "working" };
    this.#save(live);
    this.#run(live, () => live.session.receive(text));
  }

  #takeAgain(id: string): void {
    const live = this.#require(id);
    const pending = live.pending;
    if (pending === null) {
      // Nothing was sent, so what failed was the opening.
      this.#run(live, () => live.session.start());
      return;
    }
    live.pending = { text: pending.text, status: "working" };
    this.#save(live);
    this.#run(live, () => live.session.receive(pending.text));
  }

  /**
   * Runs one step in the background. Never two at once for one conversation:
   * the transport refuses a message while `working`, and this throws if that
   * ever fails, because a second concurrent `receive()` would fork the state.
   */
  #run(live: Live, step: () => Promise<AgentReply>): void {
    if (live.turn !== null) {
      throw new Error(`conversation ${live.id} already has a turn in flight`);
    }
    const { transport } = this.#options;
    live.turn = (async () => {
      try {
        const reply = await step();
        live.pending = null;
        if (reply.kind === "done") {
          live.result = reply.result;
        }
        this.#save(live);
        transport.deliver(live.id, reply.text);
        transport.setStatus(live.id, reply.kind === "done" ? "done" : "idle");
      } catch (error) {
        const { status, detail } = this.#describe(error);
        if (live.pending !== null) {
          live.pending = { text: live.pending.text, status, detail };
        }
        this.#save(live);
        transport.setStatus(live.id, status, detail);
      } finally {
        // Every turn's spend reaches the ledger as it goes (slice 0017, gate 2).
        this.#options.agent.release(live.adapter);
        live.turn = null;
      }
    })();
  }

  /**
   * Puts a saved conversation back on the channel. A message that was being
   * worked on when the server stopped comes back as not processed, so the
   * person can send it again; nothing is silently retried.
   */
  #restore(id: string, record: SavedConversation, updatedAt: Date): void {
    // Saved before slice 0017, a conversation could only have run on the local model.
    const model = record.model ?? "omlx";
    const adapter = this.#options.agent.forConversation(model);
    const session = ScreeningSession.fromState(record.state, adapter);
    const state = session.state();
    let pending = record.pending ?? null;
    if (pending?.status === "working") {
      pending = { text: pending.text, status: "failed", detail: RESTARTED };
    }
    const live: Live = {
      id,
      vignetteId: record.vignetteId,
      source: record.source,
      session,
      model,
      adapter,
      pending,
      turn: null,
      result: record.result,
      updatedAt,
    };
    this.#live.set(id, live);

    const history = channelHistory(state.transcript);
    let status: ChannelStatus = state.done ? "done" : "idle";
    let detail: string | undefined;
    if (pending !== null) {
      history.push({ from: "participant", text: pending.text });
      status = pending.status === "unavailable" ? "unavailable" : "failed";
      detail = pending.detail;
    } else if (state.transcript.length === 0) {
      // Started, but the opening never arrived.
      status = "failed";
      detail = RESTARTED;
    }
    this.#options.transport.open(id, history, status, detail);
  }

  /**
   * Saves, and never throws. A save that fails is logged and the conversation
   * goes on: the session has already moved, and reporting its turn as failed
   * would offer the same message to be taken twice.
   */
  #save(live: Live): void {
    live.updatedAt = this.#now();
    const { store } = this.#options;
    if (store === undefined) {
      return;
    }
    try {
      this.#write(store, live);
    } catch (error) {
      this.#options.logError?.(error);
    }
  }

  #write(store: ConversationStore, live: Live): void {
    store.save(live.id, {
      vignetteId: live.vignetteId,
      source: live.source,
      model: live.model,
      state: live.session.state(),
      ...(live.result === undefined ? {} : { result: live.result }),
      ...(live.pending === null ? {} : { pending: live.pending }),
    });
  }

  #describe(error: unknown): { status: "unavailable" | "failed"; detail: string } {
    if (isConnectionFailure(error)) {
      return { status: "unavailable", detail: MODEL_UNAVAILABLE };
    }
    if (error instanceof ModelError || error instanceof ScreeningError) {
      return { status: "failed", detail: error.problems[0] ?? error.message };
    }
    this.#options.logError?.(error);
    return { status: "failed", detail: UNEXPECTED };
  }

  /**
   * `<nctId>-<yyyymmddThhmmss>`, the id `npm run screening:chat` gives its
   * files, so the two share `chats/`. Two starts in one second take the next
   * free second rather than collide, with a saved conversation or a new one.
   */
  #newId(nctId: string): string {
    const now = this.#now();
    for (let offset = 0; ; offset++) {
      const stamp = new Date(now.getTime() + offset * 1000)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..*$/, "");
      const id = `${nctId}-${stamp}`;
      if (!this.#live.has(id)) {
        return id;
      }
    }
  }

  /**
   * Renderings are made from labelled criteria. A conversation restored from
   * chats/ keeps the source it was made with, so one made from parses never
   * picks up a label's rendering through a shared id.
   */
  #plainFor(live: Live): Record<string, PlainDisplay> {
    const nctId = live.session.state().study.nctId;
    return live.source === "labels" ? (this.#studies.get(nctId)?.plain ?? {}) : {};
  }

  #now(): Date {
    return (this.#options.now ?? (() => new Date()))();
  }

  #require(id: string): Live {
    const live = this.#live.get(id);
    if (live === undefined) {
      throw new Error(`no conversation ${id}`);
    }
    return live;
  }
}

/**
 * The channel's messages rebuilt from a transcript. The opening and first
 * question are two turns but were delivered as one message, as `start()`
 * returns them, so consecutive agent turns are joined the same way.
 */
export function channelHistory(transcript: readonly Turn[]): ChannelMessage[] {
  const messages: ChannelMessage[] = [];
  for (const turn of transcript) {
    const last = messages.at(-1);
    if (turn.speaker === "agent" && last?.from === "agent") {
      last.text = `${last.text}\n\n${turn.text}`;
    } else {
      messages.push({ from: turn.speaker, text: turn.text });
    }
  }
  return messages;
}
