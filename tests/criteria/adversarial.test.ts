import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runEval } from "../../evals/runner.js";
import { normalize, parseCriteria } from "../../src/criteria/index.js";
import { FakeModelAdapter } from "../../src/models/index.js";
import type { Trial } from "../../src/trials/index.js";
import { getTrial } from "../../src/trials/index.js";
import { gateRecord, gateTrial } from "../fixtures/gate-trial.js";

/**
 * The quote-location net, made to fire (slice 0011, spec §7).
 *
 * 481 criteria across the corpus and not one rejected: the pinned model copies
 * faithfully, which says nothing about whether the net would catch one that
 * didn't. Each case here takes a real sentence from a real fixture, shows the
 * faithful quote is kept, then alters it the way a model tidying this corpus
 * would, and shows the altered quote is thrown out and counted.
 *
 * The kinds were chosen after reading the corpus, so they show the net catches
 * the unfaithful copies this corpus invites, not every kind there is.
 */

interface Case {
  name: string;
  study: string;
  faithful: string;
  altered: string;
}

const CASES: Case[] = [
  {
    name: "mojibake tidied",
    study: "NCT03433469",
    faithful: "conditions that interfere with the patient?s safety",
    altered: "conditions that interfere with the patient's safety",
  },
  {
    name: "full-width punctuation made ASCII",
    study: "NCT03753685",
    faithful: "/L，platelets count ≥80",
    altered: "/L,platelets count ≥80",
  },
  {
    name: "comparison symbol spelled out",
    study: "NCT06728852",
    faithful: "Expected survival time ≥ 3 months",
    altered: "Expected survival time >= 3 months",
  },
  {
    name: "abbreviation expanded",
    study: "NCT00077350",
    faithful: "Patients must have an ECOG performance status of 0 or 1",
    altered:
      "Patients must have an Eastern Cooperative Oncology Group performance status of 0 or 1",
  },
  {
    name: "shortened with an ellipsis",
    study: "NCT00077350",
    faithful:
      "Patients must not have, at the time of registration, uncontrolled intercurrent illness",
    altered:
      "Patients must not have, at the time of registration, uncontrolled intercurrent illness … or pulmonary disease requiring oxygen are excluded",
  },
  {
    name: "two sentences stitched",
    study: "NCT04385368",
    faithful: "Normal appearing lymph nodes, if present, must be biopsied or removed.",
    altered:
      "that the lymph node level was explored and no lymph nodes were present. Exploration of nodes must clearly be documented in medical file if not recorded in operative report.",
  },
  {
    // Since slice 0011's normalization version 2 the model is shown `10^9/L`,
    // so a quote that copies the registry's escape back in is not a copy.
    name: "registry escape copied back",
    study: "NCT06728852",
    faithful: "platelet count ≥ 100×10^9/L",
    altered: "platelet count ≥ 100×10\\^9/L",
  },
  {
    name: "another study's words",
    study: "NCT04316364",
    faithful: "Adequate organ function",
    altered: "Locally advanced unresectable or metastatic pancreatic ductal adenocarcinoma",
  },
];

function criterion(quote: string): Record<string, unknown> {
  return {
    quote,
    text: quote,
    polarity: "inclusion",
    type: "clinical",
    confidence: 0.9,
  };
}

function adapterReturning(...quotes: string[]): FakeModelAdapter {
  return new FakeModelAdapter([{ kind: "json", content: { criteria: quotes.map(criterion) } }]);
}

describe.each(CASES)("the net against $name ($study)", ({ study, faithful, altered }) => {
  const trial = getTrial(study);

  it("keeps the faithful quote", async () => {
    expect(normalize(trial.eligibility.criteriaText).text).toContain(faithful);

    const parsed = await parseCriteria(trial, adapterReturning(faithful));

    expect(parsed.rejected).toEqual([]);
    expect(parsed.criteria).toHaveLength(1);
  });

  it("rejects the altered one, names it, and counts it", async () => {
    const parsed = await parseCriteria(trial, adapterReturning(faithful, altered));

    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.rejected).toHaveLength(1);
    expect(parsed.rejected[0]?.reason).toMatch(/does not appear in the source/);
    expect(parsed.rejected[0]?.quote).toBe(altered);
  });
});

