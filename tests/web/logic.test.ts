import { describe, expect, it } from "vitest";
import type { Progress } from "../../src/screening/index.js";
import type { ConversationInspection } from "../../src/server/index.js";
import type { ChannelView } from "../../src/transport/index.js";
import {
  badgeWords,
  canSubmit,
  changedIds,
  charsLeft,
  composerFor,
  dollars,
  droppedWords,
  exampleLabel,
  exampleOrder,
  hostedHint,
  MAX_MESSAGE_CHARS,
  modelLine,
  navOf,
  overCap,
  pendingWords,
  plainView,
  questionCount,
  retryText,
  reviewHash,
  routeFrom,
  rows,
  screeningLabel,
  settleWords,
  showCommand,
  submitLabel,
  trialHash,
  typeTag,
  viewChanged,
  waitingText,
} from "../../src/web/logic.js";
import { CRITERIA, STUDY } from "../fixtures/conversation.js";

/**
 * The page's decisions, tested in Node. Components only lay these out, so
 * this is where the page's behaviour is pinned (spec §7.4, §10).
 */

const view = (status: ChannelView["status"], extra: Partial<ChannelView> = {}): ChannelView => ({
  status,
  messages: [{ seq: 0, from: "agent", text: "How old are you?" }],
  ...extra,
});

const open = (id: string): Progress => ({
  criterionId: id,
  status: "open",
  reason: null,
  evidence: [],
  timesAsked: 0,
});

function inspection(progress: Progress[], pending: string | null = null): ConversationInspection {
  return {
    id: "NCT04316364-20000123T150000",
    study: STUDY,
    source: "labels",
    criteria: CRITERIA,
    plain: {},
    progress,
    pending,
    done: false,
    calls: 0,
    spent: null,
    hosted: null,
  };
}

describe("the composer", () => {
  it("offers Send only while waiting for the participant", () => {
    expect(composerFor(undefined).kind).toBe("loading");
    expect(composerFor(view("idle")).kind).toBe("send");
    expect(composerFor(view("working")).kind).toBe("waiting");
    expect(composerFor(view("done")).kind).toBe("finished");
  });

  it("offers the unprocessed message back after a failure, saying whether the model is down", () => {
    const failed = view("unavailable", {
      detail: "The model isn't responding.",
      messages: [
        { seq: 0, from: "agent", text: "How old are you?" },
        { seq: 1, from: "participant", text: "64", state: "unprocessed" },
      ],
    });
    expect(composerFor(failed)).toEqual({
      kind: "send-again",
      text: "64",
      detail: "The model isn't responding.",
      modelDown: true,
    });
    expect(composerFor({ ...failed, status: "failed" })).toMatchObject({ modelDown: false });
  });

  it("offers an empty send-again when the opening is what failed", () => {
    expect(composerFor(view("failed", { messages: [] }))).toMatchObject({
      kind: "send-again",
      text: "",
    });
  });

  it("lets the button be pressed only with something to send, or to try the opening again", () => {
    const failedReply = {
      kind: "send-again",
      text: "64",
      detail: "d",
      modelDown: true,
    } as const;
    const failedOpening = { ...failedReply, text: "" };

    expect(canSubmit({ kind: "send" }, "")).toBe(false);
    expect(canSubmit({ kind: "send" }, "64")).toBe(true);
    expect(canSubmit({ kind: "send" }, "x".repeat(MAX_MESSAGE_CHARS + 1))).toBe(false);
    expect(canSubmit({ kind: "waiting" }, "64")).toBe(false);
    expect(canSubmit({ kind: "finished" }, "64")).toBe(false);
    expect(canSubmit(failedReply, "")).toBe(false);
    expect(canSubmit(failedReply, "64")).toBe(true);
    expect(canSubmit(failedOpening, "")).toBe(true);

    expect(submitLabel({ kind: "send" })).toBe("Send");
    expect(submitLabel(failedReply)).toBe("Send again");
    expect(submitLabel(failedOpening)).toBe("Try again");
  });

  it("sends no text when trying a failed opening again, whatever is in the box", () => {
    const failedOpening = { kind: "send-again", text: "", detail: "d", modelDown: true } as const;
    const failedReply = { ...failedOpening, text: "64" };

    expect(canSubmit(failedOpening, "something typed meanwhile")).toBe(true);
    expect(retryText(failedOpening, "something typed meanwhile")).toBeUndefined();
    expect(retryText(failedReply, "64")).toBeUndefined();
    expect(retryText(failedReply, "I'm 64")).toBe("I'm 64");
  });

  it("points a finished conversation at its saved file", () => {
    expect(showCommand("NCT04316364-20000123T150000")).toBe(
      "npm run screening:show -- chats/NCT04316364-20000123T150000.json --html",
    );
  });

  it("counts characters left against the transport's cap, trimmed", () => {
    expect(charsLeft("  hi  ")).toBe(MAX_MESSAGE_CHARS - 2);
    expect(charsLeft("x".repeat(MAX_MESSAGE_CHARS + 1))).toBe(-1);
  });

  it("shows whole seconds waited", () => {
    expect(waitingText(12.7)).toBe("Thinking… 12 s");
    expect(waitingText(-1)).toBe("Thinking… 0 s");
  });
});

