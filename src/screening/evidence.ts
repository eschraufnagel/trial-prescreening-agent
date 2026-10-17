/**
 * Finds a quoted piece of evidence in the participant's message.
 *
 * The read call returns, for every reading, the words it rests on. Those words
 * must actually be in what the person said, and in the message just received —
 * not somewhere earlier in the conversation. A quote that cannot be found is the
 * model claiming the person said something they did not, and the reading is
 * rejected (spec §5.1).
 *
 * The same approach as `src/criteria/locate.ts`, reimplemented rather than
 * imported because that one works in the parser's normalized-text coordinates.
 * The loose match forgives exactly what a model changes when it copies text
 * faithfully — whitespace, letter case, curly quotes — and nothing that changes
 * a word.
 */

export interface Located {
  start: number;
  end: number;
  /** True when only the loose match found it. */
  loose: boolean;
}

export function locateEvidence(message: string, quote: string): Located | undefined {
  const needle = quote.trim();
  if (needle.length === 0) {
    return undefined;
  }

  const exact = message.indexOf(needle);
  if (exact !== -1) {
    return { start: exact, end: exact + needle.length, loose: false };
  }

  const words = straighten(needle)
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map(escapeRegExp);
  if (words.length === 0) {
    return undefined;
  }

  const match = new RegExp(words.join("\\s+"), "i").exec(straighten(message));
  return match === null
    ? undefined
    : { start: match.index, end: match.index + match[0].length, loose: true };
}

/**
 * Curly quotes and apostrophes to straight ones, one character for one, so
 * offsets into the straightened text are offsets into the original.
 */
function straighten(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
