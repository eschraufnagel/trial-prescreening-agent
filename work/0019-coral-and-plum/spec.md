# spec: 0019 coral and plum

**Status:** Draft, from `intent.md`
**Date:** 2026-10

What the page looks like after this slice. The values are the mockup's, with a dark mode added and a few colours added or moved for contrast. A first contrast check of every value here passed (§5). The order of work is in `plan.md`.

`main` has option A (Paper & Ink) from 0018. Where a rule below says **revert**, it goes back to its value before 0018 (`3c86777`), so no Paper & Ink choice survives by accident.

---

## 1. Tokens (`src/web/styles.css`, `:root` and its dark block)

Every variable from before 0018 keeps its name and role. 0018's `--terracotta`, `--terracotta-ink`, `--rule` and `--serif` are removed; its `--field`, `--field-line` and `--shadow` stay with new values. Colour tokens:

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#fbf2ec` | `#170f1b` | page |
| `--panel` | `#ffffff` | `#221727` | cards |
| `--text` | `#2c1a30` | `#f5e9ef` | body text |
| `--heading` | `#3a1d42` | `#f3dcef` | headings, titles, big counts |
| `--dim` | `#74606c` | `#b8a3b1` | secondary text |
| `--ink-2` | `#503d55` | `#dccbd5` | quieter text |
| `--line` | `#f0dfd6` | `#3a2a40` | borders, rules |
| `--agent` | `#f7ebe5` | `#2c1f32` | the agent's bubble |
| `--me`, `--me-2` | `#5a2f63`, `#4b2753` | `#7a4386`, `#5e3369` | the person's bubble, a gradient |
| `--me-text` | `#ffffff` | `#ffffff` | its words |
| `--accent` | `#c4402f` | `#ff9a85` | links, focus, the chosen provider |
| `--accent-soft` | `#fde6df` | `#3a1f24` | secondary buttons, notes |
| `--accent-ink` | `#9a2e20` | `#ffc2b5` | words on `--accent-soft` |
| `--button` | `#c4402f` | `#c4402f` | primary buttons, white words |
| `--band`, `--band-2` | `#3a1d42`, `#5a2f63` | `#2a1431`, `#3f2149` | the header, a gradient |
| `--band-ink` | `#ffffff` | `#ffffff` | the wordmark; the current nav pill |
| `--band-ink-2` | `#e6d6ea` | `#d9c6dd` | other nav links, the model pill |
| `--band-dot` | `#7ee2a8` | `#7ee2a8` | the model pill's dot |
| `--chip` | `#f3e6f3` | `#34243a` | condition chips |
| `--chip-ink` | `#5a2f63` | `#dccbd5` | their words |
| `--coral-line`, `--pink-line` | `#ff9f87`, `#f2b8d8` | `#d9705c`, `#7a4a86` | decoration: the flask, step strips, plain-language rule |
| `--plain-bg` | `#fff7f3` | `#2a1a26` | the plain-language block |
| `--new` | `#fff1d6` | `#3a2d16` | the tester panel's changed row |
| `--ok-bg` / `--ok` | `#e3f3ea` / `#1e6b45` | `#17301f` / `#8ddcaa` | |
| `--warn-bg` / `--warn` | `#fff1d6` / `#835000` | `#3a2d14` / `#f2c879` | |
| `--down-bg` / `--down` | `#fbe3e8` / `#a3123a` | `#3d1520` / `#ff9fb1` | errors, Remove…, Delete… |
| `--holds` | `#23774c` | `#7fd3a4` | tester panel only |
| `--not` | `#a5432a` | `#f5a58a` | tester panel only |
| `--open` | `#74606c` | `#b8a3b1` | tester panel only |
| `--review` | `#6b3d8c` | `#d3b0f5` | tester panel only |
| `--unresolved` | `#8a5d00` | `#f0c060` | tester panel only |
| `--field` | `#fffaf7` | `#1b1220` | inputs |
| `--field-line` | `#f0dfd6` | `#4a3650` | their borders |

Other tokens, light / dark:
- `--glow`: `rgba(255,170,140,.35)` / `rgba(196,64,47,.16)`, the page's warm corner;
- `--band-line` and `--band-fill`: `rgba(255,255,255,.25)` and `rgba(255,255,255,.08)`, both modes, for the model pill;
- `--shadow`: `0 1px 2px rgba(58,29,66,.06), 0 18px 40px -26px rgba(120,50,60,.45)` / `0 18px 40px -26px rgba(0,0,0,.7)`;
- `--band-shadow`: `0 10px 30px -18px rgba(58,29,66,.8)`, both modes;
- `--button-shadow`: `0 8px 18px -10px rgba(196,64,47,.8)`, both modes;
- `--radius`: `22px`.

## 2. Type

- `--sans`: `"Avenir Next", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`, the page's base font. No serif anywhere.
- **Headings and titles** in `--heading`: page `h1` 2.3 rem, weight 800, −0.02 em tracking; `.trial-hero h1` and `.review-head h1` weight 750; `.page h2` weight 700; trial and study card titles weight 650; big counts weight 800 at 2.1 rem.
- **Revert** 0018's other heading sizes (`.page h2`, `.tester h2`, `.review-summary h2`, `.review-group h2`, `.review-transcript h2`, `.checklist h2`) to their values before 0018, keeping only the colour.
- `code` and `.id` stay monospace. **Revert** `.id`'s colour: NCT links take `--accent` as links.

## 3. Rules, by area