describe("when the tester panel refetches", () => {
  it("refetches on the first poll, a new message, a status change or a message's state changing", () => {
    const idle = view("idle");
    expect(viewChanged(undefined, idle)).toBe(true);
    expect(viewChanged(idle, view("idle"))).toBe(false);
    expect(viewChanged(idle, view("working"))).toBe(true);
    const sent = view("working", {
      messages: [...idle.messages, { seq: 1, from: "participant", text: "64", state: "pending" }],
    });
    expect(viewChanged(idle, sent)).toBe(true);
    const failed = view("failed", {
      messages: [
        ...idle.messages,
        { seq: 1, from: "participant", text: "64", state: "unprocessed" },
      ],
    });
    expect(viewChanged({ ...sent, status: "failed" }, failed)).toBe(true);
  });
});

describe("the tester panel's rows", () => {
  const before = inspection(
    CRITERIA.map((c) => open(c.id)),
    "L8",
  );
  const after = inspection(
    [
      {
        criterionId: "L8",
        status: "does-not-hold",
        reason: "answered",
        evidence: [{ turn: 2, quote: "No treatment", reading: "does-not-hold" }],
        timesAsked: 1,
      },
      open("L4"),
      open("L2"),
      // Volunteered out of order: settled without being asked.
      {
        criterionId: "L19",
        status: "does-not-hold",
        reason: "answered",
        evidence: [{ turn: 2, quote: "not pregnant", reading: "does-not-hold" }],
        timesAsked: 0,
      },
    ],
    "L2",
  );

  it("marks what changed on the last turn, including an answer volunteered out of order", () => {
    expect([...changedIds(before, after, new Set())]).toEqual(["L8", "L19"]);
  });

  it("keeps the last marks when a refetch finds nothing new", () => {
    const marks = new Set(["L8", "L19"]);
    expect([...changedIds(after, after, marks)]).toEqual(["L8", "L19"]);
  });

  it("marks nothing on the first reading or a different conversation", () => {
    expect(changedIds(undefined, after, new Set(["L8"])).size).toBe(0);
    expect(changedIds({ ...before, id: "other" }, after, new Set(["L8"])).size).toBe(0);
  });

  it("lists every criterion in document order, with 0004's words and the awaited one flagged", () => {
    const listed = rows(after, new Set(["L8", "L19"]));

    expect(listed.map((r) => [r.criterion.id, r.words, r.awaiting, r.changed])).toEqual([
      ["L8", "does not hold", false, true],
      ["L4", "open", false, false],
      ["L2", "open", true, false],
      ["L19", "does not hold", false, true],
    ]);
    expect(listed[3]?.evidence).toEqual([{ turn: 2, quote: "not pregnant" }]);
  });

  it("carries nothing that reads as a verdict or a total", () => {
    expect(JSON.stringify(rows(after, new Set()))).not.toMatch(
      /eligib|verdict|disposition|qualif|total|score/i,
    );
  });
});

