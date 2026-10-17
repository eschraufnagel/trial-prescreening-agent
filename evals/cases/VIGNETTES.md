# Vignette guide

How a patient vignette is written for the screening agent's evaluation. A
vignette is a made-up person: what they would say about each criterion in one
study, and what the agent should conclude from it. Every number slice 0004
reports is computed against these files, so the rules for writing them are
written down, the same way `ANNOTATION.md` does it for criteria.

**These are writing conventions, not clinical judgments.** The rules are built
so that checking a vignette means reading two sentences side by side: the
criterion, and what the person says. If deciding an expected outcome would take
medical knowledge, the rules below say to avoid the question or mark the fact
`defer`. They never say to answer it.

## Who writes vignettes, and why that limits the claim

Vignettes are drafted by the same party that wrote the spec, the graders and,
later, the agent's prompts. Committing the vignettes before the prompts exist
stops the prompts being tuned to them. It does not stop shared blind spots: a
drafter who never imagines a certain kind of evasive answer will neither test
for it nor handle it. This guide is written so that a second, independent
drafter could follow it and their vignettes could be scored separately. That
is planned for slice 0008, not done here.

## Rule 1: expected outcomes are about the statement, not about eligibility

`expected` says whether the criterion's statement is true of this person:
`holds` or `does-not-hold`. It never says whether that is good or bad for them.

- *Pregnant* (an exclusion). She says "No, I'm not pregnant." → `does-not-hold`.
- *Age ≥ 18* (an inclusion). He says "I'm 64." → `holds`.

Polarity is never part of the reasoning. That removes the double negatives
that make exclusion criteria easy to get backwards, for the drafter and for the
agent.

**An exclusion's statement is the condition that disqualifies,** however the
protocol words it. This follows `ANNOTATION.md` Rule 2: a criterion is an
exclusion when being true disqualifies. So *"Patients must not have received
prior gemcitabine chemotherapy"* is about whether the person received
gemcitabine:

- "Yes, I had gemcitabine last year." → `holds`
- "I've never had gemcitabine." → `does-not-hold`

Likewise *"breastfeeding should be discontinued if the mother is treated"* is
about whether she is breastfeeding. For an inclusion, the statement is the
requirement: *"must have completed radiation therapy ≥ 3 weeks prior"* holds
when the radiation finished more than three weeks ago.

## Rule 2: a fact restates the criterion, plainly negates it, or compares numbers

The expected outcome has to follow from reading the fact next to the
criterion. Three forms are allowed:

- **Restates:** *Allergic to monoclonal antibodies* ← "I'm allergic to
  monoclonal antibody drugs, I had a reaction to one." → `holds`
- **Plainly negates:** *close contact with a person with known or suspected
  COVID-19* ← "No, I haven't been near anyone with COVID." → `does-not-hold`
- **Compares a number with a number:** *≥ 18 years* ← "I'm 71." → `holds`.
  *within 5 years* ← "That was in 2012." → `does-not-hold`, when the vignette's
  timeframe makes the arithmetic unambiguous.

What a fact must not do is require knowing what a medical term covers. "I take
pembrolizumab" does not settle *previous systemic anti-cancer therapy* without
knowing what pembrolizumab is. Either write "I've had immunotherapy for my lung
cancer", which restates the criterion, or use Rule 3.

## Rule 3: `defer` when reading is not enough

Mark a `patient` fact `defer` when the person gives a real answer, but whether
it satisfies the criterion depends on interpretation. This happens with
qualifiers the protocol does not define (*significant*, *serious*, *active*,
*adequate*) and with terms a lay answer does not map onto cleanly.

- *substance abuse disorders* ← "I have a few beers at the weekend." → `defer`.
  Whether that is a disorder is not something a reader can settle, and it is
  not something the agent should settle either.

For a `defer` fact, any abstention by the agent is correct and any
determination is confidently wrong. That is the point: these facts test
whether the agent knows when to stop. Include some in every study, but they
should be a minority. An agent is only useful if most answers can be settled,
and abstention can only be measured against facts that can be.

