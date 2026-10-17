/**
 * The words the check knows (spec §5.3). Data, not logic, so it can be read as
 * a list at Gate 2 and extended when a reading finds something it missed.
 * Changing this file changes what the page shows without regenerating any
 * rendering, because the check runs whenever renderings are loaded.
 *
 * Nothing here is medical judgment. It is lists of English words, symbols and
 * drug-naming conventions, and what a comparison symbol means in words.
 */

/** Which way a comparison points. */
export type Direction = "≥" | ">" | "≤" | "<";

/**
 * Comparison cues that come before a number, by family. Longer phrases are
 * tried first, so "no more than" is never read as "more than". "Within", "in
 * the last" and the like put a duration in ≤: "within 4 weeks" means at most 4
 * weeks ago.
 */
export const CUES_BEFORE: ReadonlyArray<{ direction: Direction; cues: readonly string[] }> = [
  {
    direction: "≥",
    cues: [
      ">=",
      "=>",
      "≥",
      "at least",
      "no less than",
      "not less than",
      "no fewer than",
      "a minimum of",
      "minimum of",
      "greater than or equal to",
      "more than or equal to",
    ],
  },
  {
    direction: "≤",
    cues: [
      "<=",
      "=<",
      "≤",
      "no more than",
      "not more than",
      "no greater than",
      "not greater than",
      "no longer than",
      "not exceeding",
      "not to exceed",
      "at most",
      "up to",
      "a maximum of",
      "maximum of",
      "less than or equal to",
      "within",
      "in the last",
      "in the past",
      "during the last",
      "during the past",
      "in the previous",
      "in the prior",
    ],
  },
  {
    direction: ">",
    cues: [
      ">",
      "more than",
      "greater than",
      "over",
      "above",
      "exceeding",
      "older than",
      "longer than",
    ],
  },
  {
    direction: "<",
    cues: ["<", "less than", "fewer than", "under", "below", "younger than", "shorter than"],
  },
];

/** Cues that come right after a number and its unit: "18 years of age or older". */
export const CUES_AFTER: ReadonlyArray<{ direction: Direction; cues: readonly string[] }> = [
  {
    direction: "≥",
    cues: ["or more", "or older", "or greater", "or higher", "or above", "or over", "or longer"],
  },
  {
    direction: "≤",
    cues: ["or less", "or fewer", "or younger", "or lower", "or below", "or under", "or shorter"],
  },
];

/** Words that may sit between a number and a trailing cue: "18 years of age or older". */
export const BETWEEN_NUMBER_AND_TRAILING_CUE: readonly string[] = ["of age", "old"];

/** How many words may sit between a cue and its number: "≥ CTCAE grade 2". */
export const MAX_WORDS_BETWEEN_CUE_AND_NUMBER = 3;

/** Before or after something, for a duration: "3 weeks prior to registration". */
export type Anchor = "before" | "after";

export const ANCHORS: ReadonlyArray<{ anchor: Anchor; words: readonly string[] }> = [
  { anchor: "before", words: ["prior to", "prior", "before", "preceding", "ago", "earlier"] },
  { anchor: "after", words: ["after", "following", "post", "since"] },
];

/**
 * Time units, each with its spellings. A duration's unit may be written any of
 * these ways; every other unit must be copied as written.
 */
export const TIME_UNITS: Readonly<Record<string, readonly string[]>> = {
  minute: ["minute", "minutes", "min", "mins"],
  hour: ["hour", "hours", "hr", "hrs", "h"],
  day: ["day", "days", "d"],
  week: ["week", "weeks", "wk", "wks"],
  month: ["month", "months", "mo", "mos"],
  year: ["year", "years", "yr", "yrs", "y"],
};

/**
 * Other units, matched right after a number with or without a space. Anything
 * with a slash is a unit too ("/mm^3", "mL/min", "g/dL"). A number followed by
 * none of these has no unit, and only the number is compared.
 */
export const OTHER_UNITS: readonly string[] = [
  "%",
  "cm",
  "mm",
  "mg",
  "g",
  "kg",
  "ml",
  "l",
  "msec",
  "ms",
  "mmhg",
];

/**
 * Numbers written as words, compared as digits: "within five half-lives" and
 * "within 5 half-lives" are the same quantity. Found by the mutation tests in
 * the full run, where a word number carried no comparison the check could see.
 */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  ninety: 90,
  hundred: 100,
};

/** "1.5 x ULN" and "1.5 times the upper limit": a multiple, written either way. */
export const TIMES: readonly string[] = ["x", "×", "times"];

