# GitHub page: 0016 polish

What the repository's GitHub page should say, for the owner to apply to the new public repository (intent, decision 5; spec §6). Nothing here has been applied.

## Description

> A local proof of concept: an AI holds a clinical trial's first eligibility conversation and hands a coordinator a reviewable record of what the person said. Runs on a local model with made-up patients, and is measured by its own eval harness.

It's 242 characters. GitHub allows 350.

## Topics

`clinical-trials` `llm` `ai-agents` `evals` `local-llm` `mlx` `typescript` `react` `healthcare`

## Setting both

Replace `<owner>/<repo>` with the new repository, and run it once it exists:

```bash
gh repo edit <owner>/<repo> --description "A local proof of concept: an AI holds a clinical trial's first eligibility conversation and hands a coordinator a reviewable record of what the person said. Runs on a local model with made-up patients, and is measured by its own eval harness." --add-topic clinical-trials --add-topic llm --add-topic ai-agents --add-topic evals --add-topic local-llm --add-topic mlx --add-topic typescript --add-topic react --add-topic healthcare
```

Leave the website field empty. The project has no hosted demo, on purpose (CLAUDE.md: no cloud deployment surface).

## Preview card

`docs/images/social-card.png`, 1280×640, made by `npm run screenshots` from `e2e/capture/social-card.html`.

GitHub has no API for it. Upload it in the new repository under **Settings → General → Social preview → Edit → Upload an image**. It's what a link to the repository shows when it's shared.
