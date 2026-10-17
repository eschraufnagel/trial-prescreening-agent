# plan: 0015 parser on nested protocols

**Intent:** `work/0015-nested-protocols/intent.md` (accepted 2026-10) · **Spec:** `work/0015-nested-protocols/spec.md`
**Branch:** `0015-nested-protocols`, from `roadmap-0015` at `91fecdd` (PR #21, merged into `main`). Intent `1845b72`, spec `905fcfe`. PR into `main`.

---

## Context

At 0013's gate, NCT06090266 lost 11 of 45 parsed criteria. In each one, the model quoted a heading and one of its sub-items as one string ("Recent or ongoing serious infection including the following: Uncontrolled infection with … (HIV)."). That string isn't in the source verbatim, so `locateQuote` rejected it, and the agent never asks about those criteria. Among them are the HIV, hepatitis and TB exclusions.

The intent settles three things:
- **Where the fix goes:** a deterministic third attempt in the location step, a *heading join*. The prompt doesn't change.
- **What fixed means:** decision 6(a)–(d).
- **How much is measured:** one local model run.

A scratch replay of the committed gate parse already showed the rule recovering 10 of 11. Unclaimed passages go from 6 to 8, and 7 of those 8 are carve-outs, which are out of scope.

**Nothing here spends money.**
- One local parse on oMLX.
- No `--spend`, no `.env`, no dependency added.
- The prompt and normalization versions don't move, so no committed parse, result or screening key changes.

**Baseline**, from `npm test` on `905fcfe`: 73 test files, 1070 passed and 8 expected fail (1078), in 0.83 s.

---

## Order of work

### Stages and gates

| Stage | Steps | Ends at | What you can see at the end |
| --- | --- | --- | --- |
| **A. The rule, proved without a model** | 1–5 | **Gate** | `npm test` replays the gate parse: 44 kept, 1 rejected (B3), 8 unclaimed. Every adversarial quote, old and new, rejected. `parse:criteria --trial-file` reads the gate record (shown dry) |
| **B. One run, written up** | 6–8 | PR | The fresh parse committed and judged by 6(d). Docs, roadmap, review passes |

**Gate: is the rule narrow enough to keep the net a net? (intent, Gates)**

- **Why it's a gate.** It decides whether stage B's run means anything. A rule loose enough to pass 6(d) by accepting stitched quotes turns the safety net into a hole. No later test would notice, because the run and the docs would both be built on it.
- **What the owner reads.** The table of joined quotes, from step 4, which Claude pastes into this plan's Records. Each row has the quote, the source lines it was matched against, and kept or rejected. For each row, the question is whether the kept half is in the source as written, under that heading. No clinical judgment is needed.
- **What Claude reports with it.** The replay's counts, and any place a number differed from the intent's scratch replay (10 recovered, 8 unclaimed), with why.
- **The answer can be no.** If the owner finds a kept quote that shouldn't be, the rule is narrowed, the replay's numbers change, and the docs say what they become. Nothing is tuned to keep 10 of 11.

**A second, conditional stop, after step 6.** If 6(d) fails, meaning the fresh parse leaves a rejection that is a heading plus an item in that heading's list, work stops before the docs. The rule isn't tuned against that run. The owner decides whether the slice ships with the miss recorded, or stops short of the PR. If 6(d) passes, stage B continues without stopping: the docs only report what the run shows.

### Steps

- Each step is one commit, made through `npm run check && git commit`.
- No test mocks a module or stubs a global. The model is a `FakeModelAdapter`.
- No commit carries a Co-Authored-By trailer (CLAUDE.md).

**Stage A: the rule, proved without a model**

1. **Commit this plan** as `work/0015-nested-protocols/plan.md`. In the same commit, `spec.md` §6.1 and §8 are amended for two things found while planning:
   - `parserWorkload` in `evals/estimate.ts` looks a study up by NCT ID, so it gains a sibling that takes trials;
   - the file reader lives in `scripts/lib/trial-file.ts`.

2. **The rule (spec §2) in `src/criteria/locate.ts`, with its unit tests (spec §5.1).**
   - **`LocateResult` gains `heading?: SourceSpan`.** `locateQuote` tries `findJoined` after `findLoose`, and maps both halves through `toSourceSpan`. If either half fails to map, there's no result.
   - **`findJoined(text, quote, from)`:**
     - It splits the quote at each `:` followed by whitespace, left to right, into `H` (through the colon) and `S` (the rest, trimmed). An empty `S` is skipped.
     - It finds every occurrence of `H`, those starting at or after `from` first and then the rest. Each occurrence must satisfy `isWholeHeading`: no line break inside, `LEAD` before it on its line, and only spaces or tabs after it to the line's end.
     - For each occurrence, `listEnd` is the start of the first non-blank line after `H`'s line whose indent is no greater than `H`'s line. If there's none, it's the end of the text.
     - It searches for `S` from the end of `H`'s line, taking the first match that starts before `listEnd` and whose line prefix is `LEAD`.
     - The first `H` and `S` that both pass win. `loose` is true if either half's matched text differs from the half as given.
   - **The matching.** One whitespace-flexible regex per half, built the way `findLoose` builds its own: split on `\s+`, `escapeRegExp` each part, join with `\s+`. The function that builds the pattern is shared with `findLoose`, not copied. A match equal to the half as given is the exact case.
   - **The constants.**
     - `MARKER = (?:[*\-•]|\(?(?:\d{1,3}|[a-zA-Z]|[ivxIVX]{1,5})[.)])`
     - `LEAD = ^[ \t]*(?:MARKER[ \t]+){0,2}$`, applied to the text from the line's start to the match.
   - **Comments.** The module's header comment gains a paragraph on the third attempt. It says why it exists (0013's gate) and why each clause of spec §2.2 is there, naming the stitch it stops.
   - **`tests/criteria/locate.test.ts` gains a `describe("heading joins (slice 0015)")`.** It uses one invented block with two headings, a nested list each, a mid-line colon, an inline sub-item and a repeated heading. One `it` per clause of §2.2, passing and failing:
     - the heading's lead, including a two-marker lead;
     - text after the colon on the heading's line;
     - the item's lead, with and without its own marker;
     - an item on the heading's level;
     - an item after the list ends;
     - a repeated heading resolved by the cursor;
     - `loose` carried from either half.

     It also checks that `heading` is absent on an exact and on a loose match.

