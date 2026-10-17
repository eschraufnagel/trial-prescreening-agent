/**
 * The corpus: twelve real NSCLC protocols, pinned by NCT ID.
 *
 * This list *is* the corpus definition. The fetch script fetches exactly these,
 * the loader expects exactly these, and a study is in the set because someone
 * decided it should be — not because it came back from a query that will return
 * something different next month.
 *
 * `rationale` says what a study contributes to the corpus, for a reader deciding
 * whether the corpus is strong enough to trust results measured against it. It
 * is not a description of the study.
 *
 * Selected to vary the things that make eligibility prose hard to parse: block
 * length, phase, whether inclusion is gated on a molecular alteration, sponsor
 * house style, and how badly the text is formatted. Slice 0002's parser is
 * measured against this set, so a corpus that is easy in some dimension makes
 * the parser look better than it is in that dimension.
 */
export interface CorpusEntry {
  nctId: string;
  rationale: string;
}

export const CORPUS: readonly CorpusEntry[] = [
  {
    nctId: "NCT00743379",
    rationale:
      "Worst formatting in the pool: numbered criteria whose a./b. sub-items run together inline with no line break, so 'standard therapy b. Tumor progression' appears mid-sentence. Also the longest phase 1 block.",
  },
  {
    nctId: "NCT04841811",
    rationale:
      "Long, essentially unbulleted, semicolon-separated run-ons. Inclusion is gated on confirmed EGFR sensitising mutations, and the criteria distinguish tissue from blood and effusion sources.",
  },
  {
    nctId: "NCT06728852",
    rationale:
      "Mid-length block with no bullet structure whatsoever. Tests whether the parser depends on list markers to find criterion boundaries.",
  },
  {
    nctId: "NCT04385368",
    rationale:
      "Longest block in the corpus, large-pharma house style. Gated on biomarkers in the negative direction: patients must be EGFR/ALK wild-type, with PD-L1 status centrally determined. A parser that reads 'EGFR' as 'requires an EGFR mutation' gets this backwards.",
  },
  {
    nctId: "NCT03433469",
    rationale:
      "Long and heavily nested. Gated on a documented activating EGFR mutation named three ways (exon 19 deletion, T790M, L858R), which is one criterion expressed as an alternation.",
  },
  {
    nctId: "NCT03377023",
    rationale:
      "Long, academic-centre style, and the criteria branch by study arm and phase: separate inclusion sets for the phase I portion, arm A and arm B. Eligibility depends on which part of the study a patient would enter.",
  },
  {
    nctId: "NCT03753685",
    rationale:
      "Gated on ALK positivity rather than EGFR, so the corpus carries more than one alteration type. Mid-length, and its criteria are numbered with escaped markup ('1\\.') that survives into the text.",
  },
  {
    nctId: "NCT00966472",
    rationale:
      "Mid-length phase 1. Mentions EGFR only as a prior-therapy exclusion, not as gating — a deliberate near-miss for anything keying off biomarker names rather than what the criterion asks.",
  },
  {
    nctId: "NCT00077350",
    rationale:
      "Cooperative-group (NCI) house style, which differs markedly from industry sponsors: criteria written as prose paragraphs with embedded justifications rather than as testable predicates.",
  },
  {
    nctId: "NCT04316364",
    rationale:
      "Short phase 3. Requires adequate tissue for central PD-L1 testing without requiring any particular result, which is a logistical criterion wearing biomarker vocabulary.",
  },
  {
    nctId: "NCT07229729",
    rationale:
      "Short and unbulleted. Recently registered, so it is also the corpus's canary for a record changing under us.",
  },
  {
    nctId: "NCT00106626",
    rationale:
      "Shortest usable block in the pool, and a solid-tumour basket rather than an NSCLC-specific protocol — the condition itself has to be read out of the criteria.",
  },
];

/** NCT IDs in pinned order. The loader reads fixtures in this order. */
export const CORPUS_IDS: readonly string[] = CORPUS.map((entry) => entry.nctId);
