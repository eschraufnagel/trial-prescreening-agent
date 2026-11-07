# The screening agent

How the prescreening conversation works, how it's measured against made-up patients, and where it fails. Part of the [Trial Prescreening Agent](../README.md) documentation.

## The screening agent

`ScreeningSession` in `src/screening/` holds a prescreening conversation. It works through one study's criteria and returns one finding per criterion, each with the person's own words behind it. **It never returns an eligibility decision.** The result has no field that could hold one, and a test checks that.

The code runs the conversation. The model is asked to do only two things: phrase one question, and read one reply. Code decides which criterion comes next, what may be asked at all, how many times, and what a reply is allowed to settle:

| Criterion type | What happens | Possible findings |
| --- | --- | --- |
| `patient` | Asked; an outright answer can settle it | holds, does not hold, unresolved |
| `clinical` | Asked; the answer is recorded as *reported* but never settles it | needs chart review |
| `clinical`, a lab value | Not asked; nobody knows their creatinine | not raised |
| `protocol`, `definitional` | Never put to the person | not raised |

Findings are about whether the criterion's *statement* is true of the person, never whether that is good or bad for them. Each finding's quote has to be found in what the person actually said, or the finding is rejected. A partial answer gets one follow-up about the missing part. A correction that contradicts an earlier answer unsettles it. A person who declines is not asked again. No answer stops the conversation early, even one that rules the person out, because the other answers may matter for a different trial.

Since slice 0009, the model reading a reply works in a fixed order. For each criterion the reply touches, it first writes the criterion as one plain statement about the person ("The person has never smoked"), then the quote, then whether those words settle the statement *outright*, and only then its reading. A reading that isn't outright is recorded as unclear, by code, with what the model would have said kept beside it. That covers a hedge, a guess, or a fact the reader would have to fit to the criterion's term. A new reading, **does not apply**, covers a person the criterion isn't about, such as a criterion for women answered by a man. It leaves the criterion unresolved for the coordinator. The model is shown what was already recorded for each answered criterion, newest first, and any change to a settled answer unsettles it.

Since slice 0021, **the person can ask the agent for something, and it responds before moving on.** The model reading a reply also reports whether it asks for anything, and quotes the asking words. Code decides what that does:

| The person asks… | What the agent does |
| --- | --- |
| what the question means ("elaborate on this") | Explains the question in plain words, from the criterion's own words, then asks it again. What the same reply said about that criterion is set aside, because it was said before the person understood the question |
| why it's asked | Says the study can only include people who meet its requirements, then asks again |
| about the study or the process | Answers from a fixed list (the title, that this is prescreening and not enrolment, that a coordinator reviews everything, that any question can be skipped), then asks |
| to stop | Fixed text: they can stop at any time by closing the page, and a coordinator will still follow up. Then the question again |

Each criterion gets at most one of these responses, and a response doesn't use up one of its two asks, so the conversation still always ends. A second "what does that mean?" on the same question gets the coordinator offered, and the answer is recorded. The request's words have to be in the reply, like a finding's. Known limits:

- a request is taken to be about the question just asked;
- one request per reply;
- explanations come from the protocol's words, not the plain-language renderings.

The vignettes never ask for anything. So this is tested by deterministic tests and by playing it in the app, not by the screening numbers below, which come from 0009's prompts (`2c46ada9a1d5`).

### Corrections, since 0022

When the person corrects an earlier answer while answering a different question ("Actually, it was more recent than I said"), the model reading the reply now reports **corrections** first: each already answered criterion the reply changes, with the words that change it. A correction goes through the same rules as any reading. It must quote the reply word for word, and a change to a settled answer unsettles it, so the row ends open for the coordinator, never settled on the later answer. The next question starts by acknowledging it.

It was measured twice on the local model, with the same settings as below, at prompt `f761514b3da8`:

- **A replay** of the read call at recorded turns (`npm run corrections:replay`, `evals/results/corrections/01-f761514b3da8.json`). Of the ten scripted corrections in the committed conversations, six correct an answer that was settled when the correction came. The read call caught 5 of those 6, one more than the recorded conversations did, and gave no false corrections in 44 ordinary turns. The miss was noticed, but its statement was read in the wrong direction, so it agreed with the first answer.
- **The five dev vignettes, re-run once** (`evals/results/screening/dev/13-f761514b3da8.json`, against `12-834179395652.json`). Corrections caught 3 of 4, as before, but a different one is missed: the fourth was noticed, and rejected because its quote wasn't word for word. Confidently wrong 3 of 38, against 3 of 44. One false correction: a later "I don't know if I'm taking any medications that prolong the QT interval" unsettled "no regular medicines".

