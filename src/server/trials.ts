import { parseCriteria } from "../criteria/parse.js";
import type { CriterionType } from "../criteria/types.js";
import type { ModelAdapter } from "../models/index.js";
import { fromParse } from "../screening/from-parse.js";
import type { ScreeningCriterion } from "../screening/types.js";
import { readTrialReference } from "../trials/reference.js";
import type { Trial } from "../trials/types.js";
import type { ConversationService } from "./conversations.js";
import { hostedOf } from "./settings.js";
import { type AddedTrialRecord, TrialStore } from "./trial-store.js";
import type { ServedStudy, TrialDetail, TrialRow } from "./types.js";

/**
 * The trials a person adds by link on the Trials screen (slice 0013).
 *
 * Adding one fetches it from the registry, parses its eligibility text with
 * the local model, and then serves it through the conversation service like
 * any study, with `source: "parse"`. A parse takes minutes, so jobs run one at
 * a time, in order, in the background; the screen polls `rows()`.
 *
 * The fetch and the parser are given, never chosen here: the launcher passes
 * `fetchStudy` and the model chosen in Settings (slice 0017), and fake mode
 * passes a fixture reader and a scripted parser, so nothing in fake mode or a
 * test can reach the network.
 */

export interface TrialsOptions {
  /** Where added trials are kept. Without one, they last as long as the process. */
  dir?: string;
  fetchStudy: (nctId: string) => Promise<Trial>;
  /**
   * A parser for one read (slice 0017): the model chosen in Settings at the
   * parser's defaults, built fresh so each read has its own cap, or a fake.
   * It may throw, for a hosted model with no key, and the trial then fails
   * with the reason.
   */
  parserFor: () => ModelAdapter;
  /** A read finished, however it went: log what it spent. */
  released?: (parser: ModelAdapter) => void;
  now?: () => Date;
}

/** What the library serves through: the conversation service. */
export type TrialHost = Pick<ConversationService, "studies" | "serve" | "unserve">;

export type TrialAction =
  | { kind: "accepted"; nctId: string }
  | { kind: "refused"; status: 400 | 404 | 409; error: string };

export const REFRESH_FAILED = "Refresh failed; the earlier version is still offered:";

/** How many of a trial's criteria are of each type, for "who can settle them". */
export function countByType(
  criteria: readonly Pick<ScreeningCriterion, "type">[],
): Record<CriterionType, number> {
  const counts: Record<CriterionType, number> = {
    patient: 0,
    clinical: 0,
    protocol: 0,
    definitional: 0,
  };
  for (const c of criteria) {
    counts[c.type] += 1;
  }
  return counts;
}

/** The Trials screen's read-only rows: every study served that wasn't added by link. */
export function pinnedRows(studies: readonly ServedStudy[]): TrialRow[] {
  return studies.filter((s) => s.origin !== "added").map(pinnedRow);
}

/** A pinned study's checklist, or undefined. Also what a server without a library answers. */
export function pinnedDetail(
  studies: readonly ServedStudy[],
  nctId: string,
): TrialDetail | undefined {
  const s = studies.find((x) => x.origin !== "added" && x.study.nctId === nctId);
  return s === undefined
    ? undefined
    : {
        row: pinnedRow(s),
        criteria: s.criteria,
        plain: s.plain ?? {},
        criteriaText: s.criteriaText ?? null,
      };
}

function pinnedRow(s: ServedStudy): TrialRow {
  return {
    nctId: s.study.nctId,
    origin: "pinned" as const,
    briefTitle: s.study.briefTitle,
    conditions: s.conditions ?? [],
    state: "ready" as const,
    criteria: s.criteria.length,
    dropped: null,
    problem: null,
    since: null,
    byType: countByType(s.criteria),
    readBy: null,
  };
}

export class TrialLibrary {
  readonly #options: TrialsOptions;
  readonly #host: TrialHost;
  readonly #store: TrialStore | undefined;
  readonly #records = new Map<string, AddedTrialRecord>();
  /** A trial fetched by a job still parsing, shown on its row until the parse lands. */
  readonly #fetched = new Map<string, Trial>();
  readonly #queued = new Set<string>();
  #chain: Promise<void> = Promise.resolve();

