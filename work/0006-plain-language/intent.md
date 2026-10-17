# intent: 0006 plain language

**Author:** the repository owner
**Status:** Draft
**Date:** 2026-09
**Scope:** One slice. Each criterion gets a plain-language rendering, made by the local model ahead of time and committed. It is shown beside the protocol's words in the tester panel. A check decides whether a rendering may be shown. The agent is not changed (decision 2).

---

## Problem

The criteria are written for clinicians. "Platelet count \>= 100,000/mm\^3", "histologically confirmed NSCLC; cytology alone is not acceptable", "measurable disease, as defined by RECIST, within 4 weeks prior to registration". At 0004's Gate 2 I said that most people, me included, cannot follow them. That is still true on the page 0005 built. The tester panel shows each criterion in the protocol's words, so I can see what the agent recorded but often not what it recorded it *about*. The coordinator pane in 0007 will have the same problem, with a reader who has to act on it.

A plain-language version fixes the reading problem and creates a new one. It is a new model output, and the model can get it wrong in a way that is hard to see. "An active second malignancy" becomes "another cancer", and the word *active* is gone. "\>= 3 weeks" becomes "at least 3 weeks ago" in one place and "within 3 weeks" in another. "Cytology alone is not acceptable" disappears because it sounded like a detail. Each rendering reads fine by itself. The error only shows when it sits next to the original, and only to someone who knows to look.

Every model output in this project has shipped with a check built alongside it: the parser with 0003's harness, the agent with 0004's vignettes. This one needs its own. It has two constraints the earlier checks did not.

**Nobody here can judge medical equivalence.** I am not a clinician, and the labels and vignettes were written so that checking them means reading two sentences, not knowing medicine. A check that asks "does this mean the same thing?" asks the one question nobody on this project can answer. So the check has to be split. Code handles what can be compared as text. A person gets only a question about text: *is something from the left missing on the right?*

**Explanations cannot be verified here.** Most of what makes a rendering plain is explaining a term. "Histologically confirmed" becomes "confirmed by a lab test on a tissue sample." Whether that explanation is correct is a clinical question. This slice can make sure an explanation takes nothing away and adds no requirement. It cannot make sure the explanation is right, and it should say so rather than imply otherwise.

The scale is small enough to read, if the reading has a clear question. The five labelled studies have 252 criteria: 137 `clinical`, 61 `patient`, 30 `definitional`, 24 `protocol`. The median criterion is 91 characters long and the longest is 652. The five cached parses add 195 more.

## Proposed outcome

**Plain renderings, committed.** A script run by a person, like `parse:criteria`, asks the local model for a plain-language rendering of each labelled criterion, one at a time, and saves the results as files. Nothing is generated while the app runs. The page shows committed text, fake mode shows it too, and a rendering is fixed text that can be read, diffed and checked in `npm test`. Each rendering is tied to the exact criterion text it was made from. If a label's text changes, its rendering is stale and is not shown. The run records the model, quantization, temperature, seed and prompt version, as every result here does.

**A rewording, not a reframing.** A rendering says the same statement in plainer words. It keeps the protocol's form. If the protocol says "Pregnant", the rendering does not become "You can't take part if you are pregnant." If the protocol says "must not have received prior gemcitabine", the rendering keeps the "not". There are three reasons. The agent's findings (`holds`, `does-not-hold`) describe the statement, so the plain version has to be the same statement for a finding to read correctly beside it. The tester panel deliberately does not apply polarity, and a rendering written as a rule would apply it. And "you can't take part if" is one short step from an eligibility verdict, which no code path may produce.

**A mechanical check, in `src/` and run in `npm test`.** It compares a rendering with its original as text. A rendering may be shown only if it passes. At minimum, everything below from the original must appear in the rendering, and the rendering must not bring in any of them that the original lacks:

- every number, with its unit (`100,000/mm^3`, `3 weeks`, `90 days`)
- every comparison, and which way it points (`>=` and "at least", `<` and "under", "no more than")
- every time window, and which way it runs ("within 60 days", "at least 3 weeks prior")
- every negation ("not", "no", "without", "except", "unless")
- every named drug, gene, biomarker, variant and acronym (`gemcitabine`, `EGFR`, `T790M`, `RECIST`, `ANC`)
- a fixed list of scope words that change what is required: "active", "prior", "current", "any", "only", "known", "symptomatic", "uncontrolled", "significant", and the like. The spec settles the list.

The last rule is what catches "an active second malignancy" turning into "another cancer." The check reports exactly what failed, such as "missing: active" or "direction: >= became within", so a failure can be read at a glance.

**The check is tested against renderings broken on purpose.** 0002's quote-location net never fired, and that proved nothing about whether it worked. This check must not repeat that. Real renderings are mutated in each way the check claims to catch: a number dropped, a comparison flipped, a "not" removed, a drug name swapped, a scope word deleted. Each mutation has to be caught. The same tests also record what the check does not catch, as named cases, so the check's limits are written down rather than assumed.

