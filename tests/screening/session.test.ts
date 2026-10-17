import { describe, expect, it } from "vitest";
import type { ScriptedResponse } from "../../src/models/index.js";
import { FakeModelAdapter } from "../../src/models/index.js";
import { MAX_ASKS } from "../../src/screening/agenda.js";
import type { AgentReply } from "../../src/screening/session.js";
import { ScreeningSession } from "../../src/screening/session.js";
import type { ScreeningCriterion, ScreeningResult } from "../../src/screening/types.js";
import { ScreeningError } from "../../src/screening/types.js";

/**
 * The session drives a conversation with a scripted model. Each test scripts
 * the model's ask and read responses in the order the session will request
 * them: ask, then for every reply a read followed by an ask (or nothing, when
 * the conversation closes).
 */
const STUDY = { nctId: "NCT04316364", briefTitle: "A Lung Cancer Study" };
const CRITERIA: ScreeningCriterion[] = [
  { id: "L8", polarity: "exclusion", type: "patient", text: "Previous anti-cancer therapy" },
  { id: "L4", polarity: "inclusion", type: "protocol", text: "Adequate tissue for PD-L1 testing" },
  { id: "L2", polarity: "inclusion", type: "clinical", text: "Untreated, resectable stage II" },
  { id: "L19", polarity: "exclusion", type: "patient", text: "Pregnant" },
];

const askR = (message: string): ScriptedResponse => ({ kind: "json", content: { message } });
const readR = (
  readings: Array<{
    criterionId: string;
    reading: string;
    quote: string;
    missing?: string;
    outright?: boolean;
  }>,
): ScriptedResponse => ({
  kind: "json",
  content: {
    readings: readings.map((r) => ({
      statement: "The criterion's statement.",
      outright: true,
      ...r,
    })),
  },
});

function session(script: ScriptedResponse[]): { s: ScreeningSession; adapter: FakeModelAdapter } {
  const adapter = new FakeModelAdapter(script);
  return { s: ScreeningSession.create(STUDY, CRITERIA, adapter), adapter };
}

function done(reply: AgentReply): ScreeningResult {
  if (reply.kind !== "done") {
    throw new Error(`expected the conversation to be done, got: ${reply.text}`);
  }
  return reply.result;
}

const HAPPY: ScriptedResponse[] = [
  askR("Have you had any anti-cancer therapy?"),
  readR([{ criterionId: "L8", reading: "does-not-hold", quote: "No treatment" }]),
  askR("Has a surgeon said it can be removed?"),
  readR([{ criterionId: "L2", reading: "holds", quote: "stage II, removable" }]),
  askR("Are you pregnant?"),
  readR([{ criterionId: "L19", reading: "does-not-hold", quote: "not pregnant" }]),
];
const REPLIES = [
  "No treatment at all.",
  "It's stage II, removable, untreated.",
  "No, I'm not pregnant.",
];

describe("a whole conversation", () => {
  it("opens, asks each raisable criterion once, closes, and hands off findings", async () => {
    const { s } = session(HAPPY);

    const first = await s.start();
    expect(first.text).toMatch(/^Hello[\s\S]*coordinator[\s\S]*\n\nHave you had any anti-cancer/);

    await s.receive(REPLIES[0] ?? "");
    await s.receive(REPLIES[1] ?? "");
    const result = done(await s.receive(REPLIES[2] ?? ""));

    expect(result.findings.map((f) => [f.criterionId, f.status])).toEqual([
      ["L8", "does-not-hold"],
      ["L4", "not-raised"],
      ["L2", "chart-review"],
      ["L19", "does-not-hold"],
    ]);
    expect(result.handoff).toEqual({
      holds: [],
      doesNotHold: ["L8", "L19"],
      unresolved: [],
      chartReview: ["L2"],
      notRaised: ["L4"],
    });
    expect(result.calls).toBe(6);
    expect(result.run.promptVersion).toMatch(/^[0-9a-f]{12}$/);
  });

  it("never asks about a protocol criterion", async () => {
    const { s } = session(HAPPY);
    await s.start();
    for (const reply of REPLIES) {
      await s.receive(reply);
    }

    const asked = s
      .state()
      .transcript.filter((t) => t.kind === "question")
      .map((t) => t.criterionId);
    expect(asked).toEqual(["L8", "L2", "L19"]);
  });

  // A result with no field for a verdict cannot be rendered as one.
  it("produces a result with no eligibility-shaped field anywhere", async () => {
    const { s } = session(HAPPY);
    await s.start();
    await s.receive(REPLIES[0] ?? "");
    await s.receive(REPLIES[1] ?? "");
    const result = done(await s.receive(REPLIES[2] ?? ""));

    const keys = JSON.stringify(result).match(/"[A-Za-z]+":/g) ?? [];
    expect(keys.filter((k) => /eligib|verdict|disposition|qualif/i.test(k))).toEqual([]);
  });
});

