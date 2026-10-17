# Known limitations

Everything known to be wrong, missing or unmeasured. Part of the [Trial Prescreening Agent](../README.md) documentation.

## Known limitations

- **No frontier adapter has made a live call.** All three are tested against responses written from documentation. See [Model providers and cost](models-and-cost.md). The token estimate's characters-per-token ratio is uncalibrated for the same reason, and set to overestimate.
- **A frontier result will be unseeded.** Claude has no seed, GPT-6 Luna's isn't sent, and xAI's is best effort. One run is one sample.
- **Prompt caching saves nothing on Claude Haiku 4.5 with today's prompts**, which are below its 4,096-token floor.
- **xAI's Chat Completions endpoint is documented as legacy.** If it goes, the change is confined to `src/models/xai.ts`.
- **The coordinator review was read blind by a model, not a person.** See [The coordinator review](coordinator-review.md). A self-correction the agent never read is attached to no row; it is only in the transcript at the bottom of the review.
- **A trial added on the Trials screen is unmeasured.** The parser was graded on five labelled lung cancer trials only. No added trial has labels, so nothing measures how well its criteria were captured, and no screening run has used one. The app marks each as "parsed, not checked against labels".
- **A long, nested protocol leaves its exceptions unread.**
  - **What 0015 fixed.** At 0013's gate, an 11,000-character protocol with cohorts (NCT06090266) lost 11 of the 45 criteria the parser returned. The parser had joined section headings onto their sub-items ("…including the following: Known active hepatitis C…"). The quotes weren't in the source, and the location check rejected them, the HIV, hepatitis and tuberculosis exclusions among them. Since 0015 the check accepts a heading joined to one of its own items (see [The criteria parser](parser.md#the-criteria-parser)).
    - Replayed through the new check, the gate's parse keeps 10 of the 11, and rejects only a Cohort B3 requirement joined to a heading with no colon (`tests/criteria/nested.test.ts`).
    - A fresh local parse of the same text rejected nothing. That day the model joined only the five cohort-only exclusions, and the check recovered all five (`work/0015-nested-protocols/run/`).
    - One parse is one sample: this protocol's parse moves between days.
  - **What's left: carve-outs.** A rule is often followed by an exception: "Subjects on stable highly active antiretroviral therapy … are eligible." The parser quotes the rule and leaves the exception unread, so the agent asks about the rule without it. That flags someone the exception would let in, for the coordinator to clear, rather than letting someone through. The replay leaves 8 passages unread and the fresh parse 7, and all but the B3 item are carve-outs. The labelled NCT04385368 shows it too, in 5 of its 12 unread passages. Carrying exceptions into the criterion's statement is a prompt change, measured on the labelled studies, and not made.
  - **Cohort scope doesn't reach the agent.** A criterion's `appliesTo` ("Cohorts A2, B1, B2, and B3") is parsed but never passed on, so the agent asks cohort-only criteria of everyone, and the page doesn't show the scope. Passing it changes the agent's four fields, and so means re-running the vignettes.
  - **A trial added before 0015 keeps its old parse.** Refresh reparses only when the eligibility text changed, so remove the trial and add it again.
  - The three trials' saved records from 0013's gate are in `work/0013-trials-by-link/gate/`. The short and mid-length ones lost nothing then.
- **Plain-language renderings exist only for the five labelled studies**, and none for an added trial. With `--source parse` the panel shows the protocol's words alone. Rendering parsed criteria needs `plain:render` to read them as well as labels, then a run.
- **About one criterion in twelve has no plain version**, most often because an explanation said "not". See [Plain language](plain-language.md).

- **The screening agent still misses a correction volunteered in a reply about something else**, and still settles some answers that needed interpretation. 0009 halved its confidently wrong findings from labels, at the cost of more abstentions. See [Where the agent fails](screening-agent.md#where-the-agent-fails).
- **The screening agent runs with the model's reasoning mode off.** With it on, each call took 15–30 s and wrote its reasoning into the JSON. The parser still runs with the runtime default. Every result records which mode produced it.
- **The page refuses a second message while the agent is working** (see [Try it](running.md#try-it)). That is a known departure from a real text-message channel.
- **The browser test runs the scripted agent only.** The page on the local model is still tried by hand. See [Checking the page](running.md#checking-the-page).
- **The page's model-down notice always names `http://127.0.0.1:8000/health`**, the pinned default, even if `OMLX_BASE_URL` points elsewhere.
- **A full screening run takes about 13 hours** of local model time: 30 conversations and 1,106 questions in 0009's run (0004's took 12 hours for 1,048). It resumes after an interruption.
- **The labels are not independent of the prompt being graded.** See [What the numbers do not mean](parser.md#what-the-numbers-do-not-mean). This is the limitation that bounds every number in the table.
- **Seven of twelve studies are unlabelled**, so the harness measures five. The pooled figure is not a corpus-wide result.
- **The corpus turned out not to be hard on formatting.** Eleven of twelve studies parse at 89-98% source coverage whatever their house style, so that axis no longer discriminates between a good parser and a poor one.
- **The hallucination check checks quotes, not meaning.** It fires on an unfaithful copy, as tests and two real 0011 parses show, but a faithful quote under a reversed statement passes, and the agent reads the statement.
- **The parser's output on the longest protocol isn't reproducible across days.** NCT04385368 gave a different parse from identical input five days apart, and same-day repeats were identical. A parser number from one run of that study is one sample.
- **Parsing all twelve takes about 45 minutes and degrades** as it goes; a study can time out late in a batch and parse fine alone. The harness caches parses and continues past a failure for that reason.
- Two axes of the corpus selection (whether formatting is genuinely awkward, whether a study gates on a biomarker) cannot be checked by a test and are enforced by review.
- Refetching produces diff churn in `overallStatus` and `lastUpdatePostDate`, which move for administrative reasons unrelated to eligibility.
- Criteria text is stored exactly as the registry returned it. The parser normalizes a copy in memory and never writes it back.

## Not for real use

Synthetic and published data only, no patient contact path, no clinical determination. See `work/0000-product/intent.md`.
