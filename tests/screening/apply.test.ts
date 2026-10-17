import { describe, expect, it } from "vitest";
import { initialProgress } from "../../src/screening/agenda.js";
import type { Reading } from "../../src/screening/apply.js";
import { applyReadings, finalize } from "../../src/screening/apply.js";
import { locateEvidence } from "../../src/screening/evidence.js";
import type { Progress, ScreeningCriterion } from "../../src/screening/types.js";

/**
 * The rules in spec §5, one test each. These are the guarantees the design
 * rests on: evidence that is not in the message is rejected, a clinical
 * criterion is never settled, a contradiction unsettles rather than picks.
 */
const P: ScreeningCriterion = { id: "P", polarity: "exclusion", type: "patient", text: "Pregnant" };
const Q: ScreeningCriterion = {
  id: "Q",
  polarity: "exclusion",
  type: "patient",
  text: "Prior gemcitabine",
};
const C: ScreeningCriterion = {
  id: "C",
  polarity: "inclusion",
  type: "clinical",
  text: "Previously untreated, pathologically confirmed, resectable stage II NSCLC",
};
const X: ScreeningCriterion = {
  id: "X",
  polarity: "inclusion",
  type: "protocol",
  text: "Adequate tissue for central testing",
};
const CRITERIA = [P, Q, C, X];

function apply(
  message: string,
  readings: Reading[],
  progress = initialProgress(CRITERIA),
  turn = 2,
) {
  return applyReadings({ criteria: CRITERIA, progress, turn, message }, readings);
}

function get(progress: readonly Progress[], id: string): Progress {
  const p = progress.find((x) => x.criterionId === id);
  if (p === undefined) {
    throw new Error(id);
  }
  return p;
}

describe("locateEvidence", () => {
  it("finds an exact quote", () => {
    expect(locateEvidence("No, I'm not pregnant.", "not pregnant")).toMatchObject({ loose: false });
  });

  it("forgives whitespace, case and curly quotes, and nothing else", () => {
    expect(locateEvidence("No, I’m not\n  pregnant.", "i'm not pregnant")).toMatchObject({
      loose: true,
    });
    expect(locateEvidence("No, I'm not pregnant.", "I am not pregnant")).toBeUndefined();
  });

  it("rejects an empty quote", () => {
    expect(locateEvidence("Anything.", "  ")).toBeUndefined();
  });
});

describe("rule 1: evidence must be in the message just received", () => {
  // The hallucination check, shown to fire.
  it("rejects a reading whose quote the person never said, and leaves the criterion open", () => {
    const out = apply("I'm not sure.", [
      { criterionId: "P", reading: "does-not-hold", quote: "definitely not pregnant" },
    ]);

    expect(out.rejected).toEqual([
      { turn: 2, criterionId: "P", reading: "does-not-hold", quote: "definitely not pregnant" },
    ]);
    expect(get(out.progress, "P").status).toBe("open");
  });

  it("rejects a reading with an empty quote, which is how a reading with no quote arrives", () => {
    const out = apply("No, I'm not pregnant.", [
      { criterionId: "P", reading: "does-not-hold", quote: "" },
    ]);

    expect(out.rejected).toEqual([
      { turn: 2, criterionId: "P", reading: "does-not-hold", quote: "" },
    ]);
    expect(get(out.progress, "P").status).toBe("open");
  });

  it("records evidence-not-found when a criterion closes with only rejected readings", () => {
    const out = apply("I'm not sure.", [
      { criterionId: "P", reading: "does-not-hold", quote: "definitely not pregnant" },
    ]);
    const findings = finalize(CRITERIA, out.progress, out.rejected);

    expect(findings.find((f) => f.criterionId === "P")).toMatchObject({
      status: "unresolved",
      reason: "evidence-not-found",
    });
  });
});

