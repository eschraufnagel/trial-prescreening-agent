# spec: 0006 plain language

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Intent:** `work/0006-plain-language/intent.md`

---

## 1. Summary

A script run by a person asks the local model for a plain-language rendering of each labelled criterion and commits the results under `data/plain/`. A deterministic check in `src/plain/` compares each rendering with its criterion as text. It decides whether the rendering may be shown, and when it may not, it says exactly why. The tester panel shows each criterion's protocol words with the plain rendering under them, or the reason there is none. All of this goes through `CriterionText`. The agent never sees a rendering. `PROMPT_VERSION` stays `c5778afe9cbd`, and 0004's numbers still describe the agent the page runs.

## 2. Decisions taken before this spec

| # | Decision | Consequence here |
| --- | --- | --- |
| D1 | The check is split. Code checks what can be matched as text, a person checks what is missing, and nobody checks whether an explanation is correct | §5 is the mechanical check. §8 is the reading, and its questions are about text only. The README names explanations as unverified (§12) |
| D2 | Display-only. The agent asks and reads from the protocol's words | Renderings are not a field on `ScreeningCriterion`, and `src/screening/` cannot import `src/plain/` (§9) |
| D3 | Something to read after the first stage, before the check exists | Renderings for one study are shown as *unchecked* in the first stage (§7.2). Gate 1 settles their format (§11) |

The intent's seven open questions are answered here:

| Intent question | Answer | Section |
| --- | --- | --- |
| 1. Where renderings live | `data/plain/<NCT ID>.json`. They are display data the app reads, not measurement. `src/plain/` loads them, the way `src/trials/` loads `data/trials/` | §4.3 |
| 2. One call per criterion or per study | One per criterion. Each rendering is independent, a failure touches one criterion, and a retry can target one | §4.1 |
| 3. Retry | One retry, told what the check found. Both attempts are kept, so the first-try pass rate stays reportable | §4.2 |
| 4. Parses | Not rendered in this slice. With `--source parse`, the panel says so once, at the top | §7.3 |
| 5. Scope words and matching words to symbols | A fixed list and a fixed table in `src/plain/vocabulary.ts`, reviewed at Gate 2 | §5.2, §5.3 |
| 6. Enforcing "statement, not rule" | Part of the check: a list of words that may appear in a rendering only if they appear in the criterion | §5.2 (rule 7) |
| 7. What the reading gate reads | All of NCT00077350, plus every rendering that passed only on retry, in every study | §8 |

## 3. What a rendering is

A rendering restates one criterion in plainer words. It is a **rewording, not a reframing**:

- **The same statement.** The criterion "Pregnant" becomes "Is pregnant", not "Cannot be pregnant" or "You can't take part if pregnant." A protocol "must not" stays a "must not." Polarity is shown by the existing tag, and never written into the sentence.
- **No subject, or the protocol's own.** "Patients must have…" may become "Must have…". A rendering never says "you."
- **Every number, unit, comparison, negation and named term kept.** Numbers are written as digits and copied exactly as written, including units such as `/mm^3` and `×10^9/L`.
- **Hard terms explained in passing.** Named terms (§5.1) stay as they are. Other medical words may be replaced by plain ones, with the protocol's word kept in parentheses. For example: "confirmed by a lab test on a tissue sample (histologically)". Gate 1 settles whether that is the right shape.
- **Short.** One to three sentences. There is no hard limit. Length is reported by `plain:check`, and Gate 1 may set a limit.

Every type is rendered, all 252 labelled criteria, including `protocol` and `definitional`. The agent never raises those, but a coordinator reads them.

## 4. Making renderings

### 4.1 The call

`renderPlain(adapter, criterionText)` in `src/plain/render.ts` makes one model call:

- **System prompt:** `src/plain/prompt.ts`. It carries the rules of §3, the check's rules written as instructions (§5.2), and four worked examples. **The examples come from outside the corpus**, hand-written in the house style of protocols that are not among the twelve, for the same reason the parser's do: an example drawn from the labelled studies would put part of the reading gate's material into the prompt.
- **User prompt:** the criterion text alone. It does not include the polarity, the type, the study or the other criteria. Polarity is left out on purpose, because a model told "exclusion" tends to write a rule.
- **Reply:** `{ "plain": string }`, validated. A reply that is empty, is not a string, or ends with `finishReason: "length"` counts as a failed attempt, with a reason. It is not an exception that stops the run.
- **Settings:** `OmlxAdapter({ thinking: false })`, temperature 0, the pinned seed, and `maxOutputTokens: 512`. Reasoning is off, as for the agent: it roughly halves the time per call, and the task is copying with substitutions, not reasoning.
- **`PLAIN_PROMPT_VERSION`:** a hash of the system prompt and the retry template (§4.2), made the same way as the parser's `PROMPT_VERSION`.