  constructor(options: TrialsOptions, host: TrialHost) {
    this.#options = options;
    this.#host = host;
    this.#store = options.dir === undefined ? undefined : new TrialStore(options.dir);
    const pinned = new Set(this.#pinned().map((s) => s.study.nctId));
    for (const record of this.#store?.list() ?? []) {
      if (pinned.has(record.nctId)) {
        continue;
      }
      this.#records.set(record.nctId, record);
      this.#serveIfParsed(record);
    }
  }

  rows(): TrialRow[] {
    const pinned = pinnedRows(this.#host.studies());
    const added = [...this.#records.values()]
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
      .map((r) => this.#row(r));
    return [...pinned, ...added];
  }

  /** A trial's checklist page: an added trial's, or a pinned one's. Undefined if not listed. */
  detail(nctId: string): TrialDetail | undefined {
    const record = this.#records.get(nctId);
    if (record === undefined) {
      return pinnedDetail(this.#host.studies(), nctId);
    }
    return {
      row: this.#row(record),
      criteria: record.parsed === null ? [] : fromParse(record.parsed).criteria,
      plain: {},
      criteriaText: (this.#fetched.get(nctId) ?? record.trial)?.eligibility.criteriaText ?? null,
    };
  }

  #row(r: AddedTrialRecord): TrialRow {
    const trial = this.#fetched.get(r.nctId) ?? r.trial;
    return {
      nctId: r.nctId,
      origin: "added",
      briefTitle: trial?.briefTitle ?? null,
      conditions: trial?.conditions ?? [],
      state: r.state,
      criteria: r.parsed?.criteria.length ?? null,
      dropped:
        r.parsed === null
          ? null
          : { rejected: r.parsed.rejected.length, unclaimed: r.parsed.unclaimed.length },
      problem: r.problem,
      since: r.updatedAt,
      byType: r.parsed === null ? null : countByType(r.parsed.criteria),
      readBy:
        r.parsed === null
          ? null
          : {
              adapter: r.parsed.run.adapter,
              model: r.parsed.run.model,
              hosted: hostedOf(`${r.parsed.run.adapter}:${r.parsed.run.model}`)?.name ?? null,
            },
    };
  }

  add(reference: string): TrialAction {
    const read = readTrialReference(reference);
    if ("problem" in read) {
      return { kind: "refused", status: 400, error: read.problem };
    }
    const { nctId } = read;
    if (this.#records.has(nctId) || this.#pinned().some((s) => s.study.nctId === nctId)) {
      return { kind: "refused", status: 409, error: `${nctId} is already listed.` };
    }
    const now = this.#now();
    this.#save({
      version: 1,
      nctId,
      state: "fetching",
      trial: null,
      parsed: null,
      problem: null,
      addedAt: now,
      updatedAt: now,
    });
    this.#queue(nctId);
    return { kind: "accepted", nctId };
  }

  refresh(nctId: string): TrialAction {
    const refused = this.#refuseChange(nctId, "refreshed");
    if (refused !== undefined) {
      return refused;
    }
    const record = this.#records.get(nctId) as AddedTrialRecord;
    this.#save({ ...record, state: "fetching", updatedAt: this.#now() });
    this.#queue(nctId);
    return { kind: "accepted", nctId };
  }

  remove(nctId: string): TrialAction {
    const refused = this.#refuseChange(nctId, "removed");
    if (refused !== undefined) {
      return refused;
    }
    this.#records.delete(nctId);
    this.#store?.remove(nctId);
    this.#host.unserve(nctId);
    return { kind: "accepted", nctId };
  }

  /** Whether a job for this trial is queued or running. */
  busy(nctId: string): boolean {
    return this.#queued.has(nctId);
  }

  /** Settles when every job queued so far has finished. For tests. */
  whenIdle(): Promise<void> {
    return this.#chain;
  }

  #refuseChange(nctId: string, verb: string): TrialAction | undefined {
    if (this.#pinned().some((s) => s.study.nctId === nctId)) {
      return {
        kind: "refused",
        status: 409,
        error: `${nctId} is a built-in example and can't be ${verb} here.`,
      };
    }
    if (!this.#records.has(nctId)) {
      return { kind: "refused", status: 404, error: `${nctId} isn't listed.` };
    }
    if (this.busy(nctId)) {
      return { kind: "refused", status: 409, error: `Wait for ${nctId} to finish.` };
    }
    return undefined;
  }

  #queue(nctId: string): void {
    this.#queued.add(nctId);
    this.#chain = this.#chain.then(async () => {
      try {
        await this.#run(nctId);
      } finally {
        this.#queued.delete(nctId);
        this.#fetched.delete(nctId);
      }
    });
  }

  /**
   * One job. The record keeps the trial its parse was made from until a new
   * parse lands, so a refresh that fails never pairs a new text with an old
   * parse.
   */
  async #run(nctId: string): Promise<void> {
    const before = this.#records.get(nctId);
    if (before === undefined) {
      return;
    }
    try {
      const trial = await this.#options.fetchStudy(nctId);
      if (
        before.parsed !== null &&
        before.trial?.eligibility.criteriaText === trial.eligibility.criteriaText
      ) {
        this.#finish({ ...before, trial, state: "ready", problem: null });
        return;
      }
      this.#fetched.set(nctId, trial);
      this.#save({ ...before, state: "parsing", updatedAt: this.#now() });
      const parser = this.#options.parserFor();
      try {
        const parsed = await parseCriteria(trial, parser);
        this.#finish({ ...before, trial, parsed, state: "ready", problem: null });
      } finally {
        this.#options.released?.(parser);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // With no parse to keep, a trial that fetched but didn't parse is kept,
      // so its row still has a title.
      this.#finish(
        before.parsed === null
          ? {
              ...before,
              trial: this.#fetched.get(nctId) ?? before.trial,
              state: "failed",
              problem: reason,
            }
          : { ...before, state: "failed", problem: `${REFRESH_FAILED} ${reason}` },
      );
    }
  }

  #finish(record: AddedTrialRecord): void {
    // Removed while running is refused, but a record could still be gone.
    if (!this.#records.has(record.nctId)) {
      return;
    }
    this.#save({ ...record, updatedAt: this.#now() });
    this.#serveIfParsed(record);
  }

  #serveIfParsed(record: AddedTrialRecord): void {
    if (record.trial === null || record.parsed === null) {
      return;
    }
    const served: ServedStudy = {
      study: { nctId: record.nctId, briefTitle: record.trial.briefTitle },
      criteria: fromParse(record.parsed).criteria,
      source: "parse",
      origin: "added",
      conditions: record.trial.conditions,
      criteriaText: record.trial.eligibility.criteriaText,
    };
    this.#host.serve(served);
  }

  #save(record: AddedTrialRecord): void {
    this.#records.set(record.nctId, record);
    this.#store?.save(record);
  }

  #pinned(): ServedStudy[] {
    return this.#host.studies().filter((s) => s.origin !== "added");
  }

  #now(): string {
    return (this.#options.now ?? (() => new Date()))().toISOString();
  }
}
