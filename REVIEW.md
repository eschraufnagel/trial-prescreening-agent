# REVIEW.md

How pull requests in this repository are reviewed. Claude runs these passes on every PR before a human reads it. Each pass produces findings; each finding is labeled **Important** or **Nit**.

This is a solo project, so there is no second engineer to catch anything. These passes exist to replace that person. Run them honestly. A pass that always comes back clean is not doing its job.

---

## Severity

**Important.** Blocks merge. The change is wrong, unsafe, out of scope, or contradicts what was agreed in the slice's `spec.md` or `plan.md`. Includes anything that would be embarrassing in a public repository.

**Nit.** Does not block merge. Style, naming, a clearer way to express something, a test worth adding later. Record it and move on.

If a finding sits between the two, call it Important. The cost of over-flagging on a solo project is a minute of reading. The cost of under-flagging is discovering it three slices later.

---

## Pass 1: Plan compliance

The diff should do what `work/NNNN-*/plan.md` said it would do, and not more.

- Does every file changed appear in the plan's "Files that change" list?
- Does anything in the plan remain unimplemented without explanation?
- Did scope grow during implementation? Unplanned refactors, new dependencies, and "while I was in there" changes are Important findings even when the code is good.
- If implementation diverged from the plan for a legitimate reason, was `plan.md` updated in the same commit? An out-of-date plan is Important, because the artifact chain is the point of this repository.

## Pass 2: Correctness

- Logic errors, off-by-one, unhandled nulls, incorrect error handling.
- Does the code do what its tests claim it does?
- Are failure paths handled, or only the happy path?
- Anything that would break on a second run, a resumed conversation, or an empty input.
- If the change touches the page's paths (CLAUDE.md lists them), did `npm run test:e2e` run, and did it pass? A page change with no browser run, or with a failing one, is Important.

## Pass 3: Scope and data discipline

These are the constraints from `work/0000-product/intent.md`. Violations are always Important.

- **No PHI, ever.** No real patient data in fixtures, tests, logs, comments, or commit messages. All patient data is synthetic or hand-authored.
- **No real patient contact path.** No SMS, no email, no telephony, no outbound messaging of any kind. The transport is local and simulated.
- **No live network dependency at runtime.** The pinned trial corpus is saved locally as fixtures. The runtime calls are `src/trials/registry.ts` fetching a study from ClinicalTrials.gov when a person clicks Add or Refresh on the Trials screen (slice 0013), and, since slice 0017, the provider a person chose in Settings with a key saved there, through `createAppAdapter` in `src/server/models.ts`, always inside the budget wrapper. Anything else reaching the network, either made without that choice, a hosted key taken from anywhere but Settings, or a key's value in a response, log or file outside `local/`, is Important.
- **No secrets in the diff.** No API keys, tokens, or credentials, including in example config and test files.
- **No cloud deployment surface.** No Dockerfiles targeting hosting platforms, no deployment config, no infrastructure code.
- **Coordinator-in-the-loop is preserved.** No code path produces a final eligibility determination without a human review step. The agent recommends and hands off.

## Pass 4: Eval integrity

The eval harness is the primary artifact of this project. Anything that weakens it to make a change pass is Important.

- Were tests or graders modified in the same change that was supposed to make them pass? If the change is a bug fix, the failing test should have been committed first and left untouched.
- Were thresholds lowered, cases removed, or assertions loosened? If so, is the reason documented in the PR?
- Does a new eval case actually test the thing it claims to, including the negative case?
- Are model name, quantization, temperature, and seed recorded for any run whose results get reported?
- Browser specs under `e2e/` are held like tests. A spec loosened, skipped or deleted in the change it would have caught is Important.

## Pass 5: Documentation

- Does the README still describe what the code does, in words a non-technical reader can follow? Is it still short?
- Do reported numbers in the README and `docs/` match what the harness currently produces?
- Are limitations and known failures stated rather than omitted?

---

## What is deliberately not reviewed here

**Production security hardening.** This runs locally, handles no real data, and is exposed to no network. Auth, rate limiting, input sanitization against hostile users, and dependency CVE scanning are out of scope. Pass 3 covers the constraints that actually matter for this project.

**Performance.** Unless something is slow enough to make the eval harness impractical to run, it is not a finding.

**Test coverage percentage.** Coverage of the paths the evals exercise is what matters. A number is not a target here.
