import { describe, expect, expectTypeOf, it } from "vitest";
import { loadLabelSet } from "../../evals/cases/load.js";
import type { LabelSet, Vignette } from "../../evals/cases/types.js";
import { loadVignettes } from "../../evals/cases/vignettes.js";
import {
  deterministicFlags,
  modelFidelityCheck,
  UNCITED_LENGTH,
} from "../../evals/participant/fidelity.js";
import type { ParticipantMemory, TranscriptLine } from "../../evals/participant/simulate.js";
import {
  buildParticipantPrompt,
  freshMemory,
  instructionFor,
  SimulatorError,
  simulate,
} from "../../evals/participant/simulate.js";
import type { ModelAdapter } from "../../src/models/index.js";
import { FakeModelAdapter } from "../../src/models/index.js";

/**
 * The simulated participant is the measurement's weakest part. These tests pin
 * the things that must not be left to the model: what it is shown, when it
 * contradicts itself, what it volunteers, and that it cannot see the agent.
 */
const vignettes = loadVignettes();

function byId(id: string): Vignette {
  const v = vignettes.find((x) => x.id === id);
  if (v === undefined) {
    throw new Error(`no vignette ${id}`);
  }
  return v;
}

const CONTRADICTS = byId("NCT00077350-v2");
const VOLUNTEERS = byId("NCT00077350-v1");
const DECLINES = byId("NCT04316364-v2");
const LABELS_77350 = loadLabelSet("NCT00077350");
const LABELS_16364 = loadLabelSet("NCT04316364");

const TRANSCRIPT: TranscriptLine[] = [
  { speaker: "agent", text: "Hello. Have you had chemotherapy for advanced lung cancer?" },
];

describe("what the participant is shown", () => {
  const prompt = buildParticipantPrompt(CONTRADICTS, LABELS_77350, TRANSCRIPT, [], null);

  it("shows each fact with the criterion text it answers", () => {
    expect(prompt).toMatch(/- L4 \(topic: patients must not have received prior gemcitabine/);
  });

  it("never shows what is graded", () => {
    expect(prompt).not.toMatch(/expected|does-not-hold|reported/);
  });

  it("does not show a correction before code asks for it", () => {
    expect(prompt).not.toMatch(/two different chemotherapy regimens/);
  });

  it("shows the corrected version once the correction has been made", () => {
    const after = buildParticipantPrompt(CONTRADICTS, LABELS_77350, TRANSCRIPT, ["L3"], null);

    expect(after).toMatch(/two different chemotherapy regimens.*corrected yourself/);
    expect(after).not.toMatch(/Just the one chemotherapy regimen/);
  });

  it("marks a declined fact without giving it an answer", () => {
    const declined = buildParticipantPrompt(DECLINES, LABELS_16364, TRANSCRIPT, [], null);

    expect(declined).toMatch(/- L17 \(topic: [^)]*\): DECLINE/);
  });
});

describe("behaviors triggered by code", () => {
  it("asks for a correction on the reply after a contradicted fact is used", () => {
    const memory: ParticipantMemory = { ...freshMemory(), used: ["L3"], replies: 1 };
    const instruction = instructionFor(CONTRADICTS, memory);

    expect(instruction?.kind).toBe("correct");
    expect(instruction?.text).toMatch(/two different chemotherapy regimens/);
  });

  it("asks for each correction once", () => {
    const memory: ParticipantMemory = {
      ...freshMemory(),
      used: ["L3"],
      corrected: ["L3"],
      replies: 2,
    };

    expect(instructionFor(CONTRADICTS, memory)).toBeNull();
  });

  it("volunteers three settleable facts from late in the protocol on the first reply only", () => {
    const first = instructionFor(VOLUNTEERS, freshMemory());

    expect(first?.kind).toBe("volunteer");
    expect(first?.facts).toEqual(["L23", "L33", "L35"]);
    expect(instructionFor(VOLUNTEERS, { ...freshMemory(), replies: 1 })).toBeNull();
  });

  it("gives other behaviors no instruction by default", () => {
    expect(instructionFor(DECLINES, freshMemory())).toBeNull();
  });
});

