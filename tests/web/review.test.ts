import { describe, expect, it } from "vitest";
import { locateEvidence } from "../../src/screening/evidence.js";
import type { ConversationReview } from "../../src/server/index.js";
import {
  EVAL_RUN_NOTE,
  findingWords,
  HEADER_NOTE,
  PARSE_NOTE,
  type ReviewModel,
  reasonWords,
  reviewModel,
  SCRIPTED_NOTE,
  segments,
} from "../../src/web/review.js";
import { evalRun, keysOf } from "../fixtures/eval-run.js";
import { REVIEW } from "../fixtures/review.js";

/** The committed eval run as the review route serves it. */
function committed(): ConversationReview[] {
  return evalRun().map((f) => ({
    id: f.id,
    origin: "eval-run",
    source: f.source,
    criteria: f.criteria,
    plain: f.plain,
    result: f.result,
  }));
}

describe("the review's groups", () => {
  const model = reviewModel(REVIEW);

  it("groups by what the coordinator does next, in a fixed order, keeping protocol order", () => {
    expect(model.frame.groups.map((g) => [g.key, g.rows])).toEqual([
      ["settled", ["C1", "C2", "C3"]],
      ["chart", ["C4", "C5", "C6", "C7"]],
      ["unresolved", ["C8", "C9"]],
      ["not-raised", ["C10", "C11", "C12"]],
    ]);
    expect(model.frame.groups.map((g) => g.count)).toEqual([3, 4, 2, 3]);
  });

  it("shows every group, with 0, even when empty", () => {
    const empty = reviewModel({
      ...REVIEW,
      criteria: REVIEW.criteria.slice(0, 1),
      result: { ...REVIEW.result, findings: REVIEW.result.findings.slice(0, 1) },
    });
    expect(empty.frame.groups.map((g) => [g.key, g.count])).toEqual([
      ["settled", 1],
      ["chart", 0],
      ["unresolved", 0],
      ["not-raised", 0],
    ]);
  });
});

describe("a row's finding, in words", () => {
  it("applies polarity to the one criterion, and says whose account it is", () => {
    const table = [
      ["inclusion", { status: "holds" }, "Met, by the participant's account"],
      ["inclusion", { status: "does-not-hold" }, "Not met, by the participant's account"],
      ["exclusion", { status: "holds" }, "Applies, by the participant's account"],
      ["exclusion", { status: "does-not-hold" }, "Does not apply, by the participant's account"],
      [
        "inclusion",
        { status: "chart-review", reported: "holds" },
        "Participant reported: met. Needs the record",
      ],
      [
        "inclusion",
        { status: "chart-review", reported: "does-not-hold" },
        "Participant reported: not met. Needs the record",
      ],
      [
        "exclusion",
        { status: "chart-review", reported: "holds" },
        "Participant reported: applies. Needs the record",
      ],
      [
        "exclusion",
        { status: "chart-review", reported: "does-not-hold" },
        "Participant reported: does not apply. Needs the record",
      ],
      [
        "inclusion",
        { status: "chart-review", reported: "partial" },
        "Participant reported part of it. Needs the record",
      ],
      [
        "exclusion",
        { status: "chart-review", reported: "partial" },
        "Participant reported part of it. Needs the record",
      ],
      [
        "inclusion",
        { status: "chart-review", reported: "unknown" },
        "Participant didn't know. Needs the record",
      ],
      ["exclusion", { status: "chart-review" }, "Participant didn't know. Needs the record"],
      ["inclusion", { status: "unresolved" }, "Not settled"],
      ["exclusion", { status: "not-raised" }, "Not asked"],
    ] as const;
    for (const [polarity, finding, words] of table) {
      expect(findingWords(polarity, finding)).toBe(words);
    }
  });

  it("gives the reason in words for unresolved and not-raised rows only", () => {
    const model = reviewModel(REVIEW);
    expect(
      Object.fromEntries(Object.entries(model.rows).map(([id, row]) => [id, row.reason])),
    ).toEqual({
      C1: null,
      C2: null,
      C3: null,
      C4: null,
      C5: null,
      C6: null,
      C7: null,
      C8: "declined to say",
      C9: "the conversation ended before an answer",
      C10: "a site or protocol requirement",
      C11: "a definition",
      C12: "a lab value",
    });
    expect(reasonWords("answered")).toBeNull();
    expect(reasonWords("contradicted")).toBe("contradicted themselves");
    expect(reasonWords("evidence-not-found")).toBe("the agent's quote wasn't in what they said");
  });
});

