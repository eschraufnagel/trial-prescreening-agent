# spec: 0018 paper and ink

**Status:** Draft, from `intent.md`
**Date:** 2026-10

What the page looks like after this slice. The values here are the mockup's, with a dark mode added. The contrast check (§5) may move a value; if it does, the plan records the new one. The order of work is in `plan.md`.

---

## 1. Tokens (`src/web/styles.css`, `:root` and its dark block)

Every existing variable keeps its name and role. Three are added: `--terracotta` (rules and marks, never small text), `--terracotta-ink` (small text in terracotta) and `--rule` (the header's bottom line). `--serif` and `--sans` name the font stacks (§2).

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `#f3ede2` | `#131917` |
| `--panel` | `#fffcf6` | `#1b2320` |
| `--text` | `#1e2a25` | `#ece5d6` |
| `--dim` | `#6c675c` | `#a59e8f` |
| `--ink-2` | `#3d4842` | `#cfc8b9` |
| `--line` | `#e2d9c8` | `#2e3833` |
| `--rule` | `#1e2a25` | `#5f6d66` |
| `--agent` | `#efe7d8` | `#232c28` |
| `--me` | `#1f5747` | `#2c6b56` |
| `--me-text` | `#fdfaf3` | `#fdfaf3` |
| `--accent` | `#1f5747` | `#8fcfb0` |
| `--accent-soft` | `#e2ece5` | `#1f302a` |
| `--accent-ink` | `#164234` | `#b5e2cb` |
| `--button` | `#1f5747` | `#2c6b56` |
| `--terracotta` | `#c2603a` | `#d9784f` |
| `--terracotta-ink` | `#a24a26` | `#eb9b74` |
| `--chip` | `#ece4d4` | `#26302b` |
| `--new` | `#f6e7dc` | `#33281f` |
| `--ok-bg` / `--ok` | `#e2ece5` / `#1b5a3f` | `#1d3328` / `#93d6b0` |
| `--warn-bg` / `--warn` | `#f8ead2` / `#7f4d0c` | `#3a2e17` / `#f0c77a` |
| `--down-bg` / `--down` | `#f8e0d8` / `#9b2a1c` | `#3d1f19` / `#ffb3a0` |
| `--holds` | `#256b48` | `#7fd3a4` |
| `--not` | `#9b4a24` | `#f2a27e` |
| `--open` | `#6c675c` | `#a59e8f` |
| `--review` | `#6a4a8c` | `#c7a8ec` |
| `--unresolved` | `#8a5d00` | `#f0c060` |
| `--radius` | `6px` | (same) |

Fields and shadows are tokens too, so dark mode is one block: `--field` (`#fffefb` / `#141b18`), `--field-line` (`#d6ccb8` / `#36423c`) and `--shadow` (§3). *(Changed at step 3: the draft set the dark field colours in a separate rule.)*

## 2. Type

- `--serif`: `"Iowan Old Style", "Charter", "Palatino", Georgia, serif`.
- `--sans`: `"Avenir Next", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. The page's base font.
- **Serif:** the wordmark, page `h1`, section `h2`s (page, review summary, review groups, tester panel, checklist), trial card titles, study card titles, the review header's `h1`, big counts (`.counts strong`, `.review-count strong`), and the agent's chat bubbles.
- **Sans:** everything else, including the protocol's words and the plain-language versions.
- `code` and `.id` stay monospace.

## 3. Rules, by area

Only the rules listed change. Everything else in `styles.css` stays.

- **Header.** Background `--bg`, a 4 px `--terracotta` top border, a 1 px `--rule` bottom border. The flask in `--terracotta`. Nav links lose their pill: the current one is `--text` with a 2 px terracotta underline at the header's bottom edge; the rest `--ink-2`. The model pill is square-cornered (4 px) on `--panel`.
- **Headings.** Page `h1` 2.4 rem; first-run `h1` as now. Serif per §2.
- **Cards** (`.card`, `.participant`, `.tester`, `.review-summary`, `.review-group`, `.review-transcript`, `.steps li`, `.counts li`). `--radius`, a `--line` border, and a soft warm shadow: `0 1px 0 rgba(60,45,20,.04), 0 12px 28px -22px rgba(60,45,20,.35)`. In dark mode, the shadow is `0 12px 28px -22px rgba(0,0,0,.6)`. Both are `--shadow`.
- **Buttons.** 4 px corners. Primary unchanged in structure (`--button`, white text). Secondary transparent with a 1 px `--text` border and `--text` words. Quiet and destructive as now. `button.danger`'s words become `--panel`, so they stay readable on dark mode's light `--down`.
- **Focus.** `:focus-visible` draws a 2 px `--accent` outline, 2 px out, in place of the browser's blue. *(Added at step 7, when the retaken screening showed the default ring.)*
- **Fields** (`.add-row input`, `.field > input`, `.field select`, `.composer textarea`). 4 px corners; `--field` and `--field-line`.
- **Badges and tags** (`.badge`, `.tag`). 3 px corners, capitals, 0.05 em tracking, 0.72 rem. **Chips** (`.chips li`) keep sentence case.
- **Step names** (`.step-name`). `--terracotta-ink`, capitals, 0.08 em tracking.
- **Chat.** Bubbles 6 px corners, 10 × 14 px padding. The agent's in the serif at 1.04 rem with a 3 px `--terracotta` left border. The person's unchanged apart from colour.
- **Plain language** (`.words.plain`). The left border in `--terracotta`.
- **NCT IDs** (`.id`). `--terracotta-ink`.
- **The review's notes** (`.review-notes`). `--panel`, a `--line` border and a 3 px `--terracotta` left border, square corners.
- **Big counts.** Serif, 2.1 rem, `--accent`.
- **Settings.** Nothing beyond the tokens: the chosen provider keeps `--accent` and `--accent-soft`.

## 4. What doesn't change

- **Markup.** No `.tsx` file changes. Every class name stays.
- **The review's rule.** No rule selects on a finding or polarity, and no colour is given to `.review-finding`. The review's groups look alike.
- **Layout, spacing, widths and breakpoints**, except the paddings in §3.
- **Motion.** The spinner, and its reduced-motion rule.

## 5. Contrast

A script run during the work (not committed) computes WCAG contrast for these pairs, in both modes, from the values in `styles.css`. Each must reach the bar given:

- **4.5:1, text:**
  - `--text`, `--dim` and `--ink-2` on `--bg`, `--panel` and `--agent`;
  - `--text` and `--ink-2` on `--chip`;
  - `--me-text` on `--me`; white on `--button`; `--panel` on `--down` (danger);
  - `--accent` and `--terracotta-ink` on `--bg` and `--panel` (links, NCT IDs, step names);
  - `--accent-ink` on `--accent-soft`; `--ok` on `--ok-bg`; `--warn` on `--warn-bg`; `--down` on `--down-bg` and on `--panel`;
  - `--holds`, `--not`, `--open`, `--review` and `--unresolved` on `--panel` and on `--new` (the tester panel's changed row).
- **3:1, borders that mean something:** `--accent` on `--panel` (the awaiting row's outline); `--rule` on `--bg`.

`--terracotta` is decoration (top border, rules, flask) and isn't held to a bar. A pair that fails moves its foreground value until it passes, and the plan records the change.

## 6. Images, favicon and preview card

- **Favicon** (`src/web/index.html`). The flask's stroke becomes `#c2603a`.
- **Preview card** (`e2e/capture/social-card.html`). Its own tokens take §1's light values; the headline and wordmark take `--serif`; the tags become small-capital labels like §3's badges, in `--accent` on `--accent-soft`. Same size and layout.
- **Retaken by `npm run screenshots`:** `trials.png`, `screening.png`, `review.png`, `transcript.png`, `settings.png` and `social-card.png`. **By `npm run demo`:** `demo.gif`. Light mode, as now. Each is looked at before it's committed.

## 7. Docs

- `work/ROADMAP.md`: a 0018 row and a line in "Where the project stands".
- `docs/running.md`, README and CLAUDE.md: no change expected; checked for any mention of the old colours.

## 8. Proof

- `npm run check` passes at every commit; no test changes.
- `npm run test:e2e`: 11 passed, unchanged specs.
- The boundary test's "styles rows by group only" passes untouched.
- `git diff main --stat` touches no `.tsx` file.
- The contrast table (§5), all passing, recorded in the plan.
- The gate (intent).