describe("plain language under the protocol words", () => {
  it("gives each row its criterion's rendering, and none when nothing is served", () => {
    const served = {
      ...inspection([]),
      plain: {
        L8: {
          state: "shown" as const,
          text: "Has had cancer treatment before.",
          attempt: 1 as const,
        },
      },
    };
    const listed = rows(served, new Set());
    expect(listed[0]?.plain).toEqual(served.plain.L8);
    expect(listed[1]?.plain).toBeUndefined();
  });

  it("shows a rendering, tagged when it took a retry", () => {
    expect(plainView({ state: "shown", text: "Is pregnant.", attempt: 1 })).toEqual({
      label: "Plain language",
      tag: null,
      text: "Is pregnant.",
      lines: [],
    });
    expect(plainView({ state: "shown", text: "Is pregnant.", attempt: 2 })?.tag).toBe("retry");
  });

  it("says why there is none, and shows no text", () => {
    expect(plainView({ state: "failed", problems: ["missing: active"] })).toEqual({
      label: "No plain version: the check found",
      tag: null,
      text: null,
      lines: ["missing: active"],
    });
    expect(plainView({ state: "stale" })?.text).toBeNull();
    expect(plainView({ state: "missing" })?.lines).toEqual(["None has been made."]);
  });

  it("leaves the protocol words alone when nothing is served", () => {
    expect(plainView(undefined)).toBeNull();
  });

  it("tells the coordinator only that there is no plain version, and which kind of absence", () => {
    expect(plainView({ state: "shown", text: "Is pregnant.", attempt: 2 }, "coordinator")).toEqual({
      label: "Plain language",
      tag: null,
      text: "Is pregnant.",
      lines: [],
    });
    const none = (lines: string[]) => ({
      label: "No plain-language version",
      tag: null,
      text: null,
      lines,
    });
    expect(plainView({ state: "failed", problems: ["missing: active"] }, "coordinator")).toEqual(
      none(["One was made but failed the check."]),
    );
    expect(plainView({ state: "stale" }, "coordinator")).toEqual(
      none(["It was made from earlier wording."]),
    );
    expect(plainView({ state: "missing" }, "coordinator")).toEqual(none(["None has been made."]));
    expect(plainView(undefined, "coordinator")).toBeNull();
  });
});

describe("routes", () => {
  it("reads every page from the hash, and anything else is Trials, the home page", () => {
    expect(routeFrom("#/c/NCT04316364-20000123T150000")).toEqual({
      page: "conversation",
      id: "NCT04316364-20000123T150000",
    });
    expect(routeFrom("")).toEqual({ page: "trials" });
    expect(routeFrom("#/")).toEqual({ page: "trials" });
    expect(routeFrom("#/trials")).toEqual({ page: "trials" });
    expect(routeFrom("#/screenings")).toEqual({ page: "screenings" });
    expect(routeFrom("#/reviews")).toEqual({ page: "reviews" });
    expect(routeFrom(trialHash("NCT06557512"))).toEqual({ page: "trial", nctId: "NCT06557512" });
    expect(routeFrom("#/t/NCT1")).toEqual({ page: "trials" });
    expect(routeFrom("#/trials/x")).toEqual({ page: "trials" });
    expect(routeFrom("#/c/../../x")).toEqual({ page: "trials" });
  });

  it("reads a review id, encoded, including an eval run's with a space in it", () => {
    for (const id of ["NCT04316364-20000123T150000", "eval NCT00077350-v1-labels"]) {
      expect(routeFrom(reviewHash(id))).toEqual({ page: "review", id });
    }
    expect(reviewHash("eval NCT00077350-v1-labels")).toBe("#/review/eval%20NCT00077350-v1-labels");
    expect(routeFrom("#/review/%E0%A4%A")).toEqual({ page: "trials" });
    expect(routeFrom("#/review/../x")).toEqual({ page: "trials" });
  });

  it("puts each page under its nav item", () => {
    expect(navOf({ page: "trial", nctId: "NCT06557512" })).toBe("trials");
    expect(navOf({ page: "conversation", id: "x" })).toBe("screenings");
    expect(navOf({ page: "review", id: "x" })).toBe("reviews");
  });
});

