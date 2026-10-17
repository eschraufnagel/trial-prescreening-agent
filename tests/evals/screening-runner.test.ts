import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLabelSet } from "../../evals/cases/load.js";
import type { LabelSet, Vignette } from "../../evals/cases/types.js";
import {
  FIDELITY_SYSTEM_PROMPT,
  PARTICIPANT_SYSTEM_PROMPT,
} from "../../evals/participant/prompt.js";
import { freshMemory } from "../../evals/participant/simulate.js";
import { cacheKey } from "../../evals/runner.js";
import type { ConversationFile } from "../../evals/screening-runner.js";
import { conversationKey, runScreening } from "../../evals/screening-runner.js";
import type { Criterion, ParsedCriteria } from "../../src/criteria/types.js";
import { BudgetedAdapter } from "../../src/models/budget.js";
import type {
  CompletionRequest,
  CompletionResponse,
  ModelAdapter,
  ModelDescriptor,
} from "../../src/models/index.js";
import { catalogEntry, ModelError } from "../../src/models/index.js";
import { ASK_SYSTEM_PROMPT, READ_SYSTEM_PROMPT } from "../../src/screening/prompts.js";

/**
 * The runner's job is to survive: resume a conversation after a failure, skip
 * work already done, and stop rather than record forty identical failures when
 * the model is down. A routing fake answers each kind of call by its prompt.
 */
const NCT = "NCT04316364";
const FULL = loadLabelSet(NCT);
/** A three-criterion slice of the real labels: patient, clinical, protocol. */
const LABELS: LabelSet = {
  ...FULL,
  criteria: FULL.criteria.filter((l) => ["L1", "L4", "L8"].includes(l.id)),
};

const VIGNETTE: Vignette = {
  id: `${NCT}-v1`,
  nctId: NCT,
  labelSetSha: "0".repeat(64),
  behavior: "cooperative",
  persona: "test",
  facts: [
    { label: "L8", says: "No treatment.", expected: "does-not-hold" },
    { label: "L1", says: "Fully active.", reported: "holds" },
  ],
  provenance: { drafter: "test", guide: "test", sawAgentPrompt: false },
  dev: false,
};

const DESCRIPTOR: ModelDescriptor = {
  model: "fake",
  quantization: "none",
  temperature: 0,
  seed: 0,
  adapter: "fake",
};

class RoutingAdapter implements ModelAdapter {
  readonly descriptor = DESCRIPTOR;
  calls = 0;

  constructor(private readonly failFrom = Number.POSITIVE_INFINITY) {}

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.calls += 1;
    if (this.calls >= this.failFrom) {
      throw new ModelError("fake", ["request failed: connect ECONNREFUSED 127.0.0.1:8000"]);
    }
    const content = this.#answer(request);
    return {
      content,
      raw: JSON.stringify(content),
      finishReason: "stop",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  #answer(request: CompletionRequest): unknown {
    switch (request.system) {
      case ASK_SYSTEM_PROMPT:
        return { message: "A question?" };
      case READ_SYSTEM_PROMPT: {
        const asked = /THE QUESTION WAS ABOUT: (\S+)/.exec(request.user)?.[1];
        return {
          readings:
            asked === undefined
              ? []
              : [
                  {
                    criterionId: asked,
                    statement: "The criterion's statement.",
                    quote: "No.",
                    outright: true,
                    reading: "does-not-hold",
                  },
                ],
        };
      }
      case PARTICIPANT_SYSTEM_PROMPT:
        return { message: "No.", usedFacts: ["L8"] };
      case FIDELITY_SYSTEM_PROMPT:
        return { faithful: true, reason: "" };
      default:
        throw new Error("unrouted request");
    }
  }
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "screening-run-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(adapter: ModelAdapter, extra: Partial<Parameters<typeof runScreening>[0]> = {}) {
  return runScreening({
    agent: adapter,
    vignettes: [VIGNETTE],
    sources: ["labels"],
    resultsDir: dir,
    parsesDir: join(dir, "parses"),
    labels: () => LABELS,
    ...extra,
  });
}

function conversationFiles(): ConversationFile[] {
  const d = join(dir, "conversations");
  return readdirSync(d).map(
    (f) => JSON.parse(readFileSync(join(d, f), "utf8")) as ConversationFile,
  );
}

/**
 * A cached parse of two real labels, L1 typed clinical and L8 patient, where
 * the runner looks for it.
 */
function writeParse(adapter: ModelAdapter): void {
  const toCriterion = (id: string, type: Criterion["type"]): Criterion => {
    const l = LABELS.criteria.find((x) => x.id === id);
    if (l === undefined) throw new Error(id);
    return {
      id: `${NCT}:${l.start}-${l.end}`,
      polarity: l.polarity,
      type,
      text: l.quote,
      source: { start: l.start, end: l.end, text: l.quote },
      confidence: null,
    };
  };
  const parsed: ParsedCriteria = {
    nctId: NCT,
    criteria: [toCriterion("L1", "clinical"), toCriterion("L8", "patient")],
    rejected: [],
    unclaimed: [],
    run: { ...DESCRIPTOR, promptVersion: "x", timestamp: "2000-01-22T00:00:00Z" },
  };
  mkdirSync(join(dir, "parses"), { recursive: true });
  writeFileSync(join(dir, "parses", cacheKey(NCT, adapter.descriptor)), JSON.stringify(parsed));
}

