import type { NormalizedText } from "./normalize.js";
import { toSourceSpan } from "./normalize.js";
import type { SourceSpan } from "./types.js";

/**
 * Finds where a model-supplied quote occurs in the text, and maps it back to
 * the original.
 *
 * The model is asked for a verbatim quote rather than for character offsets.
 * Offsets into a 16KB string are arithmetic, and a language model is bad at
 * arithmetic in a way that is hard to detect downstream: a plausible pair of
 * numbers produces a span pointing at the wrong sentence, and nothing in the
 * output looks wrong. A quote either occurs in the source or it does not, and
 * when it does not, the model made it up.
 *
 * Searching forward from the previous criterion's end does two jobs: it
 * resolves a quote that legitimately appears twice to the right occurrence,
 * and it keeps criteria in document order.
 *
 * ## Heading joins (slice 0015)
 *
 * A long protocol nests criteria under a heading ("Recent or ongoing serious
 * infection including the following:", then a numbered list), and the model
 * quotes the heading and one item as one string, dropping the marker between
 * them. Both halves are in the source; the joined string isn't. At 0013's gate
 * that threw away 11 of NCT06090266's 45 criteria, the HIV, hepatitis and
 * tuberculosis exclusions among them.
 *
 * So a quote found neither exactly nor loosely gets a third try: split at a
 * colon into a heading and an item, and accept it only when the source has
 * exactly that structure. Each clause exists to refuse a stitch:
 *
 * - the heading is the whole of its line, after any list marker, and ends in
 *   the colon, so a prefix like "Patients must have" (0011's real stitch) or a
 *   colon partway along a line is not a heading;
 * - the item starts a line, after its indent and any marker, so a phrase from
 *   the middle of a sentence is not an item;
 * - the item sits inside the heading's list, before any line indented no
 *   deeper than the heading, so an item from another heading's list is not
 *   this heading's.
 *
 * The span is the item's. The heading's span comes back beside it, because the
 * heading's own span would run across the sibling items above the one quoted.
 * Shapes that may be honest but haven't been seen (a heading that is the tail
 * of its line, an inline sub-item, an unindented sub-list) are refused, and
 * `tests/criteria/adversarial.test.ts` pins each.
 */

export interface LocateResult {
  span: SourceSpan;
  /** Where to resume searching for the next criterion, in normalized coordinates. */
  nextFrom: number;
  /**
   * True when the quote matched only after allowing whitespace to differ.
   *
   * Worth surfacing rather than hiding: it is the difference between a model
   * copying text out and a model retyping it, and a corpus where most quotes
   * need the loose match is one whose parse should be read more suspiciously.
   */
  loose: boolean;
  /**
   * The heading, when the quote was a heading joined to one of its items
   * (slice 0015). `span` is then the item's.
   */
  heading?: SourceSpan;
}

export function locateQuote(
  normalized: NormalizedText,
  quote: string,
  from = 0,
): LocateResult | undefined {
  const trimmed = quote.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const exact = findExact(normalized.text, trimmed, from);
  if (exact !== undefined) {
    return build(normalized, exact.start, exact.end, false);
  }

  // A model that reflows a criterion spanning a line break produces a quote
  // that is correct in every respect except its whitespace. Rejecting those
  // would throw away real criteria to punish cosmetic infidelity.
  const loose = findLoose(normalized.text, trimmed, from);
  if (loose !== undefined) {
    return build(normalized, loose.start, loose.end, true);
  }

  const joined = findJoined(normalized.text, trimmed, from);
  if (joined !== undefined) {
    const span = toSourceSpan(normalized, joined.item.start, joined.item.end);
    const heading = toSourceSpan(normalized, joined.heading.start, joined.heading.end);
    if (span !== undefined && heading !== undefined) {
      return { span, nextFrom: joined.item.end, loose: joined.loose, heading };
    }
  }

  return undefined;
}

function build(
  normalized: NormalizedText,
  start: number,
  end: number,
  loose: boolean,
): LocateResult | undefined {
  const span = toSourceSpan(normalized, start, end);
  return span === undefined ? undefined : { span, nextFrom: end, loose };
}

/** Exact match, preferring the first occurrence at or after `from`. */
function findExact(
  haystack: string,
  needle: string,
  from: number,
): { start: number; end: number } | undefined {
  let start = haystack.indexOf(needle, from);

  // Falling back to the whole text keeps a criterion the model returned out of
  // order, rather than discarding it as a hallucination it is not.
  if (start === -1 && from > 0) {
    start = haystack.indexOf(needle);
  }

  return start === -1 ? undefined : { start, end: start + needle.length };
}

