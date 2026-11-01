import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ReplayedTurn, ROOT, replay } from "../evals/corrections/replay.js";
import { nextRunFile } from "../evals/run-file.js";
import {
  createLocalAdapter,
  describeSettings,
  type ModelAdapter,
  ModelError,
  parseModelSpec,
} from "../src/models/index.js";
import { PROMPT_VERSION } from "../src/screening/prompts.js";

/**
 * `npm run corrections:replay` (slice 0022, spec §5): the read call, replayed
 * on the local model at the recorded correction turns and a fixed sample of
 * ordinary ones, rebuilt from committed conversations. About 60 calls, about
 * 8 minutes. Writes `evals/results/corrections/NN-<prompt version>.json`.
 */

const RESULTS_DIR = join(ROOT, "evals/results/corrections");

function line(t: ReplayedTurn): string {
  const what = t.kind === "correction" ? `${t.criterionId} (${t.shape})` : "ordinary";
  const extra = t.unsettled.length > 0 ? `  unsettled ${t.unsettled.join(",")}` : "";
  return `${t.conversation.padEnd(16)} turn ${String(t.turn).padStart(3)}  ${what.padEnd(22)} ${t.outcome}${extra}`;
}

async function main(): Promise<void> {
  let adapter: ModelAdapter;
  try {
    adapter = createLocalAdapter(parseModelSpec("omlx"), { thinking: false });
  } catch (error) {
    console.error(error instanceof ModelError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const path = join(RESULTS_DIR, nextRunFile(RESULTS_DIR, PROMPT_VERSION));
  console.log(`prompt ${PROMPT_VERSION}  ${describeSettings(adapter.descriptor)}\n`);

  const result = await replay(adapter, { onTurn: (t) => console.log(line(t)) });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);

  const s = result.summary;
  console.log(`\nsettled corrections caught  ${s.settled.caught} of ${s.settled.of}`);
  for (const o of s.otherShapes) {
    console.log(
      `  reported, not counted     ${o.conversation} ${o.criterionId} (${o.shape}): ${o.outcome}`,
    );
  }
  console.log(
    `false corrections          ${s.ordinary.falseCorrections} in ${s.ordinary.turns} ordinary turns` +
      (s.ordinary.failed > 0 ? ` (${s.ordinary.failed} failed)` : ""),
  );
  console.log(`\n${result.calls} calls, model ${result.model} (${result.quantization})`);
  console.log(`wrote ${path}`);
}

await main();
