import type { Anchor, Direction } from "./vocabulary.js";
import {
  ANCHORS,
  BETWEEN_NEGATION_AND_VERDICT,
  BETWEEN_NUMBER_AND_TRAILING_CUE,
  CONDITIONS,
  CUES_AFTER,
  CUES_BEFORE,
  DRUG_STEMS,
  MAX_WORDS_BETWEEN_CUE_AND_NUMBER,
  MAX_WORDS_VERDICT_TO_CONDITION,
  MIN_DRUG_NAME_LENGTH,
  MIN_PREFIXED_WORD_LENGTH,
  NEGATING_PREFIXES,
  NEGATIONS,
  NOT_NAMED_TERMS,
  NOT_PREFIX_NEGATIONS,
  NUMBER_WORDS,
  OTHER_UNITS,
  SCOPE_GROUPS,
  TIME_UNITS,
  TIMES,
  VERDICT_FAMILIES,
} from "./vocabulary.js";

/**
 * What the check compares, pulled out of a text (spec §5.1). Each function
 * returns plain data with the words it matched, so a refusal can quote them.
 *
 * Deliberately regular expressions over words, not a parser. The check only
 * has to notice when something that can be matched as text is gone or has
 * changed, and it is tested against the corpus's real notation. Where it
 * cannot tell, it errs towards refusing: a refused rendering costs a reader
 * the plain version, and a wrongly passed one costs them the criterion.
 */

export interface Quantity {
  /** As written, number and unit: "100,000/mm^3", "3 weeks". */
  surface: string;
  /** For comparison: commas gone, unit lowercased, time units by name. */
  key: string;
  direction: Direction | null;
  /** Only for a duration. */
  anchor: Anchor | null;
  duration: boolean;
}

/** Undoes registry escaping that `normalize()` leaves, and evens out spacing. */
export function prepare(text: string): string {
  return text
    .replace(/\\([\\^<>=*_[\]().-])/g, "$1")
    .replace(/[–—]/g, "-")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------- named terms

const TOKEN = /[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]|[A-Za-z0-9]/g;
const NOT_NAMED = new Set(NOT_NAMED_TERMS);

interface Span {
  start: number;
  end: number;
  text: string;
}

/**
 * Named terms, taken per hyphenated part: "EGFR-mutant" names EGFR, and
 * "HIV-positive" names HIV, so "HIV positive" keeps it. A code is kept whole
 * when a part of it is a number ("COVID-19"): the number belongs to the name.
 */
function namedSpans(text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(TOKEN)) {
    let offset = m.index;
    for (const part of m[0].split("-")) {
      if (part.length > 0 && isNamed(part)) {
        out.push({ start: offset, end: offset + part.length, text: part });
      }
      offset += part.length + 1;
    }
  }
  return out;
}

/** Tokens whose digits are part of a name, not a quantity: "COVID-19", "PD-L1", "glucose-6-phosphate". */
function codeSpans(text: string): Span[] {
  return [...text.matchAll(TOKEN)]
    .filter((m) => /^[A-Za-z]/.test(m[0]) && /\d/.test(m[0]))
    .map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
}

function isNamed(token: string): boolean {
  const capitals = token.replace(/[^A-Z]/g, "").length;
  if (capitals >= 2 && !NOT_NAMED.has(token)) {
    return true;
  }
  // A code: starts with a letter and has a digit (T790M, G6PD, v1.1, COVID-19).
  if (/^[A-Za-z]/.test(token) && /\d/.test(token)) {
    return true;
  }
  const lower = token.toLowerCase();
  return (
    /^[a-z]+$/.test(lower) &&
    lower.length >= MIN_DRUG_NAME_LENGTH &&
    DRUG_STEMS.some((stem) => lower.endsWith(stem))
  );
}

/** "ECGs" and "ECG" are the same term. */
function canonicalTerm(token: string): string {
  const plural = /^[A-Z0-9-]{2,}s$/.test(token) ? token.slice(0, -1) : token;
  return plural.toLowerCase();
}

/** Abbreviations, codes and drug names, each once, lowercased. */
export function namedTerms(text: string): string[] {
  return [...new Set(namedSpans(prepare(text)).map((s) => canonicalTerm(s.text)))];
}

// ----------------------------------------------------------------- quantities

const DIGITS =
  /(?<![\w.,^]|[A-Za-z]-)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\^\d+)?(?:\s*[x×]\s*10\^\d+)?/;
const NUMBER = new RegExp(
  `${DIGITS.source}|(?<![\\w-])(?:${Object.keys(NUMBER_WORDS).join("|")})(?![\\w-])`,
  "gi",
);

const TIME_SPELLINGS = Object.entries(TIME_UNITS)
  .flatMap(([name, spellings]) => spellings.map((s) => ({ name, s })))
  .sort((a, b) => b.s.length - a.s.length);