- **Body.** Background: `radial-gradient(700px 360px at 85% 0%, var(--glow), transparent 70%), var(--bg)`.
- **Header.** `linear-gradient(100deg, var(--band), var(--band-2))`, no borders, `--band-shadow`. The wordmark in `--band-ink`, weight 700; the flask in `--coral-line`.
- **Nav.** **Revert** 0018's underline to the earlier padding, with pill links (999 px) in `--band-ink-2`, weight 500. The current one is `--band-ink` behind `--band` words, weight 650. The 480 px rule reverts to `padding: 8px 9px` (0017's).
- **Model pill.** `--band-ink-2` words, a `--band-line` border, `--band-fill` behind, 999 px corners, the dot in `--band-dot`.
- **Focus.** `:focus-visible` is a 2 px `--accent` outline, 2 px out. Inside the header it's `--band-ink`, since coral on plum is under 3:1.
- **Cards** (`.card`, `.participant`, `.tester`, `.review-summary`, `.review-group`, `.review-transcript`, `.counts li`). `--radius`, a `--line` border, `--shadow`.
- **Steps** (`.steps li`). As cards, with a 5 px strip across the top: `linear-gradient(90deg, var(--coral-line), var(--pink-line)) top / 100% 5px no-repeat, var(--panel)`. Step names in `--accent`, sentence case (**revert** 0018's capitals).
- **Buttons.** 999 px corners, weight 650.
  - Primary: `--button`, white words, `--button-shadow`.
  - Secondary: `--accent-soft` behind `--accent-ink` words, no border, no shadow.
  - Quiet: as before 0018, no shadow.
  - Destructive (Remove…, Delete…): transparent, a 1.5 px `--down` border, `--down` words, no shadow.
  - Danger (the final Remove): `--down` behind `--panel` words.
- **Fields.** Single-line inputs and selects have 999 px corners, a 2 px `--field-line` border, `--field` behind and 18 px left padding. The composer's textarea has 16 px corners.
- **Badges and tags.** **Revert** 0018's capitals, tracking and sizes. Badges and tags keep their pill shape.
- **Chips.** `--chip` behind `--chip-ink` words, pill.
- **Chat.** Bubbles: 20 px corners, 10 × 16 px padding. The agent's: `--agent`, sans (**revert** 0018's serif and left rule). The person's: `linear-gradient(135deg, var(--me), var(--me-2))`.
- **Plain language** (`.words.plain`). A 3 px `--coral-line` left rule, `--plain-bg` behind, corners `0 10px 10px 0`.
- **The review's notes** (`.review-notes`). `--panel`, a `--line` border, 14 px corners (**revert** 0018's side rule).
- **Settings.** Nothing beyond the tokens: the chosen provider keeps `--accent` and `--accent-soft`.

## 4. What doesn't change

- **Markup.** No `.tsx` file changes. Every class name stays.
- **The review's rule.** No rule selects on a finding or polarity, and `.review-finding` gets no colour.
- **Layout, spacing, widths and breakpoints,** except the paddings in §3.
- **Motion.** The spinner, and its reduced-motion rule.

## 5. Contrast

The scratch script from 0018 computes WCAG contrast for these pairs, in both modes, from `styles.css`. Each must pass the bar given:

- **4.5:1, text:**
  - `--text`, `--dim` and `--ink-2` on `--bg`, `--panel` and `--agent`; `--text` and `--ink-2` on `--chip` and `--plain-bg`;
  - `--heading` on `--bg` and `--panel`;
  - `--me-text` on `--me` and `--me-2`; white on `--button`; `--panel` on `--down`;
  - `--accent` on `--bg` and `--panel`; `--accent-ink` and `--text` on `--accent-soft`;
  - `--band-ink` and `--band-ink-2` on `--band` and `--band-2`; `--band` on white (the current nav pill);
  - `--chip-ink` on `--chip`; `--ok` on `--ok-bg`; `--warn` on `--warn-bg`; `--down` on `--down-bg` and `--panel`;
  - `--holds`, `--not`, `--open`, `--review` and `--unresolved` on `--panel` and `--new`.
- **3:1, borders that mean something:** `--accent` on `--panel` (focus, the awaiting row).

44 pairs. The first check passed them all; the tightest is `--accent` on `--bg` in light mode, at 4.61. `--coral-line`, `--pink-line` and the shadows are decoration and aren't held to a bar.

## 6. Images, favicon and preview card

- **Favicon** (`src/web/index.html`). The flask's stroke becomes `#c4402f`.
- **Preview card** (`e2e/capture/social-card.html`). The same size and layout:
  - its tokens take §1's light values;
  - a 10 px `--band` top border and the `--glow` corner;
  - the wordmark in `--heading` with a coral flask; the headline in `--heading`, weight 800;
  - the tags as pills, `--accent-soft` behind `--accent-ink` words, sentence case;
  - the shot with 22 px corners on its open side, and the warm shadow.
- **Retaken:** `trials.png`, `screening.png`, `review.png`, `transcript.png`, `settings.png` and `social-card.png` by `npm run screenshots`, and `demo.gif` by `npm run demo`. Light mode, as now. Each is looked at.

## 7. Docs

- `work/ROADMAP.md`: a 0019 row and an item in "Where the project stands"; 0018's row says its look was replaced by 0019.
- README, `docs/` and CLAUDE.md: no change expected, checked again.

## 8. Proof

- `npm run check` passes at every commit; no test changes.
- `npm run test:e2e`: 11 passed, unchanged specs.
- The boundary test's "styles rows by group only" passes untouched.
- `git diff main --stat` touches no `.tsx` file.
- The contrast table (§5), all passing, recorded in the plan.
- `grep -n "serif\|terracotta\|--rule" src/web/styles.css` finds nothing but the `--sans` fallback `sans-serif`.
- The gate (intent).
