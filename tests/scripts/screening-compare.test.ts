import { describe, expect, it } from "vitest";
import type { LabelOutcome, ScreeningScore } from "../../evals/graders/screening.js";
import { LEAST_SEEN } from "../../scripts/lib/least-seen.js";
import {
  barVerdict,
  type CommittedConversation,
  type CommittedRun,
  compareRuns,
  devReport,
  renderComparison,
  withoutOtherSex,
} from "../../scripts/screening-compare.js";

function score(
  determinations: number,
  wrong: number,
  answerable = 10,
  abstained = 0,
): ScreeningScore {
  return {
    determinations,
    confidentlyWrong: wrong,
    answerable,
    abstained,
    abstainable: 2,
    correctAbstentions: 2,
    simulatorAffected: 0,
    confidentlyWrongRate: determinations === 0 ? null : wrong / determinations,
    abstentionRate: abstained / answerable,
    correctAbstentionRate: 1,
  };
}

function wrong(label: string, expected: LabelOutcome["expected"] = "holds"): LabelOutcome {
  return {
    label,
    expected,
    status: "does-not-hold",
    outcome: "confidently-wrong",
    evidence: ["made up"],
  };
}

function conversation(
  vignetteId: string,
  source: "labels" | "parse",
  s: ScreeningScore,
  notCorrect: LabelOutcome[] = [],
  verdicts: string[] = [],
): CommittedConversation {
  const grade = {
    score: s,
    reported: { graded: 1, agreed: 1, disagreements: [] },
    discipline: {
      agentQuestions: 10,
      participantReplies: 10,
      multiQuestion: 0,
      overLength: 0,
      followUps: 1,
      verdictLanguage: verdicts.map((text, turn) => ({ turn, text })),
    },
    notCorrect,
  };
  return {
    vignetteId,
    nctId: vignetteId.slice(0, 11),
    source,
    status: "graded",
    timing: {
      agentMs: 60000,
      participantMs: 30000,
      fidelityMs: 30000,
      agentCalls: 20,
      participantCalls: 10,
      fidelityCalls: 10,
    },
    questions: 10,
    ...(source === "labels" ? { labels: grade } : { parse: { scored: grade } }),
  };
}

function run(
  conversations: CommittedConversation[],
  graderVersion = "4",
  dev = false,
): CommittedRun {
  return {
    model: "made-up",
    quantization: "8bit",
    temperature: 0,
    seed: 1,
    thinking: "off",
    promptVersion: "p",
    simulatorVersion: "s",
    graderVersion,
    dev,
    conversations,
  };
}

const HELD = LEAST_SEEN[0] as string;

describe("screening:compare", () => {
  const before = run(
    [
      conversation("NCT00000001-v1", "labels", score(10, 2), [wrong("L1"), wrong("L2")]),
      conversation("NCT00000001-v1", "parse", score(5, 1), [wrong("L1")]),
      conversation(HELD, "labels", score(10, 5), [wrong("L9")]),
      conversation(HELD, "parse", score(5, 5)),
    ],
    "3",
  );
  const after = run([
    conversation("NCT00000001-v1", "labels", score(10, 0)),
    conversation("NCT00000001-v1", "parse", score(5, 0)),
    conversation(HELD, "labels", score(10, 1)),
    conversation(HELD, "parse", score(5, 1)),
  ]);

  it("pools the twelve alone, leaving the least-seen out", () => {
    const c = compareRuns(before, after, { leastSeen: false });
    expect(c.twelve.before.labels.all.score.confidentlyWrong).toBe(2);
    expect(c.twelve.before.labels.all.conversations).toBe(1);
    expect(c.twelve.after.parse.all.score.confidentlyWrong).toBe(0);
  });

  it("never computes or prints the least-seen without the flag", () => {
    const c = compareRuns(before, after, { leastSeen: false });
    expect(c.leastSeen).toBeUndefined();
    const text = renderComparison(before, after, c);
    expect(text).not.toContain(HELD);
    expect(text).not.toContain("LEAST-SEEN, apart");
  });

  it("reports the least-seen apart with the flag, with their wrong findings", () => {
    const c = compareRuns(before, after, { leastSeen: true });
    expect(c.leastSeen?.before.labels.all.score.confidentlyWrong).toBe(5);
    expect(c.leastSeen?.after.labels.all.score.confidentlyWrong).toBe(1);
    expect(c.twelve.before.labels.all.score.confidentlyWrong).toBe(2);
    expect(renderComparison(before, after, c)).toContain(`${HELD} (labels) L9`);
  });

  it("takes the other-sex facts out: a wrong one leaves the determinations, a correct abstention leaves the abstainable", () => {
    const facts = [
      { vignetteId: "NCT00000001-v1", label: "L1" },
      { vignetteId: "NCT00000001-v1", label: "L5" },
    ];
    const s = withoutOtherSex(before.conversations.slice(0, 1), facts);
    expect(s.determinations).toBe(9);
    expect(s.confidentlyWrong).toBe(1);
    expect(s.abstainable).toBe(1);
    expect(s.correctAbstentions).toBe(1);
  });

  it("filters a v3 run's stored verdict hits by v4's pattern, and says so", () => {
    const v3 = run(
      [
        conversation(
          "NCT00000001-v1",
          "labels",
          score(1, 0),
          [],
          ["Has a surgeon said you are a candidate for surgery?", "You may not be eligible."],
        ),
      ],
      "3",
    );
    const c = compareRuns(v3, v3, { leastSeen: false });
    expect(c.twelve.before.labels.all.discipline.verdictHits.map((h) => h.text)).toEqual([
      "You may not be eligible.",
    ]);
    expect(renderComparison(v3, v3, c)).toContain(
      "grader v3's stored hits, filtered by v4's pattern",
    );
  });

  it("judges the bar fixed in spec §8.2", () => {
    expect(barVerdict(score(100, 7), score(50, 6))).toEqual({
      labels: "better",
      parse: "better",
      improvement: true,
    });
    expect(barVerdict(score(100, 10), score(50, 6)).labels).toBe("mixed");
    expect(barVerdict(score(100, 15), score(50, 6)).labels).toBe("worse");
    // Abstention past 0.10 is worse, however few are wrong.
    expect(barVerdict(score(100, 0, 100, 11), score(50, 0)).labels).toBe("worse");
    expect(barVerdict(score(100, 7), score(50, 7)).improvement).toBe(false);
  });

  it("gives dev runs every fact that wasn't correct, per vignette, and the pace", () => {
    const d = run(
      [conversation("NCT00000001-dev", "labels", score(10, 1), [wrong("L3")])],
      "4",
      true,
    );
    const text = devReport(d, d);
    expect(text).toContain("━━ NCT00000001-dev");
    expect(text).toContain("L3 confidently-wrong: expected holds, recorded does-not-hold.");
    expect(text).toContain("agent call      before 3.0 s, after 3.0 s");
  });
});
