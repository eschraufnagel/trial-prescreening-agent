import { normalize } from "../src/criteria/normalize.js";
import type { ScreeningCriterion, StudyContext } from "../src/screening/types.js";
import { getTrial } from "../src/trials/index.js";
import type { LabelSet } from "./cases/types.js";

/**
 * The two ways the agent is fed during measurement (spec D1, §3).
 *
 * `fromLabels` is here rather than in `src/screening/` because it reads label
 * sets, and `src/` may not import `evals/`. `fromParse` reads only a parse, so
 * since slice 0013 it lives in `src/screening/from-parse.ts`, where the app can
 * use it too, and is re-exported below. The agent sees four fields either way;
 * it never learns which source it was given.
 */

export function studyContext(nctId: string): StudyContext {
  return { nctId, briefTitle: getTrial(nctId).briefTitle };
}

/**
 * From hand labels, in document order, with registry escaping removed so the
 * model is not shown `\>=` or, since slice 0011, `\^`.
 */
export function fromLabels(labels: LabelSet): ScreeningCriterion[] {
  return [...labels.criteria]
    .sort((a, b) => a.start - b.start)
    .map((l) => ({
      id: l.id,
      polarity: l.polarity,
      type: l.type,
      text: normalize(l.quote).text.replace(/\s+/g, " ").trim(),
    }));
}

export { fromParse, type ParseInput } from "../src/screening/from-parse.js";
