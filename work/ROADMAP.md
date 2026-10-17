# roadmap

What each slice covers, and which of the product intent's open questions it is expected to close.

This exists so a session starting cold knows what comes next without being told. If you find yourself explaining the next slice in a prompt, that explanation belongs here instead.

**Slices after 0002 are provisional.** Boundaries will move as earlier slices teach us things. What is not provisional is that each one is a separate `intent.md`, `spec.md`, `plan.md`, branch and PR.

---

| Slice | Covers | Status |
| --- | --- | --- |
| 0001 trial data | Fetch script, twelve NSCLC fixtures, loader | **Done** (PR #1) |
| 0002 criteria parser | Free-text eligibility block → structured criteria. First model use, so `src/models/` adapter lands here | **Done** (PR #3) |
| 0003 eval harness | Measures the parser. Golden set, graders, committed results | **Done** (PR #4) |
| 0004 screening agent | Multi-turn conversation, per-criterion determination with evidence, explicit abstention | **Done** (PR #6) |
| 0005 transport and API | `MessageTransport`, local Fastify API, a page to play the participant with a live tester panel | **Done** (PR #7) |
| 0006 plain language | Each criterion rendered in plain language beside the protocol's words, with a check that the rendering does not change what the criterion requires | **Done** (PR #8) |
| 0007 coordinator review pane | The handoff surface: determinations, evidence, unresolved criteria | **Done** (PR #9) |
| 0008 frontier adapters | Anthropic, OpenAI and xAI adapters behind `src/models/`, chosen by configuration per role, proven against recorded responses. Cost controls: estimate first, call cap, caching, batch, smallest-first defaults. Nothing calls a paid API unless the owner runs it | **Done** (PR #10) |
| *held* model comparison and independent checks | Local agent against a frontier agent on the same vignettes, and the independent checks that were waiting on a frontier model: a second annotator for the parser labels, a second vignette drafter, a check of the plain-language explanations. **Runs only when the owner says so** | Held |
| 0009 agent fixes | The overconfidence found in 0004, fixed in the order listed there, plus a way to say a criterion does not apply to the person. Iterated on new dev vignettes, re-measured once on the same fifteen, with the three least-seen v2 conversations reported apart. The review keeps serving 0004's run until the new one exists. Local model only | **Done** (PR #12) |
| 0010 browser end-to-end tests | A browser test of the page and the coordinator review, run by a person or an agent after UI work, never in `npm test`. The tooling decision 0001 deferred and nobody took. Also the review's data committed, so a fresh clone passes | **Done** (PR #13) |
| 0011 parser fixes | The parser's collapse toward `clinical`, its dropped site-facing requirements and the `\^` normalization gap. Measured by the parser eval; the screening run from parses was skipped (owner, 2026-09). Local model only | **Done** (PR #14) |
| 0012 close-out | A README for technical and non-technical readers: what the product does, what it found, and how it was built with the AI-native SDLC, with diagrams and screenshots. Open question 1 brought up to date, and the roadmap closed | **Done** (PR #15) |
| 0013 trials by link | A screen in the app to add, refresh and remove trials by ClinicalTrials.gov link or NCT ID. The server fetches the study, the local parser parses it, and it's offered for screening, marked as unmeasured. A narrow runtime network exception for clinicaltrials.gov. The pinned twelve stay as the measured set | **Done** (PR #18) |
| 0014 UI refresh | The page reorganised around what a person does: **Trials · Screenings · Reviews**, trial cards, a checklist of what the AI read, a folded tester panel, a scannable coordinator review (no verdict), deleting your own screenings, readable labels in place of names. From the owner's pick of Claude Design mockups. No model, no measurement | **Done** (PR #20; #19 merged into the 0013 branch by mistake) |
| 0015 parser on nested protocols | Stop the parser losing criteria when a long protocol nests them under a heading ("…including the following: Known active hepatitis C…"): 11 of 45 rejected and 6 passages unread on NCT06090266 at 0013's gate. Measured by a replay of the gate parse, adversarial tests and one fresh local parse | **Done** (PR #22) |
| 0016 polish | How the project looks to someone opening it: a README that opens with a demo of the real local model, screenshots from the real agent instead of fake mode, plain wording on the page (no slice numbers or run codes), examples grouped by trial, a favicon, the GitHub page's words and preview card, and a going-public check of the files. No model behaviour changes | **Done** (PR #23) |
| 0017 hosted providers in the app | A Settings screen: choose the local model, Anthropic, OpenAI or xAI for the agent and the trial reader, save a key on this machine, test it, cap what a screening and a trial read may spend. The constraint that kept the running app local, changed on the owner's decision and asserted by the boundary test. The page says where answers go and marks hosted results unmeasured | **Done** (PR #24) |
| *optional* simulator fidelity | A stronger check that the simulated participant says what its vignette says. It changes the ruler, so never in the same slice as an agent change | **Not doing** (0012): every screening number already carries the simulator caveat, and the PoC's question doesn't turn on it |
| *optional* more labels | Label the seven unlabelled studies, so the parser eval covers twelve, not five | **Not doing** (0012): labels by the same author add coverage, not independence. The held second annotator is the real check |
| *optional* plain-language follow-ups | Renderings for parsed criteria, and the explanations refused for a negation | **Not doing** (0012): display only, and the review works without them |
| *optional* CI for the deterministic checks | A GitHub Actions workflow running `npm test`, typecheck and lint on every push and PR, so a skipped check or a commit from a dirty machine is caught by something other than its author. Not the browser test, and no model | **Not doing** (owner, 2026-09): one author on one machine, and `npm run check` gates every commit. A sensible first step if the repository gains a second contributor |

**Renumbered in 0005.** Plain language was carried forward from 0004 as the next thing to do. 0005's intent (decision 1) gave it a slice of its own, after the transport and before the coordinator pane, because it is a new model output that needs its own check, and because the pane is its main reader. The coordinator pane moved from 0006 to 0007, and the model comparison from 0007 to 0008. The documents for 0001 to 0004 keep the numbers they were written with, so "0006" there means the coordinator pane and "0007" the comparison. Comments and living documents were updated in 0005.

**Rescoped in 0008.** 0008 was the model comparison. It now builds the frontier adapters and uses none of them, because no paid API is used until the owner decides to. The comparison, and the independent checks earlier slices assigned to "0008" (0003's second annotator, open question 6's second drafter, 0006's check of explanations), moved to the held row above. Where a carried-forward note below says 0008 will do one of those, read it as the held slice.

**Planned after 0008.** Written at the end of 0008, when the owner asked for everything left to be placed before handing the project to a new session.

**Closed in 0012.** 0012 was the last planned slice. Every row is Done, Held or Not doing, and nothing is next. The held comparison is the only open door, and it opens only on the owner's word.

**Reopened after 0012.** The owner's aim was always a screener for any oncology trial, not for twelve. 0013 adds trials by link. Other conditions remain out of scope.

**After the close.** PR #16 rewrote the README for someone new to the repository, without findings, and replaced the owner's name with "the owner" across the repository. It was not a slice and changed no behavior.

---

## Where the project stands

**Closed (0012).** The product intent's "done" is met:

- A coordinator-facing review pane showing a completed screening: 0007.
- A README reporting what the harness measured, including where the system fails: kept current by every slice, and given a plain-language top layer in 0012.
- A `work/` directory showing the loop running: fourteen slices, each an intent, spec, plan and PR.
- The secondary artifact, the README's account of where the playbook was adapted for a solo project, is "How it was built" (0012).

What the slices bought, in order:

1. **0009 agent fixes:** confidently wrong from labels on the twelve went from 0.14 to 0.06, at the cost of abstention rising from 0.01 to 0.07.
2. **0010 browser end-to-end tests:** `npm run test:e2e` drives the page in Chromium in about 13 seconds, and `npm test` passes from a fresh clone.
3. **0011 parser fixes:** reach from parses rose from 84 to 120 of 183 patient facts. It didn't generalize much to the held-back studies, it costs coverage on the longest protocol, and it was stopped before its screening run.
4. **0012 close-out:** the README for everyone, and the roadmap closed.
5. **0013 trials by link:** any trial can be added on the app's Trials screen by its ClinicalTrials.gov link, then fetched, parsed on the local model and screened against. On three real oncology trials, short and mid-length protocols parsed cleanly. A long nested one lost 11 criteria, and the screen now says so.
6. **0014 UI refresh:** the page a newcomer can use: Trials as the home page, a checklist of what the AI read before screening, Screenings and Reviews, a coordinator review that opens with what's left to do. Built from mockups the owner picked.
7. **0016 polish:** the README opens with a 27-second demo of the real agent on the local model, and every image shows the real agent. The page lost its internal vocabulary. The repository is ready for the owner to publish as a new public one (`work/0016-polish/going-public.md`).
8. **0017 hosted providers in the app:** anyone can try the real agent by pasting a key in Settings, at about $0.03–0.33 a screening on the cheapest models. Anthropic's adapter has met the live API (smoke run and the owner's own screening); OpenAI's and xAI's are offered as untested.

**Every slice ran on the local model, for free.** The held comparison is the only row that spends money, and it starts only on the owner's word.

## The remaining slices

Each gets its own `intent.md`, `spec.md`, `plan.md`, branch and PR, as CLAUDE.md sets out. What follows is what each intent has to settle, not the intent itself.

### 0009 agent fixes

**Done.** What follows is the plan as written before it. What happened is in "Carried forward from 0009" and `work/0009-agent-fixes/plan.md`.

**What to fix, from 0004's Gate 3 attribution of the 24 confidently wrong findings from labels:**

- **The 16 agent faults, in 0004's order.**
  1. 6 missed self-corrections.
  2. 4 exclusions read backwards: prohibitions such as "never smoked" and "no anticancer therapy".
  3. 4 answers settled that needed interpretation.
  4. 2 vague yeses accepted.

  0007's reading adds that half-hearted agreements ("I suppose so") and judgment answers ("I could quit if I had to") are the same class as the last two.
- **The 6 "does not apply" findings.** A criterion about the other sex was recorded as does-not-hold. The vignette convention is `defer`, so any abstention is right. The agent needs a way to say a criterion does not apply to this person. It should record an unresolved finding with its own reason, not a new status, so the review's groups and `tests/web/review.test.ts` still hold. The grader needs no change.
- **The 2 simulator distortions are not the agent's.** Leave them, and leave the simulator alone in this slice.

**The three least-seen v2 conversations go to 0009 (owner, 2026-09).** They are `NCT03433469-v2`, `NCT04385368-v2` and `NCT06728852-v2`, holding 7 of the 24. Being precise about what they are:

- They were never read in the coordinator review. That's what 0007 held them back for.
- They *were* read at 0004's Gate 3, which attributed every wrong finding. Their failures are known by kind, not unseen.

So in 0009:

- Nobody designing fixes reopens their old conversations or graded findings. They are still in `evals/results/screening/01-c5778afe9cbd.json`, and tests load that file.
- After the re-run, their before and after are reported apart from the other twelve, as the subset least looked at while fixing.
- With 7 wrong findings between them, that is a small number. The README says so.
- No human blind reading of them is planned. Once 0009 changes the agent, a blind reading of the old conversations would measure a review of an agent that no longer exists.

**Constraints the intent must keep:**

- **No tuning on the scored vignettes.** 0004 iterated on the dev vignette alone. The failures here were found on the scored fifteen, so fixing them from those transcripts is fitting to the test set, and the headline will flatter the fixes. The intent should say how that is limited. The likely answer: new dev vignettes, one or more per failure class, written under `evals/cases/VIGNETTES.md`'s rules; iterate on those only; run the fifteen once, at the end. The three v2 are the least-contaminated view.
- **Don't change the ruler.** The grader (v3), the simulator (`5fd4476340c9`) and the vignettes stay as they are, so before and after are comparable. `PROMPT_VERSION` changes, which is the point.
- **Keep the agent's transparency.** 0005's test drives one scripted conversation directly, through `MemoryTransport` and through HTTP, and requires identical state. It must keep passing.
- **Repoint the review.** After the re-run, `EVAL_RUN` in `scripts/app/eval-run.ts` names the new run. The review's tests (`tests/fixtures/eval-run.ts`, `tests/web/review.test.ts`) run over it.
- **The full run is about 12 hours** on oMLX, and resumes after interruption. It is a gate: a prompt fault found afterwards means spending it twice. oMLX goes down; check `http://127.0.0.1:8000/health` before assuming the code is wrong.
- **No gate needs clinical judgment.** The vignettes' expected outcomes settle what's right. Attributing the new run's wrong findings (0004's Gate 3 again) is a reading of transcripts. Its value is partly independence from whoever wrote the fixes, so say so when presenting it.

**Decisions the intent should take, with a recommendation:**

- **Whether the ask call gets checked plain-language renderings**, to fix questions like "on a scale of 0 to 1" (0005, 0006). Recommend no. No metric measures question wording, so the change would be unmeasured. It would also cross the 0006 boundary that keeps `src/screening/` from importing `src/plain/`.
- **Whether to reorder the prompts so they could cache on a frontier model** (0008). Recommend no. It changes the local agent for a benefit that exists only with a paid API, and muddies what caused any change in the numbers. The held comparison can do it.
- **Whether to narrow the verdict-language pattern** (0004), which over-matches the criteria's own words. Recommend yes, since the re-run's transcripts will be read against it anyway.

### 0010 browser end-to-end tests

**Done.** What follows is the plan as written before it. What happened is in "Carried forward from 0010" and `work/0010-browser-e2e-tests/plan.md`.

**Nothing has ever driven the page in a browser.**

- `tests/web/` tests the review's logic as plain functions in Node, and the server's routes are tested over HTTP.
- 0001's plan deferred "Playwright or similar" to the first slice with a UI, and neither 0005 nor 0007 took it up.
- 0007's blind reading was done by an agent driving Chrome by hand, not by a test.

**The intent has to settle:**

- **The tool.** Playwright, or `@vitest/browser-playwright`, which already sits in the lockfile as an optional peer of Vitest. Either is a new dependency, which CLAUDE.md makes a plan-level decision. Browser binaries are downloaded at install, which is a network step like `npm install`.
- **Where it runs.** Not in `npm test`, which is deterministic and under a second. It needs its own `npm run test:e2e`, against `npm run app -- --fake` so no model is needed, run after UI work.
- **What it covers.** At least:
  - start a fake conversation, answer it, and see the tester panel update;
  - finish it and open its coordinator review;
  - open an eval-run conversation in the review;
  - the model-down notice;
  - a second message refused while the agent works;
  - 0009's new words: a row closed as "said it doesn't apply to them", and a clinical row reported that way.
- **The loop, written down.** CLAUDE.md doesn't describe a browser check today. Its "Verifying your work" table and its PR checklist only list `npm test`, typecheck and lint. This slice adds `npm run test:e2e` to the table, with the rule that any change to `src/web/`, `src/server/` or the page's build runs it before a PR. `REVIEW.md` gains the question for its passes: did a change to the page run `test:e2e`, and did it pass? Until then, a page change is checked by typecheck and by `tests/web/` in Node, never in a browser (the owner asked, 2026-09).

**The review's data isn't in the repository** (found in 0009's intent). `loadEvalRun` reads the named run's 30 conversation files from `evals/results/screening/conversations/`, which is gitignored, so `npm test` and the page's review pass only on a machine with that cache. Committing what the review reads for one run is about 0.9 MB of JSON. This slice has to run the page from a clean state, so it decides whether that is committed, generated or replaced by a smaller fixture.

**Where it goes in the order.** It can move ahead of 0009 if the owner wants the loop first. 0009's only page change is the words for a new unresolved reason.

### 0011 parser fixes

**Done.** What follows is the plan as written before it. What happened is in "Carried forward from 0011" and `work/0011-parser-fixes/plan.md`.

**What to fix, from 0003 and 0004:**

- **The collapse toward `clinical`**, the highest-leverage parser change. 22 `patient` and 7 `protocol` criteria were typed `clinical`, and only 84 of 183 patient criteria reached the agent intact from parses. On NCT04385368, 39 of 57 were mis-typed.
- **Dropped site-facing requirements.** 10 of the 16 genuine misses are `protocol` criteria in NCT04385368.
- **`normalize()` doesn't unescape `\^`**, so exponents reach the model as `mm\^3`.

**How to re-measure:** the parser eval (about 45 minutes, and it slows as a batch goes on), then screening from parses, which is where a parser change shows as reach.

**Also worth adding:** the adversarial cases 0002 asked for, so the quote-location safety net, which has never fired, is proven to fire.

**The parser's reasoning mode** still runs at the runtime default. If this slice touches it, the result records it.

### 0012 close-out

**Done.** What follows is the brief as written before it. It grew, on the owner's direction, into a README for technical and non-technical readers, with the product and the AI-native SDLC shown in diagrams and screenshots. See `work/0012-close-out/`.

- **The README section the product intent promises:** where the intent → spec → plan → PR loop was adapted for a solo project, and why. For example: gates delegated and recorded as such, Claude-authored labels and vignettes with their independence caveats, review passes run by the author's own tools, and the reading gate's fallback to a model reader.
- **Open question 1 restated with 0009's numbers.**
- **The roadmap closed:** each remaining row marked done, held or not doing, with a reason.

### 0013 trials by link

**Done.** What follows is the brief as written before it. What happened is in `work/0013-trials-by-link/` and "Carried forward from 0013". One divergence: the fetch lives in `src/trials/registry.ts`, not `src/server/`, beside the trimming it shares with the fetch script (intent decision 4).

**Decided by the owner (2026-10):**

- **Any oncology trial, added from the page.** A simple screen lists trials, takes a ClinicalTrials.gov link or NCT ID, and can refresh or remove an added one. The pinned twelve show read-only. Other conditions are out of scope, but nothing enforces that.
- **A narrow runtime network exception.** The server may fetch `https://clinicaltrials.gov/api/v2/studies/{NCT ID}`, from one named file under `src/server/`, only when someone clicks Add or Refresh. `tests/boundary.test.ts` pins it like the model hosts. CLAUDE.md's constraints and the product intent's "single condition" and "frozen trial corpus" are amended in the same slice. Model calls are unchanged: parsing is local only.
- **A short slice.** Brief intent, spec and plan, one gate, one PR.

**What the intent has to settle:**

- **Where added trials live.** They're user state, like `chats/`: a gitignored directory with a `--trials-dir` flag, holding the trimmed study and its parse. Nothing under `tests/` reads it.
- **Fetch code moves into `src/`.** `scripts/fetch-trials.ts` fetches and `src/trials/trim.ts` trims. The fetch has to sit in the excepted server file, and the script should share it rather than copy it.
- **Parsing takes about four minutes a trial on oMLX.** Each row shows fetching, parsing, ready or failed. Parses run one at a time, and a parse interrupted by a restart is marked failed, not left hanging.
- **Refresh and remove.** Refresh refetches, and reparses only if the eligibility text changed. A conversation already held keeps the criteria it ran with. Removing a trial takes it off the start page, but its saved conversations stay reviewable.
- **Unmeasured is said, not measured.** The parser was graded on five labelled lung cancer trials only. An added trial says so on the start page and in the coordinator review. No new eval runs.
- **Which pinned trials are offered.** Today only the five labelled ones are. The other seven could be served from a cached parse where one exists.
- **Plain language.** Added trials have no renderings. It's display only, so leave it out unless it's cheap.
- **Fake mode and the browser test.** With `--fake`, Add reads a saved study response and a canned parse, so `test:e2e` gets a deterministic add, refresh and remove case.

**The gate, suggested:** after the fetch, parse and store work, and before the screen is built, the owner adds two or three real oncology trials of their choosing and screens against one. That decides whether parses of unseen trials are usable enough to put behind a button, which the screen's whole cost depends on. If they aren't, the slice stops at a documented limitation.

### 0014 UI refresh

**Done.** Not planned before it: the owner asked for a design and usability update after 0013, picked option A of Claude Design mockups (https://claude.ai/artifact/Uht1U7kkVxYb1mMKmcJXER, private to the owner), and added three requests at the gate: a scannable coordinator review, deleting screenings, and the question of names. See `work/0014-ui-refresh/`.

### 0015 parser on nested protocols

**Done.** What follows is the brief as written before it. What happened is in `work/0015-nested-protocols/` and "Carried forward from 0015". Two divergences, both from its intent:
- the fix went in the location check, not the prompt;
- it wasn't measured on the parser eval. It can't move the eval, because the five labelled parses have nothing rejected, and committed results re-grade unchanged.

**Chosen by the owner (2026-10)** from the options left after 0014, as the biggest weakness for the product's aim: any oncology trial added by link.

**The failure, from 0013's gate** (records in `work/0013-trials-by-link/gate/`):
- NCT06090266 (melanoma and solid tumours, 10.8k characters, cohorts): 34 criteria kept, **11 rejected** and **6 passages unclaimed**.
- **The rejected quotes join a heading to its sub-item**, for example "Recent or ongoing serious infection including the following: Known active hepatitis C as determined by…". Text like that isn't in the source verbatim, so `locateQuote` rejects each one. They include the HIV, hepatitis B and C and tuberculosis exclusions, and five "For Cohorts A2, B1, B2, and B3 only:" exclusions.
- The unclaimed passages include a cohort's prior-therapy requirement and the brain-metastases conditions.
- The short (NCT05854498) and mid-length (NCT06927180) gate trials lost nothing.

**What the intent has to settle:**
- **Where the fix goes.** In code, `locateQuote` could accept a heading-plus-sub-item quote by locating the sub-item and keeping the heading as context in `text`. In the prompt, the model could be told to quote only the sub-item and carry the heading in `text` or `appliesTo`. A code fix is deterministic and doesn't flip whole blocks; 0011 found that small prompt changes do (see "Carried forward from 0011").
- **What "fixed" means, fixed before any run.** At least: NCT06090266's rejections fall from 11 toward 0 without accepting quotes that aren't in the source. The quote check is the safety net, so loosening it needs its adversarial tests kept, and new ones for the new shape. The unclaimed passages drop. Nothing gets worse on the five labelled studies by the parser eval.
- **How many runs.** Proportionate (see 0011's stop). The long protocol's parse moves between days, so one before-and-after on the gate trial is one sample. Name the claim each run supports, in one line.
- **Labels.** NCT06090266 isn't labelled. Counting rejected and unclaimed is a deterministic measure that needs no labels. Labelling it would add coverage, not independence.

**Not in scope:** the overall suggestion in the review, plain language for added trials, and the paid model comparison.

### 0016 polish

**Done.** Not planned before it: the owner asked for polish after 0015, so the project reads well to someone browsing it. Scope chosen by the owner (2026-10): real-model screenshots, an animated demo, page polish, the README and GitHub page, and readiness to go public as a new repository without this one's history. See `work/0016-polish/`. One gate, the look before capture, answered go.

### 0017 hosted providers in the app

**Done.** Not planned before it: the owner asked for no-code configuration after 0016, so that a newcomer could pick a provider and paste a key. Decided by the owner (2026-10 and 17): the running app may use a hosted provider chosen in Settings; keys are remembered on this machine; the choice covers both the agent and the trial reader; all three providers are offered, OpenAI and xAI marked untested. Two gates, both the owner's, both passed: the Anthropic smoke run (gate 1, $0.002) and a live screening through Settings (gate 2, about $0.02). See `work/0017-hosted-providers/`.

### Held: model comparison and independent checks

Unchanged from 0008, and it runs only on the owner's word.

- It starts with `npm run models:smoke -- anthropic --spend` (under a cent). Then it answers how many runs per vignette an unseeded model needs, before any comparison.
- The independent checks, to repeat 0008's note: a second annotator for the parser labels, a second vignette drafter, a check of the plain-language explanations, and any later model reading. A non-Anthropic provider is further from the author of the labels, vignettes and renderings than Claude is.

## Not doing, on purpose

These are out of the PoC's scope, and each has a reason recorded where it was found:

- **Recording a coordinator's decision** (0007). It belongs to a system with real coordinators.
- **Merge-and-rerun for a second message** (0005). A real text channel needs it, and this PoC has none.
- **Locking `chats/` against two writers** (0005). One person on one machine.
- **A thirteenth protocol** (0002). The formatting axis is spent.
- **Anything production:** SMS, deployment, IRB, real patients (product intent).

## Where every open carried-forward item went

The "Carried forward" lists below are history, each written at the end of its slice. This table is where each item that is still open lives now. An item not listed was resolved by a later slice. For example, plain language (0004) became 0006, and the coordinator pane (0005) became 0007.

| From | Item | Goes to |
| --- | --- | --- |
| 0002 | The quote-location safety net has never fired | Done in 0011: adversarial tests, and it fired on two real parses. Its gap, a faithful quote under a reversed statement, is below |
| 0002 | `definitional` is barely exercised (one study) | Not doing (0012), was: optional more labels |
| 0002 | `confidence` is weak (0.8–1.0) | Known. Not used as a filter |
| 0003 | Drops site-facing requirements; types collapse toward `clinical`; merge rate 0.20 | Not doing (0012): known limitation. Was: 0011 fixed most of the collapse. The drops and bundling are still open, and noisier than 0003 showed. A later parser slice |
| 0003 | Labels and prompt share an author | Held, second annotator |
| 0003 | Seven of twelve studies unlabelled | Not doing (0012), was: Optional more labels |
| 0003 | `normalize()` doesn't unescape `\^` | Done in 0011 (with `\&`) |
| 0004 | The parser's cost is reach (84 of 183 intact) | 0011: 120 of 183, from the parse. Not yet screened from |
| 0004 | Reasoning mode is part of the experiment | Recorded on every parse since 0011. Not varied: 0011's reasoning-off run was skipped. Held comparison |
| 0004 | The simulated participant invents, and its checks are weak | Not doing (0012), was: Optional simulator fidelity |
| 0005 | The agent asked "on a scale of 0 to 1" and assumed "childbearing age" | Not doing (0012): known limitation. Was: Not fixed: 0009 left the ask call alone (D2), and it still asks "0 to 1". A later agent slice, if question wording gets a measure |
| 0005 | A second message is refused; `chats/` has no locking | Not doing |
| 0005 | `vmThreads` would halve `npm test` | Not needed while it's under a second |
| 0006 | Explanations of terms unchecked (L67 "IP", L49 "allogeneic") | Held, independent checks |
| 0006 | Most refusals are negations inside explanations; parsed criteria have no renderings | Not doing (0012), was: Optional plain-language follow-ups |
| 0006 | The ask call could use checked renderings | Not doing (0009 D2): unmeasured, and crosses the 0006 boundary |
| 0007 | The reader's model wasn't recorded | Not doing (0012): known limitation. Was: Any later reading records it |
| 0007 | A missed self-correction is only in the transcript | Not doing (0012): known limitation. Was: Still true: 0009 still misses a correction volunteered about something else, and the review doesn't show `statement` or `withheld`. A later agent or review slice |
| 0007 | The simulator can drop a scripted line | Not doing (0012), was: Optional simulator fidelity |
| 0007 | No recording of a coordinator's decision | Not doing |
| 0008 | No adapter has seen the real API; the estimate is uncalibrated | Held (smoke first) |
| 0008 | Variance first; which parser a frontier agent screens from; screening batch | Held |
| 0008 | Caching needs the prompts reordered | Held (0009 D3) |
| 0008 | The parser's reasoning mode differs by provider | Held |
| 0008 | xAI Chat Completions legacy; Luna's cache writes unpriced | Held |
| 0009 | The agent's reasoning mode as a lever against overconfidence | Held comparison, or a later agent slice. Not 0009 |
| 0009 | A correction volunteered in a reply about another criterion is still missed | Not doing (0012): known limitation. Was: A later agent slice (a separate correction check, one more call per turn) |
| 0009 | Abstention cost: "I'm a man" read as does-not-apply to pregnancy; plain denials held back from a hedging persona | Not doing (0012): known limitation. Was: A later agent slice |
| 0009 | The review shows neither `statement` nor `withheld` | Not doing (0012): known limitation. Was: A later review slice |
| 0009 | One run per agent; noise not measured | Held comparison (variance) |
| 0009 | Gates 1 and 3 read by a model, not a person; the author overrode four of Gate 3's calls | Held, independent checks |
| 0010 | `--source parse` serves no studies from a fresh clone; the parse cache is gitignored | Done in 0011: parses are committed |
| 0010 | The browser test runs the scripted agent only; the page on the local model is tried by hand | Known. Not planned |
| 0010 | The mutation pass was chosen by the tests' author | Known. Recorded in 0010's plan |
| 0010 | Nothing runs on GitHub: every check is run by hand, on this machine, by whoever commits | Not doing (owner, 2026-09) |
| 0011 | NCT04385368's parse isn't reproducible across days; same-day repeats are identical | Not doing (0012): known limitation. Was: Known. Any later parser slice measures that study more than once |
| 0011 | The quote check can't catch a faithful quote under a reversed statement | Not doing (0012): known limitation. Was: A later parser slice |
| 0011 | The new parser drops 23 of NCT04385368's labels and bundles more on NCT00077350 | Not doing (0012): known limitation. Was: A later parser slice |
| 0011 | Nobody has screened from 0011's parses | Not doing (0012): known limitation. Was: A later run, when wanted (6–7 h) |
| 0013 | The parser joins headings onto sub-items in long, nested protocols | Done in 0015: the location check accepts a heading joined to its own item |
| 0015 | Carve-outs: a rule's exception is left unread | Open. A later parser slice (a prompt change, measured as 0011 was) |
| 0015 | Cohort scope (`appliesTo`) never reaches the agent or the page | Open. A later agent slice (changes `ScreeningCriterion`, re-run the vignettes) |
| 0015 | Three possibly honest join shapes, and B3's, refused | Known. Pinned by tests; widened only when one is seen |
| — | README note on where the playbook was adapted (product intent) | Done in 0012: "How it was built" |

---

## Open questions, and who owns them

Numbered as in `work/0000-product/intent.md`.

| # | Question | Owner | State |
| --- | --- | --- | --- |
| 1 | Augmentation or replacement — which claim this project makes, and on what evidence | 0007, restated in 0009, closed in 0012 | **Answered as far as a PoC can:** replacement is not argued (confidently wrong 0.15 in 0004, 0.06 after 0009's fixes, and only 164 of 756 rows in the labelled conversations settled from the participant's words). Augmentation is argued, and was tested once by a model reader: it caught 10 of 15 findings graded wrong from the review alone (10 of 14 against the question), with 1 false alarm in 91. Not independent, no human reader, no time measured. See the README's "The coordinator review" |
| 2 | Criteria schema — is patient-answerability a model output or derived from category; does the schema need a type field separating patient criteria from protocol constraints and definitional clauses | 0002 | **Closed:** the model emits a four-value `type`, and answerability is derived from it by a function rather than stored. See `work/0002-criteria-parser/spec.md` §3 |
| 3 | Primary eval metric | 0003 | **Closed:** coverage recall against hand labels, reported always beside strict recall and merge rate. Coverage asks whether a requirement was captured at all; strict recall additionally requires it to be its own criterion; the gap is the granularity failure, kept out of recall so it cannot hide there |
| 4 | Local model — not yet pinned; candidate is a quantized 30B-class model via MLX | 0002 | **Closed:** `Qwen3.6-35B-A3B-MLX-8bit` via oMLX 0.6.4 at `http://127.0.0.1:8000/v1`, temperature 0, seed 20260921 |
| 5 | Corpus size | 0001 | **Closed:** twelve. 0002 found the corpus easy on formatting but recommends against expanding it — see below |
| 6 | Golden set source — hand-authored vignettes, generated cases, or both | 0004 | **Closed:** authored, not generated. Fifteen vignettes written against labelled criteria under `evals/cases/VIGNETTES.md`, with expected outcomes following by construction, so checking one is reading rather than clinical judgment. A model *plays* a vignette and never writes one. An independent second drafter is planned for the held comparison slice |

---

## Carried forward from 0017

- **OpenAI and xAI have never met their live APIs, and won't be smoke-tested** (owner, 2026-10). Settings offers them marked "Not yet tested"; a person's own Test is their first live call, capped at 2¢, and its error comes back with the key taken out. If one is ever wanted, `npm run models:smoke -- openai --spend` (or `xai`) records real fixtures and lets the catalog date them.
- **A hosted agent is unmeasured.** The prompts were tuned on the local model and are unchanged. The held comparison slice is what would measure one, and its first question, how many runs an unseeded model needs, stands.
- **`CHARS_PER_TOKEN` overestimates Anthropic's count by about 1.4×** (smoke run, 2026-10). Left at 3.0 because it's shared by three providers and only one is measured; estimates and caps err high.
- **A restart resets a resumed screening's cap.** Its pool is in memory. The ledger has the true total; a cap that survives a restart would mean saving the pool with the conversation.
- **The cap is a stop, not a warning.** A screening that reaches it stops mid-conversation and says how to continue. A warning before the last few cents is a possible refinement.
- **The app's ledger is local only.** `local/spend.jsonl` isn't committed and isn't summed anywhere on the page; the committed `evals/results/spend.jsonl` remains the eval's.

## Carried forward from 0016

- **Publishing is the owner's next step, not done.** Make the new repository from the tracked files (`git archive`), commit as GitHub's no-reply address, then apply `work/0016-polish/github.md`. The rest of the check's recommendations are in `work/0016-polish/going-public.md`: a line saying PR numbers refer to the original repository, and the private 0014 mockup link.
- **The README's images aren't reproducible.** They're the local model's words in 2026-10, kept rather than regenerated. `npm run screenshots` makes new ones that tell the same story.
- **The capture's answer table is crude.** In the committed screening, the model paraphrased the ECOG question past the table's words and got the fallback, and a two-part question got the biopsy answer twice. Recorded, not tuned (`work/0016-polish/plan.md`, Records). A table that read the tester panel's criterion id instead of the question's words would be steadier, if the images are ever retaken.
- **The demo screens a built-in trial, not the one it adds.** The added trial is colorectal and the made-up patient has lung cancer. A second patient for the added trial would show the whole path on one trial.
- **The page still has no layout test.** Looks were checked by eye at the gate, at 1280 px light and dark and at 390 px.

## Carried forward from 0015

- **Fixed: a heading quoted with its item.** The location check accepts a heading joined to one of its own items, located at the item, with the heading kept beside it. Replayed through the new check, the gate parse of NCT06090266 keeps 10 of its 11 rejections. A fresh local parse of the same text rejected nothing: it joined only five items, and the check recovered all five.
- **Carve-outs are the next parser problem.** A rule's exception ("Subjects on stable HAART … are eligible") is left unread, so the agent asks the rule without it. That's 7 of the fresh parse's 7 unclaimed passages, and 5 of the labelled NCT04385368's 12. Its other 7 are notes and site procedures. It errs toward flagging someone for the coordinator. Fixing it is a prompt change: the exception has to be in the criterion's statement, since the agent reads that, not the source. That means 0011's measurement, including three samples of NCT04385368.
- **Cohort scope never reaches the agent.** `appliesTo` is parsed, and `fromParse` drops it. The page doesn't show it either. NCT06090266's fresh parse has 13 cohort-scoped criteria, asked of everyone. Passing it on changes `ScreeningCriterion`'s four fields, and so the agent, and means re-running the vignettes.
- **The check refuses three shapes that may be honest:** a heading that is the tail of its line, an inline sub-item, and an unindented sub-list. None has been seen joined. Each is pinned by a test, so widening the check for one is a visible change. The Cohort B3 shape (no colon, a sibling between) is refused too. It didn't recur in the fresh parse.
- **One fresh parse is one sample.** The gate's 11 rejections were one day's sample, and the fresh parse joined differently. No repeat was run, by the slice's own rule: same-day repeats were identical in 0011.
- **A trial added before 0015 keeps its old parse** until it's removed and added again, since Refresh reparses only on changed text.
- **`parse:criteria --trial-file`** parses a trial from a saved record or trimmed study. It's how an unpinned trial gets parsed from fixed text, without refetching.

## Carried forward from 0014

- **An overall suggestion in the coordinator review was asked for and not built.** The owner asked for "a quick summary and ultimate suggestion". The summary was built as what's left per group. A suggestion would break 0007's rule against combining criteria, and the owner chose not to change it now. If it's wanted, it's a slice of its own: change the rule and the product intent deliberately, measure the suggestion against the vignettes' expected outcomes before it ships, and show its error rate beside it.
- **No names, by design.** Asked whether a person should give their name, the owner agreed to readable labels made by the app (trial and start time), under the no-PHI rule. A real deployment would take identity from the site's own systems under consent, out of this project's scope.
- **Deleting a screening deletes it.** The file in `chats/` goes. A real clinical system would archive with an audit trail, which is out of scope (21 CFR Part 11 is named as such in the product intent).
- **The page has no layout test.** The browser test checks words, order and behaviour. Looks were checked by hand at 1280 px, in dark mode and at 390 px, and in the four screenshots.

## Carried forward from 0013

- **The parser joins headings onto sub-items in long, nested protocols.** On NCT06090266 (11k characters, cohorts), 11 of 45 returned criteria were rejected because their quotes, such as "…including the following: Known active hepatitis C…", aren't in the source verbatim. Six passages went unclaimed. The pinned corpus never showed it this badly. It's the strongest candidate for a parser slice if one is ever opened: added trials are where the parser now meets protocols it was never tuned on. The Trials screen states the loss per trial, so it's visible, not fixed.
- **Added trials are unmeasured, and so is screening from them.** No labels, no vignettes, no run. The app marks them, and the docs say so.
- **The network boundary's detector looks for `fetch(`.** A call through another name (`fetchImpl(`, `const f = fetch`) would pass it, and 0013's first draft of `registry.ts` did exactly that until the new test caught it. Every exempt file today calls `fetch(` by that name. Tightening the detector to any mention of `fetch` outside the exempt files is a small change to `tests/boundary.test.ts`, not made here.
- **Parsing timings are from an idle machine.** About 30 s, 40 s and 2 min 10 s for three trials. A parse while a conversation is running slows both. That isn't measured.
- **No plain-language versions for added trials.** Same reason as for parsed criteria (0006). Display only.

## Carried forward from 0012

- **The roadmap is closed.** *Reopened 2026-10 for 0013, trials by link; see its section above.* Nothing is planned. The held comparison, with its independent checks, is the only open row, and it spends money, so it starts only on the owner's word. If it ever runs, 0008's smoke test and its variance question come first.
- **The README is short, and the detail is in `docs/`.** The README, about 100 lines, is for anyone who opens the repository: the problem, what it does, screenshots, how to run it with or without a model, and how it was built. Findings are in `docs/`, not the README. Every number and its run is in `docs/`, one file per part. A README claim links to its doc, and a change that moves a number updates both. The first draft kept everything in one two-layer README at 590 lines, and the owner said nobody would read it.
- **The screenshots are made by `npm run screenshots`** from fake mode and the committed eval run. They're byte-identical run to run. A page change that alters a view should re-run it and commit the images; nothing checks that automatically.
- **The review screenshot shows a known failure on purpose.** The conversation in `docs/images/` is NCT00077350-v2 from 0009's run, where the agent misses a correction volunteered in a reply about another question. The caption says so. If `EVAL_RUN` ever moves, the screenshots and captions move with it.

## Carried forward from 0011

- **The collapse toward `clinical` was mostly an unwritten rule.** The prompt and the annotation guide both typed a criterion by who could answer it. The labels had followed another rule: what was done to or by the person is `patient`, a condition is `clinical`. Writing it down took `patient` typed `clinical` from 25 to 9 and reach from 72 to 120. The rule is in `evals/cases/ANNOTATION.md` with the 7 labels that contradict it, left unchanged, which a second annotator should look at first.
- **The long protocol's parse moves between runs, and one run of it is one sample.** NCT04385368 gave 42 different criteria from identical input five days apart, with misses at 16 in 0003 and 2 in the re-run. Three same-day repeats were identical, so the runtime may have changed in between; oMLX reports no version to check. The drops 0003 reported were largely one parse. A later parser slice should run that study three times per version: `npm run eval -- --dev NCT04385368 --sample N` and `eval:compare --samples` exist for it.
- **Small prompt changes flip whole blocks.** The alternation example alone moved NCT04385368's 13-label exclusion block between `patient` and `clinical`, and NCT00077350's merge rate went 0.30, 0.14, 0.27 across three versions. A difference of a few type errors on one study isn't a result.
- **The fix didn't generalize much, and the held-back studies were seen.** On the three studies not tuned on, `patient`→`clinical` went from 7 to 6. They were parsed at the final prompt before it was frozen, by a scripting mistake (a multi-word argument list passed as one zsh variable), and their summary numbers were read. Nothing was tuned after that.
- **The frozen prompt carries two regressions.** NCT04385368 misses 23 labels, 6 of them clinical, including resectability by a multidisciplinary team. NCT00077350's merge rate rose from 0.14 to 0.27.
- **Nobody has screened from the new parses.** The six to seven hour run, the reasoning-off parser run and the unlabelled-studies comparison were skipped (owner, 2026-09: the proof of concept had lost its way). `EVAL_RUN` still names 0009's run, whose parse conversations came from 0003's parser. `npm run app -- --source parse` uses the new, committed parses.
- **The measurement is sounder.** A screening conversation from a parse is keyed by the parse's identity, so a parser change can't silently reuse old conversations. A parse is named by prompt, normalization and reasoning mode. Every committed parser result is re-graded from committed parses by `npm test`. `normalize()` unescapes `^` and `&`.
- **The quote check fires, and has a gap.** Adversarial tests, and two real 0011 parses (an inserted space, a stitched quote), show it catches unfaithful copies. It checks the quote, not the `text` the agent reads.
- **Four plain renderings were re-hashed.** They're keyed by normalized text, so the escapes fix staled four lab criteria. `plain:render` re-rendered them word for word the same.
- **`npm test` is at about 0.8 s for 1,010 tests.**

## Carried forward from 0010

- **No check runs anywhere but this machine.** The repository has no `.github/` directory and no workflows, so "tests pass" in a PR means they passed where the PR says they ran. 0010 made a CI run possible: before it, `npm test` failed 5 files from a fresh clone. The optional CI row is the proposal (the owner asked, 2026-09).
  - **Scope:** `npm test`, `npm run typecheck` and `npm run lint` on every push and PR, on Node 24.
  - **Left out:** the browser test (a 94 MB download per run, for a check already run before page PRs) and anything needing a model.
  - **The intent has to settle one thing:** whether a test-only workflow counts as the "cloud deployment surface" the product intent rules out. It deploys nothing, but it is config for a hosted service, and the intent should say why it is or isn't allowed.

- **The review's data is committed now, and each served run adds to it.** `evals/results/screening/review/` holds what the review reads for `EVAL_RUN` (1.77 MB) and `READING_RUN` (1.51 MB), made by `npm run review:export` from the local conversation cache. A later run that becomes `EVAL_RUN` commits its file in the same change, and a test fails if it doesn't. Dev runs don't get one, since the page never serves them.
- **Parse mode from a fresh clone serves nothing.** The parse cache is gitignored, like the conversation cache was. 0011 makes new parses and is the slice to decide whether they're committed, the same way.
- **The browser test covers the scripted agent only.** The page on the local model, layout and styling aren't covered. The local model is slow and non-deterministic, which is `evals/`' job, not a test's.
- **The mutation pass isn't independent.** The nine breaks were chosen by whoever wrote the specs, aimed at what each case claims. It shows each case catches its own behaviour, not that the suite catches any page bug.
- **A missing link or button takes a minute to fail.** A click waits out the 60 s test timeout, where an assertion gives up after 5 s. Setting Playwright's `actionTimeout` would shorten it. Left alone: the failure still names the locator.
- **Playwright and its browser move together.** `@playwright/test` is pinned at 1.63.0, and its Chromium comes from `npx playwright install chromium`. Upgrading one means re-running the install.
- **Fake mode now has test apparatus in it.** `[slow]` and `[down]` are listed in the README and the scripted agent's comment, not in the page's banner.
- **`npm test` is at about 0.75 s for 910 tests.** Reading two committed review files instead of sixty cache files cost nothing measurable.

## Carried forward from 0009

- **The L15 shape is still missed.** A correction volunteered in the reply to a different question ("Actually, I had two different chemotherapy regimens…") is read only for the question it answers. That happened even with the corrected criterion at the top of the answered list the read call is shown. Missed self-corrections are 4 of the new run's 17 wrong findings, and the worked example, `examples/NCT00077350-v2-labels-0009.html`, shows it. The lever not tried is a separate correction check per reply: one more model call a turn. The simulator can't produce this shape on purpose (`volunteerable` skips facts with `laterSays`), so a vignette that needs it has to script it.
- **The fixes' cost is abstentions, and two patterns account for most of them.** From labels, abstention on the twelve rose from 1 of 108 to 8 of 107. Four of the eleven across the run are "I'm a man, so I'm not pregnant" read as does-not-apply to a criterion about a condition. The prompt says pregnancy names a condition, not a group, and the model does it anyway, about once per dev iteration too. Four more are plain denials held back as not outright in `NCT04385368-v3`, whose persona hedges every reply. A fix for either is an agent change, measured again.
- **Should the review show `statement` and `withheld`?** The read call now writes the criterion as a statement and keeps a held-back reading, and `screening:show` prints both. The coordinator review shows neither (spec §3.4). A statement that drops a group ("agrees to use contraception" for "Female patients… must agree") is exactly what a coordinator could catch. Showing it changes the review, and `tests/web/review.test.ts`'s flip test has to be read against it.
- **The verdict pattern is v4.** A verdict word followed by "for" and something other than the study no longer counts. Every run from now on is graded v4. 0004's before count comes from its stored v3 hit texts, filtered. The new run's five hits are four questions the agent opened with "to help us check eligibility" or close to it, and one quote of a criterion's "eligible to tolerate…", which v4's exception doesn't cover. None is a verdict.
- **The attribution wasn't independent.** Gate 3 was read by a Claude Sonnet 5 subagent, and Gate 1 by another. Neither was a person. The fixes' author then moved four of Gate 3's calls onto the agent, each against the fixes' interest, and the plan records why. A person reading the 17 wrong findings in transcript is still the check the spec asked for.
- **Noise is not measured.** One run per agent at temperature 0 and seed 20260921. Dev iterations 2 and 3 differed by two wrong findings on facts that flipped for reasons neither change explains. Differences of two or three findings in the scored numbers could be the conversation's path. The seed is a constant in `src/models/omlx.ts`, so a second-seed run needs a code change. The held comparison's variance question covers the local model too.
- **The three least-seen are now seen.** Their new conversations were read at Gate 3, and two dev facts turned out to be the same test items as two of theirs (`NCT04385368` L65, `NCT06728852` L19). A later agent slice has no least-seen subset left. It needs new held-out vignettes, written before any fix, if it wants one.
- **A read reply's truncation isn't recorded when a retry recovers it.** The read cap was raised to 2,048 tokens mid-run when a reply touching many criteria passed 1,024 twice. The run file records failures, not recovered truncations, so how close other replies came is unknown.
- **The model still applies medical knowledge the prompt forbids.** It decided an inhaled steroid isn't immunosuppressive medication (dev `NCT04385368` L65), with the earlier words in front of it. `outright` didn't stop it: the model judged its own mapping outright.
- **The paid-run estimate now describes 0009's agent.** It takes call counts from 0009's run, the read call's 2,048-token cap, and a read prompt with what was said shown under every criterion. One conversation on Haiku 4.5 is now estimated at 78 agent calls, about $0.29, up from 0008's $0.16. Still uncalibrated.
- **`npm test` is at about 0.8 s for 892 tests**, with two eval runs loaded. Loading the second cost nothing measurable.

## Carried forward from 0008

- **No adapter has seen the real API.** The owner skipped Gate 2 to spend nothing. Every fixture under `tests/fixtures/models/` still says "written from documentation". The first paid run of any provider should start with `npm run models:smoke -- <provider> --spend` (under a cent, capped at $0.05), which replaces the fixtures and needs no test edit. The likeliest surprises are:
  - whether `gpt-6-luna` honours `json_object` with `reasoning_effort: "none"` on Chat Completions (implied by the docs, not stated);
  - whether Haiku answers in bare JSON or needs the one-fence tolerance `parseModelJson` gives it.
- **The estimate is uncalibrated.** `CHARS_PER_TOKEN` is 3.0, set to overestimate. The smoke script prints the real ratio, and a change of more than 25% is a commit that says why. Today's estimate for one conversation on Haiku 4.5 is 73 agent calls at about 1,600 input tokens each, about $0.16.
- **The comparison's first question is variance, not accuracy.** No Claude model takes a seed, Luna's seed isn't sent, and xAI's is best effort. One run of a frontier agent is one sample. The held slice has to decide how many repeats it needs per vignette, and price them with the estimator, before a difference between models means anything.
- **A frontier agent screens from labels only.** Cached parses are keyed by the agent's model, so a frontier agent screening from parses would look for parses made by that model. Which parser a frontier comparison should screen from (the local parser's output, to isolate the agent, or its own) is the held slice's call.
- **The parser's reasoning mode differs by provider.** The local parser runs with the runtime default, and every admitted frontier model runs with reasoning off. A parser comparison would differ in reasoning mode unless the local parser is re-run with it off. The screening agent already matches.
- **Caching needs the prompts reordered.** The read prompt puts the criteria list, which is stable, after the transcript, which changes every turn, so only the short system prompt repeats. That is below Haiku 4.5's 4,096-token floor and Sonnet 5's 1,024. Moving the stable part first would change `PROMPT_VERSION` and means re-running the vignettes, so it belongs with the agent fixes.
- **Screening has no batch mode.** Lockstep batching of the 30 conversations would take about a hundred rounds of up to an hour each, to save about half of a few dollars. Built only if the held slice decides it's worth that time.
- **For the independent checks, Claude is the least independent provider.** The labels, vignettes and renderings were all written by Claude, so a second annotator, a second vignette drafter or a reader on OpenAI or xAI is further from the author than one on Claude. That argues for a non-Anthropic provider there, even though Claude goes first for the comparison.
- **`plain:render` stays local on purpose.** It writes committed renderings the coordinator review shows. The check of explanations the held slice wants is a frontier *checker* reading the local renderings, not a frontier renderer. Opening the renderer is a decision, and a one-line change behind `createLocalAdapter`.
- **Provider surfaces to watch.** xAI documents Chat Completions as legacy, and OpenAI recommends its Responses API. Either moving is confined to one file. Luna's cache writes ($0.125 per million) aren't priced, because Chat Completions usage doesn't report them: at most $0.025 per million tokens under-counted.
- **The batch ledger is conservative.** A request collected from a batch already in the ledger is counted and priced again by the budget, so the spend log can overstate, never understate.
- **`npm test` is at about 0.71 s for 851 tests**, up from 0.66 s for 724. The new tests are mostly in `tests/models/`, all through injected `fetch`, sleep and clock.

## Carried forward from 0007

- **The blind reading still wants a person.** Gate 2 was delegated to a Claude subagent, which is not the independent reader the spec asked for. It shares a model family with the simulated participants and the vignettes' author, and never answered "can't tell". **Three conversations are unread by anyone on the project**: `NCT03433469-v2`, `NCT04385368-v2` and `NCT06728852-v2` from labels, holding 7 findings graded wrong. `npm run review:sheet` can be pointed at them for a human reading. They are also the cleanest material for the agent-fixes slice to re-measure against, if nobody reads them first.
- **Four of the ten catches are one easy pattern.** A criterion for the other sex ("Female patients of childbearing potential must…" for a man) is recorded as does-not-hold, which the review shows as *Not met*, and the grade agrees it is wrong. The agent has no way to say "does not apply to me" for a conditional criterion. That is an agent fix, and it would also make the review's words right.
- **The reader's model was not recorded.** The Gate 2 reading was done by a Claude subagent in another session, and its model and settings are unknown. A later reading should record them, or be done by a person.
- **What the reader missed is what the agent gets wrong.** Four of the five misses were half-hearted agreements ("I suppose so") and answers the vignettes leave to judgment ("I could quit if I had to"). The agent settles them, and a literal reader agrees. The agent-fixes slice should treat these as one class with 0004's "settled where interpretation was needed" and "vague yeses accepted".
- **A missed self-correction is only in the transcript.** Across all 32 committed results, the agent ignored only 2 readings as "already settled", so most corrections it misses were never read and are attached to no row. The review shows the whole transcript below the groups, but nothing points at the correction. Fixing that means the agent reading it, which is an agent fix.
- **The simulator can drop a scripted line.** NCT03433469-v1 L63 is graded confidently wrong, but the participant never said the denial the vignette scripted before its correction, so on what was said the agent was right. 0004's warning that the simulator's faults bound every number applies to the grades too.
- **Where the review stops is a test.** `tests/web/review.test.ts` flips every settled finding and requires that only each row's own words change. A slice that wants exclusions that apply promoted to the top, which a real clinic would, has to change that test in the open.
- **The review serves 0004's eval run by name.** `EVAL_RUN` in `scripts/app/eval-run.ts` names the run, and the loader refuses a run made with a different prompt or simulator version. When the agent-fixes slice re-runs the vignettes, it points `EVAL_RUN` at the new run, and the review shows the new conversations.
- **Recording a coordinator's decision is deliberately absent.** No field, route or control. What a coordinator records, and where, belongs to a system with real coordinators.
- **Vitest is at 5 and tsx at 4.23**, upgraded during this slice to clear `npm audit`. Vite stays at 7, but Vitest 5 supports 8, so the 0005 note below no longer holds Vite back. Vitest 5 reports the seven `it.fails` known-gap tests as "expected fail" rather than passes.
- **`npm install` denies esbuild's and fsevents' install scripts** (`allowScripts` in `package.json`). Neither is needed on macOS arm64. A different platform might need esbuild's.
- **`npm test` is at about 0.7 s for 724 tests.** Loading the committed eval run costs about 0.2 s of test time, mostly re-checking plain renderings. `tests/fixtures/eval-run.ts` loads it once per worker.

## Carried forward from 0006

- **The renderings are ready for the coordinator pane (0007).** 230 of the 252 labelled criteria have a checked plain-language rendering in `data/plain/`. `displayFor` in `src/plain/load.ts` gives each criterion a `PlainDisplay` (shown, failed with reasons, stale, missing), `GET /api/conversations/:id` already carries it as `plain`, and `CriterionText` lays it out. The pane should show it through `CriterionText` too, so the one-place rule in `tests/boundary.test.ts` keeps holding.
- **Renderings are statements, and the pane applies polarity.** "Pregnant women are excluded from this study" is rendered "Is pregnant". In the reading, the owner counted the missing "are excluded" three times, and read literally the question says the owner was right. The pane is where "exclusion" gets said in words. A future reading question should say that verdict wording is left out on purpose.
- **The agent still asks and reads from the protocol's words.** The agent-fixes slice may give checked renderings to the **ask** call, to fix questions like "on a scale of 0 to 1", and must re-run the vignettes. The **read** call should keep judging against the protocol: a flaw in a rendering would otherwise become a confident wrong finding.
- **Nobody has checked the explanations of terms.** Two wrong ones are known: NCT04385368 L67 explains "IP" as "an intervention group" (shown, named as a known gap), and L49 explains "allogeneic" as a donor "who is not a close relative" (not shown, refused for its negation). An independent check of explanations by the frontier model is 0008's to add.
- **Most refusals are negations inside explanations.** 17 of the 22 not shown. The prompt forbids them and the model does not always comply. Two ways on: a stronger prompt and a re-run, or a spec change that lets an explanation carry a negation the check then ignores. The second weakens a promise the spec makes, which is why this slice did neither.
- **A retry told a count can satisfy it the wrong way.** Told "1 negation in the protocol, 2 in the plain", the model removed both and reversed the criterion (NCT04385368 L50, twice). The check caught the second. Anyone changing the retry should know its instruction is a number, not a meaning.
- **The check's known gaps are named tests** in `tests/plain/check.test.ts`: a wrong explanation (with L67 as a real case), a dropped clause holding nothing the check extracts, "and" turned into "or", an ordinary word changed, a negation moved between clauses, and before or after swapped where no time is involved.
- **Parsed criteria have no renderings.** `plain:render` reads labels only. Rendering parses needs it to read them too, then a run of about 15 minutes.
- **`npm test` runs with `isolate: false`**, about 0.55 s for 670 tests. It was about 1.0 s after this slice's eight new test files, all of it per-file startup. Safe while no test mocks a module or stubs a global, and a boundary test enforces that.
- **The whole corpus renders in about 16 minutes** on the pinned model with reasoning off, about 3.5 s a criterion.

## Carried forward from 0005

- **The page runs the agent 0004 measured, unchanged.** `PROMPT_VERSION` is still `c5778afe9cbd`. A test drives one scripted conversation directly, through `MemoryTransport` and through HTTP, and requires identical state. Any slice that changes the agent should keep that test passing and re-run the vignettes. The page gives no new measurement.
- **Plain language (0006) has one place to go.** Every criterion's words on the page are rendered by `src/web/CriterionText.tsx`, and a boundary test fails if another component reads `criterion.text`. The agent still asks from the protocol's words. If 0006 wants the agent to ask from the plain version, that changes the agent and needs the vignette re-run.
- **The coordinator pane (0007) has most of an API and none of a view.** `GET /api/conversations/:id` returns criteria and per-criterion progress, which the tester panel reads. A finished conversation's `ScreeningResult`, with the handoff grouping and run metadata, is held by the service (`result(id)`) and saved in `chats/`, but no route returns it yet. The tester panel is deliberately not the pane: it shows no totals, no grouping and no polarity. The page's grid leaves room for a third area.
- **Real reply time is about 7.5 s** (6.6–8.4 s over five replies, 12.4 s for the opening) on the pinned model with reasoning off and nothing else using it. 0004's 18 s estimate came from an eval run that shared the model with the simulator and the fidelity check.
- **A second message during a turn is refused.** That is fine for a test page and wrong for a real text channel, which would need merge-and-rerun: keep the pre-turn state, discard the turn in flight, and receive the two messages as one. `ScreeningSession`'s atomic turns make it possible without changing the session.
- **The agent, tried by hand, did two things worth adding to the agent fixes.** It asked performance status as "on a scale of 0 to 1", which is the criterion's wording, not a patient's. And after "I'm not pregnant" it said "Since you are of childbearing age…", which assumes something the person never said.
- **`npm test` is at about 0.8 s for 552 tests**, in Vitest's `threads` pool. Process startup, not the tests, is most of it. `vmThreads` measured 0.42–0.46 s, but its separate VM contexts can break `instanceof`, which these tests rely on. That is the next lever, not a free one.
- **The network rule now has three exceptions**, each in named files and each proved to fire: loopback `fetch()` in `src/models/`, listening on `127.0.0.1` in `src/server/start.ts`, and relative-path `fetch()` in `src/transport/web/client.ts` and `src/web/api.ts`. 0008's frontier swap is still meant to be a visible change to `tests/boundary.test.ts`.
- **The page's tsconfig includes Node's types**, so it can import the server's response types instead of duplicating them. A boundary test stands in for what leaving them out would have enforced: nothing under `src/web/` imports a `node:` module or reads `process`.
- **Vite is pinned at 7** because Vitest 3.2.7 does not support 8. Upgrading Vitest would allow it, and would also clear a moderate `npm audit` advisory in Vitest's mocker. Both are development-only. *(0007 upgraded Vitest to 5 and cleared the advisory. Vite is still 7 but no longer has to be.)*
- **`chats/` is shared by the terminal and the page**, with no locking. One person on one machine is the assumption. Two writers on the same conversation at once are not handled.

## Carried forward from 0004

- **Criteria need plain language, and that is the first thing the next stage should address.** Raised by the owner at Gate 2: inclusion and exclusion criteria read as medical jargon that most people, the owner included, do not fully understand. The agent already rephrases a little when it asks, but the criteria it holds, and everything a coordinator pane would show, are still the protocol's words. A plain-language rendering is a new place for a model to be wrong, so it needs a check of its own: at minimum, that it does not change what the criterion requires.
- **The agent is overconfident.** From labels, confidently wrong 0.15 (24 of 163) with abstention at 0.01, and it settled about half the answers that should have stayed open. Of the 24: 6 missed self-corrections, 4 exclusions read backwards, 4 settled where interpretation was needed, 2 vague yeses accepted. These are the agent's to fix. A later slice should attack them in that order and re-run the same vignettes, which is what they are for.
- **Self-corrections are the weakest spot.** The read call is shown already-answered criteria so that it can notice a correction, and mostly does not. The two canonical failures are in `evals/results/screening/examples/NCT00077350-v2-labels.html`.
- **Exclusions worded as prohibitions still confuse it.** "Never smoked" against a never-smoker exclusion, and "no anticancer therapy" against a prohibited-medication exclusion, were both read backwards. Statement-truth semantics are in the read prompt; they are not enough on their own.
- **The parser's cost is reach, not accuracy.** Screened from parses, only 84 of 183 patient criteria reached the agent intact: 66 were typed `clinical` and 33 bundled. On NCT04385368 it was 39 of 57 mis-typed. Fixing the parser's collapse toward `clinical` is now the highest-leverage parser change, and the screening harness can measure its effect directly.
- **Reasoning mode is part of the experiment.** The screening agent, simulator and fidelity check run with the model's reasoning off (`OmlxAdapter({ thinking: false })`); the parser runs with the runtime default. Results record which. Slice 0008 has to hold it fixed across models or report it.
- **The simulated participant invents, and its checks are weak.** It still answers some uncovered questions from its persona ("I'm fully active"). The model fidelity check flagged 375 of 1,048 replies, mostly honest "I don't know"s, so it is a reading aid, not a filter. The Gate 2 rule that keeps a flagged reply's *cited* facts let through two distortions of cited facts. A better simulator check would raise every number's credibility more than any agent change.
- **The verdict-language pattern over-matches.** 14 hits and no real verdicts: the criteria themselves say "candidate for surgery" and "eligible for an R0 resection". Narrow it to the agent's own framing before relying on it.
- **Running the local model for conversations needs care.** In JSON mode, a `ROLE:` transcript is continued rather than answered, so transcripts are quoted and numbered. JSON mode wraps objects in a one-element array. Long verbatim quotes can fall into a repetition loop, so quotes are capped at about 12 words. All three are handled in code and pinned by tests.
- **A full screening run is about 12 hours** of local model time for 30 conversations and 1,048 questions, and it resumes after interruption. The parse run costs as much as the labels run.
- **`ScreeningSession` is ready for a transport.** It is push-driven (`start()`, `receive(text)`), knows nothing about where messages come from, and its state is plain JSON that restores exactly after any turn. 0005's `MessageTransport` wraps it rather than changing it.
- **`npm test` is at the edge of its budget:** 0.97 s. The next slice that adds tests should look at collection time first.

## Carried forward from 0003

- **The parser drops site-facing requirements.** Ten of the sixteen genuine misses are `protocol` criteria, all in NCT04385368: sample collection windows, nodal examination and documentation duties. A protocol dense with site obligations is where the parser is weakest, and slice 0007's coordinator pane is exactly where those would have been needed.
- **Type errors run one way.** 22 `patient` and 7 `protocol` criteria were labelled `clinical` by the model, against 2 in the other direction. It collapses toward `clinical` under uncertainty. That is a prompt problem with an obvious first thing to try, and it was invisible before this slice.
- **Merge rate is 0.20 pooled and 0.36 on one study.** The content is captured; the packaging disagrees with the annotation guide. 0004 asks one question at a time, so it inherits this as a real constraint rather than a cosmetic one.
- **The headline number is not accuracy.** Labels and prompt share an author. Until a second, independent annotator is measured against `evals/cases/ANNOTATION.md`, the figure says the parser follows its prompt, not that it is right. This is the single most valuable thing a later slice could add, and it is cheap.
- **Seven of twelve studies are unlabelled.** The pooled figure covers five. Labelling the rest is mechanical now that the guide exists.
- **The skeleton tool hid criteria three times before it stopped.** A length floor dropped `Hemoglobin >= 9 g/L`; a heading rule dropped four criteria that end in a colon because they introduce their own exceptions. Both are fixed and pinned by tests, but the lesson generalises: a tool that prepares work for a human can corrupt the measurement by omission, and nothing downstream notices.



- **`normalize()` does not unescape `\^`.** `src/criteria/normalize.ts` strips the backslash from `\>`, `\<`, `\.` and others, but `^` is absent from its `ESCAPABLE` set, so normalized text still reads `100,000/mm\^3` and `1.5\^9/L`. The model is shown stray backslashes in every lab threshold using an exponent, and a quote written the natural way will not locate. Found while writing 0003's runner tests. Not fixed there: the slice forbids `src/` changes while building the parser's own measurement, and the fix belongs in a slice that can re-run the numbers afterwards.

## Carried forward from 0002

- **The corpus is not hard on formatting, and that axis is spent.** All twelve parse at 89-98% source coverage except NCT04385368 (51%), across every house style the corpus contains. 481 criteria, zero rejected. Adding a thirteenth awkwardly-formatted protocol would re-confirm a settled result. The recommendation from 0002 is to leave the corpus at twelve and put the effort into labelling instead.
- **Coverage and rejection count cannot be 0003's primary metric.** Both are non-discriminating across eleven of twelve studies. Recall against hand-labelled criteria can discriminate, and **NCT04385368 is the study to label first** — it drops real requirements, including that the primary tumor be deemed resectable by multidisciplinary evaluation, among procedural narrative it correctly skips. Distinguishing those two needs a human label; no metric available today does it.
- **The quote-location safety net has never fired.** Zero rejections in 481 criteria says this model copies text faithfully. It says nothing about whether the net works on a model that does not, so 0003 should stress it with adversarial cases rather than assume it is proven.
- **`definitional` is barely exercised** — one study, four criteria. If 0004 leans on separating definitional clauses from real criteria, that rests on thin evidence and may warrant one targeted corpus addition.
- **Parsing the corpus takes ~45 minutes and degrades.** Generation slowed roughly fourfold across a twelve-study batch, and one study blew a twenty-minute timeout that parsed in 78 seconds alone. A batch failure near the end says nothing about the study it lands on. 0003 should not treat a single sequential run as a reliable measurement.
- **`confidence` is weak but not constant.** It ranges 0.8-1.0 across the corpus and is 1.0 for every criterion in some studies. Usable as a tiebreak at best, not as a filter.

## Carried forward from 0001

Things a later slice needs to know that are not obvious from the code.

- **The corpus may be too easy, and no test can tell you.** Four of the twelve gate on a molecular alteration; whether the three "awkward formatting" entries are genuinely awkward is a human judgment recorded in `src/trials/corpus.ts`. If 0002's parser handles all twelve comfortably, suspect the corpus before believing the parser. A planning-time survey of this already produced a wrong answer once, by matching `ALT (SGPT)` in liver-function values as `ALK`.
- **`criteriaText` is stored byte-for-byte**, including inconsistent formatting and escaped markup. Normalizing it is 0002's job and nothing upstream has done any of it.
- **Nothing under `src/` may reach the network**, asserted by `tests/trials/boundary.test.ts`. When `src/models/` lands in 0002 it will talk to a local model over HTTP, which makes it the first real test of where that boundary sits. Decide deliberately rather than by loosening the test.
- **Refetching the corpus churns** `overallStatus` and `lastUpdatePostDate` for administrative reasons unrelated to eligibility.
