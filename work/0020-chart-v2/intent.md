# intent: 0020 chart v2

**Author:** the repository owner
**Status:** Proceeding on the owner's go, 2026-10. The design is the owner's, delivered as a handoff in `docs/design_handoff_chart_v2/`; the mapping onto the app is Claude's, decided at five gates
**Date:** 2026-10
**Scope:** How the page looks, on every screen, in light and dark: tokens, type, components, the logo, favicon and app icons. Markup changes only where the new layout needs it. No wording, behaviour, data flow, route or result changes.

---

## Problem

**The page should read as a careful clinical tool, in two registers.** 0019's Coral & Plum made the page warm, but a coordinator reading thirty findings and a person answering questions need different things: the first wants density and data set in a monospace, the second wants large, calm, legible text. One look served both, and served neither especially well.

**The design is done.** Chart v2 is a complete handoff: tokens, component CSS, a logo ("Record"), favicons, app icons, and HTML references for the screening chat, the top of the coordinator review and trials on a phone. What's left is applying it to the React app and its one stylesheet, and deciding the screens the handoff doesn't draw.

## Proposed outcome

- **Every screen in Chart v2**: Trials, a trial's checklist, Screenings, a conversation with the testing panel, Reviews, the coordinator review, Settings and the transcript, in light and dark, at desktop and 390 px.
- **Two registers.** IBM Plex Sans and Plex Mono for coordinator screens; Atkinson Hyperlegible, larger and with more space, for the screening conversation.
- **The coordinator review in two columns**: "What's left for you" on the left, groups as `<details>` on the right, findings in neutral ink.
- **The Record mark** in the header, favicon and app icons, following light and dark through tokens.

## Absent on purpose

- **No wording change**, except one addition the design asks for: the screening header repeats the agent's existing opening line.
- **No change to the coordinator review's rule** (0007). Findings are words in neutral ink; nothing is coloured, weighted, iconned, sorted or summarised by outcome. `--accent` is for actions, links, focus and the active nav item only.
- **No theme switcher.** Dark mode follows the system.
- **No new dependency.** The fonts are committed files, not packages.
- **No agent, parser, prompt or result change.** Nothing is re-measured.

## Constraints

- **Offline.** The fonts are bundled as WOFF2 under the OFL and served by the app. Nothing loads from a CDN or Google Fonts.
- **WCAG AA in light and dark**, by the handoff's ratios; tap targets at least 44 px, primary buttons and text inputs 48 px.
- **One stylesheet**, `src/web/styles.css`, plain CSS, components referencing `var(--token)` only.

## What 0019 decided that this reverses

- **"No web fonts."** Chart v2 is built on Plex and Atkinson. They are bundled, so the page still makes no request off the machine.
- **"The favicon stays an inline data URL."** The Record mark ships as files, with PNG app icons and a manifest.
- **"The tester panel keeps distinct status colours."** The design sets its state text in neutral `--ink-2`, and a "changed" tag in the same neutral style as any tag.

## Open questions

- Settings, the transcript, the trial checklist, Screenings, Reviews and the preview card aren't drawn. They take the same tokens and patterns in the coordinator register, and each choice is listed at its gate.
- The design has no error or warning colour. Where the page shows one today (a failed add, the model being unreachable, the character count over its limit), how it reads is decided at the step that reaches it.
