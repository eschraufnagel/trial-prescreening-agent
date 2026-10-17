import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLabelSet } from "../../evals/cases/load.js";
import type { Vignette } from "../../evals/cases/types.js";
import { VignetteError } from "../../evals/cases/types.js";
import { labelFileSha, loadVignettes, validateVignette } from "../../evals/cases/vignettes.js";
import {
  borrowedWording,
  renderSheet,
  setWarnings,
  sharesContent,
  vignetteWarnings,
} from "../../scripts/check-vignettes.js";

/**
 * Vignettes are the screening agent's ground truth. The faults worth catching
 * are the ones that leave a vignette looking fine while it measures the wrong
 * thing: a hard criterion quietly given no fact, a determination expected on a
 * criterion the agent is forbidden to settle, a decline with an answer.
 */
const NCT = "NCT04316364";
const LABELS = loadLabelSet(NCT);
const SHA = labelFileSha(NCT);

/** The patient labels in NCT04316364, each of which needs a fact. */
const PATIENT = LABELS.criteria.filter((l) => l.type === "patient").map((l) => l.id);

function facts(overrides: Record<string, Record<string, unknown>> = {}): unknown[] {
  return PATIENT.map((label) => ({
    label,
    says: "No, that's not me.",
    expected: "does-not-hold",
    ...overrides[label],
  }));
}

function vignette(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `${NCT}-v1`,
    nctId: NCT,
    labelSetSha: SHA,
    behavior: "cooperative",
    persona: "Retired, answers briefly.",
    facts: facts(),
    provenance: { drafter: "test", guide: "evals/cases/VIGNETTES.md", sawAgentPrompt: false },
    ...overrides,
  };
}

function validate(value: unknown, dev = false): Vignette {
  return validateVignette(value, { source: "test", dev, labels: LABELS, labelSetSha: SHA });
}

function problems(value: unknown, dev = false): string[] {
  try {
    validate(value, dev);
  } catch (error) {
    if (error instanceof VignetteError) {
      return [...error.problems];
    }
    throw error;
  }
  return [];
}

