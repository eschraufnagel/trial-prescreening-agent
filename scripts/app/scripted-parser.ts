import type { CompletionRequest, ScriptedResponse } from "../../src/models/index.js";

/**
 * The parser behind `npm run app -- --fake` (slice 0013): a `FakeModelAdapter`
 * responder that plays the model's part in `parseCriteria`, so a trial added
 * on the Trials screen gets criteria without a model.
 *
 * It reads the eligibility block from the parser's user prompt
 * (`buildUserPrompt` in `src/criteria/prompt.ts`) and makes one `patient`
 * criterion per bullet line, inclusion or exclusion by the heading above it.
 * It measures nothing. `tests/scripts/scripted-parser.test.ts` runs
 * `parseCriteria` with it, so a change to the prompt's layout breaks a test,
 * not fake mode.
 *
 * Its answer is held back, so the screen shows a trial parsing.
 */

const BLOCK_START = "\nEligibility criteria:\n\n";
const BULLET = /^\s*(?:[*\-•]|\d+[.)])\s+(.+?)\s*$/;
/** Long enough for a browser to see the parsing state. */
export const PARSE_MS = 1500;

export function scriptedParser(request: CompletionRequest): ScriptedResponse {
  const at = request.user.indexOf(BLOCK_START);
  const block = at === -1 ? "" : request.user.slice(at + BLOCK_START.length);
  let polarity: "inclusion" | "exclusion" = "inclusion";
  const criteria = block.split("\n").flatMap((line) => {
    if (/^\s*exclusion/i.test(line)) {
      polarity = "exclusion";
    } else if (/^\s*inclusion/i.test(line)) {
      polarity = "inclusion";
    }
    const quote = BULLET.exec(line)?.[1];
    return quote === undefined
      ? []
      : [{ quote, text: quote, polarity, type: "patient", appliesTo: null, confidence: 0.5 }];
  });
  return { kind: "json", content: { criteria }, delayMs: PARSE_MS };
}
