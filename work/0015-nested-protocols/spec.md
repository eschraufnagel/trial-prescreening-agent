# spec: 0015 parser on nested protocols

**Intent:** `work/0015-nested-protocols/intent.md` (accepted 2026-10)
**Date:** 2026-10

This answers the intent's open questions and states what is built. Section numbers are what the plan cites.

---

## 1. What changes, in one paragraph

`locateQuote` gains a third attempt, after the exact and the whitespace-loose match: a **heading join**. A quote that is a heading plus one of the items listed under it is located at the item, and the heading's span is returned beside it. `parseCriteria` records that heading on the criterion and counts it as claimed. Nothing else in the parser changes, and nothing outside it does, except one flag on `parse:criteria` so the out-of-sample run can read a trial that isn't pinned.

## 2. The rule

All of this works on the normalized text, which is what quotes are matched against today.

### 2.1 Terms

- **A line** is a run of text between line breaks. A **blank line** holds only whitespace.
- **A line's indent** is the number of space and tab characters before its first other character.
- **A list marker** is one of `*`, `-`, `•`, or a number of up to three digits, a single letter, or a roman numeral of up to five letters (i to x range, either case). The number, letter or numeral is closed by `.`, `)` or `.)`, and may be opened with `(`. (`.)` added at step 2: NCT03377023's `* A.)`, the form the next clause names, needs it.)
- **A line's lead** is its indent followed by at most two list markers, each followed by whitespace. Two covers forms like `* A.)` in NCT03377023.

### 2.2 When a quote is a heading join

The quote, trimmed, is tried at each `:` followed by whitespace, from left to right. At each, the part up to and including the colon is the candidate **heading** H, and the rest, trimmed, is the candidate **item** S. The first split that satisfies everything below wins. If none does, the quote is rejected as now.

1. **H is in the source, on one line.** H is found by the existing exact-then-loose matching, without crossing a line break.
2. **H is the whole heading.** On H's line, what comes before H is exactly the line's lead, and what follows H is only whitespace up to the line break or the end of the text.
3. **S is in the source, after H's line.** S is found by the existing exact-then-loose matching. It may cross line breaks, as any quote may.
4. **S starts an item.** On S's first line, what comes before S is exactly that line's lead, and S doesn't start with whitespace. S may begin with its own marker, as in "ii. Cohort B3 …", because a marker in S is then text found verbatim, and the lead before it is just the indent.
5. **S is inside H's list.** S's first line has a greater indent than H's line. Every non-blank line from the line after H up to and including S's first line also has a greater indent than H's line.

H may occur more than once in the text. Every occurrence is tried, those starting at or after the search cursor first and then the rest, as `findExact` falls back today. S is searched for only between H's line and the end of H's list (rule 5).

### 2.3 What it returns

`LocateResult` gains `heading?: SourceSpan`. For a heading join:
- `span` is S's span;
- `heading` is H's span;
- `nextFrom` is S's end;
- `loose` is true if either half needed the whitespace-loose match.

For an exact or loose match, `heading` is absent and the result is the same object as today.

### 2.4 What the rule refuses, on purpose

Each of these is a test in §5.2:
- a heading that isn't in the source, or altered by one character;
- an item that isn't in the source, or altered;
- a prefix that doesn't end in a colon at its line's end, including 0011's real stitch "Patients must have" + later text, and a colon partway along a line ("Vulnerable persons: subjects under judicial safeguard…" is a real line in NCT06090266, and a prefix ending at its colon fails rule 2);
- a heading that is only the tail of its line ("…The following are exceptions to this criterion:" in NCT04385368);
- an item from another heading's list, or after H's list has ended;
- the two halves in reverse order;
- an item that skips from one sub-item to a later one;
- a heading with no colon and an inline sibling between it and the item: the Cohort B3 quote (intent decision 4).

The tail-of-line heading and an unindented sub-list are refused although they may be honest joins. Nothing in the corpus or the gate trials has shown either, and widening the rule for a shape not yet seen is how the net loosens. They're recorded in `docs/parser.md`.

## 3. Types

- **`Criterion` gains `heading?: SourceSpan`.** It's present only on a criterion located by a heading join, and holds the heading's span in the original text. The doc comment says it is the parser's account of how it found the quote, like `loose`, and that the agent never sees it.
- **`ScreeningCriterion` and `fromParse` are unchanged.** The agent keeps its four fields. The model's `text` already carries the heading's meaning.
- **`ParsedCriteria.run` is unchanged.** No location version is recorded (intent open question 3):
  - The run descriptor names what the model was shown and how it answered.
  - Location is applied afterwards, and its result is stored in the parse itself: a recovered criterion carries `heading`.
  - No committed parse has a rejection the rule would recover, so no committed file changes meaning.
- **`RejectedCriterion` is unchanged.** Its reason stays "quote does not appear in the source text".

## 4. `parseCriteria`

- **`locateAll`** copies `heading` from the `LocateResult` onto the criterion, as it copies `loose`. Ids stay derived from the item's span, so a recovered criterion's id is `${nctId}:${start}-${end}` of its item.
- **`findUnclaimed`** counts each criterion's `heading` span as claimed, beside its `source`. The model did read the heading. Counting it is honest, and it keeps a short heading from tipping the gap after it over the 80-character threshold.
- **Nothing else.** The eval runner's quote counts (`rejected`, `loose`) don't gain a `joined` count. Committed results are re-graded by `npm test` and compared whole, and a new field would make every one of them differ. The parse itself carries the mark.

## 5. Tests

All deterministic, all under `tests/criteria/`, none calling a model. The gate record `work/0013-trials-by-link/gate/NCT06090266.json` is committed, so reading it keeps `npm test` passing from a fresh clone. Its `trial` is read through `validateTrial`.

### 5.1 The rule's own tests (`tests/criteria/locate.test.ts`)

Small invented texts, one per clause of §2.2, each with a passing and a failing case:
- the heading's lead;
- the line end after the heading;
- the item's lead, with and without its own marker;
- the indent of the item and of the lines between;
- a repeated heading resolved by the cursor;
- the loose flag carried from either half.

### 5.2 The net against heading joins (`tests/criteria/adversarial.test.ts`)

**A new `describe.each`, built like the existing one from real text.** Each case has a joined quote the rule must keep and an altered one it must reject. The kept ones:

| Name | Study | Kept |
| --- | --- | --- |
| infection list, item 2 | NCT06090266 (gate record) | "Recent or ongoing serious infection including the following: Uncontrolled infection with human immunodeficiency virus (HIV)." |
| cohort list, item 2 | NCT06090266 (gate record) | "For Cohorts A2, B1, B2, and B3 only: Interstitial lung disease." |
| a pinned study's sub-list | NCT00743379 | "8. Acceptable liver function:" without its marker, joined to its "a." item. The exact strings are fixed in the plan |

**The altered quotes,** one per refusal in §2.4. Exact strings are fixed in the plan.

**Also:**
- **The eight existing cases are unchanged.** Every one of them must still pass.
- **Both real 0011 rejections stay rejected.** Each quote is read from its committed parse file in `evals/results/parses/`, and fed back through `parseCriteria`.
- **The B3 quote stays rejected.** It's read from the gate record.

### 5.3 The replay (`tests/criteria/nested.test.ts`)

This rebuilds the gate parse and runs it through `parseCriteria` with a `FakeModelAdapter`:

- **The kept 34.** Each kept criterion's quote is the normalized text of its span, with its recorded fields.
- **The 11 rejected.** Each is its `raw` entry, as recorded.
- **The order.** Criteria are ordered by where each would be located, so the cursor sees them in document order.

It asserts:
- 44 criteria and 1 rejected, the rejected one being the B3 quote;
- 10 criteria with `heading`: five whose heading text is the infection heading and five the cohort heading, and each one's `source.text` beginning with the item's words;
- 8 unclaimed passages. That's the number the docs will quote, and the test is where it's traced.

**This is intent decision 6(a).**

### 5.4 The measured set

No new test. `tests/evals/committed-results.test.ts` re-grades every committed result from its committed parses, and it passes unchanged (decision 6(c)). The plan records that no file under `evals/results/` changed.

## 6. The out-of-sample run

### 6.1 `parse:criteria --trial-file <path>`

- **What it reads.** A JSON file holding either a trimmed study, or an app record whose `trial` field is one, as in `added-trials/` and `work/0013-trials-by-link/gate/`. The trial is read through `validateTrial`.
- **What it refuses.** It can't be combined with an NCT ID, `--all` or `--cache`. The cache is keyed for pinned studies, and the refusal says so.
- **Everything else is as today.** It's local unless `--model` says otherwise, and dry without `--spend`. `--json` writes the parse.
- **Where it lives** (amended in the plan). The reader is `readTrialFile` in `scripts/lib/trial-file.ts`. `parserWorkload` in `evals/estimate.ts` looks a study up by NCT ID, which an unpinned trial doesn't have, so it gains a sibling, `parserWorkloadFor(trials)`, that the flag's estimate uses.
- **Why a flag, not the app.** Adding the trial through the app would refetch it from ClinicalTrials.gov, and the protocol may have changed since 2026-10. Reading the gate record parses the same text the gate did, so the run differs from the gate only by the day.

### 6.2 The run

```
npm run parse:criteria -- --trial-file work/0013-trials-by-link/gate/NCT06090266.json \
  --json work/0015-nested-protocols/run/NCT06090266.json
```

- **When.** Made once, on oMLX, after the gate, with the rule frozen.
- **What's committed.** The output, with its `run` (model, quantization, temperature, seed, prompt and normalization versions).
- **How it's judged.** By intent decision 6(d), from the file:
  - the counts of criteria, recovered (with `heading`), rejected and unclaimed;
  - each remaining rejection's quote, read against the source and named as a heading join or not.

  It passes if no remaining rejection is a heading plus an item in that heading's list. The totals are recorded, not judged.

## 7. Documents

- **`docs/parser.md`.** The quote-check paragraph gains the heading join: what is accepted, and the shapes refused on purpose (§2.4), including the two honest ones left out.
- **`docs/limitations.md`.** The nested-protocol entry is rewritten from the replay and the run:
  - what is now recovered;
  - the one B3 shape still rejected;
  - carve-outs left unread, and which way that error points;
  - cohort scope not reaching the agent;
  - a trial added before 0015 has to be removed and added again to benefit.
- **`work/ROADMAP.md`.** The 0015 row and section marked done, "Carried forward from 0015", and the open-items table gaining carve-outs and cohort scope.
- **`CLAUDE.md`.** The `parse:criteria` row names `--trial-file`.
- **No README change.** It reports no findings, and the claim "add any oncology trial by link" stands.

## 8. Not touched

`src/criteria/prompt.ts`, `src/criteria/normalize.ts`, `src/screening/`, `src/server/`, `src/web/`, `src/transport/`, `src/models/`, `src/plain/`, `evals/` (results, parses, graders, cases and runner; only `evals/estimate.ts` changes, for §6.1), `data/`, `e2e/`.

The browser test isn't required, because none of the paths that call for it change.