describe("the words behind a finding", () => {
  const model = reviewModel(REVIEW);
  const turns = (id: string) =>
    model.rows[id]?.exchanges.map((e) => [e.question?.turn ?? null, e.reply?.turn ?? null]);

  it("shows each question asked about the criterion with the reply that followed", () => {
    expect(turns("C1")).toEqual([[1, 2]]);
    expect(turns("C8")).toEqual([[13, 14]]);
  });

  it("shows a reply cited from a question about something else, with that question", () => {
    expect(turns("C3")).toEqual([[5, 6]]);
    expect(model.rows["C3"]?.exchanges[0]?.question?.text).toBe("Has a doctor checked your heart?");
  });

  it("shows a question the conversation ended on, with no reply", () => {
    expect(turns("C9")).toEqual([[15, null]]);
  });

  it("shows each reply once, even when several readings cite it", () => {
    expect(turns("C2")).toEqual([[3, 4]]);
  });

  it("shows a reply cited only by an ignored reading", () => {
    expect(turns("C10")).toEqual([[1, 2]]);
  });

  it("marks each quote the agent read, where the session found it", () => {
    const reply = model.rows["C4"]?.exchanges[0]?.reply;
    expect(reply?.marks).toEqual([{ start: 5, end: 19, reading: "holds" }]);
    expect(reply?.text.slice(5, 19)).toBe("it was checked");
    // The same reply, in C3's row, marks only C3's own quote.
    expect(model.rows["C3"]?.exchanges[0]?.reply?.marks.map((m) => m.reading)).toEqual([
      "does not hold",
    ]);
  });

  it("cuts a reply into plain and marked pieces that rebuild it exactly", () => {
    const reply = model.rows["C4"]?.exchanges[0]?.reply;
    const parts = segments(reply?.text ?? "", reply?.marks ?? []);
    expect(parts.map((p) => p.text).join("")).toBe(reply?.text);
    expect(parts.filter((p) => p.mark !== null).map((p) => p.text)).toEqual(["it was checked"]);
  });

  it("says when a reading was discarded or ignored, on the row it concerns", () => {
    expect(model.rows["C8"]?.readings).toEqual([
      'At turn 14 the agent read "prefer not to discuss" as declined, but those words weren\'t in the reply, so it was discarded.',
    ]);
    expect(model.rows["C2"]?.readings).toEqual([
      "At turn 4 the agent read this as holds after it was settled. It was ignored.",
    ]);
    expect(model.rows["C10"]?.readings).toEqual([
      "At turn 2 the agent read something about this criterion, which isn't asked in conversation. It was ignored.",
    ]);
  });

  it("links each transcript turn to the rows that show it", () => {
    const line = (turn: number) => model.transcript.find((t) => t.turn === turn);
    expect(line(6)?.citedBy).toEqual(["C3", "C4"]);
    expect(line(5)?.raised).toBe("C4");
    expect(line(0)?.citedBy).toEqual([]);
  });

  it("carries each criterion and its rendering for CriterionText, never reading the words itself", () => {
    expect(model.rows["C1"]?.criterion).toBe(REVIEW.criteria[0]);
    expect(model.rows["C1"]?.plain).toEqual({
      state: "shown",
      text: "Is 64 or older.",
      attempt: 1,
    });
    expect(model.rows["C2"]?.plain).toBeUndefined();
  });
});