describe("a trial's words (slice 0014)", () => {
  it("badges each state, and a pinned trial as an example", () => {
    expect(badgeWords({ origin: "pinned", state: "ready", criteria: 37 })).toEqual({
      text: "Built-in example",
      tone: "neutral",
    });
    expect(badgeWords({ origin: "added", state: "parsing", criteria: null }).tone).toBe("accent");
    expect(badgeWords({ origin: "added", state: "ready", criteria: 16 })).toEqual({
      text: "Ready · 16 criteria",
      tone: "ok",
    });
    expect(badgeWords({ origin: "added", state: "failed", criteria: null })).toEqual({
      text: "Couldn't add",
      tone: "down",
    });
    // A refresh that failed still has its earlier parse in use.
    expect(badgeWords({ origin: "added", state: "failed", criteria: 16 }).tone).toBe("ok");
  });

  it("tags each type by who can settle it, and counts them in a line", () => {
    expect(
      ["patient", "clinical", "protocol", "definitional"].map((t) => typeTag(t as never)),
    ).toEqual(["Person answers", "Records", "For the study site", "Definition"]);
    expect(settleWords({ patient: 6, clinical: 10, protocol: 0, definitional: 0 })).toBe(
      "6 the person can answer · 10 need medical records",
    );
    expect(settleWords({ patient: 1, clinical: 2, protocol: 1, definitional: 1 })).toBe(
      "1 the person can answer · 2 need medical records · 2 for the study site",
    );
    expect(settleWords(null)).toBeNull();
  });

  it("counts the agent's questions", () => {
    expect(questionCount(undefined)).toBe(0);
    expect(
      questionCount({
        messages: [
          { seq: 1, from: "agent", text: "a" },
          { seq: 2, from: "participant", text: "b" },
          { seq: 3, from: "agent", text: "c" },
        ],
      } as never),
    ).toBe(2);
  });
});

describe("droppedWords (slice 0013)", () => {
  it("says nothing when the parse left nothing out", () => {
    expect(droppedWords(null)).toBeUndefined();
    expect(droppedWords({ rejected: 0, unclaimed: 0 })).toBeUndefined();
  });

  it("counts what was left out, in the singular and plural", () => {
    expect(droppedWords({ rejected: 11, unclaimed: 6 })).toBe(
      "11 criteria couldn't be matched to the protocol text and were left out; " +
        "6 passages weren't read. The agent won't ask about them.",
    );
    expect(droppedWords({ rejected: 1, unclaimed: 0 })).toBe(
      "1 criterion couldn't be matched to the protocol text and was left out. The agent won't ask about them.",
    );
    expect(droppedWords({ rejected: 0, unclaimed: 1 })).toBe(
      "1 passage wasn't read. The agent won't ask about them.",
    );
  });
});

describe("pendingWords (slice 0013)", () => {
  it("says what a job is doing and for how long", () => {
    expect(pendingWords("fetching", 2.7)).toBe("Fetching from ClinicalTrials.gov · 2 s");
    expect(pendingWords("parsing", 59)).toMatch(/^Reading the rules on the local model .* · 59 s$/);
    expect(pendingWords("parsing", 130)).toMatch(/ · 2 min 10 s$/);
    expect(pendingWords("parsing", -3)).toMatch(/ · 0 s$/);
  });
});

