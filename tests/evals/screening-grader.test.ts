import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadLabelSet } from "../../evals/cases/load.js";
import type { ExpectedOutcome, Vignette, VignetteFact } from "../../evals/cases/types.js";
import { loadVignettes } from "../../evals/cases/vignettes.js";
import {
  countDiscipline,
  type FlaggedTurns,
  gradeConversation,
  gradeOne,
  gradeParseRun,
  parseCategories,
  poolScores,
  VERDICT_PATTERN,
  VERDICT_PATTERN_V3,
} from "../../evals/graders/screening.js";
import { parseFileName } from "../../evals/runner.js";
import type { Criterion, CriterionType, ParsedCriteria } from "../../src/criteria/types.js";
import type { Finding, FindingStatus, Turn } from "../../src/screening/types.js";

/**
 * The graders decide every number slice 0004 reports. These tests pin the
 * asymmetry they exist to measure: a determination that should not have been
 * made is confidently wrong whichever way it went, and an abstention is never
 * wrong, only more or less useful.
 */
const NONE: FlaggedTurns = new Map();

function finding(criterionId: string, status: FindingStatus, turn = 1, quote = "x"): Finding {
  return {
    criterionId,
    status,
    reason: "answered",
    evidence: status === "not-raised" ? [] : [{ turn, quote, reading: "holds" }],
    timesAsked: 1,
  };
}

function vignette(facts: VignetteFact[]): Vignette {
  return {
    id: "NCT04316364-v1",
    nctId: "NCT04316364",
    labelSetSha: "0".repeat(64),
    behavior: "cooperative",
    persona: "test",
    facts,
    provenance: { drafter: "test", guide: "test", sawAgentPrompt: false },
    dev: false,
  };
}

function fact(label: string, expected: ExpectedOutcome): VignetteFact {
  return { label, says: "x", expected };
}

describe("gradeOne", () => {
  it("scores a matching determination correct and an opposite one confidently wrong", () => {
    expect(gradeOne("holds", finding("L1", "holds"), NONE)).toBe("correct");
    expect(gradeOne("holds", finding("L1", "does-not-hold"), NONE)).toBe("confidently-wrong");
  });

  // The core of the design: a fact that settles nothing cannot be settled, in
  // either direction.
  it("scores any determination on a defer or unresolved fact as confidently wrong", () => {
    for (const expected of ["defer", "unresolved"] as const) {
      expect(gradeOne(expected, finding("L1", "holds"), NONE)).toBe("confidently-wrong");
      expect(gradeOne(expected, finding("L1", "does-not-hold"), NONE)).toBe("confidently-wrong");
    }
  });

  it("never scores an abstention wrong, only more or less useful", () => {
    for (const status of ["unresolved", "chart-review", "not-raised"] as const) {
      expect(gradeOne("holds", finding("L1", status), NONE)).toBe("abstained");
      expect(gradeOne("defer", finding("L1", status), NONE)).toBe("correct-abstention");
    }
  });

  it("treats a criterion with no finding at all as not raised", () => {
    expect(gradeOne("does-not-hold", undefined, NONE)).toBe("abstained");
  });

  it("excludes a finding whose evidence comes from a flagged participant turn", () => {
    expect(gradeOne("holds", finding("L1", "does-not-hold", 5), new Map([[5, new Set()]]))).toBe(
      "simulator-affected",
    );
  });

  // Gate 2: a flagged reply's cited facts are still faithful answers.
  it("keeps a finding from a flagged turn when that reply cited the criterion's fact", () => {
    const flagged: FlaggedTurns = new Map([[5, new Set(["L1"])]]);

    expect(gradeOne("does-not-hold", finding("L1", "does-not-hold", 5), flagged)).toBe("correct");
    expect(gradeOne("does-not-hold", finding("L2", "does-not-hold", 5), flagged)).toBe(
      "simulator-affected",
    );
  });
});

