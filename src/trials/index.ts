/**
 * Public surface of the trials module.
 *
 * Deliberately does not re-export `trim.ts`. Trimming belongs to the fetch
 * script, and `tests/trials/boundary.test.ts` walks the module graph reachable
 * from this file to assert that nothing under `src/` can reach the network.
 * Widening this file is how that guarantee would be lost.
 */
export { CORPUS, CORPUS_IDS, type CorpusEntry } from "./corpus.js";
export { getTrial, loadTrials } from "./load.js";
export { type Trial, type TrialEligibility, TrialFixtureError } from "./types.js";