/** Match allowing runs of whitespace to differ in kind and length. */
function findLoose(
  haystack: string,
  needle: string,
  from: number,
): { start: number; end: number } | undefined {
  const regex = looseRegExp(needle);
  if (regex === undefined) {
    return undefined;
  }

  return firstMatchFrom(regex, haystack, from) ?? firstMatchFrom(regex, haystack, 0);
}

/** A pattern matching `needle` with runs of whitespace free to differ. */
function looseRegExp(needle: string): RegExp | undefined {
  const pattern = needle
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map(escapeRegExp)
    .join("\\s+");

  return pattern.length === 0 ? undefined : new RegExp(pattern, "g");
}

function firstMatchFrom(
  regex: RegExp,
  haystack: string,
  from: number,
): { start: number; end: number } | undefined {
  regex.lastIndex = from;
  const match = regex.exec(haystack);

  return match === null ? undefined : { start: match.index, end: match.index + match[0].length };
}

/**
 * A list marker: a bullet, or a number, letter or roman numeral closed by
 * `.`, `)` or `.)`, optionally opened with `(`.
 */
const MARKER = String.raw`(?:[*\-•]|\(?(?:\d{1,3}|[a-zA-Z]|[ivxIVX]{1,5})(?:\.\)|[.)]))`;

/**
 * What may come before a heading or an item on its line: indentation and at
 * most two markers (NCT03377023 writes `* A.)`).
 */
const LEAD = new RegExp(String.raw`^[ \t]*(?:${MARKER}[ \t]+){0,2}$`);

interface Range {
  start: number;
  end: number;
}

/**
 * A heading joined to one of its items, found as the source lays them out
 * (see the module comment). Undefined unless every clause holds.
 */
function findJoined(
  text: string,
  quote: string,
  from: number,
): { heading: Range; item: Range; loose: boolean } | undefined {
  for (let colon = quote.indexOf(":"); colon !== -1; colon = quote.indexOf(":", colon + 1)) {
    if (!/\s/.test(quote[colon + 1] ?? "")) {
      continue;
    }
    const head = quote.slice(0, colon + 1);
    const item = quote.slice(colon + 1).trim();
    const headPattern = looseRegExp(head);
    const itemPattern = looseRegExp(item);
    if (headPattern === undefined || itemPattern === undefined) {
      continue;
    }

    for (const heading of matchesFrom(headPattern, text, from)) {
      if (!isWholeHeading(text, heading)) {
        continue;
      }
      const listStart = lineEnd(text, heading.end);
      const listEnd = endOfList(text, heading.start, listStart);

      for (const found of matchesFrom(itemPattern, text, listStart, true)) {
        if (found.start >= listEnd) {
          break;
        }
        if (LEAD.test(text.slice(lineStart(text, found.start), found.start))) {
          const loose =
            text.slice(heading.start, heading.end) !== head ||
            text.slice(found.start, found.end) !== item;
          return {
            heading: { start: heading.start, end: heading.end },
            item: { start: found.start, end: found.end },
            loose,
          };
        }
      }
    }
  }

  return undefined;
}

/**
 * Every match, those starting at or after `from` first and then the rest, as
 * `findExact` falls back. `onlyAfter` drops the second half.
 */
function matchesFrom(regex: RegExp, text: string, from: number, onlyAfter = false): Range[] {
  const all = [...text.matchAll(regex)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  const after = all.filter((m) => m.start >= from);
  return onlyAfter ? after : [...after, ...all.filter((m) => m.start < from)];
}

/** On one line, after nothing but its lead, with nothing after it but spaces. */
function isWholeHeading(text: string, heading: Range): boolean {
  const matched = text.slice(heading.start, heading.end);
  const rest = text.slice(heading.end, lineEnd(text, heading.end));
  return (
    !matched.includes("\n") &&
    LEAD.test(text.slice(lineStart(text, heading.start), heading.start)) &&
    /^[ \t]*$/.test(rest)
  );
}

/**
 * Where the heading's list stops: the first non-blank line after it indented
 * no deeper than the heading's own line, or the end of the text.
 */
function endOfList(text: string, headingStart: number, listStart: number): number {
  const depth = indentOf(text, lineStart(text, headingStart));
  let at = listStart;

  while (at < text.length) {
    const start = at + 1;
    const end = lineEnd(text, start);
    const line = text.slice(start, end);
    if (line.trim().length > 0 && indentOf(text, start) <= depth) {
      return start;
    }
    at = end;
  }

  return text.length;
}

function lineStart(text: string, at: number): number {
  return text.lastIndexOf("\n", at - 1) + 1;
}

/** The index of the line break ending the line `at` is on, or the text's length. */
function lineEnd(text: string, at: number): number {
  const end = text.indexOf("\n", at);
  return end === -1 ? text.length : end;
}

function indentOf(text: string, start: number): number {
  return /^[ \t]*/.exec(text.slice(start, lineEnd(text, start)))?.[0].length ?? 0;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
