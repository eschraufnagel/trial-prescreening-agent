# going public: 0016 polish

The check spec §7 asks for, from the tree at `a72b7c0` (step 6). The owner plans to publish a **new repository** made from these files, without this one's history (intent, decision 6). So this reads the tracked files, not the commits. It changes nothing outside the slice folder. Every recommendation is the owner's to take or leave.

## What was checked

| # | Looked for | How | Found |
| --- | --- | --- | --- |
| 1 | Secrets | `git ls-files \| grep '\.env'`, and `git grep -E` for Anthropic, OpenAI, xAI, AWS and GitHub key shapes | Only `.env.example`, which holds no values. No key-shaped strings. (The first pass over the whole history, before this slice, found none either.) |
| 2 | The owner's name, email and local paths | `git grep -i` for the surname, the email's user name and `@gmail`; `git grep -w Eric`; `git grep "/Users/\|/home/"` | The name appears **only in `LICENSE`'s copyright line**. No email. The only `/Users/` is the spec's own description of this check. |
| 3 | Patient data | Read `evals/cases/VIGNETTES.md` (Rule 8: "everything is invented") and `evals/cases/types.ts`. `git grep` over `evals/cases`, `evals/results/screening/review`, `data/cases` for "date of birth", phone-number shapes, email addresses and full dates | Nothing. Vignettes are made-up people by the project's rules, and the committed conversations are those vignettes played by the model. The README's screenshots show made-up answers only (the capture's table in `e2e/capture.spec.ts`). |
| 4 | Links only the owner can open | `git grep "claude.ai/artifact\|claude.ai/code"`; `git grep -E "PR #[0-9]+\|pull/[0-9]+"` | **One private link, in four places:** the 0014 design mockups (`work/0014-ui-refresh/{intent,plan,spec}.md`, `work/ROADMAP.md`). Each already says it's private to the owner. **22 lines name a pull request** by number, as text, not links ("PR #22"), in `work/ROADMAP.md` and the 0013–0016 plans and intent. |
| 5 | Gitignored state | `git ls-files chats added-trials dist e2e/.out evals/results/screening/conversations .claude` | None tracked. `.claude/launch.json`, a local preview config, is untracked and excluded in `.git/info/exclude` only. |
| 6 | Size | `git ls-files -z \| xargs -0 du -ck` | **440 files, about 14.7 MB on disk.** The largest is `docs/images/demo.gif` (4.89 MB), then the two committed review files (1.7 and 1.5 MB). |

## Recommendations

1. **Make the new repository from the tracked files only.** `git archive` takes exactly what's committed, with no `.git`, ignored files or local config:

   ```bash
   mkdir ../trial-prescreening-agent-public && git archive main | tar -x -C ../trial-prescreening-agent-public
   ```

   Run it after this slice merges, so `main` holds it.

2. **Commit there as GitHub's no-reply address**, so the new history carries no personal email. In the new folder, before the first commit, set `git config user.email` to the `…@users.noreply.github.com` address shown in GitHub's email settings. Your account's "Keep my email addresses private" setting covers commits made on github.com, not local ones.

3. **One first commit is enough.** The `work/` folder already records how the project was built, slice by slice, so the new repository loses no story without the old commits.

4. **`LICENSE` keeps a name.** An MIT licence needs a copyright holder, and the name there is ordinary. If you'd rather not show it, the alternative is a GitHub handle. That's your call, and the only place the name appears.

5. **Say once that PR numbers refer to the original repository.** The 22 "PR #n" mentions are history and read fine as text. A single line at the top of `work/ROADMAP.md` keeps a reader from looking for them: "Pull request numbers below are from the project's original, private repository." That's a small edit for the owner to choose, not made here.

6. **The private mockup link can stay or go.** It's already marked private in each place. Replacing it with "(private design mockups, not published)" removes a link that would 404 for everyone else. It touches 0014's documents and the roadmap, so it's the owner's choice.

7. **After publishing, apply `github.md`:** the description, topics and the preview card upload.