describe("rule 2: patient criteria", () => {
  it("settles on holds or does-not-hold, with the quote and turn as evidence", () => {
    const out = apply("No, not pregnant.", [
      { criterionId: "P", reading: "does-not-hold", quote: "not pregnant" },
    ]);

    expect(get(out.progress, "P")).toMatchObject({
      status: "does-not-hold",
      reason: "answered",
      evidence: [{ turn: 2, quote: "not pregnant", reading: "does-not-hold" }],
    });
  });

  it("leaves a partial or unclear answer open for its follow-up, remembering why", () => {
    const out = apply("Hmm, maybe.", [{ criterionId: "Q", reading: "unclear", quote: "maybe" }]);

    expect(get(out.progress, "Q")).toMatchObject({ status: "open", reason: "unclear" });
    expect(finalize(CRITERIA, out.progress, []).find((f) => f.criterionId === "Q")).toMatchObject({
      status: "unresolved",
      reason: "unclear",
    });
  });

  it("closes as unresolved at once on unknown or declined", () => {
    const out = apply("I'd rather not say. No idea about that.", [
      { criterionId: "P", reading: "declined", quote: "I'd rather not say" },
      { criterionId: "Q", reading: "unknown", quote: "No idea" },
    ]);

    expect(get(out.progress, "P")).toMatchObject({ status: "unresolved", reason: "declined" });
    expect(get(out.progress, "Q")).toMatchObject({ status: "unresolved", reason: "unknown" });
  });

  it("settles a criterion that was not the one asked, from a volunteered answer", () => {
    const out = apply("Not pregnant, and I never had gemcitabine.", [
      { criterionId: "P", reading: "does-not-hold", quote: "Not pregnant" },
      { criterionId: "Q", reading: "does-not-hold", quote: "never had gemcitabine" },
    ]);

    expect(get(out.progress, "Q").status).toBe("does-not-hold");
  });
});

describe("rule 3: a clinical criterion is never settled by the patient", () => {
  it("records a clear answer as reported and leaves the finding for chart review", () => {
    const out = apply("Biopsy-confirmed stage II, removable, untreated.", [
      {
        criterionId: "C",
        reading: "holds",
        quote: "Biopsy-confirmed stage II, removable, untreated",
      },
    ]);

    expect(get(out.progress, "C")).toMatchObject({
      status: "chart-review",
      reported: "holds",
      reason: "answered",
    });
  });

  it("keeps a partial answer open for a follow-up, and completes it when the follow-up answers", () => {
    const first = apply("Stage II, no treatment yet.", [
      {
        criterionId: "C",
        reading: "partial",
        quote: "Stage II, no treatment yet",
        missing: "whether it is resectable and pathologically confirmed",
      },
    ]);
    expect(get(first.progress, "C")).toMatchObject({ status: "open", reported: "partial" });
    expect(get(first.progress, "C").evidence[0]?.missing).toMatch(/resectable/);

    const second = apply(
      "Yes, the biopsy confirmed it and the surgeon says it can come out.",
      [{ criterionId: "C", reading: "holds", quote: "the biopsy confirmed it" }],
      first.progress,
      4,
    );
    expect(get(second.progress, "C")).toMatchObject({ status: "chart-review", reported: "holds" });
    expect(get(second.progress, "C").evidence).toHaveLength(2);
  });

  it("closes a still-partial clinical criterion as chart review with what was reported", () => {
    const out = apply("Stage II.", [{ criterionId: "C", reading: "partial", quote: "Stage II" }]);

    expect(finalize(CRITERIA, out.progress, []).find((f) => f.criterionId === "C")).toMatchObject({
      status: "chart-review",
      reported: "partial",
      reason: "partial",
    });
  });

  it("never produces holds or does-not-hold on a clinical criterion, whatever is read", () => {
    for (const reading of [
      "holds",
      "does-not-hold",
      "unknown",
      "declined",
      "partial",
      "unclear",
    ] as const) {
      const out = apply("words", [{ criterionId: "C", reading, quote: "words" }]);
      const finding = finalize(CRITERIA, out.progress, []).find((f) => f.criterionId === "C");
      expect(finding?.status, reading).toBe("chart-review");
    }
  });
});

