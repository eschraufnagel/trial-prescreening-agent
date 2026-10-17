import { describe, expect, it } from "vitest";
import { normalize } from "../../src/criteria/normalize.js";
import { FakeModelAdapter, ModelError } from "../../src/models/index.js";
import {
  EXAMPLES,
  PLAIN_PROMPT_VERSION,
  renderPlain,
  retryPlain,
  SYSTEM_PROMPT,
} from "../../src/plain/index.js";
import { loadTrials } from "../../src/trials/index.js";

const CRITERION = "Patients must not have received prior gemcitabine chemotherapy";

describe("renderPlain", () => {
  it("returns the rendering, whitespace collapsed", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { plain: "  Must not have had  prior gemcitabine chemotherapy. " } },
    ]);
    expect(await renderPlain(adapter, CRITERION)).toEqual({
      plain: "Must not have had prior gemcitabine chemotherapy.",
    });
  });

  it("records an empty reply as an attempt with no rendering", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: { plain: " " } }]);
    const attempt = await renderPlain(adapter, CRITERION);
    expect(attempt.plain).toBeNull();
    expect(attempt.reportAtGeneration?.[0]).toMatch(/^no rendering in /);
  });

  it("records a reply of the wrong shape the same way", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: ["Must not have had it"] }]);
    expect((await renderPlain(adapter, CRITERION)).plain).toBeNull();
  });

  it("records a cut-off reply as an attempt with no rendering", async () => {
    const adapter = new FakeModelAdapter([
      { kind: "json", content: { plain: "Must not" }, finishReason: "length" },
    ]);
    expect(await renderPlain(adapter, CRITERION)).toEqual({
      plain: null,
      reportAtGeneration: ["reply cut off at 0 tokens"],
    });
  });

  it("rethrows an adapter error, so the script can tell the model is down", async () => {
    const adapter = new FakeModelAdapter([{ kind: "error", message: "request failed: refused" }]);
    await expect(renderPlain(adapter, CRITERION)).rejects.toBeInstanceOf(ModelError);
  });

  // Exactly the text: no polarity, type or study (spec §4.1).
  it("tells the model the criterion text and nothing else about it", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: { plain: "x" } }]);
    await renderPlain(adapter, CRITERION);
    const request = adapter.requests[0];
    expect(request?.user).toBe(`Original: ${CRITERION}`);
    expect(request?.system).toBe(SYSTEM_PROMPT);
  });

  it("gives a retry the earlier rewording and what the check found", async () => {
    const adapter = new FakeModelAdapter([{ kind: "json", content: { plain: "x" } }]);
    await retryPlain(adapter, CRITERION, "Has had gemcitabine.", [
      "negations: 1 in the protocol, 0 in the plain",
    ]);
    const user = adapter.requests[0]?.user ?? "";
    expect(user).toContain(`Original: ${CRITERION}`);
    expect(user).toContain("Your earlier rewording: Has had gemcitabine.");
    expect(user).toContain("- negations: 1 in the protocol, 0 in the plain");
  });
});

describe("the rendering prompt", () => {
  it("is versioned", () => {
    expect(PLAIN_PROMPT_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });

  // An example drawn from the corpus would put part of the reading gate's
  // material into the prompt (spec §4.1).
  it("takes no example from a corpus study", () => {
    const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const corpus = loadTrials().map((t) => squash(normalize(t.eligibility.criteriaText).text));
    // Would fire: a real corpus criterion is found.
    expect(corpus.some((c) => c.includes(squash("Platelet count >= 100,000/mm^3")))).toBe(true);
    for (const example of EXAMPLES) {
      const text = squash(example.criterion);
      expect(corpus.filter((c) => c.includes(text))).toEqual([]);
    }
  });
});