### 4.2 Retry

If the first attempt fails the check (§5), the script makes one more call. The user prompt then carries the criterion text, the first attempt, and the check's report, followed by: "Write it again, fixing only what the check found." A second failure is final, and the criterion is shown without a rendering. There is no third try: a retry loop tuned until everything passes would hide how often the first answer is wrong. The retry needs the check, so the script makes first attempts only until the check exists (plan, Stage B).

### 4.3 The file

`data/plain/<NCT ID>.json`, one per labelled study, committed:

```jsonc
{
  "nctId": "NCT00077350",
  "source": "labels",
  "run": { /* ModelRunMetadata: model, quantization, temperature, seed, adapter, thinking, promptVersion, timestamp */ },
  "renderings": [
    {
      "criterionId": "L5",
      "textSha": "…",            // SHA-256 of the exact ScreeningCriterion.text it was made from
      "attempts": [
        { "plain": "…", "reportAtGeneration": ["missing: within"] },
        { "plain": "…", "reportAtGeneration": [] }
      ]
    }
  ]
}
```

- **The check is re-run whenever a file is loaded.** `reportAtGeneration` records what drove the retry, but a rendering is shown or not shown according to the *current* check. When Gate 2 or Gate 3 tightens the check, a rendering that used to pass stops being shown without being regenerated, and the reason is visible. The shown text is the first attempt that passes the current check.
- **Stale means not shown.** If `textSha` does not match the criterion's text as `fromLabels` produces it today, the rendering is stale. A test over the committed files requires that none be stale.
- **One prompt version per file.** `plain:render` refuses to add to a file made with a different `PLAIN_PROMPT_VERSION`. With `--force`, it regenerates the whole study. A file never mixes prompts.
- **Not formatted by Biome.** The script writes `JSON.stringify(file, null, 2)` and a newline. `data/plain` is excluded in `biome.jsonc`, as `data/trials` is, so a regenerated file differs only where the renderings do.

### 4.4 The script

```
npm run plain:render -- NCT04316364        render one study, resuming
npm run plain:render -- --all              every labelled study
npm run plain:render -- NCT04316364 --force   start the study again
```

`scripts/render-plain.ts` loads labels through `fromLabels`, so the text is exactly what the agent and the panel use. It skips criteria already rendered under the current prompt version and not stale, and it writes the file after every criterion, so an interrupted run resumes. On a connection failure (`isConnectionFailure`), it stops and prints `check http://127.0.0.1:8000/health`, rather than recording a failed rendering the model never actually attempted. At the end, it prints the §6 summary for what it rendered. It is run by a person and is never part of `npm test`. Expected cost: about 252 first attempts plus retries, at a few seconds each with reasoning off, so under half an hour.

## 5. The check

`checkPlain(criterionText, plain)` in `src/plain/check.ts` is a pure function. It returns `{ pass: boolean, problems: Problem[] }`, where each problem has a category and a line a person can read. It uses no model and no dependency.

### 5.1 What it extracts

Both texts are first normalized on the check's side: `\^` becomes `^`, `×` and ` x ` between numbers become `×`, whitespace is collapsed, and matching ignores case. The check does not touch `normalize()` (intent, *absent on purpose*).

| Feature | How it is found |
| --- | --- |
| **Quantity** | A number (with commas, decimals, `×10^9`, `10^3`) plus the unit that follows it, if any. `100,000/mm^3` and `100000/mm^3` are equal. Time units match within a small synonym table (day/days/d, week/weeks/wk, month/months/mo, year/years/yr/yrs). Every other unit must be copied as written. Ranges ("18 to 75", "18-75") give two quantities |
| **Direction** | The comparison attached to a quantity: a symbol immediately before it (`>=`, `≥`, `>`, `<`, `≤`, `<=`), a phrase within four words before it, or a trailing phrase right after it ("or older", "or more"). Each belongs to one of four families: ≥, >, ≤, <. "Within", "in the last" and "in the past" put a duration in ≤. A quantity with no cue has no direction |
| **Anchor** | For a duration, the nearest following before/after word: {prior to, before, preceding, previous} or {after, following, since} |
| **Negation** | Occurrences of: not, no, n't, without, never, none, nor, neither, except, unless, other than, absence of, free of |
| **Named term** | An acronym or code (two or more capitals, or a letter-digit mix: `EGFR`, `T790M`, `PD-L1`, `ECOG`, `IIIa`), or a word ending in a drug-name stem from a fixed list (-mab, -nib, -tinib, -platin, -taxel, -abine, -trexed, -rubicin, -mustine, -lisib, -parib, -ciclib, and others the plan lists). The stems are standard drug-naming conventions, so a lookup, not a judgment |
| **Scope word** | From a fixed list, with a small set of plain-English synonyms: active; prior/previous/previously/before; current/currently/ongoing; any; all/every; only/alone/solely; known; suspected; confirmed; documented; symptomatic; asymptomatic; uncontrolled; untreated; stable; significant; or |