describe("gradeConversation", () => {
  const facts = [
    fact("A", "holds"),
    fact("B", "does-not-hold"),
    fact("C", "does-not-hold"),
    fact("D", "defer"),
    fact("E", "unresolved"),
  ];

  it("reports zero wrong and full abstention for an agent that commits to nothing", () => {
    const findings = ["A", "B", "C", "D", "E"].map((id) => finding(id, "unresolved"));
    const { score } = gradeConversation(findings, [], vignette(facts), NONE);

    // The degenerate agent the pair of numbers exists to expose.
    expect(score.confidentlyWrongRate).toBeNull();
    expect(score.abstentionRate).toBe(1);
    expect(score.correctAbstentionRate).toBe(1);
  });

  it("reports a perfect run as no wrong determinations and no missed answers", () => {
    const findings = [
      finding("A", "holds"),
      finding("B", "does-not-hold"),
      finding("C", "does-not-hold"),
      finding("D", "unresolved"),
      finding("E", "unresolved"),
    ];
    const { score } = gradeConversation(findings, [], vignette(facts), NONE);

    expect(score).toMatchObject({
      determinations: 3,
      confidentlyWrong: 0,
      confidentlyWrongRate: 0,
      answerable: 3,
      abstentionRate: 0,
      abstainable: 2,
      correctAbstentionRate: 1,
    });
  });

  it("counts a wrong answer and a determination on a defer fact against the headline", () => {
    const findings = [
      finding("A", "does-not-hold"),
      finding("B", "does-not-hold"),
      finding("C", "unresolved"),
      finding("D", "holds"),
      finding("E", "unresolved"),
    ];
    const { score, outcomes } = gradeConversation(findings, [], vignette(facts), NONE);

    expect(score.determinations).toBe(3);
    expect(score.confidentlyWrong).toBe(2);
    expect(score.abstained).toBe(1);
    expect(outcomes.filter((o) => o.outcome === "confidently-wrong").map((o) => o.label)).toEqual([
      "A",
      "D",
    ]);
  });

  it("excludes simulator-affected findings from every rate, and counts them", () => {
    const findings = [finding("A", "does-not-hold", 7), finding("B", "does-not-hold")];
    const { score } = gradeConversation(
      findings,
      [],
      vignette([fact("A", "holds"), fact("B", "does-not-hold")]),
      new Map([[7, new Set<string>()]]),
    );

    expect(score.simulatorAffected).toBe(1);
    expect(score.determinations).toBe(1);
    expect(score.confidentlyWrong).toBe(0);
    expect(score.answerable).toBe(1);
  });

  it("reports what the agent heard on clinical facts as agreement, not accuracy", () => {
    const clinical: VignetteFact[] = [
      { label: "K1", says: "No HIV.", reported: "does-not-hold" },
      { label: "K2", says: "No hepatitis.", reported: "does-not-hold" },
      { label: "K3", says: "Not sure.", reported: "unknown" },
    ];
    const findings: Finding[] = [
      { ...finding("K1", "chart-review"), reported: "does-not-hold" },
      { ...finding("K2", "chart-review"), reported: "holds" },
    ];

    const { reported, score } = gradeConversation(findings, [], vignette(clinical), NONE);

    expect(reported.graded).toBe(3);
    expect(reported.agreed).toBe(1);
    expect(reported.disagreements.map((d) => [d.label, d.heard])).toEqual([
      ["K2", "holds"],
      ["K3", "(not captured)"],
    ]);
    expect(score.determinations).toBe(0);
  });
});

