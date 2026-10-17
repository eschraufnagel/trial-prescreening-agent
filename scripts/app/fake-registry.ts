import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NCT_ID } from "../../src/trials/reference.js";
import { trimStudy } from "../../src/trials/trim.js";
import type { Trial } from "../../src/trials/types.js";

/**
 * The registry behind `npm run app -- --fake` (slice 0013): one invented
 * study, read from disk and trimmed as a real response would be. Fake mode and
 * the browser test add it on the Trials screen without reaching the network.
 */

export const FAKE_STUDY = "NCT00000000";
export const FAKE_ONLY = `Fake mode has no network. Only ${FAKE_STUDY} can be added here.`;

const REGISTRY_DIR = new URL("./registry/", import.meta.url);

export async function fakeFetchStudy(nctId: string): Promise<Trial> {
  if (nctId !== FAKE_STUDY || !NCT_ID.test(nctId)) {
    throw new Error(FAKE_ONLY);
  }
  const path = fileURLToPath(new URL(`${nctId}.json`, REGISTRY_DIR));
  return trimStudy(JSON.parse(readFileSync(path, "utf8")), nctId);
}
