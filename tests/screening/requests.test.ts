import { describe, expect, it } from "vitest";
import type { ScriptedResponse } from "../../src/models/index.js";
import { FakeModelAdapter } from "../../src/models/index.js";
import { MAX_ASKS } from "../../src/screening/agenda.js";
import { MAX_RESPONSES } from "../../src/screening/requests.js";
import type { AgentReply } from "../../src/screening/session.js";
import { ScreeningSession } from "../../src/screening/session.js";
import { STOP_AGAIN, STOP_NEXT, STOP_TEMPLATE } from "../../src/screening/templates.js";
import type { ScreeningCriterion, ScreeningResult } from "../../src/screening/types.js";

/**
 * What a participant's request does to a conversation (spec 0021 §3.2 and §4).
 * The model is scripted in the order the session calls it: ask, then for each
 * reply a read and, unless the turn is fixed text, an ask.
 */
const STUDY = { nctId: "NCT06557512", briefTitle: "A Meningioma Study" };
const CRITERIA: ScreeningCriterion[] = [
  {
    id: "P15",
    polarity: "exclusion",
    type: "clinical",
    text: "Any underlying medical or psychiatric condition that would interfere with evaluation",
  },
  { id: "P16", polarity: "exclusion", type: "clinical", text: "Uncontrolled seizures" },
  { id: "P17", polarity: "exclusion", type: "patient", text: "Pregnant" },
];

