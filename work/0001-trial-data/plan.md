# plan: 0001 trial data

**Intent:** `work/0001-trial-data/intent.md` · **Spec:** `work/0001-trial-data/spec.md`
Requirement IDs below (`R-n`) refer to the spec. This plan is written to be implementable without having seen the conversation that produced it.

---

## Context

The repository contains documents and no code. Every downstream slice needs eligibility criteria text to work against: the criteria parser (0002) has nothing to parse, the eval cases (0003) have no trial to bind a patient vignette to, the coordinator pane (0006) has no trial to cite.

This slice produces a frozen corpus of twelve real NSCLC protocols and the code to read it. The binding constraint is that the running application makes no network calls, so the fetch/read boundary has to exist from the first file rather than be retrofitted. Nothing here interprets criteria text — that is 0002's job, and doing any of it here would put parser behavior in untested fetch code.

This is also the first slice with runnable commands, so it establishes the toolchain and fills in `CLAUDE.md`'s "Verifying your work" placeholder.

**Verified during planning** (live API calls, planning-time only): every field path in `R-2` exists as specced on a real v2 response; a full study record is ~94KB against ~5KB trimmed, which is the concrete justification for `R-2`.

---

## Decisions already settled

Do not reopen these; they are recorded in the intent and spec.

| Decision | Where |
| --- | --- |
| Twelve studies, pinned NCT ID list, not a live query | `R-6` |
| Fetch overwrites in place; git diff is the review surface | `R-10` |
| Loader is eager, synchronous, uncached, throws on any fault | `R-14`, `R-15` |
| Shape validation hand-written, no schema library | `R-16` |
| Fetch script lives in `scripts/`, not `src/trials/` | spec 10.1, amended into `CLAUDE.md` |
| `tsx` runs the script; Biome is linter + formatter | `R-29` |
| Zero runtime dependencies | `R-28` |
| `engines.node` is `">=24"`, no `.nvmrc` | decided in planning; see Step 1 |

---

## Files that change

Every file this slice touches. Nothing outside this list should appear in the diff.