3. **The criterion and the parse (spec §3, §4).**
   - **`src/criteria/types.ts`:** `Criterion` gains `heading?: SourceSpan`. Its doc comment says what's in spec §3: how the quote was found, like `loose`; the agent never sees it; it's set since 0015.
   - **`src/criteria/parse.ts`:**
     - `locateAll` spreads `heading` onto the criterion when present, beside `loose`.
     - `findUnclaimed` treats each criterion's `heading` as claimed, beside `source`, with a one-line comment on why.
   - **`tests/criteria/parse.test.ts`**, in the "what a parse keeps about its quotes" block:
     - an exact quote has no `heading` key, so parses from before 0015 read the same;
     - a joined quote on a small invented block keeps the item's span as `source`, with `heading.text` equal to the heading;
     - the gap holding only that heading isn't reported as unclaimed when the heading is long enough to have been reported otherwise.

4. **The net against heading joins, and the replay (spec §5.2, §5.3).**
   - **`tests/fixtures/gate-trial.ts`** exports:
     - `GATE_RECORD`, the path of `work/0013-trials-by-link/gate/NCT06090266.json`;
     - `gateRecord()`, the JSON;
     - `gateTrial()`, its `trial` through `validateTrial`.
   - **`tests/criteria/adversarial.test.ts`.** The eight existing cases are untouched. New blocks follow.

     **Kept.** Each is checked to keep exactly one criterion, with `heading.text` and `source.text` as written:

     | # | Study | Quote | Source / heading |
     | --- | --- | --- | --- |
     | K1 | gate | `Recent or ongoing serious infection including the following: Uncontrolled infection with human immunodeficiency virus (HIV).` | item 8.2 / heading 8 |
     | K2 | gate | `For Cohorts A2, B1, B2, and B3 only: Interstitial lung disease.` | item 14.2 / heading 14 |
     | K3 | NCT00743379 | `Acceptable liver function: Bilirubin ≤ 1.5 times upper limit of normal` | the first "8." block's "a." item. The heading text occurs three times |

     **Refused.** Each is sent beside a kept quote from the same study, so the parse can't fail for having nothing. Each must give 1 criterion and 1 rejection with the "does not appear" reason:

     | # | Why it's refused | Study | Quote |
     | --- | --- | --- | --- |
     | R1 | heading altered | gate | `Recent or ongoing serious infections including the following: Uncontrolled infection with human immunodeficiency virus (HIV).` |
     | R2 | item altered | gate | `Recent or ongoing serious infection including the following: Uncontrolled HIV infection.` |
     | R3 | heading not in the source | gate | `Active infections of any kind: Uncontrolled infection with human immunodeficiency virus (HIV).` |
     | R4 | item under another heading | gate | `For Cohorts A2, B1, B2, and B3 only: Uncontrolled infection with human immunodeficiency virus (HIV).` |
     | R5 | item after the heading's list ended | gate | `Recent or ongoing serious infection including the following: Interstitial lung disease.` |
     | R6 | halves reversed | gate | `Uncontrolled infection with human immunodeficiency virus (HIV). Recent or ongoing serious infection including the following:` |
     | R7 | skips from one sub-item to a later one | gate | `Recent or ongoing serious infection including the following: Any uncontrolled Grade 3 or higher (per NCI-CTCAE version 5.0) viral, bacterial, or fungal infection within 2 weeks prior to the first dose of OR502. Known active or latent tuberculosis (testing at screening is not required).` |
     | R8 | colon partway along a line | gate | `Vulnerable persons: Interstitial lung disease.` |
     | R9 | heading is the tail of its line (refused on purpose) | NCT04385368 | `The following are exceptions to this criterion: Patients with vitiligo or alopecia` |
     | R10 | inline sub-item (refused on purpose) | NCT00743379 | `Acceptable liver function: AST (SGOT) and ALT (SGPT) ≤ 2.5xULN` |
     | R11 | no colon, sibling between (decision 4) | gate | the Cohort B3 quote, read from the gate record's `rejected` |
     | R12 | 0011's real stitch | NCT00077350 | read from `rejected` in the committed `…88c050f35c4c-n2…` parse |
     | R13 | 0011's real retyping | NCT04841811 | read from `rejected` in the committed `…73c3b301c4a9-20260921` parse |
     | R14 | text after the heading's colon (added at step 4) | NCT03433469 | `Women NOT of childbearing potential: Permanent sterilization includes hysterectomy and/or bilateral oophorectomy` |

     **Before each case**, the test asserts the facts its claim rests on. For example, it checks that each kept half occurs in the normalized text, so a refusal can't come from a typo in the test.
   - **`tests/criteria/nested.test.ts`**, the replay. It sends the gate record's 34 kept criteria to `parseCriteria` through a `FakeModelAdapter`:
     - **The kept 34.** They go in source order, each quote being the normalized text of its recorded span (mapped back through `sourceIndex`), with its recorded fields.
     - **The 11 rejected.** They're appended as recorded `raw` entries. Appending them, rather than interleaving them, reproduces the gate's cursor exactly: rejected quotes never moved it. Anything recovered is then found by the whole-text fallback.
     - **What it asserts:**
       - all 34 kept spans equal the recorded ones;
       - 44 criteria, and 1 rejection, the B3 quote;
       - 10 criteria with `heading`, five under the infection heading and five under the cohort heading. Each one's `source.text` starts with its sub-item's words, and its polarity and type are as recorded in `raw`;
       - the unclaimed count, which the scratch replay says is 8.

     **If the test finds another number**, the test asserts what it finds and the step records why. The docs will quote the test, not the scratch script.

