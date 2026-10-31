# spec: 0020 chart v2

**Intent:** `work/0020-chart-v2/intent.md`

The design's own spec is `docs/design_handoff_chart_v2/README.md`, with `tokens.css` and `components.css` beside it. This file says how it maps onto the app and what it adds; where the two disagree on the look, the handoff wins, and where `components.css` and a reference HTML file disagree, `components.css` wins.

---

## 1. Fonts

- Eight WOFF2 files in `src/web/fonts/`: IBM Plex Sans 400, 400 italic, 500, 600; IBM Plex Mono 400, 500 (from `@ibm/plex-sans` 1.1.0 and `@ibm/plex-mono` 2.5.0, the IBM/plex releases, `fonts/complete/woff2/`); Atkinson Hyperlegible 400 and 700 (from `googlefonts/atkinson-hyperlegible`, `fonts/webfonts/`).
- Each family's licence beside them: `IBMPlexSans-OFL.txt`, `IBMPlexMono-OFL.txt`, `AtkinsonHyperlegible-OFL.txt`.
- `@font-face` in `styles.css` with `url("./fonts/…")`. Vite resolves those against the stylesheet and emits the files, hashed, under `dist/web/assets/`.
- The server serves `.woff2` as `font/woff2` and `.webmanifest` as `application/manifest+json`.

## 2. Tokens

`tokens.css` at the top of `styles.css`, unchanged in its values: light on `:root`, dark in `@media (prefers-color-scheme: dark) { :root { … } }`, the same names in both, and `--dur-fast: 0ms` under reduced motion.

## 3. Components

`components.css` below the tokens, with its selectors renamed to the app's existing class names where one exists, so markup changes stay small and each concept has one name. Rules it replaces are deleted. While steps 2 to 5 are pending, a marked block maps 0019's token names onto the new ones so screens not yet reached still render; each step shrinks it and step 5 deletes it.

| Concept | Handoff class | App's name (kept) |
| --- | --- | --- |
| header bar | `.app-header` | `.header` > `.header-inner` |
| nav link | `.nav-link` | `.nav a` |
| model chip | `.model-chip`, `.model-chip-dot` | `.pill`, `.pill-dot` |
| primary button | `.button.button-primary` | `button`, `.button` (the default) |
| secondary button | `.button-secondary` | `.secondary` |
| quiet button | `.button-quiet` | `.quiet` |
| card, tag | `.card`, `.tag` | the same |

Later gates add rows to this table for the review, the chat and trials.

## 4. Logo and icons

- **Header:** the Record mark inline in `App.tsx`, from `icons/brand-mark-inline.svg` without its provenance metadata, coloured only by `.brand-mark-tile` (`--ink`), `.brand-mark-lead` (`--mark-lead`) and `.brand-mark-line` (`--mark-line`).
- **Files:** `favicon.svg`, `favicon-32.png`, `apple-touch-icon-180.png`, `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` in `src/web/public/icons/`, which Vite copies to `dist/web/icons/`. `favicon.svg` gets the `<style>` its classes need, light and dark, with the colours of `mark-light.svg` and `mark-dark.svg`; the handoff's copy has none and draws a black square.
- **`index.html`:** the tags from `icons/HEAD.html` with root paths (`/icons/…`, `/manifest.webmanifest`), replacing the inline flask favicon.
- **`src/web/public/manifest.webmanifest`** from the template in `HEAD.html`.

## 5. Constraints carried from the handoff

As the handoff's "Constraints" section and the intent: findings in neutral ink; groups in status order, rows in protocol order; no "eligible", "qualified" or score; wording unchanged but for the screening header's line; AA contrast; 44 px targets, 48 px primary controls and inputs; `:focus-visible` and reduced motion kept from `components.css`.

## 6. Proof, at every gate

- `npm run check` exits 0. `npm run test:e2e` passes (the change touches `src/web/` and `src/server/`).
- Headless screenshots of the screens the step reached, light and dark, at 1280 and 390 px.
- Keyboard focus visible on every control the step reached.
- Fonts and icons load with the network off: every request the page makes is to `127.0.0.1`.
- No snapshot tests exist today; if one appears, it's updated only for a purely visual change, and named.