const askR = (message: string): ScriptedResponse => ({ kind: "json", content: { message } });
const readR = (
  readings: Array<{ criterionId: string; reading: string; quote: string }>,
  request: { kind: string; quote: string } | null = null,
): ScriptedResponse => ({
  kind: "json",
  content: {
    readings: readings.map((r) => ({ statement: "The statement.", outright: true, ...r })),
    request,
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

describe("an explanation request", () => {
  it("keeps the criterion open, records nothing from that reply, and explains it next", async () => {
    const { s, adapter } = session([
      askR("Do you have any medical or mental health conditions?"),
      readR([{ criterionId: "P15", reading: "does-not-hold", quote: "No" }], {
        kind: "explain",
        quote: "elaborate on this",
      }),
      askR("It means an illness that could make the study hard to judge. Do you have one?"),
    ]);
    await s.start();
    const reply = await s.receive("No, but elaborate on this");

    expect(reply.text).toMatch(/^It means an illness/);
    const state = s.state();
    const p15 = state.progress.find((p) => p.criterionId === "P15");
    expect(p15).toMatchObject({ status: "open", evidence: [], timesAsked: 1, responses: 1 });
    expect(state.pending).toBe("P15");
    expect(state.ignoredReadings).toEqual([
      { turn: 2, criterionId: "P15", reading: "does-not-hold", why: "asked-to-explain" },
    ]);
    expect(state.transcript[2]?.request).toEqual({ kind: "explain", quote: "elaborate on this" });
    expect(state.transcript[3]).toMatchObject({
      kind: "question",
      criterionId: "P15",
      responds: "explain",
    });
    expect(adapter.requests[2]?.user).toMatch(/REQUEST: They asked what this question means/);
    expect(adapter.requests[2]?.user).toMatch(/"elaborate on this"/);
  });

  it("still records what the same reply says about other criteria", async () => {
    const { s } = session([
      askR("Any conditions?"),
      readR(
        [
          { criterionId: "P15", reading: "does-not-hold", quote: "No" },
          { criterionId: "P16", reading: "does-not-hold", quote: "no seizures" },
        ],
        { kind: "why", quote: "why do you ask" },
      ),
      askR("The study can only include people who meet its requirements. Any conditions?"),
    ]);
    await s.start();
    await s.receive("No, no seizures either, but why do you ask?");

    const state = s.state();
    expect(state.progress.find((p) => p.criterionId === "P15")?.evidence).toEqual([]);
    expect(state.progress.find((p) => p.criterionId === "P16")).toMatchObject({
      status: "chart-review",
      reported: "does-not-hold",
    });
    expect(state.transcript.at(-1)?.responds).toBe("why");
  });

  it("is answered once: a second request records the answer, moves on and offers the coordinator", async () => {
    const { s, adapter } = session([
      askR("Any conditions?"),
      readR([], { kind: "explain", quote: "what?" }),
      askR("It means an illness. Any conditions?"),
      readR([{ criterionId: "P15", reading: "does-not-hold", quote: "No" }], {
        kind: "explain",
        quote: "still lost",
      }),
      askR("The coordinator can go over that. Have you had seizures?"),
    ]);
    await s.start();
    await s.receive("what?");
    await s.receive("No, still lost");

    const state = s.state();
    expect(MAX_RESPONSES).toBe(1);
    expect(state.progress.find((p) => p.criterionId === "P15")).toMatchObject({
      status: "chart-review",
      reported: "does-not-hold",
      responses: 1,
    });
    expect(state.pending).toBe("P16");
    expect(state.transcript.at(-1)?.responds).toBeUndefined();
    expect(adapter.requests[4]?.user).toMatch(/REQUEST: They asked again \("still lost"\)/);
  });

  it("can't keep a conversation going: asking on every turn still ends", async () => {
    const script: ScriptedResponse[] = [askR("Q?")];
    for (let i = 0; i < 20; i++) {
      script.push(readR([], { kind: "explain", quote: "what" }), askR("Q?"));
    }
    const { s } = session(script);
    await s.start();
    let reply: AgentReply = { kind: "message", text: "" };
    let replies = 0;
    while (reply.kind !== "done") {
      reply = await s.receive("what");
      replies++;
      expect(replies).toBeLessThanOrEqual(CRITERIA.length * (MAX_ASKS + MAX_RESPONSES));
    }
    const asked = new Map<string, number>();
    for (const t of done(reply).transcript) {
      if (t.kind === "question" && t.criterionId !== undefined) {
        asked.set(t.criterionId, (asked.get(t.criterionId) ?? 0) + 1);
      }
    }
    for (const n of asked.values()) {
      expect(n).toBeLessThanOrEqual(MAX_ASKS + MAX_RESPONSES);
    }
  });
});

describe("a study question", () => {
  it("is answered before the same question, when that question is still open", async () => {
    const { s, adapter } = session([
      askR("Any conditions?"),
      readR([], { kind: "study", quote: "what is this study" }),
      askR("It's a short prescreening. Any conditions?"),
    ]);
    await s.start();
    await s.receive("what is this study");

    expect(s.state().transcript.at(-1)).toMatchObject({ criterionId: "P15", responds: "study" });
    expect(adapter.requests[2]?.user).toMatch(
      /STUDY FACTS:\n- The study is called "A Meningioma Study"/,
    );
  });

  it("is answered before the next question when the reply also settled this one", async () => {
    const { s, adapter } = session([
      askR("Any conditions?"),
      readR([{ criterionId: "P15", reading: "does-not-hold", quote: "No" }], {
        kind: "study",
        quote: "who reads this",
      }),
      askR("A coordinator. Have you had seizures?"),
    ]);
    await s.start();
    await s.receive("No. who reads this?");

    const state = s.state();
    expect(state.pending).toBe("P16");
    expect(state.transcript.at(-1)?.responds).toBeUndefined();
    expect(state.progress.find((p) => p.criterionId === "P16")?.timesAsked).toBe(1);
    expect(adapter.requests[2]?.user).toMatch(/STUDY FACTS/);
  });
});

describe("a stop request", () => {
  it("gets fixed text and the question again, with no model call", async () => {
    const { s, adapter } = session([
      askR("Any conditions?"),
      readR([], { kind: "stop", quote: "can we stop" }),
    ]);
    await s.start();
    const reply = await s.receive("can we stop");

    expect(reply.text).toBe(`${STOP_TEMPLATE} ${STOP_AGAIN}\n\nAny conditions?`);
    expect(adapter.requests).toHaveLength(2);
    expect(s.state().transcript.at(-1)).toMatchObject({ criterionId: "P15", responds: "stop" });
    expect(s.state().progress.find((p) => p.criterionId === "P15")?.timesAsked).toBe(1);
  });

  it("is followed by the next question when the reply settled this one", async () => {
    const { s } = session([
      askR("Any conditions?"),
      readR([{ criterionId: "P15", reading: "does-not-hold", quote: "No" }], {
        kind: "stop",
        quote: "need a break",
      }),
      askR("Have you had seizures?"),
    ]);
    await s.start();
    const reply = await s.receive("No. I need a break");

    expect(reply.text).toBe(`${STOP_TEMPLATE} ${STOP_NEXT}\n\nHave you had seizures?`);
    expect(s.state().transcript.at(-1)?.responds).toBeUndefined();
  });
});

describe("a request the person didn't make", () => {
  it("is dropped when its words aren't in the message, and changes nothing else", async () => {
    const { s } = session([
      askR("Any conditions?"),
      readR([{ criterionId: "P15", reading: "does-not-hold", quote: "No" }], {
        kind: "explain",
        quote: "what does that mean",
      }),
      askR("Have you had seizures?"),
    ]);
    await s.start();
    await s.receive("No");

    const state = s.state();
    expect(state.rejectedRequests).toEqual([
      { turn: 2, kind: "explain", quote: "what does that mean" },
    ]);
    expect(state.transcript[2]?.request).toBeUndefined();
    expect(state.ignoredReadings).toEqual([]);
    expect(state.progress.find((p) => p.criterionId === "P15")?.status).toBe("chart-review");
    expect(state.pending).toBe("P16");
  });
});

describe("conversations saved before slice 0021", () => {
  it("restore without responses or rejectedRequests, and carry on", async () => {
    const { s } = session([askR("Any conditions?")]);
    await s.start();
    const old = s.state();
    for (const p of old.progress) {
      delete p.responses;
    }
    delete old.rejectedRequests;

    const resumed = ScreeningSession.fromState(
      old,
      new FakeModelAdapter([readR([], { kind: "explain", quote: "what" }), askR("It means. Any?")]),
    );
    await resumed.receive("what");

    expect(resumed.state().progress.find((p) => p.criterionId === "P15")?.responses).toBe(1);
  });

  it("carry responses into the finished findings", async () => {
    const { s } = session([
      askR("Any conditions?"),
      readR([], { kind: "explain", quote: "what" }),
      askR("It means an illness. Any?"),
      readR([{ criterionId: "P15", reading: "does-not-hold", quote: "No" }]),
      askR("Seizures?"),
      readR([{ criterionId: "P16", reading: "does-not-hold", quote: "No" }]),
      askR("Pregnant?"),
      readR([{ criterionId: "P17", reading: "does-not-hold", quote: "No" }]),
    ]);
    await s.start();
    await s.receive("what");
    await s.receive("No");
    await s.receive("No");
    const result = done(await s.receive("No"));

    expect(result.findings.find((f) => f.criterionId === "P15")?.responses).toBe(1);
    expect(result.findings.find((f) => f.criterionId === "P16")?.responses).toBeUndefined();
  });
});
