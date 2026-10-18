# intent: 0018 paper and ink

**Author:** the repository owner
**Status:** Proceeding on the owner's go, 2026-10. The direction, option A ("Paper & Ink") of three mockups, is the owner's pick. The other decisions are Claude's recommendations
**Date:** 2026-10
**Scope:** How the page looks: colour, type, borders and shadows, in light and dark mode, on every screen, plus the images that show it (README screenshots, demo, preview card, favicon). No markup, words, behaviour or results change.

---

## Problem

**The page looks generic.** 0014 built the layout and 0016 polished the wording and spacing, but the colours are the defaults most web apps start with: near-white, one blue, light grey. Nothing about the page says what it's for, and a newcomer opening the README sees screenshots that could be any admin tool.

**The mockups.** Three directions were mocked over the current page in fake mode, on Trials, a screening and the coordinator review: A "Paper & Ink" (warm paper, evergreen ink, terracotta, serif headings), B "Night Shift" (dark indigo, glass panels, a violet-to-cyan gradient) and C "Coral & Plum" (blush paper, a plum header band, coral buttons, heavy rounding). The owner picked A. Its token values and rules are carried into `spec.md`, so the mockups need not be kept.

## Proposed outcome

- **Every screen in the Paper & Ink look**: Trials, a trial's checklist, Screenings, a conversation with the tester panel, Reviews, the coordinator review and Settings.
- **A dark mode in the same family**, deep green-black with paper-coloured text. The mockups showed light only.
- **The README's images, demo and preview card retaken** in the new look, and the favicon recoloured.

## Absent on purpose

- **No markup, wording or behaviour change.** Class names stay, so the browser test's locators and the boundary test hold. If a rule can't be reached with CSS on today's markup, it's dropped, not added by a markup change.
- **No change to the coordinator review's rule** (0007): nothing coloured, sorted or summarised by outcome. Terracotta is decoration, the same on every row.
- **No web fonts.** The serif and sans faces are named system fonts with fallbacks, so the page makes no font request and gains no dependency.
- **No theme switcher.** One look, following the system's light or dark setting, as now.
- **No agent, parser, prompt or result change.** Nothing is re-measured.

## Constraints

- **No network at runtime.** No font CDN, no remote image. Fonts are system fonts; the favicon stays an inline data URL.
- **Dependencies stay as they are.** Adding a font package would be a plan-level decision, and this slice doesn't make it.
- **Readable.** Text keeps at least 4.5:1 contrast against its background in both modes, and large text and borders that carry meaning at least 3:1.
- **Local model only, no `--spend`.** Retaking the screenshots and demo uses oMLX, as 0016 did.
- **No promotional wording.** The roadmap and docs describe the change as making the page clearer and more distinctive for someone opening it.

## Decisions

1. **Tokens first, then a few rules.** The look comes from new values for the existing `:root` colour variables, three new ones (a terracotta for rules, a darker terracotta for text, and a strong header rule), two font stacks, and a short list of rule changes (header, nav, headings, cards, buttons, badges, agent bubbles). No layout changes.
2. **Fonts.** Headings, the wordmark and the agent's words in a serif ("Iowan Old Style", then Charter, Palatino, Georgia); everything else in "Avenir Next", then Helvetica Neue and the system face. On a Mac it matches the mockup. Elsewhere it falls back to Georgia and the system sans: plainer, still in the family. Bundling open-licence fonts would add files and a dependency for a look that already holds on the owner's machine.
3. **Dark mode is designed here.** It keeps the same roles: evergreen buttons, terracotta rules, serif headings, paper-coloured text.
4. **Capitals only on short labels.** Badges, tags and step names are small capitals; condition chips and sentences are not.
5. **The agent's words are set in the serif** with a terracotta rule beside them, so the agent and the person read as different voices. It's styling of a class that already exists (`.bubble.from-agent`).
6. **The tester panel keeps distinct status colours,** retuned to the palette. It's a testing view and 0005 gave it those colours; the review has none and gets none.
7. **Contrast is checked by a small script during the work** and its ratios recorded in the plan, not by a committed test. One check at one time supports the claim; a test would guard a palette that isn't expected to change again soon.
8. **Images.** `npm run screenshots` retakes the five README images on the local model, `npm run demo` the GIF, and the capture spec the preview card, whose HTML takes the new tokens. All are looked at and committed as captured, as in 0016.

## Gates

- **One, after the restyle and before the images are retaken.** The owner looks at the restyled page in fake mode: every screen, light and dark, at desktop and phone width, as headless screenshots.
  - **Why it's a gate.** Taste can't be tested, and the images come after it. Retaking them needs oMLX running and a person at the capture, and a change of look afterwards means doing it twice.
  - **What the owner reads.** Screenshots and the contrast table. No clinical judgment is needed.

## Open questions for the spec

1. The exact token values in both modes, and which ones the contrast check covers.
2. The list of rule changes, screen by screen, and whether any 0014 or 0016 rule goes.
3. The preview card's layout in the new look, and the favicon's colour.
4. Which docs mention the look and need a line changed.