## Rule 4: which labels get facts

- **Every `patient` label gets exactly one fact,** with `expected`. The loader
  refuses a vignette that leaves one out.
- **`clinical` labels get a fact only when this person would plausibly know
  something about it.** Use `reported` for what they say (`holds`,
  `does-not-hold`, `unknown`), and only where the fact restates the criterion
  in its own words (Rule 2). Leave `reported` off when it would need
  interpretation; the fact still shapes the conversation but is not graded.
  Give each vignette one or two clinical facts that restate their *whole*
  criterion, even when it bundles several requirements (*pathologically
  confirmed, resectable, previously untreated*), with `reported` graded. The
  simulated person answers only what is asked, so a brief first answer covers
  part of it. Whether the agent follows up to get the rest (spec §4.1) then
  shows up in the reported agreement.
  **Never put `expected` on a clinical fact.** The agent is not allowed to
  settle a clinical criterion on the patient's word (spec D2), so there is
  nothing to expect.
- **`protocol` and `definitional` labels get no facts.** They are never put to
  a participant.
- Lab values (creatinine, platelets, bilirubin and so on) are not asked
  (spec §4.2). Give them no fact.

## Rule 5: behaviors

Every vignette has one primary `behavior`, which tells the simulated
participant how to play the conversation overall:

| Behavior | What the person does | How it shows in the facts |
| --- | --- | --- |
| `cooperative` | Answers what is asked, plainly | Mostly clean `holds` / `does-not-hold` |
| `vague` | Answers loosely | Several facts worded vaguely enough that they settle nothing: "I think I had something a while back" → `unresolved` |
| `volunteers` | Offers facts before they are asked | Clean facts; the simulator mentions some early, which tests out-of-order handling |
| `contradicts` | Says one thing, later the opposite | At least two facts carry `laterSays` → `unresolved` |
| `declines` | Declines some questions | At least two facts carry `declines: true`, `says: null` → `unresolved` |

Individual facts can decline or contradict in a vignette of any behavior. No
vignette is pure cooperation: each has at least one `defer`, decline,
contradiction or vague `unresolved` fact. Across the set, each behavior is
primary in at least two vignettes.

A vague fact must still be about the criterion: "not sure, it was a while
ago" in answer to a question about prior treatment. Being evasive is not the
same as saying nothing.

## Rule 6: facts are consistent with each other

The simulator answers from all of a vignette's facts at once, so they have to
describe one coherent person.

- A fact must not contradict another fact (except through `laterSays`, which is
  deliberate).
- Where two criteria overlap, their facts agree. If *previously untreated*
  (clinical) says "I haven't started any treatment", *any previous systemic
  anti-cancer therapy* (patient) is `does-not-hold`.
- Where the persona states an age or sex, the facts agree with it.

## Rule 7: the persona is manner, not medical history

`persona` gives the simulator a voice: rough age, occupation, how they talk.
It carries no medical detail beyond what the facts already say. A persona that
mentions a heart condition adds a fact that no criterion checks, and the
simulator will use it.

## Rule 8: everything is invented

No vignette is adapted from a real case report, forum post, news story or
published patient account, however anonymized. Names are not used at all. This
is the project's no-PHI constraint applied to the one artifact most likely to
drift toward realism.

## Rule 9: read the label, not the parse

Facts are written against the label's `quote` in `evals/cases/labels/`. The
parser's output is never consulted. A vignette written against parsed criteria
would grade the agent against the parser's mistakes.

## Provenance

Every vignette records `drafter`, this `guide`, and `sawAgentPrompt`. That
field is `false` for every vignette in slice 0004, which commits them before
the agent's prompts are written. `labelSetSha` pins the vignette to the exact
label file it was written against. If the labels change, the loader refuses
the vignette until its facts are re-read.

## The dev vignette

`vignettes/dev/` holds one vignette that is never scored. The agent's prompts
are iterated against it and nothing else, so prompt tuning cannot leak into
the headline. It follows every rule above.