**Abstention rose** in that run, from 2 of 43 to 7 of 42 (0.17), over the bar of 0.10 set before it. Six of the seven weren't corrections but the misreading 0023 fixed (below). The seventh was the false correction above. The owner accepted the slice with that cost recorded. Limits:

- the scored fifteen weren't re-run, so the results below are 0009's, and still count its missed corrections;
- the replay's one extra catch is compared with a conversation recorded on an older prompt, because the replay before the change was skipped;
- a vaguer correction of a clinical report, and a later answer to a question first left open, are still ignored.

### Who a criterion is for, since 0023

A reading of *does not apply* says the person is outside the group a criterion is written about, such as a criterion only for men answered by a woman. It leaves the row open for the coordinator. Until 0023 the model also gave it where it didn't belong: "No. I'm a man, so not pregnant", in reply to a pregnancy question, was read as *does not apply* to pregnancy, to breastfeeding, and to a contraception criterion that names men too ("women of child-bearing potential and men must agree…"). Each row closed at once, most of them never asked.

Two changes, at prompt `48e8483f12e2`:

- **Code:** *does not apply* closes only the criterion the last question asked about. On any other open criterion it's held back, like an answer that wasn't said outright: the row stays open, keeps the person's words, and is asked in its turn. On a criterion already answered it's ignored, so it can't unsettle anything.
- **Prompt:** the reading's wording gives the failing case as its example. "Pregnant women are excluded" is about being pregnant, so its statement is "The person is pregnant", and a man who says he isn't gives *does not hold*.

**Measured once, on the five dev vignettes** (`evals/results/screening/dev/14-48e8483f12e2.json`, against `13-f761514b3da8.json`, same model and settings as below):

- abstention 0 of 43, against 7 of 42; correct abstention 16 of 18, against 15 of 18;
- confidently wrong 2 of 45, against 3 of 38, neither about *does not apply*;
- four rows were held back, then asked, and each answered, in about 12 more questions across the five conversations;
- *does not apply* was accepted twice, both times a woman answering a criterion only for men;
- 0022's corrections caught 4 of 4, with no false correction.

Limits:

- one run, on the vignettes 0009 tuned on; the scored fifteen weren't re-run;
- a criterion asked in a combined question ("pregnant or breastfeeding?") is recorded against one of them, so the other is asked again;
- a held-back reading shows on the row as unclear, because the review doesn't show what was held back (0009's limit);
- the opposite mistake is still made: "Female patients of childbearing potential must…" read as *holds* for a woman twelve years past menopause, where the vignette expects the coordinator to decide.

The opening and closing messages are fixed text, never model output:

> **agent:** Hello, and thank you for your interest in the study "A Trial of SHR-1316/Placebo in Combination With Chemotherapy in Patients With Resectable NSCLC". I'll ask you a short series of questions, one at a time. You can skip any question. A study coordinator will review everything you tell me and follow up with you.
> …
> **agent:** Have you been diagnosed with resectable Stage II, IIIA, or Selected IIIB non-small cell lung cancer (NSCLC) that has not yet been treated?
> **person:** Yes, I have been diagnosed with stage IIIA lung cancer. The biopsy confirmed it, and the surgeon says it is resectable, but I haven't started any treatment yet.
> …
> **agent:** Do you have any active autoimmune diseases, such as rheumatoid arthritis, lupus, or Crohn's disease?
> **person:** Yes, I have rheumatoid arthritis.
> …
> **agent:** Are you allergic to monoclonal antibodies or other protein drugs? These are medicines made from proteins, such as certain cancer or autoimmune treatments.
> **person:** I prefer not to discuss that topic.

The diagnosis and the arthritis are `clinical`, so both are recorded as reported and left for chart review. The allergy is a `patient` criterion; the decline leaves it unresolved, and it is not asked again. The excerpt is verbatim from a committed run.

The whole conversation, with each finding beside the words behind it, is in `evals/results/screening/examples/NCT04316364-v2-labels.html`, from 0004's agent. Open it in a browser.

```
npm run screening:chat -- NCT04316364      screen yourself (made-up answers) against the real agent
npm run screening:show -- <file> --html    render any conversation beside its findings
npm run eval:screening                     run the vignettes and grade them
npm run vignettes:check -- NCT04316364     read vignettes beside the criteria they test
```

### How it is measured

