# Running it

How to install, run and check the proof of concept, and where the trial data comes from. Part of the [Trial Prescreening Agent](../README.md) documentation.

## Install

```
npm install
npm test
```

The corpus lives in `data/trials/` as one trimmed JSON file per study, pinned by NCT ID in `src/trials/corpus.ts`. Each entry records what that study contributes to the corpus: an unusually awkward criteria block, a biomarker-gated inclusion, a short block, a particular sponsor's house style. Breadth is not the point — variety in how eligibility prose is written is.

Read the corpus with `loadTrials()` or `getTrial(nctId)` from `src/trials/`. Both throw rather than return anything partial.

## Try it

```
npm run app                       the real agent on the local model, your own trials: http://127.0.0.1:5005
npm run app -- --examples         also the five built-in example trials and the eval run's conversations
npm run app -- --fake             a scripted agent, no model needed; the examples are included
npm run app -- --examples --source parse   the examples from the parser's output instead of the hand labels
npm run app -- --chats-dir <dir>  save conversations somewhere other than chats/
npm run app -- --trials-dir <dir> keep added trials somewhere other than added-trials/
```

**Your trials, or the examples.** `npm run app` starts with only the trials you've added (see [Adding a trial](#adding-a-trial)), so on a fresh clone it's empty until you add one. The five labelled lung cancer trials and the 30 eval-run conversations are the project's test material. They appear only with `--examples`, or in fake mode, which includes them so there's something to try without a model.

The page has three parts, in the header (slice 0014):

- **Trials**, the home page: your trials as cards, the box to add one, and with `--examples` the built-in ones below. Each card has **Start screening** and **See the checklist**. The checklist shows what the AI read from the trial before anyone screens against it: how many rules, how many the person can answer and how many need medical records, then "Who can join" and "Who can't join", each rule tagged by who can settle it, and the published text in a fold-out.
- **Screenings**: start one against any ready trial, or continue one in progress.
- **Reviews**: finished screenings, each opening the coordinator review, and with `--examples` the eval run's.

A screening is named by its trial and when it started ("… · today 2:14 PM"). Nobody is asked for a name: the app is for made-up answers, and a name beside health answers is what the project's no-PHI rule exists to prevent. Your own screenings, in progress or finished, can be deleted with **Delete…** and a confirmation. That removes the file from `chats/`. Not while the agent is replying, and never the eval run's.

Pick a trial and answer the agent's questions as a made-up participant. **Use made-up answers only.** This is a test system, and nothing typed there should be real.

A screening has two sides. In the middle is the conversation as a participant would see it, in larger, more legible type: a heading with the trial, the agent's word that a coordinator will review everything, and the question number, then the earlier turns, then the question waiting for an answer in a card of its own, and the box to answer in. On the right, or below on a narrow window, is a **tester panel**, folded until you press **Show the N rules**, and remembered in your browser: every criterion in the study, and what the agent has recorded for it so far, with the words behind each finding and the turn they came from. Each criterion shows the protocol's words and, under them, a plain-language version, or the reason there is none (see [Plain language](plain-language.md)). The panel is a view for trying the agent. A participant would never see it, and it is not the coordinator's review. It shows no totals and applies no inclusion or exclusion logic.

When a conversation finishes, **Open the coordinator review** shows it the way a coordinator would read it (see [The coordinator review](coordinator-review.md)). With `--examples`, Reviews also lists the 30 conversations from the screening agent's measured run, which open in the review with no model running. They're read from a review file committed beside the run (`evals/results/screening/review/`), so they're there in a fresh clone.

What to expect:

- **About 7.5 seconds per reply** on the pinned local model (6.6–8.4 s measured with 0004's agent), and about 12 s for the opening. 0009's read call is about 13% slower, measured back to back on one reply, and the page's replies haven't been timed again. Each reply is two model calls: one reads your answer, one phrases the next question. While the agent works, the page shows how long it has been thinking.
- **One message at a time.** While the agent is working, Send is disabled and your draft is kept. A real text-message channel could not refuse a second message. This one does, because a message written before the next question would otherwise be read as its answer, which is exactly what the evidence check exists to prevent. A real channel would need to merge the two and re-run the turn.
- **Conversations are saved** in `chats/` (gitignored) after every change, in the same format `npm run screening:chat` writes. A reload, a server restart or the model going down loses nothing. A message the agent had not finished with comes back marked *not processed*, to send again. It is never retried silently. Terminal chats appear in the page's list and can be continued there, and any conversation renders with `npm run screening:show -- chats/<id>.json --html`.
- **If the model is down**, the page says so and points at oMLX's health check. `--fake` works without it.
- **The scripted agent behind `--fake`** reads your first word literally: yes, no, not sure, or `n/a` for a criterion that doesn't apply to you. Two more replies exist for testing the page. `[slow] yes` holds the answer for two seconds, so you can see the agent working, and `[down] yes` answers as an unreachable model would.
- The server listens on `127.0.0.1` only, and refuses requests addressed to any other name or coming from another site's page.

The agent the page runs is the one measured below, unchanged. A test drives the same scripted conversation directly, through the transport and through the HTTP API, and requires all three to end in identical state.

## Adding a trial

The page's **Trials** screen (`#/`, the home page) lists your trials. With `--examples` it also lists the five built-in ones, which are marked as examples and can't be changed. Paste a ClinicalTrials.gov link or NCT ID into the box and press **Add**. Any of these forms works: `NCT05854498`, `https://clinicaltrials.gov/study/NCT05854498`, the same with `?tab=…` or `#…` after it, and the old `/ct2/show/` form. Only the ID is kept, and the app builds the one address it fetches from that ID.

What happens next:

1. **Fetching.** The server asks `clinicaltrials.gov` for the study and trims it exactly as `npm run fetch:trials` trims the corpus, which drops the site contacts. This is the app's only network call. It's made only on Add or Refresh, from `src/trials/registry.ts`, and a test in `npm test` keeps it to that file and that host.
2. **Parsing.** The local model turns the eligibility text into criteria, with the same parser and settings `npm run eval` uses. Trials parse one at a time. On an idle machine that took about 30 s for a 1,000-character protocol and about 2 minutes for an 11,000-character one. A parse competes with a conversation in progress for the same model, and each slows the other.
3. **Ready.** The card gets **Start screening** and **See the checklist**, Screenings offers the trial marked "read by the AI, not verified", and a conversation runs exactly as it does for the pinned trials, from the parse. Its coordinator review carries the parser note. If the parse left anything out, the trial's card and checklist say how many criteria couldn't be matched to the protocol text and how many passages weren't read. The agent won't ask about those.

If a step fails, the row says why: the registry has no such study, it couldn't be reached, or the parse failed. **Refresh** fetches the trial again, and parses again only if its eligibility text changed. The earlier parse stays in use until a new one is ready. **Remove…**, then **Remove**, takes it off Trials and Screenings, and conversations already held keep the criteria they ran with and stay reviewable.

Added trials are kept one file each in `added-trials/`, which is gitignored like `chats/`, so they're there after a restart. A trial left mid-parse by a restart comes back marked failed, and Refresh tries it again.

**In fake mode** there's no network and no model. Only an invented study, `NCT00000000`, can be added. It's read from `scripts/app/registry/` and given a scripted parse after a short pause, so the screen can be tried and tested. Any other ID fails with a message saying so.

## Checking the page

```
npx playwright install chromium   once per machine: the pinned browser, about 94 MB, outside the repository
npm run test:e2e                  the browser test, about 15 seconds
```

`npm run test:e2e` builds the page, starts it with the scripted agent on port 5015 and empty conversation and trial directories, and drives it in Chromium. It never reaches a model, and a test in `npm test` fails if its server command could. It's not part of `npm test`, and it runs before any PR that changes the page, the server, the transport or what the review reads (CLAUDE.md lists the paths).

It covers eleven cases:

- Screenings' studies and Reviews' eval-run conversations, which have no Delete;
- the tester panel following a conversation;
- a finished conversation opening in the coordinator review with rows in protocol order;
- the model-down notice and an edited resend;
- a second message refused while the agent works, with both drafts kept;
- 0009's doesn't-apply words, from a live conversation and from the eval run;
- an eval-run conversation in the review;
- a reload mid-conversation coming back where it was, tester panel still open;
- Trials (slices 0013 and 0014): the first-run panel, fake mode's invented study added by link, read, its checklist, offered and screened against, the two refusals, Remove with Cancel then Remove, and its screening deleted by its readable name.
- Settings (slice 0017): a provider chosen and a test key saved, shown only by its last four characters, tested, kept across a reload and removed, with no server answer ever carrying the key.

**How we know it bites.** Before it became a rule, each case's behaviour was broken on purpose in the page, nine breaks in all, and each break failed the case aimed at it. The breaks, and which cases failed, are in `work/0010-browser-e2e-tests/plan.md`. They were chosen by whoever wrote the tests, so they show each case catches its own behaviour, not that the suite catches any page bug.

**What it doesn't cover:** layout and styling, the page on the local model, and `--source parse`. From a fresh clone, parse mode serves no studies, because the parse cache is gitignored.

## Settings

The app's fourth screen chooses the model for the agent and the trial reader: the local model, or Anthropic, OpenAI or xAI with a key pasted there. It also tests that model with one call, and sets what a screening and a trial read may spend. Everything is kept in `local/settings.json`, gitignored, written so only you can read it, and the app's spend goes to `local/spend.jsonl`. `npm run app -- --settings-dir <dir>` keeps them elsewhere. The browser test uses `e2e/.out/settings/`.

With nothing saved, the app runs on the local model as configured in `.env`, as before. A hosted key is used only if it's saved in Settings, never from `.env`. In fake mode, settings can be saved, but the scripted agent always answers and Test makes no call. [Model providers and cost](models-and-cost.md) has the prices, caps and estimates.

## Making the README's images

The README's demo and screenshots show the real agent, so they're made against the app on the local model, not in fake mode. Start it on its own port and with empty directories, so nothing of yours appears:

```
npm run app -- --examples --port 5035 --chats-dir <tmp>/chats --trials-dir <tmp>/trials --settings-dir <tmp>/settings
npm run screenshots               the five screenshots, the demo's recording and the preview card, about 2 minutes
npm run demo                      the recording, sped up where the model works, as docs/images/demo.gif
```

- **`npm run screenshots` stops if the page is in fake mode.** It adds NCT05854498 by its link, which is one fetch from ClinicalTrials.gov and one local parse. It screens the built-in NCT04316364 with a fixed table of made-up answers, opens a committed example review, and removes the trial again. The table is in `e2e/capture.spec.ts`.
- **`npm run demo` needs `ffmpeg`** (`brew install ffmpeg`), and nothing else does. It keeps the GIF under 5 MB by lowering the frame rate, then the width.
- **The model's words change from run to run,** so the images aren't checked by a test, and re-running gives different ones. A person looks at them and decides whether to commit them. `work/0016-polish/plan.md` records what the committed ones show.
- **`docs/images/social-card.png`** is the repository's preview image on GitHub. It's uploaded by hand in the repository's settings.

## The corpus

To refresh the corpus from ClinicalTrials.gov:

```
npm run fetch:trials -- --dry-run   # what would change
npm run fetch:trials                # overwrite fixtures
```

The application never rewrites these fixtures. The request itself is `fetchStudy` in `src/trials/registry.ts`, which the app also calls when a person adds or refreshes a trial on its Trials screen, and at no other time. A test asserts that it's the only file outside `src/models/` that can reach the network, and that its only host is `clinicaltrials.gov`. The only other code that can leave this machine is the three frontier adapters in `src/models/`. Each is confined to its own host, reached only from scripts a person runs with `--spend`, and never from the running application.
