import { loadLabelSets } from "../../evals/cases/load.js";
import { loadVignettes } from "../../evals/cases/vignettes.js";
import { parserWorkload } from "../../evals/estimate.js";
import { screeningWorkloads } from "../../evals/screening-estimate.js";
import { admittedModels, catalogEntry, estimate, PROVIDERS } from "../../src/models/index.js";
import type { Estimates } from "../../src/server/index.js";

/**
 * What one screening and one trial read are expected to cost on each
 * admitted model (slice 0017), for Settings to show beside each model and its
 * cap. Made by the same functions that price the eval's paid runs, from the
 * longest example conversation and the five labelled trials averaged, so
 * they're never hand-written numbers. They overestimate, as those do.
 */

/** The example conversation with the most calls, as `eval:screening`'s smallest-first default uses. */
const REFERENCE_VIGNETTE = "NCT00077350-v1";

export function appEstimates(): Estimates {
  const vignettes = loadVignettes().filter((v) => v.id === REFERENCE_VIGNETTE);
  const agent = screeningWorkloads({ vignettes, sources: ["labels"] }).agent;
  const studies = loadLabelSets().map((l) => l.nctId);
  const parser = parserWorkload(studies);
  const out: Estimates = {};
  for (const provider of PROVIDERS) {
    for (const model of admittedModels(provider)) {
      const entry = catalogEntry(provider, model);
      if (entry === undefined) {
        continue;
      }
      const once = { maxCalls: 1, batch: false };
      out[`${provider}:${model}`] = {
        screeningUsd: estimate(entry, agent, once).expected.usd,
        trialUsd: estimate(entry, parser, once).expected.usd / Math.max(1, studies.length),
      };
    }
  }
  return out;
}