describe("validateVignette", () => {
  it("accepts a well-formed vignette", () => {
    const v = validate(vignette());

    expect(v.facts).toHaveLength(PATIENT.length);
    expect(v.dev).toBe(false);
  });

  it("covers every patient label in the study", () => {
    expect(PATIENT.length).toBeGreaterThanOrEqual(8);
  });

  // The rule that stops a hard criterion being quietly left out.
  it("refuses a vignette that leaves a patient label without a fact", () => {
    const partial = vignette({ facts: facts().slice(1) });

    expect(problems(partial).join()).toMatch(/every patient label needs a fact; missing L7/);
  });

  it("refuses expected on a clinical fact, because the agent may never settle one", () => {
    const withClinical = vignette({
      facts: [...facts(), { label: "L1", says: "I'm fully active.", expected: "holds" }],
    });

    expect(problems(withClinical).join()).toMatch(/clinical criterion is never settled/);
  });

  it("accepts reported on a clinical fact, and refuses it on a patient fact", () => {
    const clinical = vignette({
      facts: [...facts(), { label: "L1", says: "I'm fully active.", reported: "holds" }],
    });
    expect(problems(clinical)).toEqual([]);

    const onPatient = vignette({ facts: facts({ L8: { reported: "holds" } }) });
    expect(problems(onPatient).join()).toMatch(/reported belongs on clinical facts/);
  });

  it("refuses a fact for a protocol criterion, which is never put to a participant", () => {
    const protocol = vignette({ facts: [...facts(), { label: "L4", says: "Yes." }] });

    expect(problems(protocol).join()).toMatch(/protocol criteria are never put/);
  });

  it("refuses a fact for a label that does not exist", () => {
    const unknown = vignette({ facts: [...facts(), { label: "L99", says: "Hm." }] });

    expect(problems(unknown).join()).toMatch(/no such label/);
  });

  it("refuses two facts for one label", () => {
    const twice = vignette({
      facts: [...facts(), { label: "L8", says: "No.", expected: "holds" }],
    });

    expect(problems(twice).join()).toMatch(/duplicate fact/);
  });

  it("requires a decline to have nothing to say and to settle nothing", () => {
    const good = vignette({
      facts: facts({ L22: { says: null, declines: true, expected: "unresolved" } }),
    });
    expect(problems(good)).toEqual([]);

    const answered = vignette({
      facts: facts({ L22: { says: "No.", declines: true, expected: "unresolved" } }),
    });
    expect(problems(answered).join()).toMatch(/set says to null/);

    const settled = vignette({
      facts: facts({ L22: { says: null, declines: true, expected: "does-not-hold" } }),
    });
    expect(problems(settled).join()).toMatch(/expected must be unresolved/);
  });

  it("requires a contradicted fact to be expected unresolved", () => {
    const contradicted = vignette({
      facts: facts({
        L19: { says: "No.", laterSays: "Actually, yes.", expected: "does-not-hold" },
      }),
    });

    expect(problems(contradicted).join()).toMatch(/expected must be unresolved/);
  });

  it("refuses a null says on a fact that does not decline", () => {
    const silent = vignette({ facts: facts({ L8: { says: null } }) });

    expect(problems(silent).join()).toMatch(/does not decline/);
  });

  it("refuses a vignette written against different labels", () => {
    const stale = vignette({ labelSetSha: "0".repeat(64) });

    expect(problems(stale).join()).toMatch(/labels changed after this vignette was written/);
  });

  it("checks the id shape for scored and dev vignettes", () => {
    expect(problems(vignette({ id: `${NCT}-dev` })).join()).toMatch(/<nctId>-v<N>/);
    expect(problems(vignette({ id: `${NCT}-dev` }), true)).toEqual([]);
    expect(problems(vignette({ id: "NCT00077350-v1" })).join()).toMatch(/does not belong/);
  });

  it("requires provenance, including whether the drafter saw the agent's prompts", () => {
    const missing = vignette({ provenance: { drafter: "x", guide: "y" } });

    expect(problems(missing).join()).toMatch(/sawAgentPrompt/);
  });

  it("collects every problem rather than stopping at the first", () => {
    const bad = vignette({ behavior: "chatty", persona: "", labelSetSha: "nope" });

    expect(problems(bad).length).toBeGreaterThanOrEqual(3);
  });
});

describe("loadVignettes", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vignettes-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(sub: string, value: Record<string, unknown>): void {
    mkdirSync(join(dir, sub), { recursive: true });
    writeFileSync(join(dir, sub, `${value["id"] as string}.json`), JSON.stringify(value));
  }

  it("flags the dev directory from where the file lives, and sorts by id", () => {
    write(NCT, vignette({ id: `${NCT}-v2` }));
    write(NCT, vignette({ id: `${NCT}-v1` }));
    write("dev", vignette({ id: `${NCT}-dev` }));

    const loaded = loadVignettes({ vignettesDir: dir });

    expect(loaded.map((v) => [v.id, v.dev])).toEqual([
      [`${NCT}-dev`, true],
      [`${NCT}-v1`, false],
      [`${NCT}-v2`, false],
    ]);
  });

  it("refuses a file whose name does not match its id", () => {
    mkdirSync(join(dir, NCT));
    writeFileSync(join(dir, NCT, "wrong.json"), JSON.stringify(vignette()));

    expect(() => loadVignettes({ vignettesDir: dir })).toThrow(/file is named wrong/);
  });

  it("returns nothing when there are no vignettes yet", () => {
    expect(loadVignettes({ vignettesDir: join(dir, "absent") })).toEqual([]);
  });
});

