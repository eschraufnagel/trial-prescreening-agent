import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeModelAdapter, type ScriptedResponse } from "../../src/models/index.js";
import {
  ConversationService,
  REFRESH_FAILED,
  TrialLibrary,
  type TrialsOptions,
} from "../../src/server/index.js";
import { fixedAgent } from "../../src/server/models.js";
import { MemoryTransport } from "../../src/transport/index.js";
import type { Trial } from "../../src/trials/index.js";
import { ADDED_ID, addedTrial, cannedParse, TEXT } from "../fixtures/added-trial.js";
import { SERVED, STUDY } from "../fixtures/conversation.js";

/**
 * The Trials screen's library (slice 0013) over the real conversation
 * service, with the registry and the parser passed in: nothing here reaches
 * the network or a model.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Setup {
  library: TrialLibrary;
  service: ConversationService;
  parser: FakeModelAdapter;
  fetched: string[];
  /** What the registry says each study's text is now. Absent: no such study. */
  registry: Map<string, string>;
}

function setup(
  options: { dir?: string; parse?: ScriptedResponse[]; fetchError?: string } = {},
): Setup {
  const service = new ConversationService({
    studies: SERVED,
    source: "labels",
    agent: fixedAgent(new FakeModelAdapter()),
    transport: new MemoryTransport(),
  });
  const parser = new FakeModelAdapter(options.parse ?? [], { respond: cannedParse });
  const fetched: string[] = [];
  const registry = new Map([[ADDED_ID, TEXT]]);
  const trials: TrialsOptions = {
    fetchStudy: async (nctId: string): Promise<Trial> => {
      fetched.push(nctId);
      if (options.fetchError !== undefined) {
        throw new Error(options.fetchError);
      }
      const text = registry.get(nctId);
      if (text === undefined) {
        throw new Error(`ClinicalTrials.gov has no study ${nctId}.`);
      }
      return addedTrial(text, nctId);
    },
    parserFor: () => parser,
    ...(options.dir === undefined ? {} : { dir: options.dir }),
  };
  return { library: new TrialLibrary(trials, service), service, parser, fetched, registry };
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prescreen-library-"));
  dirs.push(dir);
  return dir;
}

const rowOf = (library: TrialLibrary, nctId: string) =>
  library.rows().find((r) => r.nctId === nctId);

