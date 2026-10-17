/**
 * The subset of a ClinicalTrials.gov study that this project uses.
 *
 * A full API v2 response is roughly 20-95KB per study and almost entirely
 * irrelevant to prescreening. Everything not named here is discarded at fetch
 * time, including the site contact blocks, which carry the names and phone
 * numbers of real coordinators.
 *
 * Field order in these interfaces is load-bearing: fixtures are serialized in
 * declaration order so that refetching an unchanged study produces a
 * byte-identical file and `git diff` stays a meaningful review surface.
 */
export interface Trial {
  nctId: string;
  briefTitle: string;
  officialTitle: string | null;
  overallStatus: string;
  phases: string[];
  conditions: string[];
  leadSponsor: string;
  lastUpdatePostDate: string;
  eligibility: TrialEligibility;
}

export interface TrialEligibility {
  /**
   * The eligibility criteria block exactly as the registry returned it.
   *
   * Stored verbatim: no trimming, no whitespace collapsing, no line-ending
   * normalization, no bullet parsing. Interpreting this string is slice 0002's
   * entire job, and doing any of it here would put parser behavior in code the
   * parser's tests never see.
   */
  criteriaText: string;
  sex: string;
  minimumAge: string | null;
  maximumAge: string | null;
  /**
   * Null when the record does not say. Not defaulted to false: "the registry is
   * silent" and "healthy volunteers are not accepted" are different facts about
   * a real protocol, and collapsing them would be a silent claim.
   */
  healthyVolunteers: boolean | null;
  stdAges: string[];
}

/**
 * Raised whenever trial data does not have the shape this project requires,
 * whether it came from the API or from a committed fixture.
 *
 * Always carries enough to act on: which study or file, and every problem
 * found rather than only the first.
 */
export class TrialFixtureError extends Error {
  readonly problems: readonly string[];

  constructor(context: string, problems: readonly string[]) {
    const detail = problems.map((p) => `  - ${p}`).join("\n");
    super(`${context}:\n${detail}`);
    this.name = "TrialFixtureError";
    this.problems = problems;
  }
}