describe("termination and follow-ups", () => {
  it("ends even when the model never reads a clear answer, asking each criterion twice", async () => {
    const unclear = (id: string) => readR([{ criterionId: id, reading: "unclear", quote: "hmm" }]);
    const script = [
      askR("q"),
      unclear("L8"),
      askR("q"),
      unclear("L8"),
      askR("q"),
      unclear("L2"),
      askR("q"),
      unclear("L2"),
      askR("q"),
      unclear("L19"),
      askR("q"),
      unclear("L19"),
    ];
    const { s } = session(script);

    let reply = await s.start();
    let turns = 0;
    while (reply.kind === "message") {
      reply = await s.receive("hmm");
      turns += 1;
      expect(turns).toBeLessThanOrEqual(3 * MAX_ASKS);
    }

    expect(turns).toBe(3 * MAX_ASKS);
    const result = done(reply);
    expect(result.findings.find((f) => f.criterionId === "L8")).toMatchObject({
      status: "unresolved",
      reason: "unclear",
      timesAsked: 2,
    });
  });

  it("follows up on a partial answer by naming what is missing", async () => {
    const script = [
      askR("q"),
      readR([{ criterionId: "L8", reading: "does-not-hold", quote: "No" }]),
      askR("Tell me about your diagnosis?"),
      readR([
        {
          criterionId: "L2",
          reading: "partial",
          quote: "stage II",
          missing: "whether it is resectable",
        },
      ]),
      askR("Has a surgeon said it can be removed?"),
    ];
    const { s, adapter } = session(script);

    await s.start();
    await s.receive("No");
    const reply = await s.receive("It's stage II.");

    expect(reply.text).toBe("Has a surgeon said it can be removed?");
    expect(adapter.requests.at(-1)?.user).toMatch(
      /FOLLOW-UP: They said: "stage II"\. Still missing: whether it is resectable/,
    );
  });

  it("skips a criterion already settled by a volunteered answer", async () => {
    const script = [
      askR("Any anti-cancer therapy?"),
      readR([
        { criterionId: "L8", reading: "does-not-hold", quote: "no treatment" },
        { criterionId: "L19", reading: "does-not-hold", quote: "not pregnant" },
      ]),
      askR("Has a surgeon said it can be removed?"),
      readR([{ criterionId: "L2", reading: "holds", quote: "removable" }]),
    ];
    const { s } = session(script);

    await s.start();
    await s.receive("I've had no treatment, and I'm not pregnant either.");
    const result = done(await s.receive("Yes, removable."));

    expect(result.findings.find((f) => f.criterionId === "L19")?.status).toBe("does-not-hold");
    expect(result.transcript.filter((t) => t.criterionId === "L19")).toEqual([]);
  });

  it("shows settled criteria to the read call, so a correction can be noticed", async () => {
    const script = [
      askR("q"),
      readR([{ criterionId: "L8", reading: "does-not-hold", quote: "No" }]),
      askR("q"),
      readR([
        { criterionId: "L8", reading: "holds", quote: "I did have chemo" },
        { criterionId: "L2", reading: "unknown", quote: "not sure" },
      ]),
      askR("q"),
    ];
    const { s, adapter } = session(script);

    await s.start();
    await s.receive("No");
    await s.receive("Actually I did have chemo. Not sure about the rest.");

    expect(adapter.requests[3]?.user).toMatch(/ALREADY ANSWERED[^\n]*\n- L8 /);
    expect(s.state().progress.find((p) => p.criterionId === "L8")).toMatchObject({
      status: "unresolved",
      reason: "contradicted",
    });
  });
});

describe("state", () => {
  it("serialized and restored after every turn, runs exactly as an uninterrupted session", async () => {
    const straight = session(HAPPY).s;
    await straight.start();
    let expected: ScreeningResult | undefined;
    for (const reply of REPLIES) {
      const r = await straight.receive(reply);
      if (r.kind === "done") expected = r.result;
    }

    const adapter = new FakeModelAdapter(HAPPY);
    let current = ScreeningSession.create(STUDY, CRITERIA, adapter);
    await current.start();
    let restored: ScreeningResult | undefined;
    for (const reply of REPLIES) {
      current = ScreeningSession.fromState(JSON.parse(JSON.stringify(current.state())), adapter);
      const r = await current.receive(reply);
      if (r.kind === "done") restored = r.result;
    }

    const strip = (r: ScreeningResult | undefined) => ({ ...r, run: { ...r?.run, timestamp: "" } });
    expect(strip(restored)).toEqual(strip(expected));
  });

  it("leaves the state untouched when a model call fails, so the same message can be sent again", async () => {
    const script = [
      askR("Any anti-cancer therapy?"),
      { kind: "error", message: "connection refused" } as ScriptedResponse,
      readR([{ criterionId: "L8", reading: "does-not-hold", quote: "No" }]),
      askR("Has a surgeon said it can be removed?"),
    ];
    const { s } = session(script);
    await s.start();
    const before = s.state();

    await expect(s.receive("No")).rejects.toThrow(/connection refused/);
    expect(s.state()).toEqual(before);

    const retried = await s.receive("No");
    expect(retried.text).toBe("Has a surgeon said it can be removed?");
    expect(s.state().transcript.filter((t) => t.speaker === "participant")).toHaveLength(1);
  });

  it("refuses to start twice, to receive before starting, or after finishing", async () => {
    const { s } = session(HAPPY);
    await expect(s.receive("hi")).rejects.toBeInstanceOf(ScreeningError);

    await s.start();
    await expect(s.start()).rejects.toBeInstanceOf(ScreeningError);
    for (const reply of REPLIES) {
      await s.receive(reply);
    }
    await expect(s.receive("more")).rejects.toThrow(/finished/);
  });

  it("refuses duplicate criterion ids", () => {
    const first = CRITERIA[0] as ScreeningCriterion;
    expect(() => ScreeningSession.create(STUDY, [first, first], new FakeModelAdapter())).toThrow(
      /duplicate criterion id L8/,
    );
  });
});