**What happens when a rendering fails.** It is not shown. The tester panel shows the protocol's words, and a line under them says there is no plain version and why, using the check's own report. The agent abstains rather than guesses, and so does this. A reader can always see which criteria have a plain version and which don't. The spec decides whether the script retries once and tells the model what failed.

**A reading gate that asks only about text.** A person reads protocol and plain side by side in the tester panel and answers two questions for each pair:

1. Is any word, number or condition on the left missing on the right?
2. Does the right add a condition, limit or requirement that is not on the left? (An explanation of a term does not count as one.)

Neither question needs clinical knowledge. The mechanical check has already confirmed numbers, directions and names, so the reader looks for what code cannot see: a dropped clause, a merged "or", a qualifier missing from the list. The gate names in advance which criteria get read, chosen by a rule and not by browsing. The spec sets the rule. My proposal is one whole study plus every criterion that failed the check and passed on a retry. Whatever I find becomes a named mutation case where the check can learn it, or a named gap where it can't.

**Beside the protocol, in one place.** `src/web/CriterionText.tsx` shows the protocol's words and the plain rendering together, or the protocol's words and the reason there is no rendering. No other component changes how a criterion is displayed. The existing boundary test that allows only `CriterionText` to read `criterion.text` is extended to cover the rendering too.

**Numbers in the README.** How many of the 252 renderings passed on the first try, how many after a retry, and how many are not shown. What the reading gate found. A plain statement of what nobody on the project has verified: explanations of terms.

**Absent on purpose:**

- **No agent change.** The agent asks and reads from the protocol's words, and `PROMPT_VERSION` stays `c5778afe9cbd` (decision 2).
- **No coordinator pane.** The renderings are built so 0007 can use them, but this slice shows them only in the tester panel.
- **No plain renderings for cached parses.** At least not by default (open question 4). With `--source parse`, the panel says there is no plain version.
- **No generation at runtime.** No model call is made to display a page.
- **No LLM judge.** A second pass by the same local model, asking "is this faithful?", would be the author grading its own work. That is the flaw 0003 names in its headline number. An independent model check, which could also look at explanations, waits for the frontier model in 0008. It is written down as carried forward.
- **No fix to `normalize()`'s `\^`.** The renderings will see `mm\^3`, and the check has to handle it on its own side. Fixing `normalize()` changes the text the agent sees, and that belongs to a slice that re-runs the vignettes.

## Affected users and systems

**Me, reading the tester panel.** The main reader in this slice. The questions I am asked: is this easier to follow, is anything missing, does it add anything. None of them are clinical.

**The coordinator, in 0007.** The reader these renderings are really for. The format decided here, beside the protocol with the statement's form kept, is the one the pane inherits.

**The prospective participant.** Unaffected. Participants never see a criterion. They see the agent's questions, and those do not change in this slice.

**`src/screening/` and the agent.** Not touched. A test makes sure the agent cannot see a rendering: the rendering is not a field on `ScreeningCriterion`, and nothing under `src/screening/` imports the module that loads renderings. The transparency test from 0005 keeps passing unchanged.

**`src/models/`.** Used through the adapter, as by the parser. The rendering call is a new call, with its own prompt and prompt version.

**A new module under `src/`** for the rendering call and the check. The spec decides whether it is `src/criteria/` or its own directory. **A new script** under `scripts/` that runs the generation. **`scripts/app.ts`** loads the committed renderings and passes them to the server beside the criteria, the same way it passes labels today (0005 decision 3). **`src/server/`** includes them in the conversation response. **`src/web/CriterionText.tsx`** displays them.

**`tests/boundary.test.ts`.** Gains the rule that the agent cannot see a rendering.

**CLAUDE.md, the README and the roadmap.** A new command in the table, a section in the README, and a carried-forward list.

**Not touched:** `data/trials/`, `src/trials/`, `src/screening/`, `evals/cases/labels/`, the vignettes, and every committed result.

## Constraints