5. **`parse:criteria --trial-file <path>` (spec §6.1).**
   - **`scripts/lib/trial-file.ts`:** `readTrialFile(path)`. It parses the JSON and takes `.trial` if present, otherwise the whole value, through `validateTrial(value, path)`. A missing file or a failed validation throws with the path in the message.
   - **`evals/estimate.ts`:** `parserWorkloadFor(trials: readonly Trial[])` holds the existing body, and `parserWorkload(ids)` maps ids through `getTrial` and calls it. No behaviour change. `tests/` covers `parserWorkload` already, if it does: that's checked at this step, and the new function gets one test either way.
   - **`scripts/parse-criteria.ts`.**
     - `--trial-file` selects that one trial. Combined with an NCT ID, `--all` or `--cache`, it exits 1 with a message. For `--cache`, the message says the cache is keyed for pinned studies.
     - The workload uses `parserWorkloadFor(trials)`.
     - The header comment gains the usage line.
   - **`tests/scripts/trial-file.test.ts`:**
     - the gate record reads as NCT06090266;
     - a pinned study's trimmed JSON (`data/trials/NCT00077350.json`) reads as itself;
     - a JSON with no valid trial throws with the path.
   - **Shown dry, with no model call:** `npm run parse:criteria -- --trial-file work/0013-trials-by-link/gate/NCT06090266.json --model anthropic` prints the parser's role and an estimate, then exits. The output goes in Records.