Fifteen hand-written **vignettes**, three per labelled study, each an invented person. For every `patient` criterion, a vignette says what the person would say and what the agent should conclude. Each fact restates, plainly negates or numerically compares against the criterion's own words, so checking an expected outcome means reading two sentences side by side, not making a clinical judgment. Where an answer would need interpretation ("I have a few beers at the weekend" against *substance abuse disorder*), the expected outcome is `defer`: any abstention is right, and any determination is wrong. Each vignette has a behavior: cooperative, vague, volunteers answers early, contradicts itself, or declines. The conventions are in `evals/cases/VIGNETTES.md`.

A **simulated participant**, played by the same local model, answers from the vignette's facts. It never sees the agent's state. Code, not the model, makes it contradict itself or volunteer answers on cue.

The headline is **confidently wrong**: of the answers the agent committed to, how many a coordinator could not trust. It is never reported without **abstention** beside it, because an agent that commits to nothing scores zero wrong and is useless.

### Results

Two runs of the same fifteen vignettes on the same model and settings: `Qwen3.6-35B-A3B-MLX-8bit` (8-bit) via oMLX, reasoning mode off, temperature 0, seed 20260921, simulator `5fd4476340c9`, vignettes `8d5dd6f20c73`.

- **Before** is 0004's agent: prompt `c5778afe9cbd`, grader v3, committed in `evals/results/screening/01-c5778afe9cbd.json`.
- **After** is 0009's: prompt `2c46ada9a1d5`, grader v4, committed in `evals/results/screening/02-2c46ada9a1d5.json`.

The fixes were aimed at the failures 0004 found in twelve of the fifteen conversations per source. Those twelve are the headline. The other three were read less closely and are reported apart below. `npm run screening:compare -- 01-c5778afe9cbd.json 02-2c46ada9a1d5.json` prints every number here.

| The twelve | Confidently wrong | Answerable left open | Should-be-open left open |
| --- | --- | --- | --- |
| From labels, before | 17 of 122 (0.14) | 1 of 108 (0.01) | 16 of 31 |
| From labels, after | **6 of 104 (0.06)** | **8 of 107 (0.07)** | 25 of 30 |
| From parses, before | 7 of 54 (0.13) | 1 of 49 (0.02) | 10 of 16 |
| From parses, after | **6 of 51 (0.12)** | **1 of 47 (0.02)** | 11 of 16 |

**The bar was met.** It was written before the run: from labels, confidently wrong at or below 0.07 and abstention at or below 0.10; from parses, no worse than before. Both hold, so the change may be called an improvement. From labels, wrong findings fell by more than half. From parses the change is small, one finding fewer.

**It cost abstentions.** From labels, 8 answerable questions were left open where 0004 left 1. Four of the eleven abstentions across the fifteen and both sources are a man saying "I'm a man, so I'm not pregnant", read as *does not apply* to a criterion about a condition, not a group. That is right in spirit and wrong under the vignettes' convention. Four more are plain denials held back as not outright, all in one vignette whose persona hedges every reply. The other three are reasonable. The agent also asked more: follow-ups rose from 97 to 157 across both sources, and questions from 819 to 880. In the twelve from labels it heard 21 of 24 graded clinical answers correctly, down from 24 of 24. Two plain answers were held back as not outright, and one was read as partial.

**Some of the drop is one new reading.** Four of the twelve's wrong findings in 0004 were a criterion for the other sex answered as if it applied. Without those four, before is 13 of 118 (0.11) and after is 6 of 104 (0.06). The rest of the drop is the other fixes.

**The three least-seen, apart.** `NCT03433469-v2`, `NCT04385368-v2` and `NCT06728852-v2` had their failures read at 0004's Gate 3, but those failures weren't used to design the fixes. They're least-seen, not unseen, and they're small:

| The three | Confidently wrong | Answerable left open |
| --- | --- | --- |
| From labels | 7 of 41 (0.17) → 3 of 40 (0.07) | 0 of 37 → 0 of 37 |
| From parses | 5 of 18 (0.28) → 2 of 16 (0.12) | 0 of 17 → 2 of 17 |

Two of their facts are, it turned out, the same test items as facts in the dev vignettes the fixes were tuned on: an inhaled steroid in `NCT04385368` L65, and a drug that stopped working in `NCT06728852` L19. A warning had flagged their shared wording while the dev vignettes were being written, and they were reworded, not replaced. After the run, the first is right and the second, from parses, is wrong.

### Where the agent fails

Every confidently wrong finding of the new run, 17 across the fifteen and both sources, was read in its transcript and attributed:

| Cause | Count | Example |
| --- | --- | --- |
| Settled what needed interpretation | 5 | a criterion that also requires a negative pregnancy test, settled from "I am not breastfeeding… I have not had a pregnancy test yet" |
| Missed a self-correction | 4 | "Just the one chemotherapy regimen" … later "Actually, I had two" — the correction was read only for the question it answered |
| Accepted a hedged answer | 1 | "Swallowing is a bit hard these days, but I manage most medications, mostly" → settled |
| Read an exclusion backwards | 1 | "I was on anlotinib and the treatment failed", written as the statement and then read as not holding |
| Other agent errors | 4 | a time comparison turned round; "I would sign" read as not yet signed; a statement that dropped "female patients", so a man was recorded as agreeing |
| The simulated participant said more than its fact | 2 | an unscripted line that settled the ambiguity the fact was there to test |

Fifteen are the agent's and two the simulator's. The numbers above are as measured, simulator errors included. The worked example, `evals/results/screening/examples/NCT00077350-v2-labels-0009.html`, is the same vignette as 0004's missed correction, and it is still missed. The correction arrived in the reply to the next question, and the model read it only for that question, although the answer it contradicted was at the top of what the model was shown. That shape, a correction volunteered in a reply about something else, is the one 0009 did not fix. 0004's version is beside it, as `NCT00077350-v2-labels.html`.

The ask call was not changed in 0009, and it still has its faults. It asks for performance status "on a scale of 0 to 1" in the worked example, and "to help us check eligibility", or close to it, opened four of its questions in the new run.

### Screened from the parser's output instead

The same vignettes, with the agent fed the criteria the parser actually produced rather than the labels. The parser's output was the same for both runs:

| | Count |
| --- | --- |
| Patient criteria that reached the agent intact | 84 of 183 |
| Typed `clinical` by the parser, so never settled by the person | 66 |
| Bundled with another criterion, so not scorable one by one | 33 |
| Missed by the parser entirely | 0 |

On the ones that arrived intact, all fifteen vignettes, the agent was confidently wrong on 8 of 67 (0.12), down from 12 of 72 (0.17). **The parser's cost is not accuracy but reach:** more than half of what a person could answer never reaches the agent as something to settle. On the longest protocol, NCT04385368, 39 of 57 were mis-typed. That is 0003's finding that the parser collapses toward `clinical`, now measured in a conversation.

Slice 0011's parser raises reach from 84 to 120 of 183 (see [After slice 0011](parser.md#after-slice-0011)). Nobody has screened from its parses yet: the six to seven hour run was skipped as not worth its time for a proof of concept. The table above, and the review's parse conversations, are from 0003's parser. `npm run app -- --examples --source parse` screens from 0011's, which are committed.

### What these numbers do not mean

- **One run each.** Temperature 0 and a fixed seed make a run reproducible, not a sample. A changed reading changes what is asked next, so every conversation took a different path. No run was repeated to measure this. On the dev vignettes, the last two prompt revisions changed only wording and differed by two wrong findings, on facts that flipped for reasons neither change explains. A difference of two or three findings here could be the path alone.
- **The fixes' author wrote the dev vignettes, after reading the twelve's failures.** The fixes were iterated on four new dev vignettes and 0004's one, never on the fifteen. But the author knew what the fifteen got wrong, and the twelve's before numbers are of conversations the author had read. That is why the three are reported apart.
- **The attribution above was not made by a person.** It was read by a Claude Sonnet 5 model in a fresh context, barred from the fixes and this project's documents. It attributed 11 of the 17 to the agent, 2 to the vignettes' convention, 2 to the simulator and 2 to the grader. The fixes' author, also a Claude model, checked the four convention and grader calls against the conversation files and moved all four onto the agent. For example, in one case the model wrote the right statement and quote and then read them backwards. Each move counts against the fixes, not for them, but the author overrode the independent reader. The record is under Gate 3 in `work/0009-agent-fixes/plan.md`. The dev vignettes were checked the same way, by a model, not a person.
- **The vignettes, graders and the agent's prompts share an author.** Vignettes were committed before the prompts existed, which stops the prompts being tuned to them. It does not stop shared blind spots. `VIGNETTES.md` is written so a second, independent drafter could follow it. Measuring one is part of the held comparison in `work/ROADMAP.md`.
- **The participant is simulated, by the same model as the agent.** Its fidelity is checked, but the model-based check is noisy. In 0004's run it flagged 375 of 1,048 replies, most of them honest "I don't know"s. It is used as a flag for reading, never a score.
- **Fifteen vignettes are few.** Each study's numbers rest on three invented people.
- **This is not an eligibility accuracy figure.** The agent makes no eligibility decision, and these numbers say nothing about how often a real coordinator would reach the right one.