interface Unit {
  key: string;
  length: number;
  duration: boolean;
}

function unitAt(rest: string): Unit | undefined {
  for (const word of TIMES) {
    const times = /\w/.test(word)
      ? rest.match(new RegExp(`^\\s*${escapeRegExp(word)}(?![\\w])`, "i"))
      : rest.match(new RegExp(`^\\s*${escapeRegExp(word)}`));
    if (times !== null) {
      return { key: "×", length: times[0].length, duration: false };
    }
  }
  for (const { name, s } of TIME_SPELLINGS) {
    const m = rest.match(new RegExp(`^\\s*${escapeRegExp(s)}(?![\\w])`, "i"));
    if (m !== null) {
      return { key: name, length: m[0].length, duration: true };
    }
  }
  const slash = rest.match(/^\s*([a-zµμ]*\/[a-zµμ]+(?:\^?\d+)?(?:\/[a-z]+)?)/i);
  if (slash?.[1] !== undefined) {
    return { key: canonicalUnit(slash[1]), length: slash[0].length, duration: false };
  }
  const percent = rest.match(/^\s*%/);
  if (percent !== null) {
    return { key: "%", length: percent[0].length, duration: false };
  }
  for (const unit of OTHER_UNITS) {
    const m = rest.match(new RegExp(`^\\s*${escapeRegExp(unit)}(?![\\w/])`, "i"));
    if (m !== null) {
      return { key: canonicalUnit(unit), length: m[0].length, duration: false };
    }
  }
  return undefined;
}

function canonicalUnit(unit: string): string {
  return unit.toLowerCase().replace(/\^/g, "").replace(/μ/g, "µ");
}

function canonicalNumber(number: string): string {
  const word = NUMBER_WORDS[number.toLowerCase()];
  if (word !== undefined) {
    return String(word);
  }
  return number.replace(/,/g, "").replace(/\s+/g, "").replace(/x/g, "×");
}

/** Every number with its unit, the comparison attached to it, and for a duration its anchor. */
export function quantities(text: string): Quantity[] {
  const prepared = prepare(text);
  // Numbers inside codes (COVID-19, PD-L1) are part of a named term, not quantities.
  let masked = prepared;
  for (const span of codeSpans(prepared)) {
    masked = masked.slice(0, span.start) + " ".repeat(span.text.length) + masked.slice(span.end);
  }

  const out: Quantity[] = [];
  let previousEnd = 0;
  for (const m of masked.matchAll(NUMBER)) {
    const start = m.index;
    const numberEnd = start + m[0].length;
    const unit = unitAt(prepared.slice(numberEnd));
    const end = numberEnd + (unit?.length ?? 0);
    const after = prepared.slice(end);

    const trailing = trailingCue(after);
    const direction = cueBefore(prepared.slice(previousEnd, start)) ?? trailing?.direction ?? null;
    const duration = unit?.duration ?? false;
    const anchor = duration ? anchorAfter(after.slice(trailing?.length ?? 0)) : null;

    const number = canonicalNumber(m[0]);
    out.push({
      surface: prepared.slice(start, end).trim(),
      key: unit === undefined ? number : `${number} ${unit.key}`,
      direction,
      anchor,
      duration,
    });
    previousEnd = end;
  }
  return out;
}

const CUE_LIST = CUES_BEFORE.flatMap(({ direction, cues }) =>
  cues.map((cue) => ({ direction, cue })),
);

/** The cue closest before a number, with only a few words between. */
function cueBefore(window: string): Direction | undefined {
  const lower = window.toLowerCase();
  let best: { end: number; length: number; direction: Direction } | undefined;
  for (const { direction, cue } of CUE_LIST) {
    const pattern = /\w/.test(cue)
      ? new RegExp(`(?<![\\w])${escapeRegExp(cue)}(?![\\w])`, "g")
      : new RegExp(escapeRegExp(cue), "g");
    for (const m of lower.matchAll(pattern)) {
      const end = m.index + m[0].length;
      const gap = lower.slice(end);
      if (!gapAllowed(gap)) {
        continue;
      }
      if (best === undefined || end > best.end || (end === best.end && m[0].length > best.length)) {
        best = { end, length: m[0].length, direction };
      }
    }
  }
  return best?.direction;
}

function gapAllowed(gap: string): boolean {
  if (/[\d;,.:]/.test(gap)) {
    return false;
  }
  const words = gap
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  return words.length <= MAX_WORDS_BETWEEN_CUE_AND_NUMBER;
}

