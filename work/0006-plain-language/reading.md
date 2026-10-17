# reading: 0006 plain language

The reading for Gate 3 (spec §8, plan step 11). Each pair is a criterion in the protocol's words and its plain-language rendering as the page shows it.

**What is read,** fixed by rule before reading: all 37 criteria of NCT00077350, which was never shown at Gate 1, and every rendering in any other study that passed only on the retry (13). 50 pairs in all. The renderings are the second full run, prompt `e5a58e26c2ac`.

A criterion of NCT00077350 whose rendering is not shown has no plain words to read; it is listed with the reason, and needs no answer.

**Two questions for each pair.** Neither needs medical knowledge. Compare the words, not what they mean clinically.

1. **Missing:** is any word, number or condition on the left missing on the right?
2. **Added:** does the right add a condition, limit or requirement that is not on the left? An explanation of a word does not count.

Answer by writing **yes** or **no** after each question, and for a yes, the words involved. The pairs can also be read in the page: `npm run app -- --fake`, start the study, and every criterion is listed from the first turn.

**What happens to a yes** (plan step 12): it becomes a rule in `src/plain/vocabulary.ts` with a test, so the check refuses that rendering from now on; or, if the check cannot learn it, a named known-gap test and a decision to accept the rendering or regenerate it. The README reports "read N, found M, of which K are now caught by the check."

## NCT00077350 (the whole study)

### L1

- **Protocol:** Patients must have histologically confirmed non-small cell lung cancer (NSCLC); cytology alone is not acceptable
- **Plain:** Has non-small cell lung cancer (NSCLC) confirmed by examining a tissue sample (histologically); cytology alone (examining cells) is not acceptable.
- Missing: no
- Added: no

### L2

- **Protocol:** Patients must have progressive or recurrent NSCLC
- **Plain:** Has progressive or recurrent NSCLC (non-small cell lung cancer that has grown or come back).
- Missing: no
- Added: no

### L3 · retry

- **Protocol:** must have failed one and only one prior cytotoxic chemotherapy regimen for advanced disease
- **Plain:** Has failed one and only one prior cytotoxic chemotherapy regimen (treatment using drugs to kill cells) for advanced disease.
- Missing: no
- Added: no

### L4

- **Protocol:** patients must not have received prior gemcitabine chemotherapy
- **Plain:** Has not received prior gemcitabine chemotherapy.
- Missing: no
- Added: no

### L5

- **Protocol:** Patients must have measurable disease, as defined by RECIST, within 4 weeks prior to registration
- **Plain:** Has measurable disease (tumor that can be measured) as defined by RECIST within 4 weeks before registration.
- Missing: no
- Added: no

### L6

- **Protocol:** Patients must have an ECOG performance status of 0 or 1
- **Plain:** Has an ECOG performance status (a measure of how well a person can perform ordinary daily tasks) of 0 or 1.
- Missing: no
- Added: no

### L7

- **Protocol:** Bilirubin < 1.5 x upper limit of normal
- **Plain:** Bilirubin (a substance in the blood) is less than 1.5 times the upper limit of normal.
- Missing: no
- Added: no

### L8

- **Protocol:** AST (SGOT) < 3 x upper limit of normal
- **Plain:** AST (SGOT) (a liver enzyme) is less than 3 times the upper limit of normal.
- Missing: no
- Added: no

### L9

- **Protocol:** Serum creatinine =< 1.5 mg/dL, or calculated creatinine clearance >= 60 mL/min
- **Plain:** Serum creatinine (a waste product in the blood) is no more than 1.5 mg/dL, or calculated creatinine clearance (a measure of kidney function) is at least 60 mL/min.
- Missing: no
- Added: no

### L10

- **Protocol:** Absolute granulocyte count >= 1500/mm3
- **Plain:** Has an absolute granulocyte count (a type of white blood cell) of at least 1500/mm3.
- Missing: no
- Added: no

### L11

- **Protocol:** WBC >= 3000/mm\^3
- **Plain:** Has a white blood cell (WBC) count of at least 3000/mm^3.
- Missing: no
- Added: no

### L12

- **Protocol:** Hemoglobin >= 9 g/L
- **Plain:** Has a hemoglobin (a protein in red blood cells that carries oxygen) level of at least 9 g/L.
- Missing: no
- Added: no

### L13

- **Protocol:** Platelet count >= 100,000/mm\^3
- **Plain:** Has a platelet count (a type of blood cell that helps with clotting) of at least 100,000/mm^3.
- Missing: no
- Added: no