describe("the frame's notes and footer", () => {
  it("always says the coordinator decides, and adds a note only when its condition holds", () => {
    expect(reviewModel(REVIEW).frame.notes).toEqual([HEADER_NOTE]);
    expect(reviewModel({ ...REVIEW, origin: "eval-run" }).frame.notes).toEqual([
      HEADER_NOTE,
      EVAL_RUN_NOTE,
    ]);
    expect(reviewModel({ ...REVIEW, source: "parse" }).frame.notes).toEqual([
      HEADER_NOTE,
      PARSE_NOTE,
    ]);
    const scripted = {
      ...REVIEW,
      result: { ...REVIEW.result, run: { ...REVIEW.result.run, adapter: "fake" } },
    };
    expect(reviewModel(scripted).frame.notes).toEqual([HEADER_NOTE, SCRIPTED_NOTE]);
  });

  it("records the model, its settings and the prompt, and counts readings about no criterion", () => {
    expect(reviewModel(REVIEW).frame.footer).toEqual([
      "Test-Model-8bit (8bit), temperature 0, seed 20260921, reasoning off",
      "Adapter omlx, prompt c5778afe9cbd, finished 2000-01-23T12:00:00.000Z",
      "17 model calls. 1 readings named no criterion in this study.",
    ]);
  });
});