describe("what the net must let through", () => {
  it("keeps a quote reflowed across a line break, marked loose", async () => {
    const faithful = "conditions that interfere with the patient?s safety";
    const reflowed = "conditions that interfere\n    with the patient?s safety";

    const parsed = await parseCriteria(getTrial("NCT03433469"), adapterReturning(reflowed));

    expect(parsed.rejected).toEqual([]);
    expect(parsed.criteria[0]?.loose).toBe(true);
    expect(parsed.criteria[0]?.source.text).toBe(faithful);
  });

  it("resolves a quote that occurs twice to each occurrence in turn", async () => {
    const trial = getTrial("NCT00077350");
    const repeated = "upper limit of normal";
    const text = normalize(trial.eligibility.criteriaText).text;
    expect(text.indexOf(repeated)).not.toBe(text.lastIndexOf(repeated));

    const parsed = await parseCriteria(
      trial,
      new FakeModelAdapter([
        {
          kind: "json",
          content: {
            criteria: [
              { ...criterion(repeated), text: "bilirubin below 1.5 times the upper limit" },
              { ...criterion(repeated), text: "AST below 3 times the upper limit" },
            ],
          },
        },
      ]),
    );

    expect(parsed.rejected).toEqual([]);
    expect(parsed.criteria[0]?.source.start).toBeLessThan(parsed.criteria[1]?.source.start ?? 0);
  });
});

/**
 * The net against a heading joined to its item (slice 0015).
 *
 * The rule that lets "Heading: item" through is the first loosening of the
 * net since 0002, so it's tested the way the net was in 0011: real text, a
 * quote the rule must keep, and quotes it must refuse, one per way a joined
 * quote can be a stitch. "gate" is NCT06090266 as 0013's gate saved it.
 */

const INFECTION = "Recent or ongoing serious infection including the following:";
const COHORTS = "For Cohorts A2, B1, B2, and B3 only:";
const HIV = "Uncontrolled infection with human immunodeficiency virus (HIV).";

function trialFor(study: string): Trial {
  return study === "gate" ? gateTrial() : getTrial(study);
}

/** A plain quote from each study, sent beside a refused one so the parse keeps something. */
const COMPANION: Record<string, string> = {
  gate: "Prior organ or stem cell transplant.",
  NCT00743379: "Serum creatinine ≤ ULN",
  NCT04385368: "Patients with vitiligo or alopecia",
  NCT00077350:
    "Patients must have measurable disease, as defined by RECIST, within 4 weeks prior to registration",
  NCT03433469: "Ability to swallow oral medications",
  NCT04841811:
    "Subjects judged by the investigator who may not be in compliance with the research procedures and requirements",
};

interface Joined {
  name: string;
  study: string;
  heading: string;
  item: string;
}

const KEPT: Joined[] = [
  { name: "the infection list's HIV item", study: "gate", heading: INFECTION, item: HIV },
  {
    name: "a cohort-only exclusion",
    study: "gate",
    heading: COHORTS,
    item: "Interstitial lung disease.",
  },
  {
    // The heading occurs three times, once per cohort section; only the first
    // section's list holds this item.
    name: "a pinned study's sub-list",
    study: "NCT00743379",
    heading: "Acceptable liver function:",
    item: "Bilirubin ≤ 1.5 times upper limit of normal",
  },
];