### L14

- **Protocol:** Patients must have completed any radiation therapy >= 3 weeks prior to registration
- **Plain:** Has finished any radiation therapy at least 3 weeks before registration.
- Missing: no
- Added: no

### L15

- **Protocol:** Patients must have completed prior cytotoxic chemotherapy >= 3 weeks prior to registration
- **Plain:** Has finished prior cytotoxic chemotherapy (treatment that kills cells) at least 3 weeks before registration.
- Missing: no
- Added: no

### L16 · retry

- **Protocol:** have recovered from adverse effects from the chemotherapy to =< Grade 1, or baseline
- **Plain:** Has recovered from adverse effects from the chemotherapy to no more than Grade 1 (mild symptoms) or baseline (the level before the chemotherapy started).
- Missing: no
- Added: no

### L17 · retry

- **Protocol:** Patients with brain metastases which have been treated are eligible if the patient is > 3 weeks post completion of treatment for their brain metastases, and patient is neurologically stable
- **Plain:** Has brain metastases (cancer that has spread to the brain) that have been treated, and is more than 3 weeks after the treatment for the brain metastases finished, and is neurologically stable.
- Missing: yes — "are eligible if"
- Added: yes — "Has brain metastases" (made a requirement)
- **Outcome: now caught by the check.** A verdict with a condition ("are eligible if") must be kept (rule 7, `c9fb5f3`). Neither attempt keeps it, so L17 is no longer shown.

### L18 · retry

- **Protocol:** patients with previous brain metastases who have not yet received therapy specifically intended for their brain metastases are not eligible to enroll in this protocol
- **Plain:** Has previous brain metastases (cancer that has spread to the brain) and has not yet received therapy specifically intended for their brain metastases, and is not eligible to enroll in this protocol.
- Missing: no
- Added: yes — "and is not eligible to enroll in this protocol"
- **Outcome: now caught by the check.** The retry was forced: the first attempt rightly dropped "are not eligible", and the check counted its "not". A verdict's negation now goes with the verdict (rule 4, `c9fb5f3`), so the first attempt is shown instead: "Has previous brain metastases (cancer that has spread to the brain) and has not yet received therapy specifically intended for their brain metastases." That text was not part of this reading.

### L19

- **Protocol:** Life expectancy greater than 3 months
- **Plain:** Has a life expectancy (estimated time left to live) of more than 3 months.
- Missing: no
- Added: no

### L20

- **Protocol:** Pregnant women are excluded from this study
- **Plain:** Is pregnant.
- Missing: yes — "women", "excluded from this study"
- Added: no
- **Outcome: accepted, by design.** A rendering restates the statement and leaves the verdict to the polarity tag, which shows "exclusion" on this row (spec §3). The question as written counts that as missing, and read literally it is. The coordinator pane (0007) is where polarity is applied.

### L21

- **Protocol:** breastfeeding should be discontinued if the mother is treated with Triapine®
- **Plain:** Breastfeeding should be stopped if the mother is treated with Triapine®.
- Missing: no
- Added: no

### L22

- **Protocol:** a negative serum pregnancy test is required within 14 days of study entry
- **Plain:** Has a negative serum pregnancy test (a blood test for pregnancy) within 14 days of study entry.
- Missing: no
- Added: no

### L23

- **Protocol:** women of child-bearing potential and men must agree to use adequate contraception (hormonal or barrier method of birth control; abstinence) prior to study entry and for the duration of study participation
- **Plain:** Women of child-bearing potential and men must agree to use adequate contraception (hormonal or barrier method of birth control; abstinence) before study entry and for the duration of study participation.
- Missing: no
- Added: no

### L24

- **Protocol:** HIV-positive patients receiving combination antiretroviral therapy are excluded from the study
- **Plain:** Is HIV-positive and receiving combination antiretroviral therapy.
- Missing: yes — "are excluded from the study"
- Added: no
- **Outcome: accepted, by design,** as L20.

### L25

- **Protocol:** Patients must not have an active second malignancy
- **Plain:** Does not have an active second malignancy (a new, currently growing cancer).
- Missing: no
- Added: no

### L26

- **Protocol:** Patients must not have, at the time of registration, uncontrolled intercurrent illness including, but not limited to, ongoing or active infection, or psychiatric illness/social situations that would limit compliance with study requirements
- **Plain:** Does not have, at the time of registration, uncontrolled intercurrent illness including, but not limited to, ongoing or active infection, or psychiatric illness/social situations that would limit compliance with study requirements.
- Missing: no
- Added: no