describe("the committed eval run, reviewed", () => {
  const reviews = committed();

  it("shows every exchange from a turn that exists", () => {
    for (const review of reviews) {
      const indices = new Set(review.result.transcript.map((t) => t.index));
      for (const row of Object.values(reviewModel(review).rows)) {
        for (const e of row.exchanges) {
          for (const turn of [e.question?.turn, e.reply?.turn]) {
            if (turn !== undefined) {
              expect(indices.has(turn)).toBe(true);
            }
          }
        }
      }
    }
  });

  it("puts every piece of evidence in its row, marked", () => {
    let checked = 0;
    for (const review of reviews) {
      const model = reviewModel(review);
      for (const finding of review.result.findings) {
        for (const evidence of finding.evidence) {
          const reply = model.rows[finding.criterionId]?.exchanges.find(
            (e) => e.reply?.turn === evidence.turn,
          )?.reply;
          const at = locateEvidence(reply?.text ?? "", evidence.quote);
          expect(at).toBeDefined();
          const covered = reply?.marks.some(
            (m) => m.start < (at?.end ?? 0) && (at?.start ?? 0) < m.end,
          );
          expect(covered).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("puts every criterion in exactly one group", () => {
    for (const review of reviews) {
      const grouped = reviewModel(review).frame.groups.flatMap((g) => g.rows);
      expect(grouped.sort()).toEqual(review.criteria.map((c) => c.id).sort());
    }
  });
});

// ------------------------------------------------------ where the pane stops

/** Every settled finding, reported value and evidence reading, the other way. */
function flipped(review: ConversationReview): ConversationReview {
  const other = <T extends string>(v: T): T =>
    (v === "holds" ? "does-not-hold" : v === "does-not-hold" ? "holds" : v) as T;
  return {
    ...review,
    result: {
      ...review.result,
      findings: review.result.findings.map((f) => ({
        ...f,
        status: other(f.status),
        ...(f.reported === undefined ? {} : { reported: other(f.reported) }),
        evidence: f.evidence.map((e) => ({ ...e, reading: other(e.reading) })),
      })),
    },
  };
}

/** A model with the only parts allowed to depend on which way findings went taken out. */
function directionless(model: ReviewModel): unknown {
  return {
    frame: model.frame,
    transcript: model.transcript,
    rows: Object.fromEntries(
      Object.entries(model.rows).map(([id, row]) => [
        id,
        {
          ...row,
          finding: undefined,
          exchanges: row.exchanges.map((e) => ({
            ...e,
            reply:
              e.reply === null
                ? null
                : { ...e.reply, marks: e.reply.marks.map((m) => ({ ...m, reading: undefined })) },
          })),
        },
      ]),
    ),
  };
}

function flipInvariant(build: (r: ConversationReview) => ReviewModel, review: ConversationReview) {
  return (
    JSON.stringify(directionless(build(review))) ===
    JSON.stringify(directionless(build(flipped(review))))
  );
}

/**
 * What a pane that ranked the person would do: put exclusions that apply and
 * inclusions not met at the top. The flip test has to catch it.
 */
function promoting(review: ConversationReview): ReviewModel {
  const model = reviewModel(review);
  const against = (id: string) => /^(Applies|Not met)/.test(model.rows[id]?.finding ?? "");
  return {
    ...model,
    frame: {
      ...model.frame,
      groups: model.frame.groups.map((g) => ({
        ...g,
        rows: [...g.rows.filter(against), ...g.rows.filter((id) => !against(id))],
      })),
    },
  };
}

describe("where the pane stops (spec §3, §8.1)", () => {
  it("changes nothing but each row's finding words when every finding is flipped", () => {
    expect(flipInvariant(reviewModel, REVIEW)).toBe(true);
    const flippedWords = reviewModel(flipped(REVIEW)).rows;
    expect(flippedWords["C1"]?.finding).toBe("Not met, by the participant's account");
    expect(flippedWords["C5"]?.finding).toBe("Participant reported: applies. Needs the record");
  });

  it("holds on every conversation in the committed eval run", () => {
    const reviews = committed();
    expect(reviews).toHaveLength(30);
    for (const review of reviews) {
      expect(flipInvariant(reviewModel, review), review.id).toBe(true);
    }
  });

  it("would catch a pane that promoted rows by how they went", () => {
    expect(flipInvariant(promoting, REVIEW)).toBe(false);
  });

  const VERDICT = /eligib|verdict|disposition|qualif|score|total/i;

  /**
   * Every string the pane writes itself. Criterion words, renderings, turns and
   * quotes are someone else's and are skipped: protocols say "eligible for
   * resection". The study's title is its registry name.
   */
  function ownWords(model: ReviewModel): string[] {
    const { title: _title, ...frame } = model.frame;
    const walk = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value.flatMap(walk)
          : typeof value === "object" && value !== null
            ? Object.values(value).flatMap(walk)
            : [];
    return [
      ...walk(frame),
      ...Object.values(model.rows).flatMap((row) => [
        row.polarity,
        row.finding,
        ...(row.reason === null ? [] : [row.reason]),
        // A reading line quotes the reply; the quote is the participant's.
        ...row.readings.map((line) => line.replace(/"[^"]*"/g, '""')),
      ]),
    ];
  }

  it("writes nothing that reads as a verdict, a score or a total", () => {
    const models = [REVIEW, ...committed()].map(reviewModel);
    const words = models.flatMap(ownWords);
    expect(words.length).toBeGreaterThan(500);
    expect(words.filter((w) => VERDICT.test(w))).toEqual([]);
  });

  it("would catch a verdict written into the frame", () => {
    const model = reviewModel(REVIEW);
    const bad = { ...model, frame: { ...model.frame, notes: ["Likely eligible."] } };
    expect(ownWords(bad).filter((w) => VERDICT.test(w))).toEqual(["Likely eligible."]);
  });

  it("has no field that could hold a decision, in what it is given or what it builds", () => {
    const review = committed()[0] as ConversationReview;
    const keys = [
      ...keysOf(review),
      ...keysOf(reviewModel(review)),
      ...keysOf(reviewModel(REVIEW)),
    ];
    expect(keys.length).toBeGreaterThan(100);
    expect(
      keys.filter((k) => /eligib|verdict|disposition|qualif|decision|determin/i.test(k)),
    ).toEqual([]);
  });
});