/**
 * Negations, counted. Negation words inside a comparison cue ("no more than")
 * are not counted: they belong to the comparison, and "<=" rendered as "no
 * more than" should not look like an added "no".
 */
export const NEGATIONS: readonly string[] = [
  "not",
  "no",
  "without",
  "never",
  "none",
  "nor",
  "neither",
  "cannot",
  "n't",
  "except",
  "with the exception of",
  "excluding",
  "unless",
  "other than",
  "absence of",
  "free of",
];

/**
 * Negations written as a prefix: "Non-leukocyte-depleted", "unresectable",
 * "untreated". Each counts once, like "not", so "not treated" and "untreated"
 * agree. Found in the full run, where a retry reversed "Non-leukocyte-depleted"
 * and the check could not see it.
 */
export const NEGATING_PREFIXES: readonly string[] = ["non", "un"];

/** A prefixed word must be at least this long, so "undo" or "none" are left alone. */
export const MIN_PREFIXED_WORD_LENGTH = 5;

/**
 * Words that begin like a negating prefix and are not negations. "Non-small
 * cell" is the name of the disease, not a denial of anything; "unless" is
 * already counted as a word.
 */
export const NOT_PREFIX_NEGATIONS: readonly string[] = [
  "non-small",
  "none",
  "nonetheless",
  "under",
  "unit",
  "univers",
  "uniform",
  "uniq",
  "union",
  "until",
  "unless",
];

/**
 * Drug-name stems: the standard endings of international nonproprietary names
 * (monoclonal antibodies end in -mab, kinase inhibitors in -tinib, and so on).
 * A word ending in one of these is a drug name and must be kept exactly.
 */
export const DRUG_STEMS: readonly string[] = [
  "mab",
  "nib",
  "lib",
  "zomib",
  "parib",
  "platin",
  "taxel",
  "abine",
  "trexed",
  "rubicin",
  "mustine",
  "tecan",
  "poside",
  "limus",
];

/** A drug-stem match must be at least this long, so short words are never taken for drugs. */
export const MIN_DRUG_NAME_LENGTH = 7;

/** Capitalised English words that are not abbreviations, when a protocol shouts them. */
export const NOT_NAMED_TERMS: readonly string[] = [
  "AND",
  "OR",
  "NOT",
  "NO",
  "WITH",
  "WITHOUT",
  "OF",
  "THE",
  "FOR",
  "IN",
  "TO",
  "IF",
  "AT",
  "ON",
  "BY",
  "AN",
  "AS",
  "IS",
  "BE",
  "ANY",
  "ALL",
];

/**
 * Words that change what is required. Each group is present if any of its
 * words is; the alternatives are plain-English equivalents, never clinical
 * ones. A rendering must keep every group the criterion has.
 */
export const SCOPE_GROUPS: ReadonlyArray<readonly string[]> = [
  ["active"],
  ["prior", "previous", "previously", "before"],
  ["current", "currently", "ongoing"],
  ["any"],
  ["all", "every"],
  ["only", "alone", "solely", "exclusively"],
  ["known"],
  ["suspected"],
  ["confirmed"],
  ["documented"],
  ["symptomatic"],
  ["asymptomatic"],
  ["uncontrolled"],
  ["untreated"],
  ["stable"],
  ["significant"],
  ["or"],
];

/**
 * Words that tell someone whether they can take part, in families. A rendering
 * may use one only where the criterion uses a word of the same family (spec
 * §5.2, rule 7): a protocol that says "enrollment" may be rendered "enrolled".
 */
export const VERDICT_FAMILIES: ReadonlyArray<readonly string[]> = [
  ["you", "your"],
  ["eligible", "ineligible", "eligibility"],
  ["qualify", "qualifies", "qualified"],
  ["take part"],
  ["participate", "participates", "participating", "participation"],
  ["join", "joins", "joining"],
  ["enroll", "enrol", "enrolled", "enrolling", "enrollment", "enrolment"],
  ["allowed", "permitted"],
  ["excluded"],
  ["included"],
];

/**
 * Words that put a condition on a verdict: "are eligible if…", "permitted to
 * enrol provided…". A verdict with a condition is a permission, not a
 * statement, and a rendering must keep it (found in Gate 3's reading).
 */
export const CONDITIONS: readonly string[] = ["if", "provided", "unless", "as long as", "only if"];

/** How many words may sit between a verdict word and its condition. */
export const MAX_WORDS_VERDICT_TO_CONDITION = 4;

/**
 * Words between a negation and the verdict it belongs to: "are not eligible",
 * "may not be enrolled", "are therefore not considered eligible".
 */
export const BETWEEN_NEGATION_AND_VERDICT: readonly string[] = ["be", "considered", "deemed"];
