/**
 * Renders one conversation with its findings, in the terminal or as a page.
 *
 *   npm run screening:show -- <conversation or chat file>
 *   npm run screening:show -- <file> --html     also write <file>.html and print its path
 *
 * The HTML page is a single static file with no dependencies, opened in a
 * browser: the conversation on one side, each finding with the participant's
 * words behind it on the other. It is a preview of what slice 0007's
 * coordinator pane has to show, not that pane.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { FidelityFlag } from "../evals/participant/fidelity.js";
import type {
  Evidence,
  Finding,
  ScreeningCriterion,
  ScreeningResult,
  Turn,
} from "../src/screening/index.js";

interface Viewable {
  result?: ScreeningResult;
  state?: { criteria: ScreeningCriterion[]; transcript: Turn[] } | null;
  participant?: Array<{ turn: number; flags: FidelityFlag[] }>;
  vignetteId?: string;
  source?: string;
}

export interface View {
  title: string;
  transcript: Turn[];
  findings: Array<Finding & { criterion: ScreeningCriterion | undefined }>;
  flags: Map<number, FidelityFlag[]>;
  complete: boolean;
}

export function toView(file: Viewable, name: string): View {
  const transcript = file.result?.transcript ?? file.state?.transcript ?? [];
  const criteria = new Map((file.state?.criteria ?? []).map((c) => [c.id, c]));
  const findings = (file.result?.findings ?? []).map((f) => ({
    ...f,
    criterion: criteria.get(f.criterionId),
  }));
  const flags = new Map(
    (file.participant ?? []).filter((p) => p.flags.length > 0).map((p) => [p.turn, p.flags]),
  );
  const title =
    file.vignetteId === undefined ? name : `${file.vignetteId} (${file.source ?? "labels"})`;
  return { title, transcript, findings, flags, complete: file.result !== undefined };
}

const STATUS_LABEL: Record<Finding["status"], string> = {
  holds: "holds",
  "does-not-hold": "does not hold",
  unresolved: "unresolved",
  "chart-review": "needs chart review",
  "not-raised": "not raised",
};

function describeFlag(f: FidelityFlag): string {
  switch (f.kind) {
    case "unknown-fact":
      return `cites facts the vignette lacks: ${f.facts.join(", ")}`;
    case "uncited-assertion":
      return `says something (${f.length} chars) citing no fact`;
    case "model":
      return f.reason;
  }
}

/**
 * A reading code held back (slice 0009): the read call proposed a
 * determination but said the words didn't settle it outright.
 */
function withheldNote(e: Evidence): string {
  return e.withheld === undefined ? "" : ` (read as ${e.withheld}, not outright)`;
}