describe("TrialLibrary", () => {
  it("lists the pinned studies read-only before anything is added", () => {
    const { library } = setup();
    expect(library.rows()).toEqual([
      {
        nctId: STUDY.nctId,
        origin: "pinned",
        briefTitle: STUDY.briefTitle,
        conditions: [],
        state: "ready",
        criteria: SERVED[0]?.criteria.length,
        dropped: null,
        problem: null,
        since: null,
        byType: { patient: 2, clinical: 1, protocol: 1, definitional: 0 },
        readBy: null,
      },
    ]);
  });

  it("adds a trial by link: fetching, then ready and served from its parse", async () => {
    const { library, service } = setup();
    expect(library.add(`https://clinicaltrials.gov/study/${ADDED_ID}`)).toEqual({
      kind: "accepted",
      nctId: ADDED_ID,
    });
    expect(rowOf(library, ADDED_ID)?.state).toBe("fetching");
    expect(library.busy(ADDED_ID)).toBe(true);

    await library.whenIdle();
    expect(rowOf(library, ADDED_ID)).toEqual({
      nctId: ADDED_ID,
      origin: "added",
      briefTitle: `Made-up study ${ADDED_ID}`,
      conditions: ["Non-small cell lung cancer"],
      state: "ready",
      criteria: 3,
      dropped: { rejected: 0, unclaimed: 0 },
      problem: null,
      since: expect.any(String),
      byType: { patient: 3, clinical: 0, protocol: 0, definitional: 0 },
      // Slice 0017: which model read its rules, from the parse's own run record.
      readBy: { adapter: "fake", model: "fake", hosted: null },
    });
    const served = service.studies().find((s) => s.study.nctId === ADDED_ID);
    expect(served?.source).toBe("parse");
    expect(served?.origin).toBe("added");
    expect(served?.criteria.map((c) => [c.id, c.polarity, c.text])).toEqual([
      ["P1", "inclusion", "Aged 18 or older"],
      ["P2", "inclusion", "Able to swallow tablets"],
      ["P3", "exclusion", "Pregnant or breastfeeding"],
    ]);
    expect(library.busy(ADDED_ID)).toBe(false);
  });

  it("refuses an unreadable reference, a trial already added, and a pinned one", async () => {
    const { library, fetched } = setup();
    expect(library.add("lung cancer")).toMatchObject({ kind: "refused", status: 400 });
    library.add(ADDED_ID);
    expect(library.add(ADDED_ID.toLowerCase())).toEqual({
      kind: "refused",
      status: 409,
      error: `${ADDED_ID} is already listed.`,
    });
    expect(library.add(STUDY.nctId)).toMatchObject({ kind: "refused", status: 409 });
    await library.whenIdle();
    expect(fetched).toEqual([ADDED_ID]);
  });

  it("reports a fetch failure on the row and serves nothing", async () => {
    const { library, service } = setup({ fetchError: "Couldn't reach ClinicalTrials.gov." });
    library.add(ADDED_ID);
    await library.whenIdle();
    expect(rowOf(library, ADDED_ID)).toMatchObject({
      state: "failed",
      problem: "Couldn't reach ClinicalTrials.gov.",
      criteria: null,
    });
    expect(service.studies().map((s) => s.study.nctId)).toEqual([STUDY.nctId]);
  });

  it("reports a parse failure, keeping the fetched trial's title", async () => {
    const { library, service } = setup({ parse: [{ kind: "json", content: { criteria: [] } }] });
    library.add(ADDED_ID);
    await library.whenIdle();
    const row = rowOf(library, ADDED_ID);
    expect(row?.state).toBe("failed");
    expect(row?.problem).toMatch(/Cannot parse criteria for NCT00000001/);
    expect(row?.briefTitle).toBe(`Made-up study ${ADDED_ID}`);
    expect(service.studies()).toHaveLength(1);
  });

  it("refreshes without parsing when the eligibility text is unchanged", async () => {
    const { library, parser, fetched } = setup();
    library.add(ADDED_ID);
    await library.whenIdle();
    expect(library.refresh(ADDED_ID)).toEqual({ kind: "accepted", nctId: ADDED_ID });
    await library.whenIdle();
    expect(fetched).toEqual([ADDED_ID, ADDED_ID]);
    expect(parser.requests).toHaveLength(1);
    expect(rowOf(library, ADDED_ID)?.state).toBe("ready");
  });

  it("parses again when the eligibility text changed, and serves the new parse", async () => {
    const { library, parser, registry, service } = setup();
    library.add(ADDED_ID);
    await library.whenIdle();
    registry.set(ADDED_ID, `${TEXT}\n* Allergic to penicillin`);
    library.refresh(ADDED_ID);
    await library.whenIdle();
    expect(parser.requests).toHaveLength(2);
    expect(service.studies().find((s) => s.study.nctId === ADDED_ID)?.criteria).toHaveLength(4);
  });

  it("keeps serving the earlier parse when a refresh fails, and says so", async () => {
    const { library, registry, service } = setup({
      parse: [
        { kind: "json", content: cannedContent(TEXT) },
        { kind: "error", message: "request failed: fetch failed" },
      ],
    });
    library.add(ADDED_ID);
    await library.whenIdle();
    registry.set(ADDED_ID, `${TEXT}\n* Allergic to penicillin`);
    library.refresh(ADDED_ID);
    await library.whenIdle();
    const row = rowOf(library, ADDED_ID);
    expect(row?.state).toBe("failed");
    expect(row?.problem?.startsWith(REFRESH_FAILED)).toBe(true);
    expect(row?.criteria).toBe(3);
    expect(service.studies().find((s) => s.study.nctId === ADDED_ID)?.criteria).toHaveLength(3);

    // The stored trial is still the one the served parse came from, so the
    // next refresh sees the changed text and parses again.
    library.refresh(ADDED_ID);
    await library.whenIdle();
    expect(rowOf(library, ADDED_ID)).toMatchObject({ state: "ready", criteria: 4 });
  });

  it("removes an added trial, refusing while it's busy and refusing pinned or unknown ones", async () => {
    const { library, service } = setup();
    library.add(ADDED_ID);
    expect(library.remove(ADDED_ID)).toEqual({
      kind: "refused",
      status: 409,
      error: `Wait for ${ADDED_ID} to finish.`,
    });
    expect(library.refresh(ADDED_ID)).toMatchObject({ kind: "refused", status: 409 });
    await library.whenIdle();

    expect(library.remove(STUDY.nctId)).toMatchObject({ kind: "refused", status: 409 });
    expect(library.remove("NCT09999999")).toMatchObject({ kind: "refused", status: 404 });
    expect(library.refresh("NCT09999999")).toMatchObject({ kind: "refused", status: 404 });

    expect(library.remove(ADDED_ID)).toEqual({ kind: "accepted", nctId: ADDED_ID });
    expect(rowOf(library, ADDED_ID)).toBeUndefined();
    expect(service.studies().map((s) => s.study.nctId)).toEqual([STUDY.nctId]);
  });

  it("runs one job at a time, in the order they were asked for", async () => {
    const events: string[] = [];
    const { library, registry } = setup();
    registry.set("NCT00000002", TEXT);
    const slow = new FakeModelAdapter([], {
      respond: (request) => {
        events.push(`parse ${/Trial: (\S+)/.exec(request.user)?.[1]}`);
        return { ...cannedParse(request), delayMs: 20 };
      },
    });
    const ordered = new TrialLibrary(
      {
        fetchStudy: async (nctId) => {
          events.push(`fetch ${nctId}`);
          return addedTrial(registry.get(nctId), nctId);
        },
        parserFor: () => slow,
      },
      new ConversationService({
        studies: SERVED,
        source: "labels",
        agent: fixedAgent(new FakeModelAdapter()),
        transport: new MemoryTransport(),
      }),
    );
    ordered.add(ADDED_ID);
    ordered.add("NCT00000002");
    await ordered.whenIdle();
    expect(events).toEqual([
      `fetch ${ADDED_ID}`,
      `parse ${ADDED_ID}`,
      "fetch NCT00000002",
      "parse NCT00000002",
    ]);
    expect(library.rows()).toHaveLength(1);
  });

  it("serves what was ready when a new library opens the same directory", async () => {
    const dir = tempDir();
    const first = setup({ dir });
    first.library.add(ADDED_ID);
    await first.library.whenIdle();

    const second = setup({ dir });
    expect(rowOf(second.library, ADDED_ID)).toMatchObject({ state: "ready", criteria: 3 });
    expect(second.service.studies().find((s) => s.study.nctId === ADDED_ID)?.source).toBe("parse");
    expect(second.fetched).toEqual([]);
  });
});

describe("a trial's checklist (slice 0014)", () => {
  it("gives an added trial's criteria and published text, and a pinned one's", async () => {
    const { library } = setup();
    library.add(ADDED_ID);
    expect(library.detail(ADDED_ID)).toMatchObject({ criteria: [], row: { state: "fetching" } });
    await library.whenIdle();

    const added = library.detail(ADDED_ID);
    expect(added?.criteria.map((c) => [c.id, c.text])).toEqual([
      ["P1", "Aged 18 or older"],
      ["P2", "Able to swallow tablets"],
      ["P3", "Pregnant or breastfeeding"],
    ]);
    expect(added?.criteriaText).toBe(TEXT);
    expect(added?.row.origin).toBe("added");

    const pinned = library.detail(STUDY.nctId);
    expect(pinned?.row.origin).toBe("pinned");
    expect(pinned?.criteria).toHaveLength(4);
    expect(pinned?.criteriaText).toBeNull();

    expect(library.detail("NCT09999999")).toBeUndefined();
  });
});

function cannedContent(text: string): unknown {
  const response = cannedParse({ user: text });
  return response.kind === "json" ? response.content : undefined;
}