describe.each(KEPT)("the net keeps a heading joined to $name ($study)", (c) => {
  it("locates it at the item, with the heading beside it", async () => {
    const trial = trialFor(c.study);
    const text = normalize(trial.eligibility.criteriaText).text;
    expect(text).toContain(c.heading);
    expect(text).toContain(c.item);
    expect(text).not.toContain(`${c.heading} ${c.item}`);

    const parsed = await parseCriteria(trial, adapterReturning(`${c.heading} ${c.item}`));

    expect(parsed.rejected).toEqual([]);
    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.criteria[0]?.source.text).toBe(c.item);
    expect(parsed.criteria[0]?.heading?.text).toBe(c.heading);
    expect(parsed.criteria[0]?.heading?.start).toBe(
      trial.eligibility.criteriaText.indexOf(c.heading),
    );
  });
});

interface Refused {
  name: string;
  study: string;
  quote: string;
  /** Text the refusal depends on being in the source, so a typo here can't pass the test. */
  present: string[];
  /** Text the refusal depends on not being in the source. */
  absent: string[];
}

const REFUSED: Refused[] = [
  {
    name: "heading altered",
    study: "gate",
    quote: `Recent or ongoing serious infections including the following: ${HIV}`,
    present: [HIV],
    absent: ["serious infections including"],
  },
  {
    name: "item altered",
    study: "gate",
    quote: `${INFECTION} Uncontrolled HIV infection.`,
    present: [INFECTION],
    absent: ["Uncontrolled HIV infection."],
  },
  {
    name: "heading not in the source",
    study: "gate",
    quote: `Active infections of any kind: ${HIV}`,
    present: [HIV],
    absent: ["Active infections of any kind:"],
  },
  {
    name: "item under another heading",
    study: "gate",
    quote: `${COHORTS} ${HIV}`,
    present: [COHORTS, HIV],
    absent: [],
  },
  {
    name: "item after the heading's list ended",
    study: "gate",
    quote: `${INFECTION} Interstitial lung disease.`,
    present: [INFECTION, "Interstitial lung disease."],
    absent: [],
  },
  {
    name: "halves reversed",
    study: "gate",
    quote: `${HIV} ${INFECTION}`,
    present: [INFECTION, HIV],
    absent: [],
  },
  {
    name: "a skip from one sub-item to a later one",
    study: "gate",
    quote: `${INFECTION} Any uncontrolled Grade 3 or higher (per NCI-CTCAE version 5.0) viral, bacterial, or fungal infection within 2 weeks prior to the first dose of OR502. Known active or latent tuberculosis (testing at screening is not required).`,
    present: [
      INFECTION,
      "fungal infection within 2 weeks prior to the first dose of OR502.",
      "Known active or latent tuberculosis (testing at screening is not required).",
    ],
    absent: [],
  },
  {
    name: "a colon partway along a line",
    study: "gate",
    quote: "Vulnerable persons: Interstitial lung disease.",
    present: ["Vulnerable persons: subjects", "Interstitial lung disease."],
    absent: [],
  },
  {
    // The only real line with a colon partway along and a deeper list under
    // it. Nothing but the heading's line end refuses it; "a colon partway
    // along a line" above is refused by its empty list as well.
    name: "text after the heading's colon",
    study: "NCT03433469",
    quote:
      "Women NOT of childbearing potential: Permanent sterilization includes hysterectomy and/or bilateral oophorectomy",
    present: [
      "* Women NOT of childbearing potential: women who",
      "\n\n    * Permanent sterilization includes hysterectomy and/or bilateral oophorectomy",
    ],
    absent: [],
  },
  {
    // Possibly honest, refused on purpose until it's seen (spec §2.4).
    name: "a heading that is the tail of its line",
    study: "NCT04385368",
    quote: "The following are exceptions to this criterion: Patients with vitiligo or alopecia",
    present: [
      "The following are exceptions to this criterion:",
      "Patients with vitiligo or alopecia",
    ],
    absent: [],
  },
  {
    // Possibly honest, refused on purpose until it's seen (spec §2.4).
    name: "an inline sub-item",
    study: "NCT00743379",
    quote: "Acceptable liver function: AST (SGOT) and ALT (SGPT) ≤ 2.5xULN",
    present: ["8. Acceptable liver function:\n", "normal b. AST (SGOT) and ALT (SGPT) ≤ 2.5xULN"],
    absent: [],
  },
];