describe("simulate", () => {
  it("returns the reply and remembers what it used", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { message: "Just the one, and it failed.", usedFacts: ["L3"] } },
    ]);

    const reply = await simulate(CONTRADICTS, LABELS_77350, TRANSCRIPT, freshMemory(), adapter);

    expect(reply.message).toBe("Just the one, and it failed.");
    expect(reply.memory.used).toEqual(["L3"]);
    expect(reply.memory.replies).toBe(1);
    // Quoted and numbered, not a chat log the model might continue.
    expect(adapter.requests[0]?.user).toMatch(
      /Conversation so far, oldest first:\n1\. Research assistant said: "Hello/,
    );
    expect(adapter.requests[0]?.user).not.toMatch(/ASSISTANT:/);
  });

  it("accepts a reply wrapped in a one-element array, as oMLX's JSON mode returns it", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: [{ message: "I don't know.", usedFacts: [] }] },
    ]);

    const reply = await simulate(DECLINES, LABELS_16364, TRANSCRIPT, freshMemory(), adapter);

    expect(reply.message).toBe("I don't know.");
  });

  it("records a delivered correction so it is not asked for again", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { message: "Actually, two regimens.", usedFacts: [] } },
    ]);
    const memory: ParticipantMemory = { ...freshMemory(), used: ["L3"], replies: 1 };

    const reply = await simulate(CONTRADICTS, LABELS_77350, TRANSCRIPT, memory, adapter);

    expect(reply.instruction).toMatch(/correct something you said earlier/);
    expect(reply.memory.corrected).toEqual(["L3"]);
  });

  it("retries once on an unusable reply", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { message: "" } },
      { kind: "json", content: { message: "I don't know.", usedFacts: [] } },
    ]);

    const reply = await simulate(DECLINES, LABELS_16364, TRANSCRIPT, freshMemory(), adapter);

    expect(reply.message).toBe("I don't know.");
    expect(adapter.requests).toHaveLength(2);
  });

  it("fails after a second unusable reply", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { nope: true } },
      { kind: "json", content: { message: "x", usedFacts: [] }, finishReason: "length" },
    ]);

    await expect(
      simulate(DECLINES, LABELS_16364, TRANSCRIPT, freshMemory(), adapter),
    ).rejects.toBeInstanceOf(SimulatorError);
  });

  // The participant must not be able to answer toward what the agent has
  // settled. Pinning the whole parameter list means adding the agent's state
  // to it is a visible, failing change.
  it("cannot receive the agent's state", () => {
    expectTypeOf(simulate).parameters.toEqualTypeOf<
      [Vignette, LabelSet, readonly TranscriptLine[], ParticipantMemory, ModelAdapter]
    >();
  });
});

describe("fidelity flags", () => {
  it("flags a reply citing a fact the vignette does not have", () => {
    expect(deterministicFlags(CONTRADICTS, "Yes.", ["L99"])).toEqual([
      { kind: "unknown-fact", facts: ["L99"] },
    ]);
  });

  it("flags a long reply that cites nothing, and lets a short one through", () => {
    const long = "x".repeat(UNCITED_LENGTH + 1);

    expect(deterministicFlags(CONTRADICTS, long, [])).toEqual([
      { kind: "uncited-assertion", length: UNCITED_LENGTH + 1 },
    ]);
    expect(deterministicFlags(CONTRADICTS, "I don't know, sorry.", [])).toEqual([]);
  });

  // Gate 2: eight honest replies were flagged for taking more than 80 characters to say it.
  it("does not flag a long reply that only says the person does not know", () => {
    const honest =
      "I don't know if I have had a heart attack, stroke, or heart failure. I only know about my lung cancer.";

    expect(honest.length).toBeGreaterThan(UNCITED_LENGTH);
    expect(deterministicFlags(CONTRADICTS, honest, [])).toEqual([]);
  });

  it("returns nothing when the model check finds the reply faithful", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { faithful: true, reason: "" } },
    ]);

    expect(await modelFidelityCheck(CONTRADICTS, "No gemcitabine.", adapter)).toBeNull();
  });

  it("flags what the model check calls unfaithful, with its reason", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { faithful: false, reason: "invents a heart attack" } },
    ]);

    expect(await modelFidelityCheck(CONTRADICTS, "I had a heart attack.", adapter)).toEqual({
      kind: "model",
      reason: "invents a heart attack",
    });
  });

  // "The check could not run" must not read as "the check passed".
  it("flags an unusable answer from the check rather than passing it", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: { verdict: "fine" } }]);

    expect(await modelFidelityCheck(CONTRADICTS, "Hm.", adapter)).toEqual({
      kind: "model",
      reason: "fidelity check returned no usable answer",
    });
  });
});