describe("screeningLabel (slice 0014)", () => {
  it("names a screening by its trial and when it started, in local time", () => {
    const id = "NCT06927180-20000204T141402";
    const started = new Date(Date.UTC(2000, 1, 4, 14, 14, 2));
    expect(screeningLabel(id, "HER2 study", started)).toMatch(/^HER2 study · today \d/);
    const nextWeek = new Date(started.getTime() + 7 * 24 * 3600 * 1000);
    expect(screeningLabel(id, "HER2 study", nextWeek)).not.toContain("today");
  });

  it("falls back to the trial's ID, and to the name alone for an id with no time", () => {
    expect(screeningLabel("NCT06927180-20000204T141402", undefined)).toMatch(/^NCT06927180 · /);
    expect(screeningLabel("eval NCT00077350-v1-labels", "Triapine study")).toBe("Triapine study");
  });
});

describe("exampleLabel (slice 0016)", () => {
  it("names an example by its simulated patient and where its rules came from", () => {
    expect(exampleLabel("eval NCT00077350-v1-labels")).toBe(
      "Simulated patient 1 · rules checked by hand",
    );
    expect(exampleLabel("eval NCT00077350-v3-labels")).toBe(
      "Simulated patient 3 · rules checked by hand",
    );
    expect(exampleLabel("eval NCT04316364-v2-parse")).toBe(
      "Simulated patient 2 · rules read by the AI",
    );
  });

  it("leaves any other id as it is", () => {
    expect(exampleLabel("NCT04316364-20000123T150000")).toBe("NCT04316364-20000123T150000");
    expect(exampleLabel("eval NCT0000-v1-labels")).toBe("eval NCT0000-v1-labels");
    expect(exampleLabel("eval NCT00077350-v1-other")).toBe("eval NCT00077350-v1-other");
  });
});

describe("exampleOrder (slice 0016)", () => {
  it("puts rules checked by hand first, then rules read by the AI, each by simulated patient", () => {
    const ids = [
      "eval NCT00077350-v2-parse",
      "eval NCT00077350-v3-labels",
      "eval NCT00077350-v1-parse",
      "eval NCT00077350-v1-labels",
      "eval NCT00077350-v2-labels",
    ];
    expect([...ids].sort(exampleOrder)).toEqual([
      "eval NCT00077350-v1-labels",
      "eval NCT00077350-v2-labels",
      "eval NCT00077350-v3-labels",
      "eval NCT00077350-v1-parse",
      "eval NCT00077350-v2-parse",
    ]);
  });

  it("puts an id it can't read last", () => {
    expect(["odd", "eval NCT00077350-v1-parse"].sort(exampleOrder)).toEqual([
      "eval NCT00077350-v1-parse",
      "odd",
    ]);
  });
});

describe("where answers go (slice 0017)", () => {
  const local = { mode: "local-model" as const, model: { model: "Qwen-8bit" }, hosted: null };
  const hosted = {
    mode: "local-model" as const,
    model: { model: "claude-haiku-4-5" },
    hosted: { name: "Anthropic", model: "claude-haiku-4-5" },
  };

  it("names the model answering in the badge", () => {
    expect(modelLine(local)).toBe("Local model · Qwen-8bit");
    expect(modelLine(hosted)).toBe("Anthropic · claude-haiku-4-5");
    expect(modelLine({ ...hosted, mode: "scripted" })).toBe("Scripted agent · no model");
  });

  it("says above the composer where answers are sent", () => {
    expect(hostedHint(hosted)).toBe(
      "Your answers are sent to Anthropic. Use made-up answers only.",
    );
    expect(hostedHint(local)).toBe("Use made-up answers only. This is a test system.");
    expect(hostedHint(undefined)).toBe("Use made-up answers only. This is a test system.");
  });

  it("shows dollars, and warns when a model's screening is over the limit", () => {
    expect(dollars(0.291)).toBe("$0.29");
    expect(dollars(0.0005)).toBe("under 1¢");
    expect(dollars(0)).toBe("$0.00");
    expect(overCap(0.58, 0.5)).toBe(true);
    expect(overCap(0.29, 0.5)).toBe(false);
    expect(overCap(undefined, 0.5)).toBe(false);
  });

  it("routes #/settings to Settings", () => {
    expect(routeFrom("#/settings")).toEqual({ page: "settings" });
    expect(navOf({ page: "settings" })).toBe("settings");
  });
});
