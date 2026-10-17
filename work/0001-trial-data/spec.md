# spec: 0001 trial data

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0001-trial-data/intent.md`

Requirements are numbered `R-n` so `plan.md` and the review passes can reference them. Section 10 flags every place the intent is ambiguous or two `CLAUDE.md` constraints pull against each other; nothing in that section is resolved silently.

---

## 1. Scope

**In.** A pinned corpus list, a fetch script, trimmed JSON fixtures, a loader, tests for the loader and the trimming logic, the toolchain needed to run any of it, and the `CLAUDE.md` "Verifying your work" section.

**Out.** Any interpretation of criteria text. Any model call. Any transport, server, or UI. Any eval case or grader. Section 11 lists what is deferred and to where.

---

## 2. Data shape

### R-1 The `Trial` type

```ts
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
  criteriaText: string;
  sex: string;
  minimumAge: string | null;
  maximumAge: string | null;
  healthyVolunteers: boolean | null;
  stdAges: string[];
}
```

### R-2 Field mapping

Each field is taken from exactly one path in the API v2 response. Nothing is computed, inferred, or merged.

| `Trial` field | API v2 path (under `protocolSection`) |
| --- | --- |
| `nctId` | `identificationModule.nctId` |
| `briefTitle` | `identificationModule.briefTitle` |
| `officialTitle` | `identificationModule.officialTitle` |
| `overallStatus` | `statusModule.overallStatus` |
| `phases` | `designModule.phases` |
| `conditions` | `conditionsModule.conditions` |
| `leadSponsor` | `sponsorCollaboratorsModule.leadSponsor.name` |
| `lastUpdatePostDate` | `statusModule.lastUpdatePostDateStruct.date` |
| `eligibility.criteriaText` | `eligibilityModule.eligibilityCriteria` |
| `eligibility.sex` | `eligibilityModule.sex` |
| `eligibility.minimumAge` | `eligibilityModule.minimumAge` |
| `eligibility.maximumAge` | `eligibilityModule.maximumAge` |
| `eligibility.healthyVolunteers` | `eligibilityModule.healthyVolunteers` |
| `eligibility.stdAges` | `eligibilityModule.stdAges` |

### R-3 Absence rules

Absent optional fields become `null` for scalars and `[]` for arrays. They are never omitted from the written JSON and never filled with a substitute value. `healthyVolunteers` is `boolean | null` rather than defaulting to `false`, because "the record does not say" and "healthy volunteers are not accepted" are different facts and collapsing them would be a silent claim about a real protocol.

Absent **required** fields are an error, not a `null`. Required: `nctId`, `briefTitle`, `overallStatus`, `leadSponsor`, `lastUpdatePostDate`, `eligibility.criteriaText`, `eligibility.sex`. A study with no `eligibilityCriteria` is useless to this project and should fail loudly at fetch time rather than reach the parser as an empty string.

### R-4 `criteriaText` is verbatim

The string is written exactly as the API returned it: no trimming, no whitespace collapsing, no line-ending normalization, no bullet parsing, no case changes. JSON encoding is the only transformation. This is the one field slice 0002 exists to interpret, and pre-chewing it here would move parser behavior into untested fetch code.

The fetch request does not pass `markupFormat`, so the API's default markup applies; whatever that default emits is what gets stored, and it is stored consistently across all twelve studies because they are all fetched the same way.

### R-5 On-disk format

One file per study at `data/trials/<nctId>.json`. UTF-8, two-space indentation, trailing newline, keys written in the declaration order of `R-1` (not alphabetized, not whatever `JSON.stringify` happens to do with the source object). The point of fixed ordering is that re-running the fetch produces a byte-identical file when the registry has not changed, so `git diff` is a meaningful review surface.

---

## 3. Corpus definition

### R-6 The pinned list

Twelve NCT IDs live in a committed TypeScript module as an array of `{ nctId, rationale }`. `rationale` is one line stating what this study contributes to the corpus, written for a reader deciding whether the corpus is strong enough — not a description of the study.

### R-7 Selection criteria

The list is chosen by hand from an exploratory query for interventional NSCLC studies. The exploratory query is not committed and is not part of the running system. The twelve are chosen to span, at minimum:

- **Length.** At least two short criteria blocks (under ~1500 characters) and at least two long ones (over ~6000).
- **Phase.** At least two phase 1 (including a dose-escalation study, whose criteria read differently), at least two phase 2, at least two phase 3.
- **Biomarker gating.** At least three studies whose inclusion depends on a specific molecular alteration (EGFR, ALK, KRAS G12C, ROS1 or similar), and at least three with no biomarker requirement.
- **Formatting.** At least two studies whose criteria block is not clean nested bullets — run-on semicolon lists, inconsistent numbering, criteria embedded in paragraphs, or sub-criteria that do not visually distinguish themselves from their parents.
- **Sponsor.** No more than four studies from any one lead sponsor. Sponsor house style is the main driver of criteria prose, so a corpus concentrated in one sponsor is not a varied corpus regardless of how the other axes look.

### R-8 The list is the corpus

The loader reads the pinned list to know which files to expect. It does not discover fixtures by globbing `data/trials/`. A file on disk with no entry in the list, or an entry with no file, is an error (see `R-15`). This resolves intent open question 3: the list is already the index, so no second index file is introduced.

---

## 4. Fetch script

### R-9 Invocation

`npm run fetch:trials`, with `-- --dry-run` for the reporting mode. The script is a standalone entry point. Nothing under `src/` imports it, and it imports nothing from the loader (`R-27` guards this).

### R-10 Behavior

For each entry in the pinned list, in list order:

1. `GET https://clinicaltrials.gov/api/v2/studies/<nctId>?format=json`, requesting the full study record.
2. Validate and trim to `Trial` per `R-2`/`R-3`.
3. Serialize per `R-5`.
4. Write to `data/trials/<nctId>.json`, overwriting unconditionally.