describe("a labels run", () => {
  it("plays the conversation to the end, grades it, and writes the result", async () => {
    const result = await run(new RoutingAdapter());
    const outcome = result.conversations[0];

    expect(outcome?.status).toBe("graded");
    expect(outcome?.questions).toBe(2);
    expect(outcome?.labels?.score).toMatchObject({ determinations: 1, confidentlyWrong: 0 });
    expect(result.pooled.labels.determinations).toBe(1);
    expect(result.promptVersion).toMatch(/^[0-9a-f]{12}$/);
    expect(readdirSync(dir).filter((f) => f.endsWith(".json"))).toHaveLength(1);

    const [file] = conversationFiles();
    expect(file?.status).toBe("complete");
    expect(file?.fidelityChecked).toBe(true);
    expect(file?.timing.agentCalls).toBeGreaterThan(0);
  });

  it("commits a trimmed result: numbers and non-correct findings, not every outcome", async () => {
    await run(new RoutingAdapter());
    const name = readdirSync(dir).find((f) => f.endsWith(".json"));
    const written = JSON.parse(readFileSync(join(dir, name ?? ""), "utf8"));
    const conversation = written.conversations[0];

    expect(conversation.labels.score.determinations).toBe(1);
    expect(conversation.labels.notCorrect).toEqual([]);
    expect(conversation.labels).not.toHaveProperty("outcomes");
    expect(typeof conversation.flaggedTurns).toBe("number");
  });

  it("reuses a finished conversation without calling the model", async () => {
    await run(new RoutingAdapter());
    const offline = new RoutingAdapter(1);

    const again = await run(offline);

    expect(again.conversations[0]?.status).toBe("graded");
    expect(offline.calls).toBe(0);
  });

  it("resumes a conversation from where a failure stopped it", async () => {
    const failing = new RoutingAdapter(5);
    const first = await run(failing);
    expect(first.conversations[0]?.status).toBe("failed");
    const partial = conversationFiles()[0];
    expect(partial?.state?.transcript.length).toBeGreaterThan(0);

    const second = await run(new RoutingAdapter());

    expect(second.conversations[0]?.status).toBe("graded");
    const [file] = conversationFiles();
    const replies = file?.result?.transcript.filter((t) => t.speaker === "participant") ?? [];
    expect(replies).toHaveLength(2);
    expect(file?.participant).toHaveLength(2);
    expect(file?.pendingReply).toBeUndefined();
  });

  it("keeps the simulated reply of a failed turn, and reuses it on resume", async () => {
    // Call 1 asks, call 2 simulates, call 3 reads: fail the read.
    await run(new RoutingAdapter(3));
    const partial = conversationFiles()[0];
    expect(partial?.pendingReply?.message).toBe("No.");

    const resumed = new RoutingAdapter();
    await run(resumed);

    const [file] = conversationFiles();
    expect(file?.status).toBe("complete");
    expect(file?.pendingReply).toBeUndefined();
  });

  it("stops after two consecutive connection failures, marking the rest not run", async () => {
    const vignettes = [1, 2, 3].map((n) => ({ ...VIGNETTE, id: `${NCT}-v${n}` }));

    const result = await run(new RoutingAdapter(1), { vignettes });

    expect(result.conversations.map((c) => c.status)).toEqual(["failed", "failed", "not-run"]);
    expect(result.stopped).toMatch(/health/);
  });
});

describe("a parse run", () => {
  it("fails a study with no cached parse, naming the command that makes one", async () => {
    const result = await run(new RoutingAdapter(), { sources: ["parse"] });

    expect(result.conversations[0]?.status).toBe("failed");
    expect(result.conversations[0]?.error).toMatch(/npm run eval -- NCT04316364/);
  });

  it("screens from the cached parse and sorts labels into the parse-run categories", async () => {
    const adapter = new RoutingAdapter();
    writeParse(adapter);

    const result = await run(adapter, { sources: ["parse"] });

    expect(result.conversations[0]?.status).toBe("graded");
    expect(result.conversations[0]?.parse?.categories.scored).toBe(1);
    expect(result.pooled.parse.scored.determinations).toBe(1);
  });
});

