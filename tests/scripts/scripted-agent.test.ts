import { describe, expect, it } from "vitest";
import { SLOW_MS, scriptedAgent } from "../../scripts/app/scripted-agent.js";
import { FakeModelAdapter, isConnectionFailure } from "../../src/models/index.js";
import { raisability, ScreeningSession } from "../../src/screening/index.js";
import { CRITERIA, STUDY } from "../fixtures/conversation.js";

/**
 * The fake mode's agent, driven through a real session. If the screening
 * prompts' layout changes, this is what breaks, instead of the fake mode
 * quietly asking nothing.
 */
async function converse(answer: (question: string) => string) {
  const session = ScreeningSession.create(
    STUDY,
    CRITERIA,
    new FakeModelAdapter([], { respond: scriptedAgent }),
  );
  let reply = await session.start();
  const questions = [reply.text];
  for (let turn = 0; reply.kind === "message" && turn < 50; turn++) {
    reply = await session.receive(answer(reply.text));
    questions.push(reply.text);
  }
  return { reply, questions, state: session.state() };
}

describe("the scripted agent", () => {
  it("finishes a conversation, asking every raisable criterion by its own words", async () => {
    const { reply, questions, state } = await converse(() => "yes");

    expect(reply.kind).toBe("done");
    const raisable = CRITERIA.filter((c) => raisability(c).raise);
    for (const c of raisable) {
      expect(questions.some((q) => q.includes(c.text))).toBe(true);
    }
    expect(state.transcript.filter((t) => t.kind === "question").map((t) => t.criterionId)).toEqual(
      raisable.map((c) => c.id),
    );
  });

  it("reads yes, no and not sure literally, with evidence that locates", async () => {
    const answers = ["Yes, I have", "No.", "not sure"];
    let i = 0;
    const { state } = await converse(() => answers[i++] ?? "yes");

    const byId = new Map(state.progress.map((p) => [p.criterionId, p]));
    expect(byId.get("L8")).toMatchObject({ status: "holds", evidence: [{ quote: "Yes," }] });
    // L2 is clinical: the answer is reported, never settled (0004, D2).
    expect(byId.get("L2")).toMatchObject({ status: "chart-review", reported: "does-not-hold" });
    expect(byId.get("L19")).toMatchObject({ status: "unresolved", reason: "unknown" });
    expect(state.rejectedReadings).toEqual([]);
  });

  it("asks again after an unclear answer, then leaves it unresolved", async () => {
    const { reply } = await converse(() => "maybe");

    if (reply.kind !== "done") {
      throw new Error("the conversation should finish");
    }
    expect(reply.result.findings.find((f) => f.criterionId === "L8")).toMatchObject({
      status: "unresolved",
      timesAsked: 2,
    });
  });

  it("answers [down] as an unreachable model, leaving the session to take the next reply", async () => {
    const session = ScreeningSession.create(
      STUDY,
      CRITERIA,
      new FakeModelAdapter([], { respond: scriptedAgent }),
    );
    await session.start();
    const before = JSON.stringify(session.state());

    const failure = await session.receive("[down] yes").then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(isConnectionFailure(failure)).toBe(true);
    expect(JSON.stringify(session.state())).toBe(before);

    await session.receive("yes");
    expect(session.state().progress.find((p) => p.criterionId === "L8")).toMatchObject({
      status: "holds",
    });
  });

  it("reads [slow] without the marker, and holds the answer back", () => {
    const prompt = "THE REPLY TO READ: [slow] yes\nTHE QUESTION WAS ABOUT: L8";
    expect(
      scriptedAgent({ system: "", user: prompt, responseFormat: "json", maxOutputTokens: 1 }),
    ).toEqual({
      kind: "json",
      content: {
        readings: [
          {
            criterionId: "L8",
            statement: "(scripted) L8",
            quote: "yes",
            outright: true,
            reading: "holds",
          },
        ],
      },
      delayMs: SLOW_MS,
    });
  });

  it("reads n/a as does-not-apply: a patient row closed, a clinical row reported", async () => {
    const { state } = await converse(() => "n/a");

    const byId = new Map(state.progress.map((p) => [p.criterionId, p]));
    expect(byId.get("L8")).toMatchObject({ status: "unresolved", reason: "does-not-apply" });
    expect(byId.get("L2")).toMatchObject({ status: "chart-review", reported: "does-not-apply" });
    expect(state.rejectedReadings).toEqual([]);
  });
});
