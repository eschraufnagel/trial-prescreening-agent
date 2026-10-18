# intent: 0019 coral and plum

**Author:** the repository owner
**Status:** Proceeding on the owner's go, 2026-10. The direction is the owner's: option C ("Coral & Plum") of the three mockups 0018 started from, chosen after 0018 built and merged option A ("Paper & Ink"). The other decisions are Claude's recommendations
**Date:** 2026-10
**Scope:** How the page looks: colour, type, borders and shadows, in light and dark mode, on every screen, plus the images that show it (README screenshots, demo, preview card, favicon). No markup, words, behaviour or results change.

---

## Problem

**The page doesn't read as a health product.** 0018 replaced the default palette (near-white, one blue, light grey) with option A, Paper & Ink: warm paper, evergreen ink, terracotta and serif headings. Seen in place, the owner judged that its tan colours "just don't scream a health app".

**The mockups.** 0018 mocked three directions over the page in fake mode, on Trials, a screening and the coordinator review:
- A, "Paper & Ink": warm paper, evergreen ink, terracotta, serif headings;
- B, "Night Shift": dark indigo, glass panels, a violet-to-cyan gradient;
- C, "Coral & Plum": blush paper, a plum header band, coral buttons, generous rounding.

**A was built, and is replaced here.** 0018 built option A through its gate, retook every image and merged (PR #1). The owner then chose C. What 0018 added beyond its colours is kept (below); its colours, serif and labels are replaced.

## Proposed outcome

- **Every screen in the Coral & Plum look**: Trials, a trial's checklist, Screenings, a conversation with the tester panel, Reviews, the coordinator review and Settings. It should read as a health product: warm, human, calm, for a person being screened as much as for a coordinator.
- **A dark mode in the same family**: deep plum-black, the plum band kept, coral lightened for text. The mockups showed light only.
- **The README's images, demo and preview card retaken** in the new look, and the favicon recoloured.

## Absent on purpose

- **No markup, wording or behaviour change.** Class names stay, so the browser test's locators and the boundary test hold. A rule that can't be reached with CSS on today's markup is dropped, not added by a markup change.
- **No change to the coordinator review's rule** (0007): nothing coloured, sorted or summarised by outcome. Coral and plum are the page's colours, the same on every row.
- **No web fonts.** One named system sans with fallbacks, so the page makes no font request and gains no dependency.
- **No theme switcher.** One look, following the system's light or dark setting.
- **No agent, parser, prompt or result change.** Nothing is re-measured.

## Constraints

- **No network at runtime.** No font CDN, no remote image. The favicon stays an inline data URL.
- **Dependencies stay as they are.**
- **Readable.** Text keeps at least 4.5:1 contrast against its background in both modes, and borders that carry meaning at least 3:1.
- **Local model only, no `--spend`.** Retaking the screenshots and demo uses oMLX.
- **No promotional wording.** Docs describe the change as making the page clearer and more distinctive for someone opening it.

## Decisions

1. **Tokens first, then a few rules.** The look comes from new values for the existing colour variables, a handful of new ones (the plum band, its text, the chip's text, a coral line for decoration, fields, shadow, a warm glow), and a short list of rule changes: header band, nav, headings, cards, buttons, fields, chips, chat bubbles. No layout changes.
2. **One sans throughout.** "Avenir Next", then Helvetica Neue and the system face, with headings in a heavy weight and in plum. No serif: the softness comes from colour and rounding, and one family is plainer to read.
3. **Coral for action, a cooler red for danger.** Primary buttons are coral. Remove… and Delete… stay outlined, as 0014 asked, but in a crimson (`#a3123a`) that is cooler and darker than the coral, and the final Remove is a filled crimson. Side by side, an action and a destructive action shouldn't look like the same colour.
4. **Dark mode is designed here,** with the same roles: the plum band, coral buttons, coral text lightened to stay readable.
5. **The tester panel keeps distinct status colours,** retuned to the palette. It's a testing view; the review has none and gets none.
6. **Contrast is checked by a scratch script during the work,** with its ratios recorded in the plan, not by a committed test. A first check of these values passed all 44 pairs.
7. **Images.** `npm run screenshots` retakes the README images on the local model, `npm run demo` the GIF, and the capture spec the preview card, whose HTML takes the new tokens. All are looked at and committed as captured.

## Kept from 0018

- **Fields, shadows and the page's glow are tokens,** so dark mode is one block.
- **The focus ring** is drawn in the page's accent, not the browser's blue.
- **The phone nav** keeps all four links on one line at 390 px.
- **The demo's 720 px fallback** in `scripts/make-demo.ts`, already on `main`, since any warm, textured page compresses less well than flat white.
- **The method:** the contrast script, the headless screenshots of every screen in both modes and widths, and restarting the app after a CSS change, because it builds the page at startup.

## Gates

- **One, after the restyle and before the images are retaken.** The owner looks at the restyled page in fake mode: every screen, light and dark, at desktop and phone width, as headless screenshots, beside the contrast table.
  - **Why it's a gate.** Taste can't be tested, and 0018 showed it can change on seeing the look in place. Retaking the images needs oMLX loaded, about 37 GB free and the key in the capture app's environment, so a change of look afterwards costs a second capture.
  - **What the owner reads.** Screenshots and the contrast table. No clinical judgment is needed.

## Open questions for the spec

1. The exact token values in both modes.
2. The list of rule changes, screen by screen, and which of 0018's rules are reverted rather than restyled.
3. The preview card's layout in the new look, and the favicon's colour.