### 5.2 The rules

A rendering passes only if all of these hold. Each failure produces a problem line.

1. **Quantities, both ways.** Every quantity in the criterion appears in the rendering, and the rendering has no quantity the criterion lacks. *"missing: 100,000/mm^3"*, *"added: 6 months"*.
2. **Direction.** Each shared quantity has the same direction family in both texts, or none in both. *"direction: ≥ 3 weeks became ≤ 3 weeks"*, *"direction added to 18"*.
3. **Anchor.** Each shared duration has the same anchor, or none in both. *"anchor: 4 weeks before became after"*.
4. **Negations, counted.** The rendering has the same number of negations as the criterion. *"negations: 2 in the protocol, 1 in the plain"*. This is a count and not a pairing: code cannot tell which negation belongs to which clause. It is strict on purpose, because a double negative simplified to one is the kind of change a reader should see.
5. **Named terms, both ways.** Every named term in the criterion appears in the rendering, and the rendering has none the criterion lacks. An abbreviation the rendering adds, such as `NSCLC` after the spelled-out name, counts as added. The prompt says not to add one.
6. **Scope words.** Each scope-word group present in the criterion is present in the rendering. This is presence, not a count. The rule goes one way only, because a rendering that says "previous" where the criterion said nothing is caught by the reader as an addition (§8, question 2).
7. **No verdict wording.** The rendering contains none of these unless the criterion does: you, your, eligible, ineligible, eligibility, qualify, qualifies, qualified, take part, participate, join, enroll, enrol, enrolled, allowed, excluded, included. L18 in NCT00077350 says "are not eligible to enroll", so its rendering may say it too.

**Amended during implementation** (plan, "What changed during implementation", where each has its reason and its commit):

- Rule 4 also counts a negation written as a prefix ("un-", "non-"), after the full run showed a reversed "Non-leukocyte-depleted" passing. When the rendering has no verdict word, the protocol's negations that belong to a verdict ("are not eligible") are left out of the count, since the statement form drops the verdict. "With the exception of" counts like "except".
- Rule 5 takes a hyphenated word by its parts ("HIV-positive" names HIV).
- Rule 1 reads numbers written as words ("five").
- Rule 7 compares verdict words by family ("enrolment" allows "enrolled"), and requires a verdict with a condition ("eligible if…") to be kept, after the reading found one turned into a requirement.

### 5.3 The vocabulary

The cue phrases, the families, the stems, the scope list and the verdict list are all in `src/plain/vocabulary.ts`, as data, each with a comment. That file is what Gate 2 reviews and what a reading finding extends. Changing it changes what is shown (§4.3) without regenerating anything.

### 5.4 What the check does not see

These are written down as **known-gap tests** (§10), so the check's limits are recorded rather than assumed:

- An explanation that is wrong ("EGFR, a type of lung cancer").
- A clause dropped when it holds none of the extracted features.
- An "and" becoming an "or", or two conditions merged, when both texts still contain "or".
- A changed ordinary word outside the lists ("brain metastases" becoming "cancer that has spread").
- A negation moved to a different clause with the count unchanged.

## 6. What gets reported

`npm run plain:check -- [NCT ID]` is deterministic and uses no model. It loads the committed renderings, runs the current check, and prints each criterion as protocol words, plain words and verdict. It ends with a summary per study and in total:

- **First try:** attempt 1 passes the current check.
- **After retry:** attempt 1 fails and attempt 2 passes.
- **Not shown:** both attempts fail, or the rendering is stale or missing.
- The problem categories, counted.
- The median and longest rendering length against the criterion's.

The README's numbers come from this command at a named commit. The files it reads are committed and the command is deterministic, so every number can be traced back, as CLAUDE.md requires. The model settings come from the files' `run` blocks.

## 7. Showing it

### 7.1 Getting it to the page

