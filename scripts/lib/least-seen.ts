/**
 * The three v2 conversations least looked at on this project (slice 0009).
 *
 * 0007 held them back from its blind reading, so nobody read them in the
 * coordinator review. They were read at 0004's Gate 3, which attributed every
 * wrong finding, so they are least-seen, not unseen. 0009 reports them apart
 * from the other twelve, and nobody designing its fixes opens their old
 * conversations or grades.
 */
export const LEAST_SEEN: readonly string[] = ["NCT03433469-v2", "NCT04385368-v2", "NCT06728852-v2"];

export function isLeastSeen(vignetteId: string): boolean {
  return LEAST_SEEN.includes(vignetteId);
}
