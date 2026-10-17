import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  NORMALIZE_VERSION,
  normalize,
  PROMPT_VERSION,
  parseIdentity,
} from "../../src/criteria/index.js";
import { CORPUS_IDS, getTrial } from "../../src/trials/index.js";

/**
 * What a parse's identity is made of (slice 0011, spec §3.1).
 *
 * The parser's prompt version hashes the system prompt only, and the model also
 * reads the normalized block. So normalization carries a version of its own,
 * and this pin makes a change to either one without the other fail here, where
 * it's cheap, rather than in a cache that silently serves an old parse.
 */

/** Every fixture normalized, in corpus order, hashed. */
function corpusHash(): string {
  const hash = createHash("sha256");
  for (const id of CORPUS_IDS) {
    hash.update(normalize(getTrial(id).eligibility.criteriaText).text);
    hash.update("\u0000");
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * The version and the corpus hash it produces. When normalization changes on
 * purpose, bump `NORMALIZE_VERSION` in `src/criteria/normalize.ts` and write
 * the new pair here, in the same commit.
 */
const PINNED = { version: "2", corpus: "6f0216de6bb183ed" };

describe("parse identity", () => {
  it("pins the normalization version to what it does to the corpus", () => {
    expect(
      { version: NORMALIZE_VERSION, corpus: corpusHash() },
      "normalized text changed: bump NORMALIZE_VERSION and update PINNED together",
    ).toEqual(PINNED);
  });

  it("is the prompt version alone for what 0003 ran with", () => {
    if (NORMALIZE_VERSION === "1") {
      expect(parseIdentity({})).toBe(PROMPT_VERSION);
    } else {
      expect(parseIdentity({})).toBe(`${PROMPT_VERSION}-n${NORMALIZE_VERSION}`);
    }
  });

  it("names reasoning off, and only when it was off", () => {
    expect(parseIdentity({ thinking: "off" })).toBe(`${parseIdentity({})}-thinking-off`);
  });
});
