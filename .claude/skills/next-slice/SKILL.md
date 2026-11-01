---
name: next-slice
description: Start the next slice of this repository in a fresh chat, from the roadmap and the last slice's gate record, through intent and spec to a plan, and stop at the plan for the owner's review. Use when the owner says "/next-slice", "start the next slice", or names a slice to start.
---

# Start the next slice

This repository is built in slices (`CLAUDE.md`, "How work is done here"). This skill opens one the same way every time:

- check the chat is fresh;
- find the slice;
- gather what the last one decided;
- write the intent and spec;
- plan it;
- stop.

It never crosses a gate. The plan's gates, and every decision `CLAUDE.md` says a person makes, stay with the owner.

## 0. A fresh chat for each slice

The owner wants each slice to start in a new chat, so it begins from the repository and not from another slice's conversation. If this chat has already worked on something else, don't start here. Offer a new session that runs `/next-slice` with the owner's words, and stop.

## 1. Find the slice

- If the owner names or describes one (`/next-slice 0022`, `/next-slice let the coordinator export a review`), that is the slice.
- Otherwise, look in `work/ROADMAP.md` for a slice that isn't **Done**, **Not doing** or **Held**. Since 0013 most slices have started from something the owner raised, so there is usually none. Then ask the owner what the slice is. Don't pick one yourself.
- A **Held** or **Not doing** row starts only on the owner's word.
- Number it after the highest folder in `work/`.

## 2. Start from main

- Switch to `main` and pull. If the working tree isn't clean, stop and say what's there. Don't stash or discard anyone's work.
- Check `git remote -v` names this repository, not its `-history` copy.
- If another session may be using this checkout, say so before switching branches.

## 3. Read, in this order

1. `CLAUDE.md`, all of it: constraints, conventions, the five boundaries, and "Things Claude gets wrong".
2. `work/ROADMAP.md`: the slice's row if it has one, any "carried forward" note that names its subject, and the last slice's section.
3. `work/0000-product/intent.md`.
4. **The last merged slice's folder** (`work/NNNN-*/`): its `intent.md` and `spec.md`, and its `plan.md`, especially the **Gate record** and **Review passes**, where the owner's decisions and the open findings are.
5. The `docs/` file for each part the slice builds on, and what it says it doesn't cover.
6. The code the slice will build on, read as the plan will need it.

## 4. Collect what is carried in

Before writing anything, list for yourself:

- what earlier gates decided that bears on this slice, quoted with the file it came from;
- what earlier slices said they left open for this one;
- what would show the slice worked.

These go in the intent's Problem and Open questions, each with its source. If two records disagree, or a decision looks like it would break a constraint in `CLAUDE.md`, ask the owner before writing. Don't choose between them.

## 5. Write the intent, then the spec

- **Branch:** create `NNNN-<short-name>` from `main`, and make the folder `work/NNNN-<short-name>/`.
- **`intent.md`:** in the shape of the last slice's. Header (Author: the repository owner, Status, Date, Scope), Problem, Proposed outcome, Absent on purpose, Affected users and systems, Constraints, Decisions, Gates proposed for the plan to argue with, Open questions for the spec. Each open question ends with a leaning.
- **Stop for the owner** to accept the intent, then commit it through `npm run check && git commit`.
- **`spec.md`:** answers each open question as a proposal, and says where a gate can overturn one. It ends with what the plan must gate and what's out of scope. Stop for the owner again, then commit it.
- **Words:** "the owner", never their name. Dates are months only (`2026-10`). No PHI: any patient data is made up.
- **Commits:** no `Co-Authored-By` trailer, ever.

## 6. Plan it in plan mode

Enter plan mode, read the codebase without editing it, and write the plan as `CLAUDE.md` describes, in the shape of the last slice's `plan.md`:

- **Context.**
- **Order of work:** the stage and gate table first. Each gate names what's decided and what it costs to be wrong, justified by what the next stage spends. A gate whose value is an independent reader is the owner's alone. Then the steps, one commit each.
- **Files that change** (against `main`), **Risks**, **Verification**, and empty **Gate record** and **Review passes** sections.
- **Model runs:** any that spend real resources are gates. The local model is free but slow, so say how long a run takes. A hosted run is dry without `--spend` and needs the owner's go-ahead.
- **Dependencies:** a new one is a plan-level decision, named in the plan.
- **Proportion:** justify each measurement run in one line. The PoC was once stopped for over-measuring.
- **Browser test:** say whether the slice touches a path that needs `npm run test:e2e` (CLAUDE.md lists them). CI runs it on the PR either way.

When the owner approves the plan, write it to `work/NNNN-*/plan.md`, commit it, and stop.

## 7. Stop

End by saying, briefly:

- where the three files are;
- what the gates decide;
- the decisions the owner should check first, especially any proposal that leans against something an earlier gate decided.

Start no implementation until the owner says so.

## After the slice's PR merges

Offer to start the next one in a fresh session that runs `/next-slice`, so each slice begins with a clean context.