describe("rule 4: contradiction", () => {
  it("unsettles a patient criterion and keeps both quotes", () => {
    const first = apply("Just the one, never gemcitabine.", [
      { criterionId: "Q", reading: "does-not-hold", quote: "never gemcitabine" },
    ]);
    const second = apply(
      "Actually I did have gemcitabine last year.",
      [{ criterionId: "Q", reading: "holds", quote: "I did have gemcitabine" }],
      first.progress,
      6,
    );

    expect(get(second.progress, "Q")).toMatchObject({
      status: "unresolved",
      reason: "contradicted",
    });
    expect(get(second.progress, "Q").evidence.map((e) => e.turn)).toEqual([2, 6]);
  });

  it("marks a contradicted clinical report and drops the report rather than pick one", () => {
    const first = apply("No hepatitis.", [
      { criterionId: "C", reading: "does-not-hold", quote: "No hepatitis" },
    ]);
    const second = apply(
      "Oh, I did have it.",
      [{ criterionId: "C", reading: "holds", quote: "I did have it" }],
      first.progress,
      4,
    );

    expect(get(second.progress, "C")).toMatchObject({
      status: "chart-review",
      reason: "contradicted",
    });
    expect(get(second.progress, "C").reported).toBeUndefined();
  });

  it("adds agreeing evidence to a settled criterion without changing it", () => {
    const first = apply("Not pregnant.", [
      { criterionId: "P", reading: "does-not-hold", quote: "Not pregnant" },
    ]);
    const second = apply(
      "As I said, not pregnant.",
      [{ criterionId: "P", reading: "does-not-hold", quote: "not pregnant" }],
      first.progress,
      4,
    );

    expect(get(second.progress, "P")).toMatchObject({ status: "does-not-hold" });
    expect(get(second.progress, "P").evidence).toHaveLength(2);
  });
});

describe("rule 5: readings the agent had no business making", () => {
  it("ignores and counts readings for unknown or unraisable criteria", () => {
    const out = apply("Some words.", [
      { criterionId: "ZZ", reading: "holds", quote: "Some words" },
      { criterionId: "X", reading: "holds", quote: "Some words" },
    ]);

    expect(out.ignored.map((i) => [i.criterionId, i.why])).toEqual([
      ["ZZ", "unknown-criterion"],
      ["X", "not-raisable"],
    ]);
    expect(get(out.progress, "X").status).toBe("not-raised");
  });

  // Slice 0009 reversed this rule. Before it, a vaguer reading of a settled
  // criterion was ignored; now the read call reports one only when the reply
  // changes what was recorded, and it is shown what was, so a qualification
  // unsettles the answer and both quotes are kept.
  it("unsettles a settled criterion on any later reading but agreement", () => {
    for (const reading of ["unclear", "partial", "unknown", "declined"] as const) {
      const first = apply("Not pregnant.", [
        { criterionId: "P", reading: "does-not-hold", quote: "Not pregnant" },
      ]);
      const second = apply(
        "Well, not sure now.",
        [{ criterionId: "P", reading, quote: "not sure now" }],
        first.progress,
        4,
      );

      expect(second.ignored, reading).toEqual([]);
      expect(get(second.progress, "P"), reading).toMatchObject({
        status: "unresolved",
        reason: "contradicted",
      });
      expect(
        get(second.progress, "P").evidence.map((e) => e.quote),
        reading,
      ).toEqual(["Not pregnant", "not sure now"]);
    }
  });
});

