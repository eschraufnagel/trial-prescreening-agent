import { describe, expect, it } from "vitest";
import { renderHtml, renderText, toView } from "../../scripts/show-conversation.js";
import type { ScreeningResult } from "../../src/screening/index.js";

const result = {
  study: { nctId: "NCT04316364", briefTitle: "Study" },
  transcript: [
    { index: 0, speaker: "agent", kind: "opening", text: "Hello." },
    { index: 1, speaker: "agent", kind: "question", text: "Any <b>chemo</b>?", criterionId: "L8" },
    { index: 2, speaker: "participant", kind: "reply", text: "No, never & I'm fine." },
    { index: 3, speaker: "agent", kind: "closing", text: "Thanks." },
  ],
  findings: [
    {
      criterionId: "L8",
      status: "does-not-hold",
      reason: "answered",
      evidence: [{ turn: 2, quote: "No, never", reading: "does-not-hold" }],
      timesAsked: 1,
    },
  ],
} as unknown as ScreeningResult;

const view = toView(
  {
    result,
    state: {
      criteria: [
        { id: "L8", polarity: "exclusion", type: "patient", text: "Previous anti-cancer therapy" },
      ],
      transcript: [],
    },
    participant: [{ turn: 2, flags: [{ kind: "model", reason: "invents a hospital stay" }] }],
    vignetteId: "NCT04316364-v1",
    source: "labels",
  },
  "file.json",
);

describe("the conversation view", () => {
  it("shows each finding with its criterion, status and the words behind it", () => {
    const text = renderText(view);

    expect(text).toMatch(/L8 {3}does not hold \(answered\) {2}Previous anti-cancer therapy/);
    expect(text).toMatch(/turn 2: "No, never"/);
    expect(text).toMatch(/⚑ simulator flag: invents a hospital stay/);
  });

  it("escapes conversation text in the page and links evidence to its turn", () => {
    const html = renderHtml(view);

    expect(html).toMatch(/Any &lt;b&gt;chemo&lt;\/b&gt;\?/);
    expect(html).not.toMatch(/<b>chemo<\/b>/);
    expect(html).toMatch(/<a href="#t2">turn 2<\/a> “No, never”/);
    expect(html).toMatch(/not an eligibility decision/);
  });
});

describe("the read call's statement and held-back readings (slice 0009)", () => {
  const withStatement = toView(
    {
      result: {
        ...result,
        findings: [
          {
            criterionId: "L8",
            status: "unresolved",
            reason: "unclear",
            evidence: [
              {
                turn: 2,
                quote: "No, never",
                reading: "unclear",
                statement: "The person has had anti-cancer therapy.",
                withheld: "does-not-hold",
              },
            ],
            timesAsked: 1,
          },
        ],
      } as unknown as ScreeningResult,
      state: {
        criteria: [
          {
            id: "L8",
            polarity: "exclusion",
            type: "patient",
            text: "Previous anti-cancer therapy",
          },
        ],
        transcript: [],
      },
      participant: [],
      vignetteId: "NCT04316364-v1",
      source: "labels",
    },
    "file.json",
  );

  it("prints the statement a reading judged, and a reading code held back", () => {
    const text = renderText(withStatement);
    expect(text).toMatch(/turn 2: "No, never" \(read as does-not-hold, not outright\)/);
    expect(text).toMatch(/judged: The person has had anti-cancer therapy\./);
  });

  it("shows both in the page, escaped", () => {
    const html = renderHtml(withStatement);
    expect(html).toMatch(/\(read as does-not-hold, not outright\)/);
    expect(html).toMatch(/judged: The person has had anti-cancer therapy\./);
  });
});