describe("the reading sheet and its warnings", () => {
  it("counts a shared content word or a number on both sides as speaking to the criterion", () => {
    expect(sharesContent("Allergic to monoclonal antibodies", "I'm allergic to those")).toBe(true);
    expect(sharesContent("Age >= 18 years", "I'm 64")).toBe(true);
    expect(sharesContent("Pregnant", "No, I'm not pregnant")).toBe(true);
    expect(sharesContent("Pregnant", "I feel fine")).toBe(false);
  });

  it("warns on a fact that shares nothing with its criterion", () => {
    const v = validate(vignette({ facts: facts({ L19: { says: "I feel fine." } }) }));

    expect(vignetteWarnings(v, LABELS).some((w) => w.label === "L19")).toBe(true);
  });

  it("does not warn on a defer fact, which is meant to need interpretation", () => {
    const v = validate(
      vignette({
        facts: facts({ L22: { says: "A few beers at the weekend.", expected: "defer" } }),
      }),
    );

    expect(vignetteWarnings(v, LABELS).some((w) => w.label === "L22")).toBe(false);
  });

  it("warns on a vignette that only tests cooperation", () => {
    const v = validate(vignette());

    expect(
      vignetteWarnings(v, LABELS)
        .map((w) => w.message)
        .join(),
    ).toMatch(/only tests cooperation/);
  });

  it("does not warn about cooperation once a fact tests abstention", () => {
    const v = validate(
      vignette({ facts: facts({ L22: { says: null, declines: true, expected: "unresolved" } }) }),
    );

    expect(
      vignetteWarnings(v, LABELS)
        .map((w) => w.message)
        .join(),
    ).not.toMatch(/cooperation/);
  });

  it("warns when a behavior is primary in fewer than two scored vignettes, ignoring dev", () => {
    const scored = validate(vignette());
    const dev = validate(vignette({ id: `${NCT}-dev`, behavior: "vague" }), true);

    const messages = setWarnings([scored, scored, dev]).map((w) => w.message);

    expect(messages.some((m) => m.startsWith("behavior cooperative"))).toBe(false);
    expect(messages.some((m) => m.startsWith("behavior vague is primary in 0"))).toBe(true);
  });

  it("prints each patient criterion beside its fact and expected outcome", () => {
    const v = validate(
      vignette({ facts: facts({ L22: { says: null, declines: true, expected: "unresolved" } }) }),
    );
    const sheet = renderSheet(v, LABELS);

    expect(sheet).toMatch(/L19 {2}patient · exclusion\n {5}criterion {2}Pregnant/);
    expect(sheet).toMatch(/L22[\s\S]*\(declines\)[\s\S]*expected {3}unresolved/);
    expect(sheet).not.toMatch(/L4 /);

    const ungraded = validate(
      vignette({ facts: [...facts(), { label: "L1", says: "I'm fully active." }] }),
    );
    expect(renderSheet(ungraded, LABELS)).toMatch(
      /L1[\s\S]*fully active[\s\S]*\(not graded: shapes the conversation only\)/,
    );
  });
});

describe("borrowed wording between dev and scored vignettes (0009)", () => {
  const made = (id: string, dev: boolean, says: string, laterSays?: string): Vignette => ({
    id,
    nctId: "NCT00000001",
    labelSetSha: "x",
    behavior: "cooperative",
    persona: "made up",
    facts: [
      { label: "L1", says, ...(laterSays === undefined ? {} : { laterSays }), expected: "holds" },
    ],
    provenance: { drafter: "test", guide: "test", sawAgentPrompt: true },
    dev,
  });
  const scored = [
    made("NCT00000001-v1", false, "Yes, I finished the radiation six weeks ago now."),
  ];

  it("flags a dev fact that repeats five words of a scored fact, case and punctuation aside", () => {
    const dev = made("NCT00000001-dev", true, "Well, I Finished the radiation six weeks back.");
    expect(borrowedWording([dev], scored)).toEqual([
      {
        vignette: "NCT00000001-dev",
        label: "L1",
        message: 'borrows "i finished the radiation six" from scored NCT00000001-v1 L1',
      },
    ]);
  });

  it("checks a correction too", () => {
    const dev = made(
      "NCT00000001-dev",
      true,
      "Radiation ended a while ago.",
      "the radiation six weeks ago",
    );
    expect(borrowedWording([dev], scored)).toHaveLength(1);
  });

  it("passes fresh wording, and four words in common", () => {
    const dev = made(
      "NCT00000001-dev",
      true,
      "My radiotherapy stopped in March; I finished the radiation.",
    );
    expect(borrowedWording([dev], scored)).toEqual([]);
  });

  it("never compares scored vignettes with each other", () => {
    expect(
      borrowedWording(
        [],
        [
          ...scored,
          made("NCT00000001-v2", false, "Yes, I finished the radiation six weeks ago now."),
        ],
      ),
    ).toEqual([]);
  });
});
