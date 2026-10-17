/**
 * Reads a model's JSON answer out of the text it returned.
 *
 * Every adapter parses with this, so what counts as a valid answer is the same
 * whichever provider produced it. That matters for a comparison: if one
 * adapter quietly forgave output another rejected, the difference would be
 * measured as a difference between models.
 *
 * It forgives exactly one thing: a single Markdown code fence around the
 * object, which a model without a JSON mode produces often. Prose before or
 * after the JSON is not forgiven. oMLX, which answers in JSON mode, has never
 * produced a fence, so its behaviour is unchanged.
 */
export function parseModelJson(text: string): unknown {
  return JSON.parse(unfence(text.trim()));
}

const FENCE = /^```(?:json)?[ \t]*\n([\s\S]*?)\n?```$/i;

function unfence(text: string): string {
  return FENCE.exec(text)?.[1]?.trim() ?? text;
}