Requests are sequential, not parallel. Twelve sequential requests against a public registry is the polite shape and takes a few seconds; there is no reason to burst.

### R-11 `--dry-run`

Performs steps 1–3 for every entry and step 4 for none. Reports, per study, one of `unchanged`, `changed`, `new`, or `error`, and for `changed` prints which top-level fields differ. Exit code 0 only if every study is `unchanged`; 1 if any is `changed`, `new`, or `error`. `new` counts as a failure because the mode's purpose is to answer "does the committed corpus still match the registry," and a pinned study with no fixture on disk means it does not — someone added an NCT ID and has not fetched it.

### R-12 Failure handling

A non-2xx response, a network error, a malformed body, or a missing required field (`R-3`) is a **hard failure**: the script reports the NCT ID and reason and exits non-zero. It does not retry, does not fall back, and does not silently skip.

Existing fixtures for other studies that already succeeded are left written. Partial success is visible in the git diff, which is the intended recovery path: fix the cause, re-run, the diff settles.

This resolves intent open question 2. A pinned study that has been withdrawn or removed produces a 404 and stops the run. The corpus is meant to be frozen, so the registry losing a study is a decision for a person — drop it from the list, or replace it, and record why in the rationale — not something the script papers over.

### R-13 What the script must not do

No writes outside `data/trials/`. No deletion of files. No mutation of the pinned list. No network call other than the per-study GET in `R-10`.

---

## 5. Loader

### R-14 Interface

```ts
export function loadTrials(dir?: string): Trial[];
export function getTrial(nctId: string, dir?: string): Trial;
export class TrialFixtureError extends Error {}
```

`dir` defaults to `data/trials/` resolved from the package root, and exists so tests can point at a fixture directory. Both functions are synchronous and eager, and neither caches. `getTrial` reads only the one file it needs.

`loadTrials` returns trials in pinned-list order, not directory order and not sorted by NCT ID, so downstream output ordering is stable and traceable to the list.

### R-15 Loader failure modes

Every one of these throws `TrialFixtureError` with a message naming the offending file or NCT ID and the specific problem:

- The directory does not exist or is not readable.
- A file named by the pinned list is missing.
- A `.json` file exists in the directory with no entry in the pinned list.
- A file is not valid JSON.
- A file's shape does not match `R-1`: a required field missing, a field of the wrong type, an array field that is not an array.
- A file's `nctId` does not match its filename.

`getTrial` additionally throws when `nctId` is not in the pinned list.

Nothing returns `undefined`, nothing returns a partial `Trial`, nothing logs and continues. A bad fixture is a test failure with a filename in it.

### R-16 Validation is hand-written