describe("slice 0009: a determination not said outright is held back", () => {
  it("turns holds, does-not-hold and does-not-apply into unclear, recording what was held back", () => {
    for (const reading of ["holds", "does-not-hold", "does-not-apply"] as const) {
      const out = apply("I'd imagine so, more or less.", [
        {
          criterionId: "Q",
          reading,
          quote: "I'd imagine so",
          outright: false,
          statement: "The person has had gemcitabine.",
        },
      ]);
      const q = get(out.progress, "Q");
      expect(q.status, reading).toBe("open");
      expect(q.reason, reading).toBe("unclear");
      expect(q.evidence, reading).toEqual([
        {
          turn: 2,
          quote: "I'd imagine so",
          reading: "unclear",
          statement: "The person has had gemcitabine.",
          withheld: reading,
        },
      ]);
    }
  });

  it("leaves readings that settle nothing as they are", () => {
    for (const reading of ["unclear", "partial", "unknown", "declined"] as const) {
      const out = apply("Hard to say, really.", [
        { criterionId: "Q", reading, quote: "Hard to say", outright: false },
      ]);
      expect(get(out.progress, "Q").evidence[0]?.reading, reading).toBe(reading);
      expect(get(out.progress, "Q").evidence[0]?.withheld, reading).toBeUndefined();
    }
  });

  it("settles as before when the words are outright, and keeps the statement", () => {
    const out = apply("Gemcitabine, no, never.", [
      {
        criterionId: "Q",
        reading: "does-not-hold",
        quote: "Gemcitabine, no, never",
        outright: true,
        statement: "The person has had gemcitabine.",
      },
    ]);
    const q = get(out.progress, "Q");
    expect(q.status).toBe("does-not-hold");
    expect(q.evidence[0]?.statement).toBe("The person has had gemcitabine.");
  });

  it("holds back a clinical report too, so a tentative word is not reported as an answer", () => {
    const out = apply("Probably untreated, I think.", [
      { criterionId: "C", reading: "holds", quote: "Probably untreated", outright: false },
    ]);
    const c = get(out.progress, "C");
    expect(c.status).toBe("open");
    expect(c.reported).toBeUndefined();
    expect(c.reason).toBe("unclear");
  });
});

describe("slice 0009: does not apply", () => {
  it("closes an open patient criterion as unresolved with its own reason, finally", () => {
    const out = apply("That one's for men, and I'm a woman.", [
      { criterionId: "Q", reading: "does-not-apply", quote: "I'm a woman" },
    ]);
    const q = get(out.progress, "Q");
    expect(q.status).toBe("unresolved");
    expect(q.reason).toBe("does-not-apply");

    const later = apply(
      "Oh, gemcitabine, yes I had it.",
      [{ criterionId: "Q", reading: "holds", quote: "gemcitabine, yes I had it" }],
      out.progress,
      4,
    );
    expect(get(later.progress, "Q").status).toBe("unresolved");
    expect(later.ignored).toMatchObject([{ criterionId: "Q", why: "already-settled" }]);
  });

  it("unsettles a settled patient criterion as contradicted, keeping both quotes", () => {
    const first = apply("No gemcitabine.", [
      { criterionId: "Q", reading: "does-not-hold", quote: "No gemcitabine" },
    ]);
    const out = apply(
      "Actually that question wasn't for someone like me.",
      [{ criterionId: "Q", reading: "does-not-apply", quote: "wasn't for someone like me" }],
      first.progress,
      4,
    );
    const q = get(out.progress, "Q");
    expect(q.status).toBe("unresolved");
    expect(q.reason).toBe("contradicted");
    expect(q.evidence.map((e) => e.quote)).toEqual([
      "No gemcitabine",
      "wasn't for someone like me",
    ]);
  });

  it("sends an open clinical criterion to chart review, reported as not applying", () => {
    const out = apply("That's not about someone like me.", [
      { criterionId: "C", reading: "does-not-apply", quote: "not about someone like me" },
    ]);
    const c = get(out.progress, "C");
    expect(c.status).toBe("chart-review");
    expect(c.reason).toBe("does-not-apply");
    expect(c.reported).toBe("does-not-apply");
  });

  it("marks a clinical report contradicted when the person later says it doesn't apply", () => {
    const first = apply("Untreated, yes, stage two.", [
      { criterionId: "C", reading: "holds", quote: "Untreated, yes" },
    ]);
    const out = apply(
      "Wait, that isn't for me at all.",
      [{ criterionId: "C", reading: "does-not-apply", quote: "that isn't for me" }],
      first.progress,
      4,
    );
    const c = get(out.progress, "C");
    expect(c.reason).toBe("contradicted");
    expect(c.reported).toBeUndefined();
  });
});

describe("finalize", () => {
  it("closes an unasked criterion as no-answer and keeps not-raised reasons", () => {
    const findings = finalize(CRITERIA, initialProgress(CRITERIA), []);

    expect(findings.map((f) => [f.criterionId, f.status, f.reason])).toEqual([
      ["P", "unresolved", "no-answer"],
      ["Q", "unresolved", "no-answer"],
      ["C", "chart-review", "no-answer"],
      ["X", "not-raised", "protocol"],
    ]);
  });
});
