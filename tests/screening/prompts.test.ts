import { describe, expect, it } from "vitest";
import { loadVignettes } from "../../evals/cases/vignettes.js";
import { VERDICT_PATTERN } from "../../evals/graders/screening.js";
import {
  ASK_CONTEXT_TURNS,
  ASK_SYSTEM_PROMPT,
  buildAskPrompt,
  buildReadPrompt,
  PROMPT_VERSION,
  READ_SYSTEM_PROMPT,
} from "../../src/screening/prompts.js";
import {
  CLOSING_TEMPLATE,
  closingMessage,
  OPENING_TEMPLATE,
  openingMessage,
} from "../../src/screening/templates.js";
import type { ScreeningCriterion, Turn } from "../../src/screening/types.js";

const STUDY = { nctId: "NCT04316364", briefTitle: "A Lung Cancer Study" };
const CRITERION: ScreeningCriterion = {
  id: "L8",
  polarity: "exclusion",
  type: "patient",
  text: "Any previous systematic anti-cancer therapy for lung cancer",
};

function turns(n: number): Turn[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    speaker: i % 2 === 0 ? "agent" : "participant",
    kind: i % 2 === 0 ? "question" : "reply",
    text: `turn ${i}`,
  }));
}

describe("the fixed templates", () => {
  // The two moments a model would sum up are the two it never writes.
  it("contain no verdict language", () => {
    expect(VERDICT_PATTERN.test(openingMessage(STUDY))).toBe(false);
    expect(VERDICT_PATTERN.test(closingMessage())).toBe(false);
  });

  it("name the study and hand off to a coordinator", () => {
    expect(openingMessage(STUDY)).toMatch(/"A Lung Cancer Study"/);
    expect(openingMessage(STUDY)).toMatch(/coordinator will review/);
    expect(closingMessage()).toMatch(/coordinator will review/);
  });
});