**New — configuration**
- `package.json` — ESM (`"type": "module"`), scripts, five exact-pinned devDependencies, `engines.node: ">=24"`
- `tsconfig.json` — `strict`, `noUncheckedIndexedAccess`, Node 24 ESM resolution (`R-30`)
- `biome.jsonc` — lint + format, one file (`.jsonc`, not `.json`: Biome's config is strict JSON and the disabled rule needs its reason next to it)
- `vitest.config.ts` — test root, node environment

**New — source (`src/trials/`)**
- `types.ts` — `Trial`, `TrialEligibility`, `TrialFixtureError` (`R-1`)
- `corpus.ts` — the pinned list: `{ nctId, rationale }[]` (`R-6`)
- `trim.ts` — API response → `Trial`, and `Trial` → fixture text. Both pure, no I/O (`R-17`, `R-5`)
- `validate.ts` — hand-written shape checks, accumulating (`R-16`)
- `load.ts` — `loadTrials`, `getTrial` (`R-14`)
- `index.ts` — public surface; re-exports types + loader only, never `trim.ts`

**New — script**
- `scripts/fetch-trials.ts` — the only file in the repo that performs HTTP (`R-9`–`R-13`)

**New — data**
- `data/trials/NCT*.json` — twelve fixtures (`R-5`)

**New — tests (`tests/trials/`)**
- `trim.test.ts`, `load.test.ts`, `corpus.test.ts`, `boundary.test.ts`, `fetch-script.test.ts`
- `tests/trials/fixtures/` — one real full API response, hand-built broken fixtures, a valid mini-corpus

**Modified**
- `CLAUDE.md` — three amendments (Step 1)
- `README.md` — a short "what exists so far" section
- `.gitignore` — add `.biome-cache/` if Biome emits one; otherwise untouched

**Explicitly not created:** `src/criteria/`, `src/models/`, `src/transport/`, `src/server/`, `src/web/`, `evals/`, `data/cases/`. Empty scaffolding is a plan-compliance finding under REVIEW.md Pass 1.

---

## Order of work

Seven steps, each a commit, grouped into four **stages** with a **review gate** between them. Steps 2–4 are the substance; 5 is the only one requiring network.

A stage is a run of steps that can be implemented without stopping. A gate is a human decision that the following stage depends on — not a status update, and not a request to skim a diff. Work does not cross a gate unattended. Stages 1, 2 and 4 could in principle be run end to end; the gates exist because of what the *next* stage spends.

| Stage | Steps | Gate at its end |
| --- | --- | --- |
| 1 — Toolchain and trim | 1–2 | Is the project's shape right? Five pinned dev dependencies, strict TypeScript, ESM, Biome. Everything after this inherits these choices, and changing them later is a retrofit. |
| 2 — Loader and corpus | 3–4 | **Is the corpus actually hard?** The one gate that carries real risk. See below. |
| 3 — Fetch and fixtures | 5 | Did the run produce what it should? Twelve fixtures, byte-stable, no contact-block fields, clean second run. |
| 4 — Boundary and docs | 6–7 | None. Goes straight to the REVIEW.md passes. |

**The gate after Stage 2 is the one that matters.** Step 5 fetches against the twelve NCT IDs in `corpus.ts`, so that list has to be right before the network run is spent on it. What needs a human specifically: the biomarker-gated entries were flagged by regex over the criteria text, which matches any *mention* of EGFR, ALK, KRAS and so on rather than genuine gating, so it over-reports. `R-26` cannot check this and neither can any test — spec 10.4 says so plainly. A soft corpus makes slice 0002's parser look better than it is, and that error stays invisible for several slices. Reading the flagged entries is the only thing standing between here and that outcome.

The gate after Stage 1 is cheap and the gate after Stage 3 is a verification, not a judgment. If either is skipped, say so in the PR rather than letting it pass silently.


### Step 1 — Toolchain and CLAUDE.md amendments
`package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `CLAUDE.md`.

devDependencies, all exact-pinned, no carets: `typescript`, `vitest`, `@types/node`, `tsx`, `@biomejs/biome`. `dependencies` stays empty and should remain so.

Scripts: `test`, `typecheck` (`tsc --noEmit`), `lint` (`biome check .`), `format` (`biome format --write .`), `fetch:trials` (`tsx scripts/fetch-trials.ts`).

`engines.node: ">=24"`. **No `.nvmrc`** — it would tell nvm to switch away from the Node the repo is actually developed on.

Three amendments to `CLAUDE.md`, all already drafted in the working tree:
1. `src/trials/` is fixture loading only; a `scripts/` entry is added.
2. The "two boundaries" paragraph becomes three; the third is that nothing under `src/` makes a network call.
3. Node 22 → **Node 24 LTS or newer, developed on v26.8.2** (adjust the currently-committed wording, which says Node 24 LTS pinned in `.nvmrc`, to match the decision above).

`CLAUDE.md`'s "Verifying your work" section is filled in at Step 7, when the commands it names all exist.

*Proof:* `npm install && npm run typecheck && npm run lint` succeed on an empty source tree.

### Step 2 — Types and the trim function
`src/trials/types.ts`, `src/trials/trim.ts`, plus `tests/trials/fixtures/` and `tests/trials/trim.test.ts`.

*Diverged from plan as written, during implementation:* `serializeTrial` lives in `trim.ts` rather than in the fetch script. `R-22` requires serialization to be tested for byte-stability, and it is pure, so it belongs beside the other pure transformation instead of inside the one file tests never load. The script calls it.

*Also diverged:* the Biome config is `biome.jsonc`. Biome parses `biome.json` as strict JSON, and `useLiteralKeys` is switched off deliberately — this code navigates untyped registry JSON by string key — which is a decision that should carry its reason in the file rather than only in a commit message.

Save one real full API response verbatim into `tests/trials/fixtures/` (fetch it by hand, commit it as-is — this is the one place an untrimmed response belongs). Write `trim.ts` against `R-2`/`R-3`, then the tests in `R-18`–`R-22`.

Two things that are easy to get wrong:
- **`R-4` — `criteriaText` is byte-for-byte verbatim.** No trim, no whitespace collapse, no line-ending normalization. The test must assert against the string read out of the sample response, never a re-typed literal, or it will pass while the code normalizes.
- **`R-3` — absence rules.** Missing optional scalars become `null`, missing arrays become `[]`, and both are still written. `healthyVolunteers` is `boolean | null` and must not default to `false`: "the record does not say" and "healthy volunteers not accepted" are different facts about a real protocol. Missing *required* fields throw.

*Proof:* `R-18`–`R-22` pass.

### Step 3 — Validation and the loader
`src/trials/validate.ts`, `src/trials/load.ts`, `src/trials/index.ts`, `tests/trials/load.test.ts`.

`validate.ts` accumulates every fault and throws once with all of them, rather than throwing on the first (`R-16`). Every failure in `R-15` throws `TrialFixtureError` naming the offending file. Nothing returns `undefined`, nothing returns a partial `Trial`, nothing logs and continues.

`loadTrials` returns trials **in pinned-list order** (`R-14`), not directory order and not sorted by NCT ID.

Write `load.test.ts` (`R-24`, `R-25`) against broken fixture directories: missing file, orphan file, bad JSON, wrong type, `nctId`/filename mismatch, missing directory.

*Diverged:* the broken directories are built per test in a temp dir rather than committed under `tests/trials/fixtures/`. Each failure mode is then visible in the test that exercises it instead of in a file a reader has to go and open.

*Diverged:* `R-23` and the fixture-dependent corpus assertions are **skipped** until fixtures exist, not left failing. The plan said to leave them red; a red suite sitting at a review gate teaches people to ignore red suites. Step 5 removes the guard, and the guard is a single `existsSync` so it cannot be forgotten silently — it flips on its own the moment the fixtures land.

`index.ts` re-exports types and the loader only. It must **not** re-export `trim.ts`, or the boundary test in Step 6 will fail for a good reason.

*Proof:* `R-24`, `R-25` pass; `R-23` fails pending fixtures.

### Step 4 — The corpus list
`src/trials/corpus.ts`, `tests/trials/corpus.test.ts`.

Twelve `{ nctId, rationale }` entries. `rationale` says what the study contributes to the corpus — "long run-on block, sub-criteria not visually separated" — not what the study is about. A reader deciding whether the corpus is strong enough is the audience.

The candidate slate below was assembled during planning from a 200-study survey and satisfies every countable axis of `R-7`. See Risks for what still needs human confirmation.

| NCT ID | chars | phase | contributes |
| --- | --- | --- | --- |
| NCT00743379 | 14015 | 1/2 | worst formatting found: numbered list, sub-items `a.`/`b.` run together inline |
| NCT04841811 | 8311 | 3 | long, unbulleted, semicolon-separated run-ons |
| NCT06728852 | 4890 | 2 | mid-length with no bullet structure at all |
| NCT04385368 | 15998 | 3 | longest block; large-pharma house style |
| NCT03433469 | 11493 | 2 | long and heavily nested (72 bullets) |
| NCT03377023 | 11168 | 1/2 | long, academic-center style |
| NCT03753685 | 2963 | 2 | ALK-gated, so the corpus carries more than one alteration type |
| NCT00966472 | 4010 | 1 | mid-length phase 1 |
| NCT00077350 | 4422 | 2 | cooperative-group style (NCI) |
| NCT04316364 | 1681 | 3 | short phase 3 |
| NCT07229729 | 1308 | 2 | short, unbulleted |
| NCT00106626 | 1271 | 1 | shortest usable block |

Counts: 2 under 1500 chars, 5 over 6000; phase 1 ×4, phase 2 ×7, phase 3 ×3; 3 with awkward formatting; no sponsor appears more than once.

*Diverged, and this is the important one:* NCT01259089 was replaced by NCT03753685 after reading the criteria. The planning-time biomarker flag was regex-derived and wrong — `ALT (SGPT)` in liver-function values matched as `ALK`, and prior-therapy exclusions like "no previous EGFR inhibitor" counted as gating. Verified by reading, only **three** of the original twelve were genuinely gated, exactly at `R-7`'s floor rather than the six the survey claimed. The swap brings it to four and adds ALK alongside EGFR. See the gate notes.

`corpus.test.ts` asserts only the mechanically checkable parts (`R-26`): twelve entries, every rationale non-empty, no NCT ID repeated, no sponsor over four, at least two blocks under 1500 and two over 6000. It must not try to assert "formatting is awkward" or "biomarker-gated."

*Proof:* `R-26` passes (the length assertions need Step 5).

### Step 5 — The fetch script, and the one network run
`scripts/fetch-trials.ts`, then `data/trials/NCT*.json`.

Sequential requests, never parallel (`R-10`). `GET https://clinicaltrials.gov/api/v2/studies/<nctId>?format=json`, full record, trimmed locally by `trim.ts` — do not use the API's `fields` parameter, so that trimming stays in one tested place.

Hard-fail on any non-2xx, network error, malformed body, or missing required field: report the NCT ID and reason, exit non-zero, no retry, no fallback, no silent skip (`R-12`). Fixtures already written for earlier studies stay on disk; the git diff is the recovery surface.

`--dry-run` does everything but write, reports `unchanged` / `changed` / `new` / `error` per study with differing field names, and exits 1 if anything is `changed` or `error` (`R-11`).

Serialization per `R-5`: two-space indent, trailing newline, keys in `R-1` declaration order — explicitly constructed, not whatever `JSON.stringify` does with the source object. Byte-stability is the whole point.

The script writes only inside `data/trials/`, deletes nothing, and makes no request other than the per-study GET (`R-13`).

Then run it once and commit the twelve fixtures as a separate commit from the script, so the script is reviewable without twelve JSON files in the same diff.

*Proof:* `npm run fetch:trials` writes twelve files; a second run leaves `git status` clean; `R-23` now passes.

*Result of the run:* twelve fixtures, 92KB total, of which 88% is criteria text — the trim is doing its job. A second run reported all twelve unchanged and produced no diff, so serialization is byte-stable. `--dry-run` exits 0. The three skipped corpus assertions lifted on their own and pass: 2 short blocks, 5 long, phase 1 ×4 / 2 ×7 / 3 ×3, no sponsor more than once. No contact-block field reached any fixture.

### Step 6 — The boundary test
`tests/trials/boundary.test.ts`.

Walk the module graph reachable from `src/trials/index.ts` and assert that no file references `fetch`, `http`, `https`, `node-fetch`, `undici`, or `XMLHttpRequest` (`R-27`). Static source inspection over the resolved import graph, not a runtime mock.

This is the executable form of the project's binding constraint and the reason `scripts/` exists. Assert it fails if `scripts/fetch-trials.ts` is reachable — a test that cannot fail is not doing its job (REVIEW.md).

*Proof:* passes; and temporarily importing the script into `index.ts` makes it fail.

### Step 7 — Docs
`CLAUDE.md` "Verifying your work", `README.md`.

Fill the section with the real command table and delete the placeholder paragraph (`R-31`). State plainly that there is **no command to run the application**, because there is none until slice 0005, rather than listing a command that does not exist. Note that lint is Biome and there is deliberately no ESLint.

`README.md` gets a short section on what exists so far: twelve trials, how to refresh them, and that no model is involved yet.

*Proof:* every command in the table runs successfully.

---

## Risks

**The corpus is soft and the tests cannot tell you.** The highest-value risk in the slice. `R-26` checks counts and lengths; it cannot check that the formatting is genuinely hard or that a study is biomarker-*gated* rather than merely biomarker-*mentioning*. The slate above flags biomarker status by regex over the criteria text, which over-reports. **Confirm the biomarker-gated entries by reading them before committing `corpus.ts`.** If 0002's parser handles all twelve easily, suspect the corpus before believing the parser.

**Two records are young or individually sponsored.** NCT07229729 is a recently registered record and NCT06728852 is sponsored by an individual investigator; both are more likely than the others to be revised or withdrawn, which by `R-12` turns a future refetch into a hard failure. Acceptable — that is the designed behavior — but if either looks unstable on inspection, substitute from the same survey.

**Byte-stability is easy to lose.** Key ordering, indentation and the trailing newline all have to be deliberate. If they are not, every refetch produces a noisy diff and `--dry-run` becomes useless. `R-22` is the guard; write it before the script, not after.

**Diff churn is expected even when criteria are unchanged.** `overallStatus` and `lastUpdatePostDate` move for administrative reasons. A `changed` result from `--dry-run` usually does *not* mean the criteria moved, which is why `R-11` reports which fields differ. Do not "fix" this by dropping the fields; the coordinator pane needs them.

**Partial fetch failure leaves a partial corpus.** By design (`R-12`). The loader will then throw on a missing file, which is the intended loud failure, not a bug to soften.

**Scope creep toward 0002.** The pressure to "just split the criteria on newlines while we're here" is real and should be refused. `trim.ts` treats `criteriaText` as an opaque string.

---

## Tests that prove it

| Requirement | Test | Proves |
| --- | --- | --- |
| `R-18` | `trim.test.ts` | field-by-field trim against a real saved response |
| `R-19` | `trim.test.ts` | absent optionals → `null` / `[]` |
| `R-20` | `trim.test.ts` | missing `eligibilityCriteria` throws, names the field |
| `R-21` | `trim.test.ts` | `criteriaText` byte-identical to source |
| `R-22` | `trim.test.ts` | serialization stable and key-ordered |
| `R-23` | `load.test.ts` | real corpus loads, twelve trials, pinned order |
| `R-24` | `load.test.ts` | one case per failure mode in `R-15`, each naming the file |
| `R-25` | `load.test.ts` | `getTrial` hits and misses |
| `R-26` | `corpus.test.ts` | countable parts of `R-7` |
| `R-27` | `boundary.test.ts` | nothing reachable from `src/` touches the network |
| — | `fetch-script.test.ts` | *added during review pass 2:* `changedFields` survives a corrupt fixture already on disk |

Not covered by tests, covered by review: the judgment axes of `R-7` (spec 10.4).

Not covered at all, deliberately:
- **The fetch script's network path.** `CLAUDE.md` forbids network calls in `tests/`, so the script's HTTP behavior is never exercised by the deterministic suite. Its *pure* parts are tested, which is how review pass 2 found the corrupt-fixture crash. `trim.ts` carries all the logic worth testing and is exercised offline (`R-18`–`R-22`); what remains untested is request sequencing and error handling, checked manually via `--dry-run`. Mocking `fetch` to test it would test the mock.
- **Browser end-to-end (Playwright or similar).** There is no UI, no server and no HTTP surface in this slice, so there is nothing for a browser driver to drive. The first meaningful target is the conversation pane in 0005 and the coordinator review pane in 0006; the tooling decision belongs to whichever of those lands first, not here.

---

## Verification

```
npm install
npm run typecheck          # tsc --noEmit
npm run lint               # biome check .
npm test                   # vitest, deterministic, no network
npm run fetch:trials -- --dry-run   # exits 0, reports twelve unchanged
```

End-to-end: delete `data/trials/`, run `npm run fetch:trials`, confirm twelve files reappear and `git status` is clean. That single sequence exercises the corpus list, the fetch script, the trim function, the serializer and the loader together.

Run the REVIEW.md passes before opening the PR. Pass 1 (plan compliance) should find the file list above matches the diff exactly. Pass 3 is the one with teeth here: confirm no contact-block fields reached any fixture, and that `R-27` actually passes.