### L27

- **Protocol:** a history of myocardial infarction within the prior 6 months
- **Plain:** Has a history of myocardial infarction (heart attack) within the prior 6 months.
- Missing: no
- Added: no

### L28 · retry

- **Protocol:** symptomatic congestive heart failure
- **Plain:** Has symptomatic congestive heart failure (a condition where the heart pumps weakly, causing symptoms such as shortness of breath or swelling).
- Missing: no
- Added: no

### L29

- **Protocol:** unstable angina pectoris
- **Plain:** Has unstable angina pectoris (chest pain that is new, worsening, or occurs at rest).
- Missing: no
- Added: no

### L30

- **Protocol:** cardiac arrhythmia requiring medical intervention (with the exception of chronic, stable, asymptomatic atrial fibrillation)
- **Not shown:** negations: 1 in the protocol, 3 in the plain

### L31

- **Protocol:** pulmonary disease requiring oxygen
- **Plain:** Has a lung disease that requires oxygen.
- Missing: no
- Added: no

### L32

- **Protocol:** Patients must not have dementia or active psychosis
- **Plain:** Does not have dementia or active psychosis.
- Missing: no
- Added: no

### L33

- **Protocol:** Patients must not have used any investigational agent in the month before study enrollment
- **Plain:** Has not used any investigational agent (a drug being studied) in the month before study enrollment.
- Missing: no
- Added: no

### L34

- **Protocol:** Patients must not have a history of allergic reactions attributed to compounds of similar chemical or biologic composition to Triapine® or other agents used in this study
- **Plain:** Has no history of allergic reactions attributed to compounds of similar chemical or biologic composition to Triapine® or other agents used in this study.
- Missing: no
- Added: no

### L35

- **Protocol:** Patients must not have a clinical history of G6PD (glucose-6-phosphate dehydrogenase) deficiency
- **Plain:** Has no clinical history of G6PD (glucose-6-phosphate dehydrogenase) deficiency.
- Missing: no
- Added: no

### L36

- **Protocol:** persons at high risk for this condition (patients of African, Asian, or Mediterranean origin/ancestry) must undergo specific clinical testing at protocol entry for this condition
- **Plain:** Persons at high risk for this condition (patients of African, Asian, or Mediterranean origin/ancestry) must undergo specific clinical testing at protocol entry for this condition.
- Missing: no
- Added: no

### L37

- **Protocol:** patients testing positive for G6PD deficiency are excluded from protocol entry
- **Plain:** Has tested positive for G6PD deficiency (a genetic condition that can cause red blood cells to break down).
- Missing: yes — "are excluded from protocol entry"
- Added: no
- **Outcome: accepted, by design,** as L20.

## NCT03433469 (passed on the retry)

### L7 · retry

- **Protocol:** Brain magnetic resonance imaging (MRI) (or CT if contraindication to MRI) within the last 60 days showing no evidence of metastatic disease
- **Plain:** A brain magnetic resonance imaging (MRI) scan (or a CT scan if an MRI is contraindicated) within the last 60 days shows no evidence of metastatic disease (cancer that has spread from another part of the body).
- Missing: no
- Added: no

### L9 · retry

- **Protocol:** The patient must have a tumor size >=1 centimeter (cm) in its longest diameter.
- **Plain:** Has a tumor size of at least 1 centimeter (cm) in its longest diameter.
- Missing: no
- Added: no

### L23 · retry

- **Protocol:** Women of childbearing potential (WoCBP): women between menarche and menopause who have not been permanently or surgically sterilized and are capable of procreation
- **Plain:** Women of childbearing potential (WoCBP): women between their first menstrual period (menarche) and menopause who have not had permanent or surgical sterilization and can become pregnant.
- Missing: no
- Added: no

### L54 · retry

- **Protocol:** Active second malignancy, i.e. patient known to have potentially fatal cancer present for which he/she may be (but not necessarily) currently receiving treatment; patients with a history of malignancy that has been completely treated, with no evidence of that cancer currently, are permitted to enroll in the trial provided all chemotherapy for prior malignancy was completed > 12 months prior and/or bone marrow transplant > 2 years prior
- **Plain:** Has an active second malignancy, i.e. patient known to have potentially fatal cancer present for which he/she may be (but not necessarily) currently receiving treatment; patients with a history of malignancy that has been completely treated, with no evidence of that cancer currently, are permitted to enroll in the trial provided all chemotherapy for prior malignancy was completed > 12 months prior and/or bone marrow transplant > 2 years prior.
- Missing: no
- Added: no

