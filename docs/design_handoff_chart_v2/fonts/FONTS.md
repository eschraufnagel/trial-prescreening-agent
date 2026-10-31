# Fonts to bundle

All three families are under the SIL Open Font License 1.1, so they can be bundled and redistributed with the app. Put the `.woff2` files in this folder. `tokens.css` points at them with relative `url("./fonts/…")` paths, so adjust the paths if the folder lives somewhere else relative to `styles.css`. Ship each family's `OFL.txt` alongside the fonts.

| File | Family | Weight | Used for |
|---|---|---|---|
| IBMPlexSans-Regular.woff2 | IBM Plex Sans | 400 | UI body, rows |
| IBMPlexSans-Italic.woff2 | IBM Plex Sans | 400 italic | quoted participant words in the testing panel |
| IBMPlexSans-Medium.woff2 | IBM Plex Sans | 500 | nav, finding status, secondary buttons |
| IBMPlexSans-SemiBold.woff2 | IBM Plex Sans | 600 | titles, group headers, primary buttons |
| IBMPlexMono-Regular.woff2 | IBM Plex Mono | 400 | model chip, char count, meta |
| IBMPlexMono-Medium.woff2 | IBM Plex Mono | 500 | NCT IDs, rule numbers, counts, labels |
| AtkinsonHyperlegible-Regular.woff2 | Atkinson Hyperlegible | 400 | patient screen: questions, answers, earlier turns |
| AtkinsonHyperlegible-Bold.woff2 | Atkinson Hyperlegible | 700 | bold in patient text, if any |

Sources (download once, then commit):
- IBM Plex: github.com/IBM/plex (releases include web/woff2). Packages `@ibm/plex-sans` and `@ibm/plex-mono` on npm also contain the woff2 files.
- Atkinson Hyperlegible: Braille Institute (brailleinstitute.org/freefont) or github.com/googlefonts/atkinson-hyperlegible. If only TTF is available, convert with `woff2_compress`.

If a font file is missing, the stacks in `tokens.css` fall back to `system-ui` / `ui-monospace`.
