# intent: 0001 trial data

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. Fetch a small frozen corpus of real NSCLC trials from ClinicalTrials.gov and make it readable from code. No criteria parsing, no model, no UI.

---

## Problem

Everything downstream of this project needs eligibility criteria text to work against, and right now there is none. The criteria parser in slice 0002 has nothing to parse. The eval cases in slice 0003 have no trial to tie a patient vignette to. The coordinator review pane has no trial to cite. The repository contains an intent, a review standard, and no data.

The product intent commits to a frozen corpus of real published protocols. That choice has consequences this slice has to absorb:

**The corpus cannot be a live query.** The binding constraint is that the running application makes no network calls. So the boundary between "fetched" and "read" has to exist from the first line of code, not be retrofitted once something is already calling the API at request time.

**Raw API responses are not usable as fixtures.** A single ClinicalTrials.gov v2 study response is large and structurally deep, and nearly all of it — sponsor collaborator lists, outcome measures, design masking, per-site contact blocks — is irrelevant to prescreening. Committing twelve raw responses makes the repository unpleasant to read and buries the one field that matters, `eligibilityCriteria`, inside several hundred lines of noise. It also drags in site contact blocks containing named real people and their phone numbers, which does not belong in this repository.

**Which twelve trials is a real decision, not an arbitrary one.** The parser in 0002 will be judged on whether it handles criteria prose in general, and the only evidence available is the corpus. A corpus of twelve phase 3 registrational studies from three large sponsors would look varied and would not be. Criteria style varies by phase, by sponsor, by whether the study is biomarker-gated, and by how the writer chose to format the block — some are clean nested bullets, some are a wall of semicolons. If the corpus does not contain the hard formatting cases, the parser will appear to work and will not.

## Proposed outcome

Three things exist at the end of this slice, and a fourth thing is deliberately absent.

**A pinned corpus list.** Twelve NCT IDs, chosen by hand and committed, each with a one-line rationale recording why it is in the set — short block, wall-of-text block, phase 1 dose escalation, phase 3 registrational, biomarker-gated, unusual formatting. The list is the corpus definition. Selection is a human judgment recorded in the repository, not a query whose results drift.

**A fetch script.** Reads the pinned list, calls ClinicalTrials.gov API v2 for each ID, trims each response to the fields in use, and writes one JSON file per study to `data/trials/`. Run by a person, never by the application. Re-running it refetches everything and overwrites in place with stable key ordering, so a second run produces an empty git diff unless the registry actually changed — and when it changed, the diff shows what. A `--dry-run` mode reports what would change without writing.

**A loader.** `loadTrials(): Trial[]` and `getTrial(nctId): Trial` in `src/trials/`. Synchronous, eager, no caching. Validates shape on read and throws on a missing directory, malformed JSON, or a fixture that does not match the `Trial` type. A bad fixture should surface as a test failure with the offending file named, not as `undefined` three layers into the parser.

Fields kept per study: `nctId`, `briefTitle`, `officialTitle`, `overallStatus`, `phases`, `conditions`, `leadSponsor`, `lastUpdatePostDate`, and an `eligibility` object holding `criteriaText`, `sex`, `minimumAge`, `maximumAge`, `healthyVolunteers`, and `stdAges`. Identity fields exist so the coordinator pane can show provenance and so a determination can be traced back to a specific version of a specific protocol. Everything else the API returns is discarded.

**The version handle is the fixture's git SHA,** not an API field. `lastUpdatePostDate` is kept because it is the useful thing to show a coordinator, but it is not what pins a protocol version. An eval result in slice 0007 is traceable to the exact criteria text it ran against by the commit the corpus was at, which the registry cannot revise after the fact. The fetch script does not touch the ClinicalTrials.gov version-history endpoint.

**Absent on purpose:** no interpretation of `criteriaText`. It is stored as the API returned it, whitespace and all. The moment this slice starts normalizing or splitting that string it has begun doing slice 0002's job with none of slice 0002's tests.

This slice also fills in the "Verifying your work" section of `CLAUDE.md`, which is currently a placeholder, since it is the first slice to produce runnable commands.

## Affected users and systems

**Me, running the fetch script.** The only human in the loop for this slice. Runs it once now, and again only when the corpus is deliberately refreshed.

**The criteria parser, slice 0002.** The loader's only consumer, and the reason the loader's interface is a decision rather than a detail. It wants the whole corpus at once to iterate over.

**The coordinator review pane, slice 0006.** A later consumer of the identity fields. It needs to name the trial a determination was made against and show when that protocol was last updated. This is why identity fields are kept now rather than added later.

**ClinicalTrials.gov API v2.** Read-only, called by a script, unauthenticated, no key required. Touched once during this slice and then not again until the corpus is deliberately refreshed. One additional exploratory query happens while authoring the pinned list; it produces no committed artifact beyond the list itself.

**Not touched:** no model, no adapter, no transport, no server, no UI, no eval harness.

## Constraints

- **No live network calls at runtime.** The fetch script is not importable by the application, and nothing under `src/` outside the script performs HTTP. This is the constraint the whole slice is shaped around.
- **No PHI.** Not at risk here, since ClinicalTrials.gov publishes protocols rather than patients. The adjacent risk that is real: site contact blocks name real coordinators and give their phone numbers. Those fields are discarded, not merely unused.
- **No secrets.** The v2 API requires no authentication, so there is nothing to store and no example config with a key-shaped hole in it.
- **Fixtures are committed and trimmed.** `data/trials/` is in git. Files are only as large as the fields in use.
- **Real protocols, unmodified.** Criteria text is stored verbatim. If the parser later trips on a specific study's formatting, the fix is in the parser, not in the fixture.
- **Zero runtime dependencies in this slice.** Node 24 has `fetch` built in, so no HTTP client is added, and the loader's shape validation is written by hand rather than pulling in a schema library. The `Trial` shape is flat and small, and the errors that matter are "which file, which field," which thirty lines produce as well as a library would. Slice 0002's parsed-criteria schema is a different shape and would not reuse this one. Revisit if a second consumer wants real schema validation.
- **TypeScript strict, Vitest, Node 24 LTS**, per `CLAUDE.md`.
- **Deterministic tests only.** Tests for this slice run against committed fixtures and a checked-in sample API response. No test hits the network.

## Open questions

1. **Do twelve studies actually cover the formatting variance?** The selection rationale is a hypothesis about what makes criteria prose hard, written before anything has tried to parse it. Slice 0002 is the first real test of it. If the parser handles all twelve easily, that is more likely a weak corpus than a strong parser, and this slice gets revisited.

2. **What happens when a pinned study is withdrawn or its record is removed?** A refetch would 404 on an ID that previously worked. Whether that is a hard failure, or a warning that leaves the existing fixture in place, depends on whether the corpus is meant to track the registry or to stay frozen. Leaning frozen, which argues for a loud failure and a human decision.

3. **Does anything need a corpus-level index file?** One JSON per study is the obvious layout, but the loader then discovers files by globbing a directory, and a stray file in `data/trials/` becomes a runtime error. An index listing the expected NCT IDs would make the corpus explicit at the cost of a second thing to keep in sync.

---

## Decisions taken since first draft

- **Loader validation is hand-written, not schema-library based.** Keeps the project at zero runtime dependencies through this slice. Reconsider when a second consumer needs the same shape checked.
- **Protocol version is pinned by the fixture's git SHA.** No version-history API call, no extra field in the fixture.