## NCT04385368 (passed on the retry)

### L15 · retry

- **Protocol:** Patients undergoing wedge resection are not eligible for this study.
- **Plain:** Is undergoing wedge resection (a type of surgery to remove a wedge-shaped piece of tissue) and is not eligible for this study.
- Missing: no
- Added: yes — "and is not eligible for this study"
- **Outcome: now caught by the check,** as L18. The first attempt is shown instead: "Is undergoing wedge resection (a type of surgery to remove a wedge-shaped piece of tissue)." That text was not part of this reading.

### L22 · retry

- **Protocol:** Exploration of nodes must clearly be documented in medical file if not recorded in operative report.
- **Plain:** The exploration of nodes must be clearly documented in the medical file if not recorded in the operative report.
- Missing: no
- Added: no

### L25 · retry

- **Protocol:** All patients who enrol in the study prior to surgery must have a pre-surgical plasma sample collected for MRD evaluation.
- **Plain:** All patients who enrol in the study prior to surgery must have a pre-surgical plasma sample (blood sample) collected for MRD (minimal residual disease) evaluation.
- Missing: no
- Added: no

### L28 · retry

- **Protocol:** Germline sequencing of whole blood is mandatory.
- **Plain:** Has germline sequencing (genetic testing) of whole blood.
- Missing: no
- Added: no

### L55 · retry

- **Protocol:** Active infection, including tuberculosis (clinical evaluation that includes clinical history, physical examination, and radiographic findings, and tuberculosis testing in line with local practice), hepatitis B (HBV; known positive HBV surface antigen [HBsAg] result), hepatitis C (HCV), or human immunodeficiency virus infection (positive HIV 1/2 antibodies).
- **Plain:** Has an active infection, including tuberculosis (clinical evaluation that includes clinical history, physical examination, and radiographic findings, and tuberculosis testing in line with local practice), hepatitis B (HBV; known positive HBV surface antigen [HBsAg] result), hepatitis C (HCV), or human immunodeficiency virus infection (positive HIV 1/2 antibodies).
- Missing: no
- Added: no

### L67 · retry

- **Protocol:** Previous IP assignment in the present study.
- **Plain:** Has been assigned to an intervention group (IP) in the current study prior to this.
- Missing: no
- Added: yes — "an intervention group"
- **Outcome: a known gap, accepted and named.** "IP" is an investigational product; "an intervention group" is a wrong explanation. The check cannot judge an explanation (spec D1), so this is kept as a named known-gap test (`tests/plain/check.test.ts`) and in the README. Regenerating would redo all 74 criteria of the study; the rendering stays, with the protocol words beside it.

## NCT06728852 (passed on the retry)

### L4 · retry

- **Protocol:** Previously received at least two systemic therapies, allowing for third-line or higher chemotherapy or unable to tolerate chemotherapy
- **Plain:** Has prior received at least two systemic therapies (treatments that travel through the bloodstream), allowing for third-line or higher chemotherapy or unable to tolerate chemotherapy.
- Missing: no
- Added: no

### L25 · retry

- **Protocol:** non-small cell lung cancer with hemoptysis (>5ml/day)
- **Plain:** Has non-small cell lung cancer with hemoptysis (coughing up blood) of more than 5ml/day.
- Missing: no
- Added: no

### L43 · retry

- **Protocol:** untreated active hepatitis B
- **Plain:** Has active hepatitis B (a liver infection caused by the hepatitis B virus) that is untreated.
- Missing: no
- Added: no

## Result

Read by the owner, 2026-09. **49 pairs read; 8 answers of "yes", on 7 criteria.**

| Outcome | Criteria |
| --- | --- |
| Now caught by the check, with a test built from the finding (`c62cd50` failing, `c9fb5f3`) | 3: NCT00077350 L17 and L18, NCT04385368 L15 |
| Accepted by design: the verdict wording is left to the polarity tag | 3: NCT00077350 L20, L24, L37 |
| A known gap, accepted and named: a wrong explanation | 1: NCT04385368 L67 |

The rule built from L17 also refused one rendering outside this reading, NCT04385368 L56, where "are eligible only if the PCR is negative" had become "Is positive for HCV antibody only if…": the same fault.