describe.each(REFUSED)("the net refuses a heading join: $name ($study)", (c) => {
  it("rejects it, names it, and counts it", async () => {
    const trial = trialFor(c.study);
    const text = normalize(trial.eligibility.criteriaText).text;
    for (const part of c.present) expect(text).toContain(part);
    for (const part of c.absent) expect(text).not.toContain(part);

    const companion = COMPANION[c.study] ?? "";
    const parsed = await parseCriteria(trial, adapterReturning(companion, c.quote));

    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.criteria[0]?.source.text).toBe(companion);
    expect(parsed.rejected).toHaveLength(1);
    expect(parsed.rejected[0]?.reason).toMatch(/does not appear in the source/);
    expect(parsed.rejected[0]?.quote).toBe(c.quote);
  });
});

describe("real rejections stay rejected", () => {
  const PARSES = new URL("../../evals/results/parses/", import.meta.url);

  function rejectedIn(file: string): string[] {
    const parse = JSON.parse(readFileSync(new URL(file, PARSES), "utf8")) as {
      rejected: { quote: string }[];
    };
    return parse.rejected.map((r) => r.quote);
  }

  it.each([
    // Of the gate's 11 rejections, the one that isn't a heading join: a heading
    // with no colon, and a sibling item between it and the item quoted (intent
    // decision 4). The other ten are recovered; tests/criteria/nested.test.ts.
    [
      "0013's gate, Cohort B3",
      "gate",
      gateRecord()
        .parsed.rejected.map((r) => r.quote ?? "")
        .filter((quote) => quote.startsWith("Cohorts B2 and B3")),
    ],
    // 0011's stitch: "Patients must have" from one sentence, the rest from later.
    [
      "0011's stitch",
      "NCT00077350",
      rejectedIn("NCT00077350-Qwen3.6-35B-A3B-MLX-8bit-88c050f35c4c-n2-20260921.json"),
    ],
    [
      "0011's retyping",
      "NCT04841811",
      rejectedIn("NCT04841811-Qwen3.6-35B-A3B-MLX-8bit-73c3b301c4a9-20260921.json"),
    ],
  ])("%s", async (_name, study, quotes) => {
    expect(quotes).toHaveLength(1);

    const companion = COMPANION[study] ?? "";
    const parsed = await parseCriteria(trialFor(study), adapterReturning(companion, ...quotes));

    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.rejected.map((r) => r.quote)).toEqual(quotes);
  });
});

describe("the net as the eval reports it", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it("counts a rejected quote in the study and in the run", async () => {
    dir = mkdtempSync(join(tmpdir(), "adversarial-eval-"));
    const [mojibake] = CASES;
    if (mojibake === undefined) throw new Error("no cases");

    const run = await runEval(adapterReturning(mojibake.faithful, mojibake.altered), {
      studies: [mojibake.study],
      resultsDir: dir,
    });

    expect(run.studies[0]?.quotes).toEqual({ rejected: 1, loose: 0 });
    expect(run.quotes.rejected).toBe(1);
  });
});

describe("what the net can't catch", () => {
  // The net checks the quote, and the agent reads the text. A model that
  // quotes an exclusion exactly and states it backwards passes, and nothing in
  // the project compares a criterion's text with its quote. Recorded as a known
  // gap, not closed: it's the held comparison's or a later parser slice's.
  it.fails("rejects a faithful quote whose statement says the opposite", async () => {
    const quote = "Pregnant women are excluded from this study";
    const parsed = await parseCriteria(
      getTrial("NCT00077350"),
      new FakeModelAdapter([
        {
          kind: "json",
          content: {
            criteria: [
              {
                ...criterion(quote),
                polarity: "exclusion",
                type: "patient",
                text: "The participant may be pregnant",
              },
            ],
          },
        },
      ]),
    );

    expect(parsed.rejected).toHaveLength(1);
  });
});