**→ Gate.**

**Stage B: one run, written up**

6. **The run (spec §6.2).**
   - **Before it.** oMLX's `/health` is checked, and nothing else is running on the model.
   - **The run:**
     ```
     npm run parse:criteria -- --trial-file work/0013-trials-by-link/gate/NCT06090266.json \
       --json work/0015-nested-protocols/run/NCT06090266.json
     ```
   - **Its claim:** the rule recovers heading joins in a parse it wasn't written against.
   - **Committed:** the output, with its `run` (model, quantization, temperature, seed, prompt and normalization versions).
   - **"Run record" below gets:**
     - time taken;
     - counts of criteria, recovered (with `heading`), rejected and unclaimed, beside the gate's;
     - each remaining rejection's quote, named as a heading join or not after reading it against the source;
     - each unclaimed passage, named as a carve-out or not;
     - 6(d), pass or fail.
   - **If it fails, stop** (see Stages and gates).

7. **Documents (spec §7).**
   - **`docs/parser.md`.** The quote-check paragraph gains the heading join: what is accepted, and the refused shapes. Those include the three honest ones left out (tail-of-line heading, inline sub-item, unindented sub-list), with the test that pins each.
   - **`docs/limitations.md`.** The nested-protocol entry is rewritten from step 4's replay and step 6's run:
     - recovered, and what still isn't (B3);
     - carve-outs unread, and which way that error points;
     - cohort scope (`appliesTo`) not reaching the agent or the page;
     - a trial added before 0015 needs removing and adding again.

     Each number names the test or the run file it comes from.
   - **`CLAUDE.md`.** The `parse:criteria` row names `--trial-file`.

8. **Roadmap and review.**
   - **`work/ROADMAP.md`:**
     - the 0015 row Done, with the PR;
     - the 0015 section opens with "**Done.**", like the others;
     - "Carried forward from 0015": carve-outs, cohort scope, the refused honest shapes, B3, and one run being one sample;
     - the open-items table gains carve-outs and cohort scope, and closes 0013's "joins headings onto sub-items" row as done in 0015.
   - **The REVIEW.md passes**, run against `git diff main`, with results recorded under "Review passes" here.
   - **PR into `main`.** It says the browser test wasn't run and why: no path that calls for it changed.

---

## Files that change

| File | Step | Change |
| --- | --- | --- |
| `work/0015-nested-protocols/plan.md`, `spec.md` | 1 | this plan; spec §6.1, §8 amended |
| `src/criteria/locate.ts` | 2 | `findJoined`, `heading` on `LocateResult`, shared pattern builder |
| `tests/criteria/locate.test.ts` | 2 | heading-join unit tests |
| `src/criteria/types.ts`, `src/criteria/parse.ts` | 3 | `Criterion.heading`; `locateAll`, `findUnclaimed` |
| `tests/criteria/parse.test.ts` | 3 | heading kept, absent on exact, claimed |
| `tests/fixtures/gate-trial.ts` | 4 | reads the committed gate record |
| `tests/criteria/adversarial.test.ts` | 4 | K1–K3, R1–R14 |
| `tests/criteria/nested.test.ts` | 4 | the replay |
| `scripts/lib/trial-file.ts`, `scripts/parse-criteria.ts`, `evals/estimate.ts` | 5 | `--trial-file` |
| `tests/scripts/trial-file.test.ts`, plus an estimate test if none covers it | 5 | |
| `work/0015-nested-protocols/run/NCT06090266.json` | 6 | the run |
| `docs/parser.md`, `docs/limitations.md`, `CLAUDE.md` | 7 | |
| `work/ROADMAP.md` | 8 | |

