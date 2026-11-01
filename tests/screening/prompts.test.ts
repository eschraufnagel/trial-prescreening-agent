import { describe, expect, it } from "vitest";
import { loadVignettes } from "../../evals/cases/vignettes.js";
import { VERDICT_PATTERN } from "../../evals/graders/screening.js";
import {
  ASK_CONTEXT_TURNS,
  ASK_SYSTEM_PROMPT,
  type AskRequest,
  buildAskPrompt,
  buildReadPrompt,
  PROMPT_LAYOUT,
  PROMPT_VERSION,
  READ_SYSTEM_PROMPT,
} from "../../src/screening/prompts.js";
import {
  CLOSING_TEMPLATE,
  closingMessage,
  OPENING_TEMPLATE,
  openingMessage,
  STUDY_FACTS_TEMPLATE,
  stopMessage,
  studyFacts,
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

  it("include the stop text and study facts, which contain no verdict language either (0021)", () => {
    expect(VERDICT_PATTERN.test(stopMessage("Are you pregnant?", true))).toBe(false);
    expect(VERDICT_PATTERN.test(stopMessage("Are you pregnant?", false))).toBe(false);
    for (const fact of studyFacts(STUDY)) {
      expect(VERDICT_PATTERN.test(fact)).toBe(false);
    }
    expect(studyFacts(STUDY)[0]).toBe('The study is called "A Lung Cancer Study".');
    expect(STUDY_FACTS_TEMPLATE.length).toBe(5);
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

describe("requests (slice 0021)", () => {
  const ask = (request?: AskRequest) =>
    buildAskPrompt({
      study: STUDY,
      transcript: turns(2),
      criterion: CRITERION,
      kind: "clinical",
      ...(request === undefined ? {} : { request }),
    });

  it("tells the ask call to explain from the criterion's words, then ask again", () => {
    const prompt = ask({ kind: "explain", quote: "elaborate on this" });
    expect(prompt).toMatch(/REQUEST: They asked what this question means \("elaborate on this"\)/);
    expect(prompt).toMatch(/using only the CRITERION's words/);
    expect(prompt).not.toMatch(/STUDY FACTS/);
  });

  it("gives the reason for a why, and study facts only for a study question", () => {
    expect(ask({ kind: "why", quote: "why?" })).toMatch(/REQUEST: They asked why you are asking/);
    const study = ask({ kind: "study", quote: "what is this?" });
    expect(study).toMatch(/from STUDY FACTS only/);
    expect(study).toMatch(/- The study is called "A Lung Cancer Study"\./);
  });

  it("points a second request to the coordinator", () => {
    expect(ask({ kind: "explain", quote: "huh?", again: true })).toMatch(
      /They asked again \("huh\?"\)\. Say briefly that the study coordinator can go over it/,
    );
  });

  it("has no REQUEST block without a request", () => {
    expect(ask()).not.toMatch(/REQUEST/);
  });

  it("replaces the one-line answer rule, and keeps a new criterion from posing as a follow-up", () => {
    expect(ASK_SYSTEM_PROMPT).not.toMatch(/you may answer briefly in a few words/);
    expect(ASK_SYSTEM_PROMPT).toMatch(
      /Begin with "To clarify" or similar only when FOLLOW-UP or REQUEST/,
    );
    expect(ASK_SYSTEM_PROMPT).toMatch(/Explain the question, never the person's own situation/);
    expect(PROMPT_LAYOUT).toBe(6);
  });

  it("asks the read call for a request, and says not sure is an answer", () => {
    expect(READ_SYSTEM_PROMPT).toMatch(/"explain": it asks what the question/);
    expect(READ_SYSTEM_PROMPT).toMatch(/"I'm not sure" or "I don't know" answers the question/);
    expect(READ_SYSTEM_PROMPT).toMatch(/"request": null \| \{ "kind"/);
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