- `src/plain/load.ts` reads `data/plain/`. `displayFor(criteria, file)` returns a `PlainDisplay` for each criterion id:

  ```ts
  type PlainDisplay =
    | { state: "shown"; text: string; attempt: 1 | 2 }
    | { state: "unchecked"; text: string }          // first stage only (§7.2)
    | { state: "failed"; problems: string[] }        // the report from the last attempt
    | { state: "stale" }
    | { state: "missing" };
  ```

- `scripts/app.ts` calls it when the source is labels, and adds `plain: Record<string, PlainDisplay>` to each `ServedStudy`. With `--source parse` it adds nothing.
- `src/server/` copies `plain` into `ConversationInspection`, unchanged, and only for a conversation whose own source is `labels`. A conversation restored from `chats/` keeps the source it was made with, so one made from parses never picks up label renderings by a shared id. The server does not interpret it. It is not saved in `chats/`, because it belongs to the renderings, not the conversation, and a conversation continued later shows the renderings current at that time.
- `ScreeningCriterion` does not change. `ConversationService` hands the session the same criteria it does today.

### 7.2 `CriterionText`

It takes `criterion` and an optional `plain: PlainDisplay`, and renders:

- **shown:** the protocol words, labelled *Protocol*, then the rendering, labelled *Plain language*. A rendering that passed only on retry carries a small *retry* tag, so a reader can see where the reading gate's attention goes.
- **unchecked:** the same, with the label *Plain language (not yet checked)*. This state exists only until the check lands in Stage 2. After that, the loader never produces it, and a test asserts so.
- **failed:** the protocol words, then *No plain version: the check found* and the problem lines.
- **stale / missing:** the protocol words, then *No plain version* and the reason in a few words.
- **absent** (no `plain` given): the protocol words alone, as today.

Below is the default. Beside is the alternative, and Gate 1 chooses. The panel is narrow, and two columns of long criteria would make each one taller rather than easier to read. The component remains the only one that reads `criterion.text`, and it becomes the only one that reads a `PlainDisplay`'s text.

### 7.3 The panel

With `--source parse`, the tester panel's heading note gains one line: *"Parsed criteria have no plain-language versions in this slice."* Nothing else in `TesterPanel` changes.

## 8. The reading

Gate 3's reading is done in the tester panel, in fake mode, by starting a conversation for the study. The scripted agent needs no model, and every criterion is listed from the first turn.

**What is read,** fixed now so it is not chosen by browsing:

- **All 37 criteria of NCT00077350.** It is not NCT04316364, whose renderings shaped the prompt at Gate 1, so it is not the study the prompt was tuned on. It has lab thresholds with `^`, washout windows in both directions, double negatives (L18) and a mix of types.
- **Every rendering in any study that passed only on retry.** These are the ones the model got wrong once, and the check is the only thing that says the second attempt is right.

**The two questions,** for each pair:

1. Is any word, number or condition on the left missing on the right?
2. Does the right add a condition, limit or requirement that is not on the left? An explanation of a word does not count.

**The record.** `work/0006-plain-language/reading.md` lists every criterion read, by study and id, and every *yes* with the words involved. A *yes* has two possible outcomes, and the record says which. Either it becomes a rule in `vocabulary.ts` with a mutation test (§10), and the rendering stops being shown, or it becomes a named known-gap test, and the rendering is fixed by hand-regeneration or accepted, with the reason written down. The README reports the count: "read N, found M, of which K are now caught by the check."

What this reading cannot establish, and the README says so: that the other ~190 renderings are faithful in the ways the check cannot see. It gives a rate on a sample chosen by rule.

## 9. Boundaries, asserted by tests

- **The agent cannot see a rendering.** Nothing under `src/screening/` imports from `src/plain/`, and a synthetic import proves the rule fires. `ScreeningCriterion`'s keys are asserted to be exactly `id`, `polarity`, `type` and `text`.
- **One place shows it.** The existing `readsCriterionText` rule is extended. No component other than `CriterionText` reads `.plain`'s `text` or `problems`, and a synthetic example proves it fires.
- **Model calls.** `src/plain/render.ts` takes a `ModelAdapter`. The existing rule that nothing outside `src/models/` uses `OmlxAdapter` as a value already covers it, and `scripts/render-plain.ts` constructs the adapter.
- **Unchanged and still asserted:** no network under `src/` beyond the three existing exceptions, and `src/` imports nothing from `evals/`. The transparency test from 0005 passes unmodified.

## 10. Testing

Everything is deterministic. The suite is at about 0.8 s. The check is string work, and the mutation tests run over at most 252 renderings × a handful of mutations each, so it should stay under a second. The plan measures it after the mutation tests land.

