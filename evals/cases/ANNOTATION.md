# Annotation guide

How a protocol's eligibility text is turned into labels. Written down because
labels are the ground truth every number in this project is computed against,
and a rule you can read and disagree with is worth more than a pile of
individual judgment calls that happened to feel right on the day.

These are **annotation conventions, not clinical judgments.** Deciding whether
`A and B` is one criterion or two is a question about the schema's granularity,
not about medicine. Where a genuine clinical question arises — whether a
threshold is sensible, whether a condition is serious — the labeller does not
answer it: the protocol says what it says, and the label records that.

## Who wrote the labels, and why that limits the claim

Labels are authored by the same party that wrote the extraction prompt the
parser runs. That is a real weakness: agreement between a parse and a label is
partly agreement between a prompt and its author, so **recall measured this way
is not accuracy against expert judgment and is not comparable to published
criterion-matching results.** The README says so.

This guide is the mitigation. It makes the conventions explicit enough that a
second annotator — a person, or a different model — could apply them
independently, and the disagreement between them would be measurable. Doing
that is the honest fix and it is not yet done.

## Rule 1: one criterion per independently checkable requirement

The unit is what a coordinator or a patient can answer on its own, because
slice 0004 asks about one thing at a time and records a determination per
requirement.

- **`and` joining two separately checkable things is two criteria.**
  `Absolute granulocyte count >= 1500/mm3 and WBC >= 3000/mm^3` is two: two
  different measurements, each with its own threshold, each independently true
  or false.
- **`or` offering alternative ways to satisfy one requirement is one
  criterion.** `Serum creatinine =< 1.5 mg/dL, or calculated creatinine
  clearance >= 60 mL/min` is one requirement — adequate renal function — with
  two acceptable forms of evidence.
- **A list of conditions sharing one exclusion verb is one criterion per
  condition.** A sentence excluding patients with myocardial infarction,
  congestive heart failure, unstable angina, arrhythmia or oxygen-requiring
  pulmonary disease is five criteria, because each is separately checkable.
  The shared rationale does not make them one requirement.
- **Split when the disjuncts need different checks; keep them together when they are forms of one check.** This is the line that decides most disjunctions, and it was added after drafting NCT06728852 showed the rule as first written cutting too finely. *Myocardial infarction, congestive heart failure, unstable angina, arrhythmia and oxygen-requiring pulmonary disease* are five criteria: each is a different question with a different answer. *Major surgery, open biopsy, or significant traumatic injury within 28 days* is one: a coordinator asks a single question and one answer settles all three. *Confirmed or suspected COVID-19* is one; *close contact with a case* is another, because it asks about someone else. *Pregnant* and *lactating* are two, because one is a test and the other is a question.
- **A clarification of how a requirement must be met stays with it.**
  `histologically confirmed NSCLC; cytology alone is not acceptable` is one
  criterion: the second clause restricts the evidence for the first rather than
  adding a separate thing to check.

## Rule 2: polarity is read from meaning, never from the heading

Registries frequently file everything under `Inclusion Criteria:`. NCT00077350
does, and a third of its bullets exclude patients. A criterion is `exclusion`
when being true disqualifies, `inclusion` when being true qualifies.

## Rule 3: type follows the 0002 definitions, applied consistently

`patient`, `clinical`, `definitional`, `protocol`, as defined in
`src/criteria/prompt.ts`. The boundary that recurs:

- A **fact about the person** is `patient` or `clinical` by what kind of fact
  it is, not by who happens to know it.
  - **`patient`:** who they are (age, sex), what has been done to them or by
    them, and what they will agree to. Treatments, medications, radiation,
    surgery, transfusions, vaccines, participation in other studies, allergic
    reactions to drugs, pregnancy and breastfeeding, habits such as smoking,
    and consent or willingness. These are `patient` even when a chart would
    also record them.
  - **`clinical`:** a condition, diagnosis, symptom, test result, measurement
    or clinician's assessment. These are `clinical` even when the person knows
    them, because a coordinator confirms them against the chart.
  - When one criterion joins the two, a condition and the treatment of it, the
    condition decides, and it is `clinical`.
- An **action the site must perform** is `protocol`, even when it concerns the
  patient's body. Testing high-risk patients for G6PD deficiency at protocol
  entry is `protocol`; testing positive for it is `clinical`. Tissue adequacy
  for central PD-L1 testing is `protocol`; a required PD-L1 result is
  `clinical`.

The first bullet was written in slice 0011, to describe labels made in 0003.
Until then this guide and the parser's prompt both said `clinical` "when it
needs a chart" and `patient` "when they could answer it themselves", and
neither said which wins when both are true. The labels had already settled it
the way the bullet says. Checked against all 61 `patient` and 137 `clinical`
labels, 191 follow it. These 7 don't, and they are left as labelled, because
the labels are the ruler and a slice that tunes the parser doesn't move it:

| Label | Labelled | By the rule | Text |
| --- | --- | --- | --- |
| NCT00077350 L35 | patient | clinical | clinical history of G6PD deficiency |
| NCT03433469 L20 | patient | clinical | ability to swallow oral medications |
| NCT04316364 L22 | patient | clinical | substance abuse disorders |
| NCT06728852 L25 | patient | clinical | NSCLC with hemoptysis (>5 ml/day) |
| NCT03433469 L4 | clinical | patient | received no more than 28 days of treatment |
| NCT04385368 L15 | clinical | patient | patients undergoing wedge resection |
| NCT04385368 L50 | clinical | patient | non-leukocyte-depleted whole blood transfusion within 120 days |

NCT06728852 L38, "history of substance abuse that cannot be quit", is read as
a habit, like smoking, and follows the rule. A second annotator applying this
guide is the check on all of it.

## Rule 4: a screening requirement is labelled; an in-trial obligation is not

The question is whether it can be answered *before* enrolment.

- `women of child-bearing potential and men must agree to use adequate
  contraception` — labelled. Willingness is answerable at screening.
- `should a woman become pregnant while participating in this study, she should
  inform her treating physician` — not labelled. It governs conduct after
  enrolment.

## Rule 5: rationale is not a criterion, and goes in `notCriteria` with a reason

Cooperative-group protocols in particular explain themselves at length.
`because Triapine is a heterocyclic carboxaldehyde thiosemicarbazone with the
potential for teratogenic effects` asserts nothing about eligibility; it says
why a criterion exists. Every such passage is recorded in `notCriteria` with a
written reason, never simply dropped — the distinction between "correctly
ignored narrative" and "missed a requirement" is the whole reason recall is
measurable at all.

## Rule 6: a restatement is labelled once

Protocols restate requirements with different emphasis. The first clear
statement is labelled; later restatements go in `notCriteria` citing the label
they duplicate. Labelling both would count one requirement twice and flatter
recall.

## Rule 7: spans are verbatim and contiguous

A label's `quote` must equal `criteriaText.slice(start, end)` exactly,
including registry escaping such as `\>=`. Where a criterion's words are not
contiguous, the span covers the smallest stretch containing the requirement.
The loader enforces the first half; the second is a judgment.