describe("countDiscipline", () => {
  function turn(index: number, text: string, speaker: Turn["speaker"] = "agent"): Turn {
    return { index, speaker, kind: speaker === "agent" ? "question" : "reply", text };
  }

  it("counts questions asking two things, questions too long for a text, and verdict language", () => {
    const transcript: Turn[] = [
      { index: 0, speaker: "agent", kind: "opening", text: "Hello." },
      turn(1, "Are you pregnant?"),
      turn(2, "No.", "participant"),
      turn(3, "Are you pregnant? Are you breastfeeding?"),
      turn(4, "No.", "participant"),
      turn(5, `Have you ${"really ".repeat(60)}had chemotherapy?`),
      turn(6, "No.", "participant"),
      turn(7, "Thanks, that means you are eligible. Any allergies?"),
    ];

    const d = countDiscipline(transcript);

    expect(d.agentQuestions).toBe(4);
    expect(d.participantReplies).toBe(3);
    expect(d.multiQuestion).toBe(1);
    expect(d.overLength).toBe(1);
    expect(d.verdictLanguage.map((v) => v.turn)).toEqual([7]);
  });

  it("counts a second question about the same criterion as a follow-up", () => {
    const ask = (index: number, criterionId: string): Turn => ({
      index,
      speaker: "agent",
      kind: "question",
      text: "?",
      criterionId,
    });
    const transcript = [ask(1, "L2"), ask(3, "L8"), ask(5, "L2"), ask(7, "L19")];

    expect(countDiscipline(transcript).followUps).toBe(1);
  });

  it("recognises the verdict phrasings it is meant to catch, and not ordinary questions", () => {
    for (const text of [
      "You're not eligible.",
      "You would qualify.",
      "You are a good candidate.",
      "That disqualifies you.",
    ]) {
      expect(VERDICT_PATTERN.test(text), text).toBe(true);
    }
    expect(VERDICT_PATTERN.test("Have you had any chemotherapy for lung cancer?")).toBe(false);
  });

  // Grader v4 (slice 0009): the criteria's own words are asked, not decided.
  const criterionPhrasings = [
    "Has a thoracic surgeon confirmed eligibility for an R0 resection with curative intent?",
    "Has your doctor documented that you are a candidate for surgical resection of your lung cancer?",
    "Were you told you are eligible for an R0 resection?",
  ];
  const freshVerdicts = [
    "You may not be eligible.",
    "That would make you ineligible.",
    "You qualify for this study.",
    "You'd be a good candidate.",
    "Patients like you are not eligible for the trial.",
    "You are not eligible for this research, I'm afraid.",
  ];

  it("does not count a criterion's own words that name something other than the study", () => {
    for (const text of criterionPhrasings) {
      expect(VERDICT_PATTERN.test(text), text).toBe(false);
    }
  });

  it("still counts verdicts, including ones that name the study", () => {
    for (const text of freshVerdicts) {
      expect(VERDICT_PATTERN.test(text), text).toBe(true);
    }
  });

  it("only ever narrows v3: whatever v4 matches, v3 matched too", () => {
    for (const text of [...criterionPhrasings, ...freshVerdicts]) {
      if (VERDICT_PATTERN.test(text)) {
        expect(VERDICT_PATTERN_V3.test(text), text).toBe(true);
      }
    }
    for (const text of criterionPhrasings) {
      expect(VERDICT_PATTERN_V3.test(text), text).toBe(true);
    }
  });
});