**Not touched:**
- `src/criteria/prompt.ts` and `normalize.ts`, so no version moves;
- `src/screening/`, `src/server/`, `src/web/`, `src/transport/`, `src/models/`, `src/plain/`;
- `evals/` other than `estimate.ts`: results, parses, graders, cases and runner;
- `data/`, `e2e/`, `README.md`.

## Reused, not rebuilt

- `toSourceSpan` (`src/criteria/normalize.ts`): both halves go back to the original through it.
- The pattern building in `findLoose` (`src/criteria/locate.ts`), shared, and `escapeRegExp`.
- `FakeModelAdapter`, and the `describe.each` and `adapterReturning` patterns in `tests/criteria/adversarial.test.ts`.
- `validateTrial` (`src/trials/validate.ts`).
- `parse:criteria`'s existing `--json` and model flags.

## Risks

- **The rule is looser than it reads.** That's what the gate and R1–R13 are for. The likeliest hole is `listEnd` on a protocol whose sub-items aren't indented: the list comes out empty, so the join is refused, which is the safe failure. The other is a `LEAD` that accepts too much. Two markers at most, and R8 shows a mid-line colon fails.
- **The replay's numbers differ from the scratch replay** (heading spans now count as claimed, and the scratch script's item-start check was rough). The test says what it finds, and the step records why. Nothing is adjusted to hit 10 or 8.
- **The fresh parse joins differently**, for example keeping the marker in the heading ("8. Recent…:"). That passes rule 2, because a marker in H is text found verbatim and the lead before it is just the indent. A form the rule refuses goes to the conditional stop. The rule isn't widened against the run.
- **oMLX is slow or down.** Check `/health` (memory: local model operations). One study takes about 2 minutes on an idle machine.
- **Cursor effects.** A recovered criterion moves the cursor where a rejected one didn't. On the five labelled parses nothing is rejected, so nothing moves (6(c)). On the gate parse the replay shows it.

## Verification

- `npm run check` exits 0 at every step. The test count rises only by the new tests, and the 8 expected failures stay 8.
- **6(a):** `tests/criteria/nested.test.ts`. **6(b):** `tests/criteria/adversarial.test.ts` and `locate.test.ts`.
- **6(c):** `tests/evals/committed-results.test.ts` passes unchanged, and `git diff main --stat -- evals/results data` is empty at the PR.
- **6(d):** the run file and its reading in "Run record".
- **`--trial-file`:** its test, and the dry run in step 5.
- **No browser test.** None of `src/web/`, `src/server/`, `src/transport/`, `src/trials/registry.ts`, `scripts/app*`, `vite.config.ts`, `tsconfig.web.json`, `EVAL_RUN`, `READING_RUN` or `evals/results/screening/review/` changes. The PR says so.

## Records