describe("the ask prompt", () => {
  it("shows one criterion, its polarity and kind, and only recent turns", () => {
    const prompt = buildAskPrompt({
      study: STUDY,
      transcript: turns(10),
      criterion: CRITERION,
      kind: "patient",
    });

    expect(prompt).toMatch(/CRITERION \(exclusion\): Any previous systematic/);
    expect(prompt).toMatch(/KIND: patient/);
    expect(prompt).not.toMatch(/turn 3\b/);
    expect(prompt).toMatch(new RegExp(`turn ${10 - ASK_CONTEXT_TURNS}\\b`));
    expect(prompt).not.toMatch(/FOLLOW-UP/);
  });

  it("renders the conversation as quoted, numbered lines, not a chat log to continue", () => {
    const prompt = buildAskPrompt({
      study: STUDY,
      transcript: turns(2),
      criterion: CRITERION,
      kind: "patient",
    });

    expect(prompt).toMatch(/0\. Research assistant said: "turn 0"\n1\. Person said: "turn 1"/);
    expect(prompt).toMatch(/Respond with a JSON object of the form \{"message"/);
  });

  it("names what is missing on a follow-up", () => {
    const prompt = buildAskPrompt({
      study: STUDY,
      transcript: turns(2),
      criterion: CRITERION,
      kind: "clinical",
      followUp: "whether it is resectable",
    });

    expect(prompt).toMatch(/FOLLOW-UP: whether it is resectable/);
  });
});

describe("the read prompt", () => {
  it("shows the reply, what was asked, and every open criterion with its polarity", () => {
    const prompt = buildReadPrompt({
      transcript: turns(3),
      message: "No, never.",
      askedAbout: "L8",
      open: [CRITERION, { ...CRITERION, id: "L19", text: "Pregnant" }],
      answered: [
        {
          criterion: {
            ...CRITERION,
            id: "L7",
            polarity: "inclusion",
            text: "Agrees to contraception",
          },
          kind: "recorded",
          value: "holds",
          quote: "Yes, I will",
        },
      ],
    });

    expect(prompt).toMatch(/THE REPLY TO READ: No, never\./);
    expect(prompt).toMatch(/THE QUESTION WAS ABOUT: L8/);
    expect(prompt).toMatch(/- L19 \[EXCLUSION\]: Pregnant/);
    expect(prompt).toMatch(/ALREADY ANSWERED[^\n]*contradicts[^\n]*\n- L7 \[INCLUSION\]/);
  });

  // Slice 0009: "does this change that answer" needs the answer.
  it("shows each answered criterion with what was recorded or reported, and the words behind it", () => {
    const prompt = buildReadPrompt({
      transcript: turns(3),
      message: "Actually, I did have one round.",
      askedAbout: "L19",
      open: [{ ...CRITERION, id: "L19", text: "Pregnant" }],
      answered: [
        {
          criterion: CRITERION,
          kind: "recorded",
          value: "does-not-hold",
          quote: "No treatment at all",
        },
        {
          criterion: { ...CRITERION, id: "L2", type: "clinical", text: "Untreated, resectable" },
          kind: "reported",
          value: "holds",
          quote: "stage II, untreated",
        },
        {
          criterion: { ...CRITERION, id: "L3", text: "Allergy" },
          kind: "reported",
          value: "nothing",
        },
      ],
    });

    expect(prompt).toContain(
      '- L8 [EXCLUSION]: Any previous systematic anti-cancer therapy for lung cancer\n    recorded: does-not-hold, from "No treatment at all"',
    );
    expect(prompt).toContain(
      '- L2 [EXCLUSION]: Untreated, resectable\n    reported: holds, from "stage II, untreated"',
    );
    expect(prompt).toContain("- L3 [EXCLUSION]: Allergy\n    reported: nothing\n");
  });

  it("shows what was already said about an open criterion, so a follow-up is judged with it", () => {
    const prompt = buildReadPrompt({
      transcript: turns(3),
      message: "Only the one I mentioned.",
      askedAbout: "L8",
      open: [CRITERION, { ...CRITERION, id: "L19", text: "Pregnant" }],
      saidSoFar: { L8: { reading: "unclear", quote: "a tablet for my joints" } },
      answered: [],
    });

    expect(prompt).toContain(
      '- L8 [EXCLUSION]: Any previous systematic anti-cancer therapy for lung cancer\n    said so far: unclear, from "a tablet for my joints"\n- L19',
    );
  });

  it("asks for the statement and outright before the reading, and describes does-not-apply", () => {
    const template = READ_SYSTEM_PROMPT.slice(READ_SYSTEM_PROMPT.lastIndexOf('{ "readings"'));
    const order = ["criterionId", "statement", "quote", "outright", "reading", "missing"].map((f) =>
      template.indexOf(`"${f}"`),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(READ_SYSTEM_PROMPT).toMatch(
      /"does-not-apply": the criterion is written about one group/,
    );
  });
});

describe("the agent's prompts and the scored vignettes (0009 spec §3.5)", () => {
  const words = (text: string) =>
    text
      .toLowerCase()
      .replace(/[’']/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 0);

  it("share no run of five words with any scored fact", () => {
    const prompts = ` ${words(`${ASK_SYSTEM_PROMPT} ${READ_SYSTEM_PROMPT}`).join(" ")} `;
    const shared = new Set<string>();
    for (const v of loadVignettes().filter((x) => !x.dev)) {
      for (const f of v.facts) {
        for (const said of [f.says, f.laterSays]) {
          const w = typeof said === "string" ? words(said) : [];
          for (let i = 0; i + 5 <= w.length; i++) {
            const run = w.slice(i, i + 5).join(" ");
            if (prompts.includes(` ${run} `)) {
              shared.add(run);
            }
          }
        }
      }
    }
    expect([...shared]).toEqual([]);
  });
});

describe("PROMPT_VERSION", () => {
  it("covers the templates as well as the prompts", () => {
    expect(PROMPT_VERSION).toMatch(/^[0-9a-f]{12}$/);
    expect(OPENING_TEMPLATE.length + CLOSING_TEMPLATE.length).toBeGreaterThan(0);
  });
});
