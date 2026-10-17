import { describe, expect, it } from "vitest";
import { normalize, parseCriteria } from "../../src/criteria/index.js";
import type { Criterion } from "../../src/criteria/types.js";
import { FakeModelAdapter } from "../../src/models/index.js";
import { gateRecord, gateTrial } from "../fixtures/gate-trial.js";

/**
 * The gate parse replayed (slice 0015, intent decision 6(a)).
 *
 * 0013's gate saved NCT06090266's parse: 34 criteria kept, 11 rejected, 6
 * passages unclaimed. The model's answer isn't saved whole, but enough of it
 * is to send it back through `parseCriteria`: each kept criterion's quote is
 * the text of its span, and each rejected one is saved as the model gave it.
 *
 * The kept go first, in source order, and the rejected after them. That
 * reproduces the gate's cursor exactly, because a rejected quote never moved
 * it; what the heading-join rule now recovers is found by the whole-text
 * fallback. This test is where the numbers `docs/limitations.md` quotes come
 * from.
 */

const INFECTION = "Recent or ongoing serious infection including the following:";
const COHORTS = "For Cohorts A2, B1, B2, and B3 only:";

interface Raw {
  quote: string;
  polarity: string;
  type: string;
}

const record = gateRecord();
const trial = gateTrial();
const normalized = normalize(trial.eligibility.criteriaText);

/** The normalized text of a span of the original, which is what the model was shown. */
function shown(source: Criterion["source"]): string {
  const start = normalized.sourceIndex.indexOf(source.start);
  const end = normalized.sourceIndex.lastIndexOf(source.end - 1) + 1;
  return normalized.text.slice(start, end);
}

function replay(): FakeModelAdapter {
  const kept = [...record.parsed.criteria]
    .sort((a, b) => a.source.start - b.source.start)
    .map((c) => ({
      quote: shown(c.source),
      text: c.text,
      polarity: c.polarity,
      type: c.type,
      appliesTo: c.appliesTo ?? null,
      confidence: c.confidence,
    }));
  const rejected = record.parsed.rejected.map((r) => r.raw);
  return new FakeModelAdapter([{ kind: "json", content: { criteria: [...kept, ...rejected] } }]);
}

describe("NCT06090266's gate parse, replayed through the heading-join rule", () => {
  it("starts from what the gate saved", () => {
    expect(record.parsed.criteria).toHaveLength(34);
    expect(record.parsed.rejected).toHaveLength(11);
    expect(record.parsed.unclaimed).toHaveLength(6);
  });

  it("keeps the gate's 34 where the gate put them", async () => {
    const parsed = await parseCriteria(trial, replay());
    const sorted = [...record.parsed.criteria].sort((a, b) => a.source.start - b.source.start);

    expect(parsed.criteria.slice(0, 34).map((c) => c.source)).toEqual(sorted.map((c) => c.source));
    expect(parsed.criteria.slice(0, 34).every((c) => c.heading === undefined)).toBe(true);
  });

  it("recovers the ten heading joins, each at its item", async () => {
    const parsed = await parseCriteria(trial, replay());
    const recovered = parsed.criteria.filter((c) => c.heading !== undefined);

    expect(parsed.criteria).toHaveLength(44);
    expect(recovered).toHaveLength(10);
    expect(recovered.filter((c) => c.heading?.text === INFECTION)).toHaveLength(5);
    expect(recovered.filter((c) => c.heading?.text === COHORTS)).toHaveLength(5);

    const raws = record.parsed.rejected
      .map((r) => r.raw as Raw)
      .filter((raw) => !raw.quote.startsWith("Cohorts B2 and B3"));
    for (const [i, c] of recovered.entries()) {
      const raw = raws[i];
      const heading = c.heading?.text ?? "";
      const item = raw?.quote.slice(heading.length).trim() ?? "";

      expect(raw?.quote.startsWith(heading)).toBe(true);
      expect(shown(c.source)).toBe(item);
      expect(c.polarity).toBe(raw?.polarity);
      expect(c.type).toBe(raw?.type);
    }
  });

  it("still rejects the one quote that isn't a heading join", async () => {
    const parsed = await parseCriteria(trial, replay());

    expect(parsed.rejected).toHaveLength(1);
    expect(parsed.rejected[0]?.quote).toMatch(
      /^Cohorts B2 and B3 \(dose-expansion\) ii\. Cohort B3/,
    );
  });

  it("leaves 8 passages unclaimed: the B3 item, and 7 carve-outs", async () => {
    const parsed = await parseCriteria(trial, replay());
    const starts = parsed.unclaimed.map((u) => u.text.trim().slice(0, 40));

    // The gate's 6 were 3 left by rejected criteria and 3 carve-outs. Recovered
    // items claim the first kind and expose each one's own carve-out, the
    // sentences after an exclusion that say who is eligible anyway. Carve-outs
    // are out of this slice's scope (intent decision 5).
    expect(starts).toEqual([
      "ii. Cohort B3 subjects (PROC) must have ",
      "Subjects who are clinically stable for a",
      "Subjects with previously treated brain m",
      "1. Subjects with a known history of AJCC",
      "Subjects on stable highly active antiret",
      "Subjects who are or have received anti-H",
      "Subjects on or having received anti-retr",
      "Subjects on hormone replacement therapy ",
    ]);
  });
});