- **Step 2.** `MARKER` closes with `.`, `)` or `.)`, not only `.` or `)`. Spec §2.1 names NCT03377023's `* A.)` as the reason a lead may hold two markers, but its marker definition couldn't read `A.)`. The two-marker unit test caught it. Spec §2.1 is amended. Run against the gate record's 11 rejected quotes, the rule keeps the 10 heading joins, none of them loose, and refuses the B3 quote.
- **Step 3.** Mutation: with `findUnclaimed` not counting headings, "counts the heading as read" fails, and nothing else does.
- **Step 4.**
  - **The replay matches the scratch replay:** 44 kept, 10 recovered (5 under each heading), 1 rejected (B3), 8 unclaimed. The 8 are the B3 item and 7 carve-outs. The AJCC one is item 7's list of exceptions ("may be eligible", "are eligible"). Counting headings as claimed changed nothing here, because neither heading sat alone in a long enough gap.
  - **R14 was added.** Each clause of spec §2.2 was removed in turn, and the tests that failed were recorded:

    | Clause removed | Fails |
    | --- | --- |
    | the list's end (rule 5) | R4, R5, 3 unit tests |
    | the item's level (rule 5, `<=` made `<`) | R4, R5, 3 unit tests |
    | the heading starts its line (rule 2) | R8, R9, 1 unit test |
    | the item starts its line (rule 4) | R7, R10, 1 unit test |
    | the heading ends its line (rule 2) | **nothing, at first** |

    R8 ("Vulnerable persons:") and the unit test's "Note:" were also refused by their empty lists, so rule 2's line end had no test of its own. The corpus has exactly one line with a colon partway along and a deeper list under it (NCT03433469's "Women NOT of childbearing potential: …"). It became R14, with a unit case built the same way. With the clause removed, both now fail.
  - **The companions.** Each refused case's companion is a plain quote with no registry escape in it, because `source.text` is the original's. NCT03433469's first choice, a haemoglobin threshold, has an escaped `>` in the original.
  - **These records were left out of the step 3 and 4 commits.** A scripted edit matched nothing, and that wasn't checked. They were added after step 5, before the gate.
- **Step 5.**
  - No test covered `parserWorkload`. `tests/scripts/trial-file.test.ts` checks that `parserWorkloadFor` gives the same workload for a pinned trial.
  - `--json` writes an array of parses, so the run file will be a one-element array.
  - The dry run, with nothing sent:
    ```
    $ npm run parse:criteria -- --trial-file work/0013-trials-by-link/gate/NCT06090266.json --model anthropic
    parser on anthropic:claude-haiku-4-5: 1 study
      expected  1 calls, 5,544 input and 7,230 output tokens, about $0.042
    Dry run: nothing was sent. Add --spend to run it and pay for it.
    ```
    With `--cache` it refuses ("the parse cache is keyed for pinned studies"), and with an NCT ID it refuses ("drop the NCT ID or --all"), each exiting 1.
- **At the gate:** `npm test` reports 75 files, 1112 passed and 8 expected fail (1120), against the baseline's 1078.

### Gate material

**Every quote the rule keeps in the tests.** Each row shows the heading line and the item line it matched, generated by running `locateQuote`. `·` marks indentation. The question for each row: is the item in the source as written, and inside that heading's list?

| Case | Quote | Heading line | Item line |
| --- | --- | --- | --- |
| gate 2 | `Recent or ongoing serious infection including the following: Any uncontrolled Grade 3 or…` | `8. Recent or ongoing serious infection including the following:` | `···1. Any uncontrolled Grade 3 or higher (per NCI-CTCAE version 5.0) v` |
| gate 3 (K1) | `Recent or ongoing serious infection including the following: Uncontrolled infection with…` | `8. Recent or ongoing serious infection including the following:` | `···2. Uncontrolled infection with human immunodeficiency virus (HIV). ` |
| gate 4 | `Recent or ongoing serious infection including the following: Known to be positive for he…` | `8. Recent or ongoing serious infection including the following:` | `···3. Known to be positive for hepatitis B virus (HBV) surface antigen` |
| gate 5 | `Recent or ongoing serious infection including the following: Known active hepatitis C as…` | `8. Recent or ongoing serious infection including the following:` | `···4. Known active hepatitis C as determined by positive serology and ` |
| gate 6 | `Recent or ongoing serious infection including the following: Known active or latent tube…` | `8. Recent or ongoing serious infection including the following:` | `···5. Known active or latent tuberculosis (testing at screening is not` |
| gate 7 | `For Cohorts A2, B1, B2, and B3 only: Known hypersensitivity to cemiplimab or any of its …` | `14. For Cohorts A2, B1, B2, and B3 only:` | `····1. Known hypersensitivity to cemiplimab or any of its excipients o` |
| gate 8 (K2) | `For Cohorts A2, B1, B2, and B3 only: Interstitial lung disease.` | `14. For Cohorts A2, B1, B2, and B3 only:` | `····2. Interstitial lung disease.` |
| gate 9 | `For Cohorts A2, B1, B2, and B3 only: Prior pneumonitis requiring systemic corticosteroid…` | `14. For Cohorts A2, B1, B2, and B3 only:` | `····3. Prior pneumonitis requiring systemic corticosteroid therapy.` |
| gate 10 | `For Cohorts A2, B1, B2, and B3 only: Receiving immunosuppressive therapy, with exception…` | `14. For Cohorts A2, B1, B2, and B3 only:` | `····4. Receiving immunosuppressive therapy, with exceptions as noted i` |
| gate 11 | `For Cohorts A2, B1, B2, and B3 only: A history of severe immune-related adverse reaction…` | `14. For Cohorts A2, B1, B2, and B3 only:` | `····5. A history of severe immune-related adverse reactions from treat` |
| K3 | `Acceptable liver function: Bilirubin ≤ 1.5 times upper limit of normal` | `8. Acceptable liver function:` (first of three) | `···a. Bilirubin ≤ 1.5 times upper limit of normal b. AST (SGOT) and AL` |

"gate n" is the gate record's n-th rejected quote. Rejected quote 1 is B3, and stays rejected.

**Every quote it refuses**, with the clause that refuses it. The full strings are in step 4's table and in `tests/criteria/adversarial.test.ts`.
- **R1–R3:** a half altered or invented. Not in the source.
- **R4:** the HIV item under the cohort heading. It's in another heading's list.
- **R5:** the cohort item under the infection heading. The infection list has ended.
- **R6:** halves reversed. There's no colon to split at with an item after it.
- **R7:** item 1 joined to item 5. The item half isn't verbatim.
- **R8:** "Vulnerable persons:". The heading doesn't end its line, and its list is empty.
- **R9:** a tail-of-line heading. Refused on purpose.
- **R10:** an inline "b." item. Refused on purpose.
- **R11:** B3.
- **R12, R13:** 0011's real stitch and retyping.
- **R14:** text after the heading's colon. Refused by rule 2 alone.

**Passed 2026-10.** The owner first asked what the work was for. Claude answered in plain words: lost rules on long protocols, the fix, what it leaves (carve-outs), and what the gate checks. The owner answered "Ok, proceed". Whether the owner read the table row by row isn't recorded.

## Run record

**The run.** Made in 2026-10, after the gate, with the rule as committed at `33f0881`. oMLX's `/health` showed the pinned model loaded and idle. It took 143 s.

**The parse:**
- **What it is:** `Qwen3.6-35B-A3B-MLX-8bit`, 8bit, temperature 0, seed 20260921, at the runtime's default reasoning mode, prompt `e1e694b399d4`, normalization 2. This is the same identity the gate parsed with.
- **The input:** the gate record's own text, so only the day differs.
- **Where it is:** `work/0015-nested-protocols/run/NCT06090266.json`, a one-element array.

| | Gate (2026-10) | Gate replayed with the rule (`nested.test.ts`) | Fresh parse with the rule |
| --- | --- | --- | --- |
| Criteria kept | 34 | 44 | 45 |
| Recovered by a heading join | — | 10 | 5 |
| Rejected | 11 | 1 (B3) | **0** |
| Unclaimed passages | 6 | 8 | 7 |
| Loose | 0 | 0 | 0 |

**What it shows:**
- **6(d) passes.** Nothing was rejected, so no heading join was left behind.
- **The model joined differently this time.** It quoted the five infection items and the Cohort B3 requirement on their own (`appliesTo` "Cohort B3 (dose-expansion)"), and joined only the five cohort-only exclusions to "For Cohorts A2, B1, B2, and B3 only:". The rule recovered all five. Without it, this parse would have lost those five, not the gate's eleven.
- **34 of the 45 have the same span as a gate criterion.** The other 11 are those 10 items and B3.
- **The 7 unclaimed passages are all carve-outs:**
  - the clinically-stable ascites exception;
  - treated brain metastases;
  - the AJCC Stage 1 and resected-cancer exceptions;
  - stable HAART;
  - anti-HBV therapy;
  - hepatitis C virus-free by PCR;
  - hormone replacement.

  These are the replay's 8 without the B3 item, which was claimed this time.

**What it doesn't show.**
- **This is one sample.** The long protocol's parse moves between days (0011), and it did here. The gate's 11 rejections were one day's sample too.
- **The B3 shape** didn't recur, so the decision to keep refusing it hasn't been tested against a real parse.

## Review passes

Run 2026-10 at step 8, against `git diff origin/main...HEAD` (20 files), by Claude, the author. They aren't independent.

**Pass 1, plan compliance.**
- Every changed file is in "Files that change". The estimate test sits in `tests/scripts/trial-file.test.ts`, as step 5 allowed.
- Every "not touched" path is empty in the diff: the prompt, `normalize.ts`, `src/screening`, `server`, `web`, `transport`, `models`, `plain`, `evals/results`, `data`, `e2e` and README.
- Divergences are recorded where they happened:
  - `MARKER`'s `.)` (step 2, spec §2.1 amended);
  - R14 (step 4);
  - `parserWorkloadFor` and `scripts/lib/trial-file.ts` (step 1, spec §6.1 and §8 amended).
- **Important, fixed before the gate:** the step 3 and 4 records were missing from their commits (Records, step 4). The plan was current before the gate and before the run.
- No dependency was added, and no commit carries a Co-Authored-By trailer.

**Pass 2, correctness.**
- **The rule only runs on quotes that matched neither exactly nor loosely,** so no criterion kept before 0015 can change. A recovered one moves the cursor where a rejected one didn't. On the five labelled parses nothing is rejected, so nothing moves. The replay shows the gate's 34 kept spans unchanged.
- **`endOfList` advances on blank lines.** A heading on the text's last line gives an empty list, and so a refusal.
- **`heading` is optional.** Nothing that reads a stored parse validates keys strictly (`src/server/trial-store.ts` casts), and nothing displays it.
- **Nit, fixed:** `tests/scripts/trial-file.test.ts` built a path from `URL.pathname`, which percent-encodes spaces. It now uses `fileURLToPath`.
- **Nit, accepted:** `findJoined` scans the whole text once per colon per heading occurrence. It runs only on otherwise-rejected quotes, at most a dozen per parse.
- **No browser test was run,** because none of the page's paths changed.

**Pass 3, scope and data discipline.**
- **No patient data.** The run file and the gate record hold a public registry protocol, trimmed, with no contact details.
- **The one model call** was the local oMLX parse, through `createAdapter` for `omlx` with no `--spend`. The dry estimate sent nothing.
- **No network** beyond loopback, no secrets, no `.env` change, no deployment surface.
- **The coordinator still decides.** Nothing in the agent or review path changed.

**Pass 4, eval integrity.**
- **Existing tests were only added to.** The only removed line in `adversarial.test.ts`, `locate.test.ts` and `parse.test.ts` is one import, widened. The eight original adversarial cases and the expected-fail gap test are unchanged. Committed results re-grade unchanged.
- **Each new refusal fails without its clause.** Removing a clause of the rule fails at least one of them (Records, step 4). That's how R14 came to exist.
- **The run records** model, quantization, temperature, seed, prompt and normalization versions.
- **Nit, recorded:** CLAUDE.md asks a bug fix to commit its failing test first. This slice treated the rejections as a planned change to the check, not a bug fix. The replay test (step 4) came after the rule (step 2), in the order the approved plan set. The rule's unit tests came in the same commit as the rule.

**Pass 5, documentation.**
- **The README** is unchanged and still true: it claims adding any oncology trial by link, not that every criterion survives.
- **Every number in `docs/limitations.md` and the roadmap traces to a test or the run file:**
  - 10 of 11 and 8 unread: `nested.test.ts`;
  - nothing rejected, 5 recovered, 7 unread and 13 cohort-scoped: the run file;
  - 5 of NCT04385368's 12: its committed parse, read by hand.
- **Important, fixed at step 8:** the first draft of the roadmap and limitations said "most" of NCT04385368's 12 unclaimed passages were carve-outs. Read again, it's 5 of 12, and the other 7 are notes and site procedures. **Left as written:** the intent says the same ("mostly"). It was written before that reading, and it's kept as the record of what was believed then.
- **Limitations are stated:** carve-outs, cohort scope, the refused shapes, one sample, and trials added before 0015.