describe("conversations from a parse are keyed by the parse (slice 0011)", () => {
  const versions = { prompt: "p", simulator: "s" };

  it("leaves a labels key as it was, whatever parse is named", () => {
    expect(
      conversationKey(VIGNETTE.id, "labels", DESCRIPTOR, {}, { ...versions, parse: "abc" }),
    ).toBe(conversationKey(VIGNETTE.id, "labels", DESCRIPTOR, {}, versions));
  });

  it("leaves a parse key as it was when no parse is named, so older runs are found", () => {
    expect(conversationKey(VIGNETTE.id, "parse", DESCRIPTOR, {}, versions)).toBe(
      "NCT04316364-v1-parse-fake-p-s-0.json",
    );
  });

  it("gives a parse key a part for the parse when one is named", () => {
    const keyed = conversationKey(
      VIGNETTE.id,
      "parse",
      DESCRIPTOR,
      {},
      { ...versions, parse: "abc" },
    );
    expect(keyed).toBe("NCT04316364-v1-parse-fake-p-s-0-parse-abc.json");
  });

  // The fault the intent found: after a parser change, a finished conversation
  // from the old parse sat under the same key, was taken as done, and was graded
  // against the new parse's criteria. Now the new parse misses that key.
  it("does not take a finished conversation from an older parse as this parse's", async () => {
    const adapter = new RoutingAdapter();
    writeParse(adapter);
    const stale: ConversationFile = {
      key: "stale",
      vignetteId: VIGNETTE.id,
      source: "parse",
      status: "complete",
      state: null,
      memory: freshMemory(),
      participant: [],
      fidelityChecked: true,
      timing: {
        agentMs: 0,
        participantMs: 0,
        fidelityMs: 0,
        agentCalls: 0,
        participantCalls: 0,
        fidelityCalls: 0,
      },
    };
    mkdirSync(join(dir, "conversations"), { recursive: true });
    writeFileSync(
      join(dir, "conversations", conversationKey(VIGNETTE.id, "parse", DESCRIPTOR)),
      JSON.stringify(stale),
    );

    const result = await run(adapter, { sources: ["parse"] });

    expect(adapter.calls).toBeGreaterThan(0);
    expect(result.conversations[0]?.status).toBe("graded");
    expect(result.parseIdentity).toMatch(/^[0-9a-f]{12}/);
  });

  it("records no parse identity for a run from labels alone", async () => {
    const result = await run(new RoutingAdapter());
    expect(result.parseIdentity).toBeUndefined();
  });
});

describe("roles and budgets (slice 0008)", () => {
  class OtherModel extends RoutingAdapter {
    override readonly descriptor = { ...DESCRIPTOR, model: "other-model" };
  }

  it("keeps every existing key: a role on the agent's model adds nothing", () => {
    const alone = conversationKey(VIGNETTE.id, "labels", DESCRIPTOR);
    expect(
      conversationKey(VIGNETTE.id, "labels", DESCRIPTOR, {
        participant: DESCRIPTOR,
        fidelity: DESCRIPTOR,
      }),
    ).toBe(alone);
  });

  // A conversation simulated by another participant is a different
  // conversation, and must never be resumed as the same one.
  it("keys a conversation by the participant's and fidelity check's models when they differ", () => {
    const key = conversationKey(VIGNETTE.id, "labels", DESCRIPTOR, {
      participant: { ...DESCRIPTOR, model: "other-model" },
    });
    expect(key).toContain("-participant-other-model");
    expect(key).not.toContain("fidelity");
  });

  it("records a role's model when it differs from the agent's, and nothing when it doesn't", async () => {
    const mixed = await run(new RoutingAdapter(), { participant: new OtherModel() });
    expect(mixed.participantModel).toMatchObject({ model: "other-model", adapter: "fake" });
    expect(mixed).not.toHaveProperty("fidelityModel");
    expect(conversationFiles()[0]?.key).toContain("participant-other-model");

    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(join(tmpdir(), "screening-run-"));
    const same = await run(new RoutingAdapter());
    expect(same).not.toHaveProperty("participantModel");
    expect(same).not.toHaveProperty("spend");
  });

  // The budget is spent, so every further call would be refused: stop now,
  // leave the conversation resumable, and say why.
  it("stops the run at the budget, leaves the conversation resumable, and records the spend", async () => {
    const second: Vignette = { ...VIGNETTE, id: `${NCT}-v2` };
    const budgeted = new BudgetedAdapter(new RoutingAdapter(), {
      entry: haikuEntry(),
      budget: { maxCalls: 3, maxUsd: 1 },
    });

    const stopped = await run(budgeted, { vignettes: [VIGNETTE, second] });
    expect(stopped.stopped).toMatch(/budget was reached/);
    expect(stopped.conversations.map((c) => c.status)).toEqual(["failed", "not-run"]);
    expect(stopped.spend?.agent).toMatchObject({ calls: 3 });
    expect(conversationFiles()[0]?.status).toBe("failed");

    // A new invocation with more budget picks up where it stopped.
    const resumed = await run(
      new BudgetedAdapter(new RoutingAdapter(), {
        entry: haikuEntry(),
        budget: { maxCalls: 1000, maxUsd: 1 },
      }),
      { vignettes: [VIGNETTE] },
    );
    expect(resumed.conversations[0]?.status).toBe("graded");
  });
});

function haikuEntry() {
  const entry = catalogEntry("anthropic", "claude-haiku-4-5");
  if (entry === undefined) throw new Error("claude-haiku-4-5 missing from the catalog");
  return entry;
}
