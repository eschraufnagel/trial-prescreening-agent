import type { SourceSpan } from "./types.js";

/**
 * Cleans an eligibility block enough for a model to read it, while keeping
 * every character traceable to where it came from.
 *
 * Slice 0001 stored `criteriaText` byte-for-byte on purpose, including
 * registry-escaped markdown and inconsistent line endings. That text is what a
 * coordinator in 0007 must be shown and what a disagreement in 0003 is
 * adjudicated against, so normalization may not be a one-way trip: every
 * offset in the cleaned text maps back to an offset in the original.
 *
 * ## What is deliberately not normalized
 *
 * Bullet markers, including their absence. The corpus contains blocks with no
 * list structure at all (NCT06728852, NCT07229729) and blocks whose sub-items
 * run inline (NCT00743379). Rewriting those into a uniform list would be a
 * regex faking the judgment the parser is supposed to make, and would hide the
 * exact formatting variance the corpus was chosen to contain. Case, spelling,
 * abbreviations and clinical terminology are untouched for the same reason.
 */

/** Cleaned text, plus the map back to the original. */
export interface NormalizedText {
  /** The original, unmodified. */
  original: string;
  /** The cleaned text a model is shown. */
  text: string;
  /**
   * `sourceIndex[i]` is the offset in `original` of `text[i]`.
   *
   * A per-character map rather than a list of edits. It costs one number per
   * character — nothing at this size — and turns offset translation into an
   * array read instead of arithmetic over a list of splices, which is the kind
   * of code that is subtly wrong for months.
   */
  sourceIndex: number[];
}

/**
 * Which normalization a parse was made from, recorded on it and part of its
 * cache key (slice 0011).
 *
 * The parser's prompt version hashes only the system prompt, but the model
 * reads normalized text too, so a change here is a change to the experiment.
 * Bumped by hand. `tests/criteria/identity.test.ts` pins this version together
 * with a hash of the whole corpus normalized, and fails when one moves without
 * the other.
 */
export const NORMALIZE_VERSION: string = "2";

/**
 * Backslash-escaped punctuation the registry emits, which survives into the
 * stored text: `1\.` at the head of a numbered criterion, `\>=` in a lab
 * threshold. The backslash is dropped and the character kept.
 *
 * Restricted to punctuation that markdown escaping actually produces. A blanket
 * "drop every backslash" would corrupt any clinical text that legitimately
 * contains one.
 */
const ESCAPABLE = new Set([
  ".",
  ",",
  ">",
  "<",
  "*",
  "-",
  "_",
  "[",
  "]",
  "(",
  ")",
  "#",
  "+",
  "!",
  "`",
  "\\",
  // Added in slice 0011 (version 2). Until then `10\^9/L` and `mm\^3` reached
  // the model in every lab threshold with an exponent, and `\&` in one list.
  "^",
  "&",
]);

export function normalize(original: string): NormalizedText {
  let chars: string[] = [];
  let sourceIndex: number[] = [];

  // Pass 1: line endings and escaped punctuation, character by character, so
  // that each surviving character records where it came from.
  for (let i = 0; i < original.length; i++) {
    const char = original[i];
    if (char === undefined) {
      continue;
    }

    if (char === "\r") {
      // CRLF collapses to the LF that follows; a lone CR becomes one.
      if (original[i + 1] === "\n") {
        continue;
      }
      chars.push("\n");
      sourceIndex.push(i);
      continue;
    }

    if (char === "\\") {
      const next = original[i + 1];
      if (next !== undefined && ESCAPABLE.has(next)) {
        continue;
      }
    }

    chars.push(char);
    sourceIndex.push(i);
  }

  ({ chars, sourceIndex } = dropTrailingSpaces(chars, sourceIndex));
  ({ chars, sourceIndex } = collapseBlankLines(chars, sourceIndex));

  return { original, text: chars.join(""), sourceIndex };
}

/** Whitespace before a line break carries nothing and makes spans harder to read. */
function dropTrailingSpaces(
  chars: string[],
  sourceIndex: number[],
): { chars: string[]; sourceIndex: number[] } {
  const keep: boolean[] = new Array(chars.length).fill(true);

  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== "\n" && i !== chars.length - 1) {
      continue;
    }
    // Walk back over the run of spaces and tabs ending at this break.
    const from = chars[i] === "\n" ? i - 1 : i;
    for (let j = from; j >= 0 && (chars[j] === " " || chars[j] === "\t"); j--) {
      keep[j] = false;
    }
  }

  return applyKeep(chars, sourceIndex, keep);
}

/** Three or more line breaks say no more than two: paragraph spacing varies. */
function collapseBlankLines(
  chars: string[],
  sourceIndex: number[],
): { chars: string[]; sourceIndex: number[] } {
  const keep: boolean[] = new Array(chars.length).fill(true);
  let run = 0;

  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "\n") {
      run += 1;
      if (run > 2) {
        keep[i] = false;
      }
    } else {
      run = 0;
    }
  }

  return applyKeep(chars, sourceIndex, keep);
}

function applyKeep(
  chars: string[],
  sourceIndex: number[],
  keep: boolean[],
): { chars: string[]; sourceIndex: number[] } {
  const outChars: string[] = [];
  const outIndex: number[] = [];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const source = sourceIndex[i];
    if (keep[i] === true && char !== undefined && source !== undefined) {
      outChars.push(char);
      outIndex.push(source);
    }
  }

  return { chars: outChars, sourceIndex: outIndex };
}

/**
 * Turns a span of normalized text into a span of the original.
 *
 * The result always satisfies `original.slice(start, end) === text`, which is
 * what lets 0007 show a coordinator the registry's own words rather than our
 * cleaned copy. Note that the original span can be wider than the normalized
 * one — it still contains any backslashes and trailing spaces that were
 * removed between them.
 */
export function toSourceSpan(
  normalized: NormalizedText,
  start: number,
  end: number,
): SourceSpan | undefined {
  if (start < 0 || end > normalized.text.length || end <= start) {
    return undefined;
  }

  const first = normalized.sourceIndex[start];
  const last = normalized.sourceIndex[end - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }

  const sourceEnd = last + 1;
  return { start: first, end: sourceEnd, text: normalized.original.slice(first, sourceEnd) };
}
