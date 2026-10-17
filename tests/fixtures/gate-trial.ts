import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ParsedCriteria } from "../../src/criteria/index.js";
import type { Trial } from "../../src/trials/index.js";
import { validateTrial } from "../../src/trials/validate.js";

/**
 * The long, nested protocol from 0013's gate, NCT06090266, as the app saved it
 * with its parse (slice 0015). Committed under `work/`, so reading it keeps
 * `npm test` passing from a fresh clone. It's the parse whose 11 rejected
 * heading joins this slice set out to recover.
 */

export const GATE_RECORD = fileURLToPath(
  new URL("../../work/0013-trials-by-link/gate/NCT06090266.json", import.meta.url),
);

interface GateRecord {
  trial: unknown;
  parsed: ParsedCriteria;
}

export function gateRecord(): GateRecord {
  return JSON.parse(readFileSync(GATE_RECORD, "utf8")) as GateRecord;
}

export function gateTrial(): Trial {
  return validateTrial(gateRecord().trial, GATE_RECORD);
}