function trailingCue(after: string): { direction: Direction; length: number } | undefined {
  const between = BETWEEN_NUMBER_AND_TRAILING_CUE.map(escapeRegExp).join("|");
  for (const { direction, cues } of CUES_AFTER) {
    const m = after.match(
      new RegExp(
        `^\\s*(?:(?:${between})\\s+)?(?:${cues.map(escapeRegExp).join("|")})(?![\\w])`,
        "i",
      ),
    );
    if (m !== null) {
      return { direction, length: m[0].length };
    }
  }
  return undefined;
}

function anchorAfter(after: string): Anchor | null {
  const lower = after.toLowerCase();
  for (const { anchor, words } of ANCHORS) {
    for (const word of words) {
      if (new RegExp(`^\\s*${escapeRegExp(word)}(?![\\w])`).test(lower)) {
        return anchor;
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ negations

/** Negation cues inside comparison phrases ("no more than") belong to the comparison. */
const NEGATING_CUES = CUE_LIST.map((c) => c.cue)
  .filter((cue) => /\b(no|not)\b/.test(cue))
  .sort((a, b) => b.length - a.length);

const NEGATION_PATTERN = new RegExp(
  [...NEGATIONS]
    .sort((a, b) => b.length - a.length)
    .map((n) => (n === "n't" ? "n't(?![\\w])" : `(?<![\\w'])${escapeRegExp(n)}(?![\\w])`))
    .join("|"),
  "g",
);

/** Every negation: the words as matched, then one "non-" or "un-" per prefixed word. */
export function negations(text: string): string[] {
  let lower = prepare(text).toLowerCase();
  for (const cue of NEGATING_CUES) {
    lower = lower.replace(new RegExp(`(?<![\\w])${escapeRegExp(cue)}(?![\\w])`, "g"), (m) =>
      " ".repeat(m.length),
    );
  }
  const words = [...lower.matchAll(NEGATION_PATTERN)].map((m) => m[0]);
  const prefixed = [...lower.matchAll(/(?<![\w-])[a-z][a-z-]*[a-z]/g)].flatMap((m) => {
    const w = m[0];
    const prefix = NEGATING_PREFIXES.find((p) => w.startsWith(p));
    return prefix !== undefined &&
      w.length >= MIN_PREFIXED_WORD_LENGTH &&
      !NOT_PREFIX_NEGATIONS.some((n) => w.startsWith(n))
      ? [`${prefix}-`]
      : [];
  });
  return [...words, ...prefixed];
}

// ------------------------------------------------------- scope and verdict words

function hasWord(lower: string, word: string): boolean {
  return new RegExp(`(?<![\\w])${escapeRegExp(word)}(?![\\w])`).test(lower);
}

/** Each scope group present, named by its first word. */
export function scopeGroups(text: string): string[] {
  const lower = prepare(text).toLowerCase();
  return SCOPE_GROUPS.filter((group) => group.some((w) => hasWord(lower, w))).map(
    (group) => group[0] as string,
  );
}

/** Words that tell someone whether they can take part, as present, each with its family. */
export function verdictWords(text: string): Array<{ word: string; family: number }> {
  const lower = prepare(text).toLowerCase();
  return VERDICT_FAMILIES.flatMap((family, index) =>
    family.filter((w) => hasWord(lower, w)).map((word) => ({ word, family: index })),
  );
}

const VERDICT_PATTERN = VERDICT_FAMILIES.flat().map(escapeRegExp).join("|");

/**
 * Negations that belong to a verdict: "are not eligible". A rendering in the
 * statement form drops the verdict, and its negation goes with it.
 */
export function verdictNegations(text: string): string[] {
  const between = BETWEEN_NEGATION_AND_VERDICT.map(escapeRegExp).join("|");
  const pattern = new RegExp(
    `(?<![\\w])(?:not|never)\\s+(?:(?:${between})\\s+)*(?:${VERDICT_PATTERN})(?![\\w])`,
    "g",
  );
  return [...prepare(text).toLowerCase().matchAll(pattern)].map((m) => m[0]);
}

/** Verdicts that carry a condition: "eligible if", with the verdict word's family. */
export function conditionalVerdicts(
  text: string,
): Array<{ word: string; family: number; condition: string }> {
  const lower = prepare(text).toLowerCase();
  const conditions = CONDITIONS.map(escapeRegExp).join("|");
  const out: Array<{ word: string; family: number; condition: string }> = [];
  VERDICT_FAMILIES.forEach((family, index) => {
    for (const word of family) {
      const pattern = new RegExp(
        `(?<![\\w])(${escapeRegExp(word)})(?![\\w])((?:\\s+[\\w'-]+){0,${MAX_WORDS_VERDICT_TO_CONDITION}}?)\\s+(${conditions})(?![\\w])`,
        "g",
      );
      for (const m of lower.matchAll(pattern)) {
        out.push({ word, family: index, condition: m[3] ?? "" });
      }
    }
  });
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
