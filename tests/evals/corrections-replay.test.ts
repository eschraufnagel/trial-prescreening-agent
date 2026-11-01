import { describe, expect, it } from "vitest";
import {
  classify,
  loadCases,
  loadRecorded,
  ordinaryTurns,
  progressAt,
  type Recorded,
  readContextAt,
} from "../../evals/corrections/replay.js";
import { finalize, unsettled } from "../../src/screening/apply.js";
import type { Progress } from "../../src/screening/types.js";

const file = loadCases();
const recorded = new Map<string, Recorded>(
  file.conversations.map((ref) => [ref.id, loadRecorded(ref)]),
);

function settledAt(r: Recorded, turn: number, id: string): boolean {
  const p = progressAt(r, turn).find((x) => x.criterionId === id);
  return (
    p?.status === "holds" ||
    p?.status === "does-not-hold" ||
    (p?.status === "chart-review" && (p.reported === "holds" || p.reported === "does-not-hold"))
  );
}

describe("the replay's committed inputs", () => {
  it("lists ten scripted corrections, six of them of a settled answer", () => {
    expect(file.cases).toHaveLength(10);
    expect(file.cases.filter((c) => c.shape === "settled")).toHaveLength(6);
  });

  it.each(
    file.cases.map((c) => [`${c.conversation} ${c.criterionId}`, c] as const),
  )("%s names a participant reply, settled before it only if its shape says so", (_, c) => {
    const r = recorded.get(c.conversation);
    expect(r).toBeDefined();
    if (r === undefined) return;
    expect(r.transcript[c.turn]?.speaker).toBe("participant");
    expect(settledAt(r, c.turn, c.criterionId)).toBe(c.shape === "settled");
  });

  it.each(
    [...recorded.values()].map((r) => [r.id, r] as const),
  )("rebuilds %s's committed findings from its evidence", (_, r) => {
    const end = progressAt(r, r.transcript.length);
    const rebuilt = finalize(r.criteria, end, r.rejected);
    const shape = (f: {
      criterionId: string;
      status: string;
      reason: string;
      reported?: string;
    }) => [f.criterionId, f.status, f.reason, f.reported ?? null];
    expect(rebuilt.map(shape)).toEqual(r.findings.map(shape));
  });
});

describe("the read call's input at a past turn", () => {
  const r = recorded.get("NCT04385368-dev") as Recorded;

  it("shows the corrected answer first among the answered, and the question asked", () => {
    const context = readContextAt(r, 88);
    expect(context.message).toMatch(/^It was more recent than I said/);
    expect(context.askedAbout).toBe("L65");
    expect(context.answered[0]?.criterion.id).toBe("L64");
    expect(context.answered[0]?.quote).toBe("my operation was about two months ago");
    expect(context.transcript.at(-1)?.index).toBe(88);
  });

  it("refuses a turn that isn't a participant reply", () => {
    expect(() => readContextAt(r, 87)).toThrow(/not a participant reply/);
  });
});

describe("classify", () => {
  const r = recorded.get("NCT04385368-dev") as Recorded;
  const correction = {
    criterionId: "L64",
    reading: "holds" as const,
    quote: "three weeks ago, not two months",
    statement: "The person had major surgery within 28 days before the first dose.",
  };

  it("is caught when a reading unsettles the corrected criterion", () => {
    expect(classify(r, 88, [correction], "L64")).toEqual({ outcome: "caught", unsettled: ["L64"] });
  });

  it("is missed when nothing reads it, as the recorded run did", () => {
    expect(classify(r, 88, [], "L64").outcome).toBe("missed");
  });

  it("is missed when the quote isn't in the reply", () => {
    expect(classify(r, 88, [{ ...correction, quote: "four weeks" }], "L64").outcome).toBe("missed");
  });

  it("counts an unsettled answer on an ordinary turn as a false correction", () => {
    const turn = 92;
    const quote = "I haven't been in any other study";
    expect(classify(r, turn, [{ ...correction, quote }]).outcome).toBe("false-correction");
    expect(classify(r, turn, []).outcome).toBe("none");
  });
});

describe("ordinaryTurns", () => {
  it("takes every fifth reply from the tenth, skipping correction turns", () => {
    const r = recorded.get("NCT04385368-dev") as Recorded;
    const replies = r.transcript.filter((t) => t.speaker === "participant").map((t) => t.index);
    const all = ordinaryTurns(r, new Set());
    expect(all[0]).toBe(replies[9]);
    expect(all[1]).toBe(replies[14]);
    expect(ordinaryTurns(r, new Set([all[0] as number]))).toEqual(all.slice(1));
  });
});

describe("unsettled", () => {
  const p = (
    status: Progress["status"],
    reason: Progress["reason"],
    reported?: "holds",
  ): Progress => ({
    criterionId: "X",
    status,
    reason,
    evidence: [],
    timesAsked: 1,
    ...(reported === undefined ? {} : { reported }),
  });

  it("names a settled answer that became contradicted", () => {
    expect(unsettled([p("holds", "answered")], [p("unresolved", "contradicted")])).toEqual(["X"]);
    expect(
      unsettled([p("chart-review", "answered", "holds")], [p("chart-review", "contradicted")]),
    ).toEqual(["X"]);
  });

  it("ignores agreement, an open criterion and one already contradicted", () => {
    expect(unsettled([p("holds", "answered")], [p("holds", "answered")])).toEqual([]);
    expect(unsettled([p("open", "unclear")], [p("unresolved", "contradicted")])).toEqual([]);
    expect(unsettled([p("unresolved", "contradicted")], [p("unresolved", "contradicted")])).toEqual(
      [],
    );
  });
});