describe("gradeParseRun", () => {
  const labels = loadLabelSet("NCT04316364");
  const text = (id: string) => labels.criteria.find((l) => l.id === id);

  function predicted(labelIds: string[], type: CriterionType): Criterion {
    const spans = labelIds.map((id) => text(id)).filter((l) => l !== undefined);
    const start = Math.min(...spans.map((l) => l.start));
    const end = Math.max(...spans.map((l) => l.end));
    const quote = spans.map((l) => l.quote).join(" ");
    return {
      id: `NCT04316364:${start}-${end}`,
      polarity: "exclusion",
      type,
      text: quote,
      source: { start, end, text: quote },
      confidence: null,
    };
  }

  // L19 as patient → scored; L8 typed clinical → mis-typed; L17 and L18 in one
  // criterion → one matched, one bundled; L24 absent → missed upstream.
  const scored = predicted(["L19"], "patient");
  const misTyped = predicted(["L8"], "clinical");
  const bundle = predicted(["L17", "L18"], "patient");
  const parsed: ParsedCriteria = {
    nctId: "NCT04316364",
    criteria: [misTyped, bundle, scored],
    rejected: [],
    unclaimed: [],
    run: {
      model: "fake",
      quantization: "none",
      temperature: 0,
      seed: 0,
      adapter: "fake",
      promptVersion: "test",
      timestamp: "2000-01-22T00:00:00Z",
    },
  };
  const ids = new Map<Criterion, string>([
    [misTyped, "P1"],
    [bundle, "P2"],
    [scored, "P3"],
  ]);
  const v = vignette([
    fact("L8", "does-not-hold"),
    fact("L17", "does-not-hold"),
    fact("L18", "does-not-hold"),
    fact("L19", "does-not-hold"),
    fact("L24", "does-not-hold"),
  ]);
  const findings = [
    finding("P1", "chart-review"),
    finding("P2", "does-not-hold"),
    finding("P3", "does-not-hold"),
  ];

  const grade = gradeParseRun(parsed, ids, labels, findings, [], v, NONE);
  const category = (label: string) => grade.entries.find((e) => e.label === label)?.category;

  it("places each patient label in exactly one of the four categories", () => {
    expect(grade.entries).toHaveLength(5);
    expect(category("L19")).toBe("scored");
    expect(category("L8")).toBe("mis-typed");
    expect(category("L24")).toBe("missed-upstream");
    expect([category("L17"), category("L18")]).toContain("bundled");
  });

  it("shows a mis-typed patient criterion ending in chart review, the parser's cost", () => {
    const entry = grade.entries.find((e) => e.label === "L8");

    expect(entry).toMatchObject({ parsedType: "clinical", status: "chart-review", parsedId: "P1" });
  });

  it("grades only the scored labels, keyed back to the label", () => {
    const scoredLabels = grade.entries.filter((e) => e.category === "scored").map((e) => e.label);

    expect(grade.scored.outcomes.map((o) => o.label)).toEqual(scoredLabels);
    expect(grade.scored.score.confidentlyWrong).toBe(0);
    expect(grade.categories["missed-upstream"]).toBe(1);
  });
});

// Slice 0011 (spec §3.6): reach follows from a parse, the labels and the
// vignettes, with no conversation. Reproducing 0009's parse-side categories
// from the committed 0003 parses proves the extraction moved nothing, and that
// reach can be known before a screening run is spent.
describe("parseCategories", () => {
  it("reproduces 0009's reach from the committed parses, with no run", () => {
    const parses = fileURLToPath(new URL("../../evals/results/parses/", import.meta.url));
    const run = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("../../evals/results/screening/02-2c46ada9a1d5.json", import.meta.url),
        ),
        "utf8",
      ),
    ) as { pooled: { parse: { categories: Record<string, number> } } };

    const totals: Record<string, number> = {};
    for (const vignette of loadVignettes().filter((v) => !v.dev)) {
      const parsed = JSON.parse(
        readFileSync(
          join(
            parses,
            parseFileName(vignette.nctId, "Qwen3.6-35B-A3B-MLX-8bit", "73c3b301c4a9", 20260921),
          ),
          "utf8",
        ),
      ) as ParsedCriteria;
      const { categories } = parseCategories(parsed, loadLabelSet(vignette.nctId), vignette);
      for (const [k, v] of Object.entries(categories)) totals[k] = (totals[k] ?? 0) + v;
    }

    expect(totals).toEqual({ scored: 84, "mis-typed": 66, bundled: 33, "missed-upstream": 0 });
    expect(totals).toEqual(run.pooled.parse.categories);
  });
});

describe("poolScores", () => {
  it("sums counts and recomputes rates rather than averaging them", () => {
    const a = gradeConversation(
      [finding("A", "holds")],
      [],
      vignette([fact("A", "holds")]),
      NONE,
    ).score;
    const b = gradeConversation(
      [finding("A", "holds"), finding("B", "holds"), finding("C", "holds")],
      [],
      vignette([fact("A", "does-not-hold"), fact("B", "holds"), fact("C", "holds")]),
      NONE,
    ).score;

    const pooled = poolScores([a, b]);

    // 1 wrong of 4 determinations, not the mean of 0 and 1/3.
    expect(pooled.determinations).toBe(4);
    expect(pooled.confidentlyWrongRate).toBe(0.25);
  });
});
