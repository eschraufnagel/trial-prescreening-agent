import type { CompletionRequest, ScriptedResponse } from "../../src/models/index.js";

/**
 * The scripted agent behind `npm run app -- --fake`: a `FakeModelAdapter`
 * responder that plays the model's two parts in a screening conversation
 * without a model (spec §8.3).
 *
 * It exists so the page can be tried in seconds, and worked on when oMLX is
 * down. It measures nothing, and the page says so in a banner.
 *
 * It reads the screening prompts' layout (`src/screening/prompts.ts`), which
 * is why it lives here and not under `src/`: neither the models module nor the
 * application should know that layout. `tests/scripts/scripted-agent.test.ts`
 * drives a whole session with it, so a change to the layout breaks a test
 * rather than the fake mode.
 *
 * These replies are read specially (slices 0010 and 0021), so the page's browser test
 * can reach every state the page has without a model:
 *
 * - `[down] ...` answers as an unreachable model would. The server reports a
 *   failure starting "request failed" as the model being down.
 * - `[slow] ...` is read without the marker, and the answer is held back
 *   two seconds, so the page shows the agent working.
 * - `n/a` reads as does-not-apply, 0009's reading for a person outside the
 *   group a criterion is about.
 * - `[explain] ...`, `[why] ...`, `[study] ...` and `[stop] ...` read as that
 *   request (slice 0021), with what follows the marker as its quote. An ask with
 *   a REQUEST answers it before asking again, from the first study fact when
 *   the request is about the study. A stop request is answered by fixed text,
 *   with no ask.
 */

const CRITERION_LINE = /^CRITERION \((?:inclusion|exclusion)\): (.*)$/m;
const REPLY_LINE = /^THE REPLY TO READ: (.*)$/m;
const ASKED_LINE = /^THE QUESTION WAS ABOUT: (\S+)$/m;
const REQUEST_LINE = /^REQUEST: /m;
const FIRST_STUDY_FACT = /^STUDY FACTS:\n- (.*)$/m;

const DOWN = "[down]";
const SLOW = "[slow]";
/** The request markers, each read as the request of the same name. */
const REQUESTS = ["explain", "why", "study", "stop"] as const;
/** How long `[slow]` holds the answer: long enough for a browser to see the agent working. */
export const SLOW_MS = 2000;

export function scriptedAgent(request: CompletionRequest): ScriptedResponse {
  const reply = REPLY_LINE.exec(request.user);
  return reply === null ? ask(request.user) : read(request.user, reply[1] ?? "");
}

function ask(prompt: string): ScriptedResponse {
  const criterion = CRITERION_LINE.exec(prompt)?.[1]?.trim() ?? "this criterion";
  const fact = FIRST_STUDY_FACT.exec(prompt)?.[1];
  if (fact !== undefined) {
    return {
      kind: "json",
      content: { message: `(scripted) ${fact} Is this true for you: ${criterion}?` },
    };
  }
  if (REQUEST_LINE.test(prompt)) {
    return {
      kind: "json",
      content: {
        message: `(scripted) That question asks whether this is true for you: ${criterion}. Is it?`,
      },
    };
  }
  return {
    kind: "json",
    content: {
      message: `(scripted) Is this true for you: ${criterion}? Answer yes, no, or not sure.`,
    },
  };
}

/** The markers first (see the top of this file), then the first word. */
function read(prompt: string, message: string): ScriptedResponse {
  const typed = message.trim();
  if (typed.startsWith(DOWN)) {
    return {
      kind: "error",
      message: `request failed: ${DOWN} was typed, the scripted model is unreachable`,
    };
  }
  const kind = REQUESTS.find((k) => typed.startsWith(`[${k}]`));
  if (kind !== undefined) {
    // The quote is what was typed after the marker, or the marker itself, so it locates.
    const marker = `[${kind}]`;
    const rest = typed.slice(marker.length).trim();
    return {
      kind: "json",
      content: { readings: [], request: { kind, quote: rest === "" ? marker : rest } },
    };
  }
  if (typed.startsWith(SLOW)) {
    return { ...readWords(prompt, typed.slice(SLOW.length)), delayMs: SLOW_MS };
  }
  return readWords(prompt, typed);
}

/**
 * Reads the first word literally. The quote is that word as typed, so it
 * always locates in the message and the evidence check passes for the right
 * reason, not because the check was bypassed.
 */
function readWords(prompt: string, message: string): ScriptedResponse {
  const criterionId = ASKED_LINE.exec(prompt)?.[1];
  const firstWord = message.trim().split(/\s+/)[0] ?? "";
  if (criterionId === undefined || firstWord === "") {
    return { kind: "json", content: { readings: [] } };
  }
  const word = firstWord.toLowerCase().replace(/[^a-z']/g, "");
  const second = message.trim().split(/\s+/)[1]?.toLowerCase() ?? "";
  const reading =
    firstWord.toLowerCase() === "n/a"
      ? "does-not-apply"
      : ["yes", "yeah", "yep", "y"].includes(word)
        ? "holds"
        : ["no", "nope", "n", "never"].includes(word) && !second.startsWith("idea")
          ? "does-not-hold"
          : (word === "not" && second.startsWith("sure")) ||
              ["don't", "dont", "unsure"].includes(word)
            ? "unknown"
            : "unclear";
  return {
    kind: "json",
    content: {
      readings: [
        // The scripted agent restates nothing and never hedges: it reads one word.
        {
          criterionId,
          statement: `(scripted) ${criterionId}`,
          quote: firstWord,
          outright: true,
          reading,
        },
      ],
    },
  };
}