describe("slice 0009: corrections and criteria that don't apply", () => {
  const PARTNER: ScreeningCriterion = {
    id: "L49",
    polarity: "inclusion",
    type: "patient",
    text: "Men with a partner who could conceive must use contraception",
  };

  it("unsettles an answer the next reply corrects, and showed the read call what was recorded", async () => {
    const adapter = new FakeModelAdapter([
      askR("Have you had any anti-cancer therapy?"),
      readR([{ criterionId: "L8", reading: "does-not-hold", quote: "None so far" }]),
      askR("Has a surgeon said it can be removed?"),
      readR([
        { criterionId: "L8", reading: "holds", quote: "one round of chemo last spring" },
        { criterionId: "L2", reading: "holds", quote: "stage II, removable" },
      ]),
      askR("Are you pregnant?"),
      readR([{ criterionId: "L19", reading: "does-not-hold", quote: "not pregnant" }]),
    ]);
    const s = ScreeningSession.create(STUDY, CRITERIA, adapter);
    await s.start();
    await s.receive("None so far.");
    await s.receive("Wait, there was one round of chemo last spring. It's stage II, removable.");
    const result = done(await s.receive("I'm not pregnant."));

    const l8 = result.findings.find((f) => f.criterionId === "L8");
    expect(l8?.status).toBe("unresolved");
    expect(l8?.reason).toBe("contradicted");
    expect(l8?.evidence.map((e) => e.quote)).toEqual([
      "None so far",
      "one round of chemo last spring",
    ]);
    // The second read was told what the first recorded.
    expect(adapter.requests[3]?.user).toContain('recorded: does-not-hold, from "None so far"');
  });

  it("lists answered criteria most recent first, and an open one with what was said so far", async () => {
    const adapter = new FakeModelAdapter([
      askR("Have you had any anti-cancer therapy?"),
      readR([
        { criterionId: "L8", reading: "does-not-hold", quote: "No therapy" },
        { criterionId: "L19", reading: "unclear", quote: "can't say about the other" },
      ]),
      askR("Has a surgeon said it can be removed?"),
      readR([{ criterionId: "L2", reading: "holds", quote: "stage II, removable" }]),
      askR("Are you pregnant?"),
      readR([{ criterionId: "L19", reading: "does-not-hold", quote: "not pregnant" }]),
    ]);
    const s = ScreeningSession.create(STUDY, CRITERIA, adapter);
    await s.start();
    await s.receive("No therapy, and I can't say about the other.");
    await s.receive("It's stage II, removable.");
    await s.receive("I'm not pregnant.");

    const lastRead = adapter.requests[5]?.user ?? "";
    // L2 was answered at turn 4, L8 at turn 2: newest first.
    expect(lastRead.indexOf("- L2 [INCLUSION]")).toBeLessThan(lastRead.indexOf("- L8 [EXCLUSION]"));
    expect(lastRead).toContain(
      '- L19 [EXCLUSION]: Pregnant\n    said so far: unclear, from "can\'t say about the other"',
    );
  });

  it("closes a criterion for another group as unresolved, does-not-apply", async () => {
    const adapter = new FakeModelAdapter([
      askR("Does this apply to you?"),
      readR([{ criterionId: "L49", reading: "does-not-apply", quote: "I'm a woman" }]),
    ]);
    const s = ScreeningSession.create(STUDY, [PARTNER], adapter);
    await s.start();
    const result = done(await s.receive("That's about men, and I'm a woman."));

    expect(result.findings).toMatchObject([
      { criterionId: "L49", status: "unresolved", reason: "does-not-apply" },
    ]);
    expect(result.handoff.unresolved).toEqual(["L49"]);
  });
});
