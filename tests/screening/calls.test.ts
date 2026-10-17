import { describe, expect, it } from "vitest";
import { FakeModelAdapter } from "../../src/models/index.js";
import { ask, RETRY_AFTER_TRUNCATION, read } from "../../src/screening/calls.js";
import type { ScreeningCriterion } from "../../src/screening/types.js";
import { ScreeningError } from "../../src/screening/types.js";

const CRITERION: ScreeningCriterion = {
  id: "L19",
  polarity: "exclusion",
  type: "patient",
  text: "Pregnant",
};
const STUDY = { nctId: "NCT04316364", briefTitle: "Study" };
const ASK = { study: STUDY, transcript: [], criterion: CRITERION, kind: "patient" as const };
const READ = {
  transcript: [],
  message: "No.",
  askedAbout: "L19",
  open: [CRITERION],
  answered: [],
};

describe("ask", () => {
  it("returns the phrased question and counts one call", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { message: " Are you pregnant? " } },
    ]);

    expect(await ask(adapter, ASK)).toEqual({ value: "Are you pregnant?", calls: 1 });
    expect(adapter.requests[0]?.maxOutputTokens).toBe(256);
  });

  // Found at Gate 2: oMLX's JSON mode wraps the object in an array every time.
  it("unwraps an answer wrapped in a one-element array, and nothing looser", async () => {
    const wrapped = new FakeModelAdapter([
      { kind: "json", content: [{ message: "Are you pregnant?" }] },
    ]);
    expect((await ask(wrapped, ASK)).value).toBe("Are you pregnant?");

    const two = new FakeModelAdapter([
      { kind: "json", content: [{ message: "a" }, { message: "b" }] },
      { kind: "json", content: [{ message: "a" }, { message: "b" }] },
    ]);
    await expect(ask(two, ASK)).rejects.toBeInstanceOf(ScreeningError);
  });

  it("retries once on an empty message", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { message: "" } },
      { kind: "json", content: { message: "Are you pregnant?" } },
    ]);

    expect(await ask(adapter, ASK)).toEqual({ value: "Are you pregnant?", calls: 2 });
  });

  // An identical retry at temperature 0 loops identically; the retry must differ.
  it("retries a truncated response with a note appended, so the model cannot loop the same way", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { readings: [] }, finishReason: "length" },
      { kind: "json", content: { readings: [] } },
    ]);

    await read(adapter, READ);

    expect(adapter.requests[0]?.user).not.toContain(RETRY_AFTER_TRUNCATION);
    expect(adapter.requests[1]?.user.endsWith(RETRY_AFTER_TRUNCATION)).toBe(true);
  });

  it("treats truncation as a failed attempt and gives up after two", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { message: "Are" }, finishReason: "length" },
      { kind: "json", content: { message: "Are" }, finishReason: "length" },
    ]);

    await expect(ask(adapter, ASK)).rejects.toBeInstanceOf(ScreeningError);
  });
});

describe("read", () => {
  it("returns validated readings, keeping missing only on partial answers", async () => {
    const adapter = new FakeModelAdapter([
      {
        kind: "json",
        content: {
          readings: [
            {
              criterionId: "L19",
              statement: "Is pregnant.",
              quote: "No.",
              outright: true,
              reading: "does-not-hold",
            },
            {
              criterionId: "L2",
              statement: "Has untreated, resectable stage II disease.",
              quote: "stage II",
              outright: true,
              reading: "partial",
              missing: "resectability",
            },
          ],
        },
      },
    ]);

    const { value } = await read(adapter, READ);

    expect(value).toEqual([
      {
        criterionId: "L19",
        reading: "does-not-hold",
        quote: "No.",
        statement: "Is pregnant.",
        outright: true,
      },
      {
        criterionId: "L2",
        reading: "partial",
        quote: "stage II",
        missing: "resectability",
        statement: "Has untreated, resectable stage II disease.",
        outright: true,
      },
    ]);
  });

  // Slice 0009: the statement and outright are what the reading rests on.
  it("accepts does-not-apply, and an answer marked not outright", async () => {
    const adapter = new FakeModelAdapter([
      {
        kind: "json",
        content: {
          readings: [
            {
              criterionId: "L19",
              statement: "Is a man with a partner who could conceive.",
              quote: "I'm a woman",
              outright: true,
              reading: "does-not-apply",
            },
            {
              criterionId: "L2",
              statement: "Has resectable disease.",
              quote: "should be fine",
              outright: false,
              reading: "holds",
            },
          ],
        },
      },
    ]);

    const { value } = await read(adapter, READ);

    expect(value.map((r) => [r.reading, r.outright])).toEqual([
      ["does-not-apply", true],
      ["holds", false],
    ]);
  });

  // Changed after 0009's freeze: a reading with no quote is kept with an empty
  // one, so rule 1 rejects it and the reply's other readings still count.
  it("keeps a reading with no quote as an empty quote, for the evidence rule to reject, and keeps the rest", async () => {
    const adapter = new FakeModelAdapter([
      {
        kind: "json",
        content: {
          readings: [
            {
              criterionId: "L19",
              statement: "Is pregnant.",
              quote: "No.",
              outright: true,
              reading: "does-not-hold",
            },
            {
              criterionId: "L2",
              statement: "Has resectable disease.",
              outright: true,
              reading: "holds",
            },
          ],
        },
      },
    ]);

    const { value, calls } = await read(adapter, READ);

    expect(calls).toBe(1);
    expect(value.map((r) => [r.criterionId, r.quote])).toEqual([
      ["L19", "No."],
      ["L2", ""],
    ]);
  });

  it("refuses a reading with no statement or no outright, then fails after the retry", async () => {
    for (const reading of [
      { criterionId: "L19", quote: "No.", outright: true, reading: "does-not-hold" },
      {
        criterionId: "L19",
        statement: "  ",
        quote: "No.",
        outright: true,
        reading: "does-not-hold",
      },
      {
        criterionId: "L19",
        statement: "Is pregnant.",
        quote: "No.",
        outright: "yes",
        reading: "does-not-hold",
      },
    ]) {
      const adapter = new FakeModelAdapter([
        { kind: "json", content: { readings: [reading] } },
        { kind: "json", content: { readings: [reading] } },
      ]);
      await expect(read(adapter, READ)).rejects.toThrow(
        /statement missing|outright is not true or false/,
      );
    }
  });

  it("accepts an empty list: a reply can address nothing", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: { readings: [] } }]);

    expect((await read(adapter, READ)).value).toEqual([]);
    // Raised from 1,024 in 0009: a reply can speak to a dozen criteria, each with a statement.
    expect(adapter.requests[0]?.maxOutputTokens).toBe(2048);
  });

  it("retries on an unrecognised reading value, then fails", async () => {
    const adapter = new FakeModelAdapter([
      {
        kind: "json",
        content: { readings: [{ criterionId: "L19", reading: "eligible", quote: "No." }] },
      },
      { kind: "json", content: { nope: true } },
    ]);

    await expect(read(adapter, READ)).rejects.toThrow(/not recognised|no readings array/);
  });

  it("lets an adapter failure through untouched, so the session can retry the turn", async () => {
    const adapter = new FakeModelAdapter([{ kind: "error", message: "connection refused" }]);

    await expect(read(adapter, READ)).rejects.toThrow(/connection refused/);
  });
});