Shape checking is explicit TypeScript in `src/trials/`, not a schema library. Per the intent's recorded decision, this keeps the slice at zero runtime dependencies. The check is a narrow function per type (`Trial`, `TrialEligibility`) that accumulates problems and throws once with all of them, rather than throwing on the first, so a malformed fixture reports every fault in one run.

### R-17 The trimming function is shared and pure

The API-response-to-`Trial` transformation (`R-2`, `R-3`) lives in its own module, takes a parsed JSON value, returns a `Trial` or throws, and performs no I/O. The fetch script calls it. This is what makes it testable against a committed sample response without a network call, and it is the only code the script and the tests share.

---

## 6. File layout

```
src/trials/
  corpus.ts       the pinned list: NCT IDs and rationales           (R-6)
  types.ts        Trial, TrialEligibility, TrialFixtureError        (R-1)
  trim.ts         API response -> Trial, pure                       (R-17)
  validate.ts     hand-written shape checks                         (R-16)
  load.ts         loadTrials, getTrial                              (R-14)
  index.ts        public surface: types + loadTrials + getTrial
scripts/
  fetch-trials.ts the fetch script                                  (R-9)
data/trials/
  NCT*.json       twelve fixtures                                   (R-5)
tests/trials/
  trim.test.ts
  load.test.ts
  fixtures/       sample API response + deliberately broken fixtures
```

`corpus.ts` is code, so it lives under `src/`, not in `data/` — see section 10.4.

---

## 7. Tests

All deterministic, no network, per `CLAUDE.md`.

### R-18 Trimming, against a committed sample response
One real full API response saved verbatim under `tests/trials/fixtures/`, trimmed by `trim.ts`, asserted field by field against the expected `Trial`.

### R-19 Absence rules
Sample response variants with `officialTitle`, `maximumAge`, `healthyVolunteers` and `phases` absent produce `null`/`[]` per `R-3`.

### R-20 Required-field failure
A response missing `eligibilityCriteria` throws, and the message names the field.

### R-21 `criteriaText` is byte-identical
Asserted against the raw string read out of the sample response, not against a re-typed literal. A test that retypes the expected text would pass while the code normalized whitespace.

### R-22 Serialization is stable
Trimming and serializing the same input twice yields identical bytes, and key order matches `R-1`.

### R-23 Loader happy path
Against the real committed corpus: twelve trials, in pinned-list order, every one shape-valid.

### R-24 Loader failure paths
One test per bullet in `R-15`, each against a purpose-built broken fixture directory, asserting `TrialFixtureError` and that the message names the file.

### R-25 `getTrial`
Returns the right study; throws for an unknown NCT ID.

### R-26 Corpus meets its selection criteria
The mechanically checkable parts of `R-7` are asserted against the real corpus: twelve entries, every entry has a non-empty rationale, no sponsor appears more than four times, at least two blocks under 1500 characters and at least two over 6000. The judgment-based axes (formatting weirdness, biomarker gating) are not asserted — see 10.5.

### R-27 No runtime network
A test asserting that no module reachable from `src/trials/index.ts` references `fetch` or an HTTP client. This is the executable form of the project's binding constraint — see 10.1.

---

## 8. Tooling and dependencies

### R-28 Runtime dependencies: none
Nothing is added to `dependencies`. Node 24's built-in `fetch` covers the only network need.

### R-29 Dev dependencies
Five, all pinned to exact versions: `typescript`, `vitest`, `@types/node`, `tsx`, `@biomejs/biome`.

`tsx` runs the fetch script. Node 24 strips types natively, but relying on that ties the one command a reader is most likely to run first to a runtime flag's behavior; `tsx` is the stable option and the cost is one dev dependency.

`@biomejs/biome` is linter and formatter in a single dependency with a single `biome.json`. ESLint would have meant `eslint`, `typescript-eslint`, `@eslint/js` and realistically Prettier as well, since the project has no formatter either. The accepted trade-off is that Biome has no type-aware rules, so it cannot catch a floating promise. Nothing in this slice returns a promise outside the fetch script; when slice 0005 brings in Fastify and async code, whether that trade-off still holds is worth re-asking.

### R-30 TypeScript configuration
`strict: true`, target and module settings appropriate to Node 24 ESM, `noUncheckedIndexedAccess` on — the loader indexes into parsed JSON, which is exactly the case that setting exists for.

---

## 9. Verification commands

### R-31
`CLAUDE.md`'s "Verifying your work" placeholder is replaced with the real commands and the paragraph saying the section is unpopulated is deleted:

| Command | Does |
| --- | --- |
| `npm install` | install |
| `npm test` | Vitest, deterministic, no network |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `biome check .` |
| `npm run format` | `biome format --write .` |
| `npm run fetch:trials` | refetch the corpus, overwriting fixtures |
| `npm run fetch:trials -- --dry-run` | report drift without writing |

There is no command to run the application, because there is no application until slice 0005. The section says so rather than leaving the reader to discover it.

### R-32 Node version is pinned
`.nvmrc` and `engines.node` in `package.json` both pin Node 24 LTS. `CLAUDE.md` is amended from Node 22 to Node 24 in the same commit.

---

## 10. Flagged ambiguities and constraint tensions

Nothing below is resolved silently. Where I have a recommendation I give it and say it is a recommendation.

### 10.1 "Trimmed" and "verbatim" pull in opposite directions on the same file
`CLAUDE.md` says keep saved trial JSON trimmed; `R-4` stores `criteriaText` verbatim, and that single field is most of each fixture's bytes — commonly 3–8KB, occasionally more. The instruction's stated reason is that full responses are "large and mostly unused," which `R-2` addresses by dropping unused fields. I read "trimmed" as being about unused fields rather than about total size, so the criteria block stays whole. Flagging it because a reviewer applying the instruction literally to a 9KB fixture would have a fair objection.

### 10.2 "Re-running produces an empty diff" is weaker than the intent implies
The intent claims a second run diffs empty unless the registry changed. True, but `overallStatus` and `lastUpdatePostDate` change routinely for reasons that have nothing to do with eligibility — a status flip from `RECRUITING` to `ACTIVE_NOT_RECRUITING`, an administrative record update. So refetches will produce churn in fields the parser does not read, and a `changed` result from `--dry-run` will not usually mean the criteria moved.

Options: accept the churn; have `--dry-run` distinguish eligibility-affecting changes from the rest; or drop the volatile fields. **I recommend accepting the churn and having `--dry-run` report which fields differ** (already `R-11`), because dropping `overallStatus` costs the coordinator pane real information. Your call.

### 10.3 The pinned list's location contradicts what I proposed earlier
When you chose the corpus approach I wrote `data/trials/corpus.ts` — a TypeScript module inside the data directory, which `CLAUDE.md`'s layout does not allow, since `data/` holds saved JSON and cases. This spec puts it at `src/trials/corpus.ts` and keeps `data/trials/` pure JSON. Noting the change rather than letting the earlier wording stand.

### 10.4 Most of the corpus selection criteria are not machine-checkable
`R-7` is the substance of this slice — a weak corpus makes slice 0002 look better than it is — and `R-26` can only assert the countable parts. "Formatting is genuinely awkward" and "this study is biomarker-gated" are judgments that live in the rationale strings and in your review of the PR. The honest position is that `R-7` is enforced by review, not by tests, and the corpus is the part of this slice most worth your actual attention.

### 10.5 "Run" has no meaning in this slice
`R-31` also asks for a command to run the application. There is no application until slice 0005, and the section says so.

---

## Decisions taken since first draft

- **The fetch script lives in `scripts/`, not `src/trials/`.** `CLAUDE.md`'s layout is amended in the same commit: `src/trials/` is fixture loading only, a `scripts/` entry is added, and the "two boundaries" paragraph becomes three, the third being that nothing under `src/` makes a network call. `R-27` asserts it. The constraint was previously convention; it is now a test.
- **Node 24 LTS**, replacing Node 22. `CLAUDE.md` is amended in the same commit, and the version is pinned in `.nvmrc` and `engines` (`R-32`).
- **`tsx`** runs the fetch script, rather than Node's native type stripping (`R-29`).
- **Biome** is the linter and formatter, one dev dependency rather than ESLint's three or four (`R-29`, `R-31`). Re-ask at slice 0005, when type-aware rules would have something to catch.

## 11. Deferred

| Thing | Where it goes |
| --- | --- |
| Splitting `criteriaText` into criteria | 0002 |
| Any structured criteria schema | 0002 |
| Patient vignettes in `data/cases/` | 0003 |
| Corpus refresh policy over time | not planned; the corpus is frozen |
| Type-aware lint rules | re-ask at 0005, per R-29 |
| Corpus expansion past twelve | only if 0002 shows the corpus is too easy |