export function renderText(view: View): string {
  const lines = [`━━ ${view.title}${view.complete ? "" : " (unfinished)"}`, ""];
  for (const t of view.transcript) {
    const who = t.speaker === "agent" ? "AGENT " : "PERSON";
    const about = t.criterionId === undefined ? "" : ` [${t.criterionId}]`;
    lines.push(`${String(t.index).padStart(3)} ${who}${about}: ${t.text}`);
    for (const f of view.flags.get(t.index) ?? []) {
      lines.push(`      ⚑ simulator flag: ${describeFlag(f)}`);
    }
  }
  lines.push("", "FINDINGS");
  for (const f of view.findings) {
    const reported = f.reported === undefined ? "" : `, reported ${f.reported}`;
    lines.push(
      `  ${f.criterionId.padEnd(4)} ${STATUS_LABEL[f.status]} (${f.reason}${reported})` +
        `  ${f.criterion?.text ?? ""}`,
    );
    for (const e of f.evidence) {
      lines.push(
        `         turn ${e.turn}: "${e.quote}"${e.missing ? ` — missing: ${e.missing}` : ""}` +
          withheldNote(e),
      );
      if (e.statement !== undefined) {
        lines.push(`           judged: ${e.statement}`);
      }
    }
  }
  return lines.join("\n");
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHtml(view: View): string {
  const turns = view.transcript
    .map((t) => {
      const flags = (view.flags.get(t.index) ?? [])
        .map((f) => `<div class="flag">⚑ simulator flag: ${esc(describeFlag(f))}</div>`)
        .join("");
      const about =
        t.criterionId === undefined ? "" : `<span class="tag">${esc(t.criterionId)}</span>`;
      return `<div class="turn ${t.speaker}" id="t${t.index}"><div class="meta">${t.index} · ${
        t.speaker === "agent" ? "agent" : "person"
      } ${about}</div><div class="bubble">${esc(t.text)}</div>${flags}</div>`;
    })
    .join("\n");

  const findings = view.findings
    .map((f) => {
      const evidence = f.evidence
        .map(
          (e) =>
            `<li><a href="#t${e.turn}">turn ${e.turn}</a> “${esc(e.quote)}”${
              e.missing ? ` <span class="muted">missing: ${esc(e.missing)}</span>` : ""
            }${withheldNote(e) === "" ? "" : ` <span class="muted">${esc(withheldNote(e).trim())}</span>`}${
              e.statement === undefined
                ? ""
                : `<div class="muted">judged: ${esc(e.statement)}</div>`
            }</li>`,
        )
        .join("");
      return `<div class="finding s-${f.status}">
  <div class="fhead"><span class="fid">${esc(f.criterionId)}</span>
  <span class="status">${STATUS_LABEL[f.status]}</span>
  <span class="muted">${esc(f.criterion?.type ?? "")} · ${esc(f.criterion?.polarity ?? "")} · ${esc(f.reason)}${
    f.reported === undefined ? "" : ` · reported ${esc(f.reported)}`
  }</span></div>
  <div class="ftext">${esc(f.criterion?.text ?? "")}</div>
  ${evidence === "" ? "" : `<ul>${evidence}</ul>`}
</div>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Screening conversation</title>
<style>
:root{--bg:#fbfbfa;--fg:#1d1d1b;--muted:#6b6b66;--line:#e2e1dc;--agent:#eef2f7;--person:#f4f1ea;--holds:#2f6f4f;--dnh:#3d5a80;--unres:#9a6b16;--chart:#6b4f8f;--nr:#8a8a85;--flag:#a3342b}
@media (prefers-color-scheme:dark){:root{--bg:#171716;--fg:#e8e6e1;--muted:#9c9a94;--line:#33322f;--agent:#1f2530;--person:#27241e;--holds:#6fbf95;--dnh:#8fb0dd;--unres:#e0b25c;--chart:#b89be0;--nr:#8a8a85;--flag:#ef8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,sans-serif}
header{padding:20px 16px;border-bottom:1px solid var(--line)}h1{font-size:18px;margin:0}
.note{color:var(--muted);font-size:13px;margin-top:4px}
main{display:grid;grid-template-columns:1fr 1fr;gap:0}
section{padding:16px;min-width:0}section+section{border-left:1px solid var(--line)}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 12px}
.turn{margin-bottom:10px}.meta{font-size:12px;color:var(--muted)}
.bubble{padding:8px 12px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}
.agent .bubble{background:var(--agent)}.participant .bubble{background:var(--person);margin-left:24px}
.tag{font:12px ui-monospace,monospace;border:1px solid var(--line);border-radius:4px;padding:0 4px}
.flag{color:var(--flag);font-size:13px;margin:4px 0 0 24px}
.finding{border-left:3px solid var(--nr);padding:6px 10px;margin-bottom:10px}
.s-holds{border-color:var(--holds)}.s-does-not-hold{border-color:var(--dnh)}.s-unresolved{border-color:var(--unres)}.s-chart-review{border-color:var(--chart)}
.fhead{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}.fid{font:600 13px ui-monospace,monospace}
.status{font-weight:600}.muted{color:var(--muted);font-size:13px}.ftext{font-size:14px}
ul{margin:4px 0 0;padding-left:18px;font-size:13px}a{color:inherit}
@media (max-width:760px){main{grid-template-columns:1fr}section+section{border-left:0;border-top:1px solid var(--line)}}
</style></head><body>
<header><h1>${esc(view.title)}</h1><div class="note">Synthetic conversation. Findings are per criterion and are not an eligibility decision; a coordinator makes that.${
    view.complete ? "" : " This conversation is unfinished."
  }</div></header>
<main><section><h2>Conversation</h2>
${turns}
</section><section><h2>Findings</h2>
${findings === "" ? '<p class="muted">No findings yet.</p>' : findings}
</section></main></body></html>
`;
}

function main(): void {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith("--"));
  if (path === undefined) {
    console.error("usage: npm run screening:show -- <conversation file> [--html]");
    process.exitCode = 1;
    return;
  }
  const view = toView(JSON.parse(readFileSync(path, "utf8")) as Viewable, path);
  console.log(renderText(view));
  if (args.includes("--html")) {
    const out = `${path.replace(/\.json$/, "")}.html`;
    writeFileSync(out, renderHtml(view), "utf8");
    console.log(`\nwrote ${out}`);
  }
}

if (import.meta.main) {
  main();
}