- **No eligibility verdict, even in wording.** A rendering restates a criterion. It never tells anyone whether they can take part. The check or a test rejects renderings written as rules ("you can", "you cannot", "you qualify", "not eligible" where the protocol doesn't say it).
- **The protocol's words are always on screen.** A rendering is shown beside the original, never instead of it. It helps with reading. It is not the criterion.
- **No gate needs clinical judgment.** Every question a person is asked is about text on the page.
- **The agent is unchanged, and that can be checked.** Same `PROMPT_VERSION`, same transparency test, and a boundary test that keeps renderings away from `src/screening/`.
- **Deterministic at runtime.** The model runs in a script run by a person, never in the app and never in `npm test`. `npm test` checks the committed renderings, with no model.
- **Every result records model, quantization, temperature and seed.**
- **No new dependencies.** The check is string work.
- **No PHI, no network beyond the existing exceptions, loopback only.** As before.
- **oMLX goes down.** The generation script resumes where it stopped and skips renderings already saved, as `eval:screening` does. When a call fails, it points at `http://127.0.0.1:8000/health`.

## Decisions

1. **The check is split between code and a reading, and the reading asks only about text.**

   Code checks anything that can be matched as a token: numbers, units, comparison direction, time windows, negations, named terms and a fixed list of scope words. It checks them in both directions, so nothing is lost and nothing is brought in. That covers the errors a quick reader is most likely to miss. A flipped `>=` or a dropped "not" looks fine at a glance.

   What code cannot see is structure. Two conditions joined by "or" can be merged into one. A clause can be dropped. An ordinary word outside the list can change the scope. Those go to a person, as "is anything on the left missing on the right?" That question can be answered by reading, because the reader compares words and does not have to understand them.

   What neither can check is whether an explanation of a term is correct. The slice limits the harm. An explanation can bring in no number, direction, negation, drug or biomarker, so it cannot quietly add a requirement. The protocol's words are always beside it. The README says that nobody here has verified the explanations, and an independent check is carried forward to 0008. The alternative was to forbid explanations. That would make the renderings safer and much less useful, and the reason for this slice is that the protocol's terms are hard to follow.

2. **The agent keeps asking from the protocol's words. Plain language is display-only in this slice.**

   *Two changes at once can't be told apart.* If the agent asks from the plain version and the vignette numbers move, it is not clear whether plain language made the agent better, or a rendering dropped a condition and the agent never asked about it. The only way to separate those is to first establish that the renderings are faithful. That is what this slice does.

   *The read call must judge against the protocol.* A finding says whether a statement holds, and the coordinator decides against the protocol. If the read call judged replies against a rendering, every flaw in a rendering would become a wrong finding: a confident answer about a slightly different criterion. That is the overconfidence 0004 measured and is trying to reduce. So even when the agent does use plain renderings, it should use them only for asking, never for reading.

   *The benefit is small until the renderings have been checked.* The ask prompt already tells the model to phrase questions in plain language, and participants never see a criterion. The one wording problem found by hand in 0005 ("on a scale of 0 to 1") is an agent fix. It is already on the roadmap's agent-fixes list, and a checked plain rendering is a good input for that fix.

   *The cost.* Re-running the vignettes takes about 12 hours of local model time. Spending that before the renderings are checked would measure an unknown. So the carried-forward note will say: once renderings pass this slice's gate, the agent-fixes slice may feed them to the **ask** call only, and re-run the vignettes.

3. **There is something to look at after the first stage, before the check is built.**

   The first stage generates renderings for one study, NCT04316364 (24 criteria, the study the example conversations use), with a first-draft prompt and no check. It commits them and shows them in the tester panel beside the protocol wording, in both the real and fake modes. At that point I can run `npm run app -- --fake` and read them.

   The gate after that stage decides the **shape** of a rendering before anything is built around it. Is it easier to read? Beside or below the protocol text? One sentence, or allowed to be longer? When a term is explained, does the protocol term stay in parentheses? Is the "statement, not rule" form readable, or does it read stiffly? The check's design depends on these answers. If protocol terms stay in parentheses, the named-term check becomes simple, and a check built for a different format would have to be rebuilt. Getting this wrong costs a check that no longer fits and a generation run that has to be redone. None of these questions are clinical.

   The later stages also end with something to look at. After the check lands, the panel shows its verdict on each of the 24 renderings, including the ones that fail. After the full run, all 252 are there, and the reading gate happens in the same panel.

## Open questions for the spec

1. **Where the renderings live.** They are a model output about labelled criteria. Cached parses sit in `evals/results/parses/`, but the app, not the eval, reads these renderings, and `src/` may not import `evals/`. Candidates: `data/plain/`, or beside the labels, loaded by `scripts/app.ts` the way labels are.
2. **One call per criterion or per study.** One call per criterion keeps each rendering independent, like the ask call. One call per study is faster and gives the model context, but a single failure then touches many renderings. It takes about 252 calls at roughly 7 seconds each, so half an hour either way.
3. **Retry on failure.** One retry, telling the model what the check found? Or none, so the first-try pass rate is the number that gets reported? A retry would report both numbers.
4. **Parses.** Render the 195 parsed criteria too, so `--source parse` shows plain language? It costs about 25 more minutes of generation and no more reading, if the gate covers only labels.
5. **The exact scope-word list, and how the check matches words to symbols** ("at least" to `>=`, "no more than" to `<=`, "within" to a window that runs backwards). It has to be tight enough that the mutation tests fail for the right reason, and loose enough that a good rendering passes.
6. **How the rule "statement, not rule" is enforced.** A list of banned phrasings in the check, a test over committed renderings, or both.
7. **What the reading gate reads.** One whole study plus the retried ones is the proposal. Whether that is enough to trust the other 200 is exactly what the gate should report, instead of assuming it.