| Area | Tested with |
| --- | --- |
| **Extraction** | Hand-written cases for each feature in §5.1, taken from real criteria: `\>= 3000/mm\^3`, `1.5×10\^9/L`, "within 4 weeks prior", "\>= 3 weeks prior", "18 to 75", L18's double negative, `T790M`, `gemcitabine` |
| **Rules** | One passing and one failing case per rule in §5.2, each checking the problem line's wording |
| **Mutations over real renderings** | For every committed rendering that passes, each applicable mutation (drop a quantity, change a direction family, change an anchor, delete a negation, swap a named term, delete a scope word, add "you") must fail with the matching category. In Stage 2 this runs over the 24 from Stage 1, and later over all of them. A mutation that passes is a failing test, never a skipped one |
| **Known gaps** | §5.4's cases as `it.fails`, one per gap, so each is a visible, named test that turns red if the check ever starts catching it and the gap entry needs removing |
| **Committed files** | Every file in `data/plain/` parses, has one prompt version, has a full `run` block, has no stale rendering, and covers every criterion of its study. No `unchecked` state is produced once the check exists |
| **Display** | `displayFor` for each state; `CriterionText`'s choice of lines lives as a pure function in `src/web/logic.ts` and is tested there, as 0005 does |
| **API** | `ConversationInspection` carries `plain` with labels and not with parses; the chats file does not |
| **Render call** | With `FakeModelAdapter`: a valid reply, an empty reply, a `length` cut-off, and a retry prompt that carries the first attempt and the report |
| **Boundaries** | §9, each with a proof that it fires |

What the model writes is not tested here. It is read at the gates.

## 11. What the plan must gate

1. **After Stage 1: the shape of a rendering.** Renderings for NCT04316364 (24 criteria) exist, made with a first-draft prompt and no check, and are shown as *unchecked* under the protocol words in `npm run app -- --fake`. You read them. The questions: Is it easier to follow? Below or beside? Is one to three sentences right, or should there be a limit? Is "confirmed by a lab test on a tissue sample (histologically)" the right way to keep a term, or should the protocol word lead? Does the statement form ("Is pregnant", "Must not have had gemcitabine before") read acceptably? This guards Stage 2: the check's rules for named terms and scope words assume a format, and the mutation tests are built on these renderings. Getting it wrong costs rebuilding the check. None of the questions are clinical.

2. **After Stage 2: whether the check is right about the 24.** The check now runs, and the panel shows its verdict on each Stage 1 rendering. For every rendering it rejects, the question is whether the named thing is really missing or changed on the page. For example, is "within" really gone? That is a reading question. This guards Stage 3, because the full run's retries are driven by the check's report. A check that rejects good renderings sends good text back to the model with false instructions, and a loose one lets bad text through with nothing to retry. Both show up in every number Stage 3 produces. The vocabulary (§5.3) is also reviewed here, as a list of words, not as medicine. If the check rejects none of the 24, that is not a pass. The gate should then ask whether the mutations prove it can reject anything at all.

3. **After Stage 3: the reading (§8).** All 252 are rendered and checked. You do the reading and record it in `reading.md`. It decides whether these renderings are what 0007's coordinator pane builds on, or whether the prompt or check changes and the run is redone first. Getting it wrong means building the pane on renderings nobody has measured. The answer is not always yes: a found rate that is high, or a gap the check cannot learn, is a reason to stop and change the prompt.

## 12. Out of scope

- Any change to `src/screening/`, the prompts, `normalize()`, the simulator, the graders, the labels, the vignettes, or any committed result under `evals/results/`.
- Rendering parsed criteria (a carried-forward note says a run, not code, would add them).
- The coordinator pane, and applying polarity.
- An LLM judge of faithfulness, whether by the local model or any other. The frontier-model check of explanations is carried forward to 0008.
- Any rendering made at runtime, and any model call in `npm test`.
- New dependencies.

## 13. Documentation

**README:** a "Plain language" section. It covers what a rendering is and is not, the check and what it catches, the §6 numbers with the commit they came from and the model settings, the reading's result, and a plain statement that nobody on the project has verified the explanations of terms. One screenshot description or excerpt shows a criterion with its rendering, and one shows a criterion the check refused.

**CLAUDE.md:** `plain:render` and `plain:check` join the command table. `plain:render` needs oMLX, is slow and is run by a person. `plain:check` is deterministic. The layout gains `src/plain/` and `data/plain/`.

**ROADMAP:** 0006 is marked done. "Carried forward from 0006" gets at least these: the agent-fixes slice may feed checked renderings to the **ask** call only and must re-run the vignettes; 0008 can use the frontier model as an independent check on explanations; rendering the parsed criteria is a run, not code; and whatever the reading found that the check cannot learn.
