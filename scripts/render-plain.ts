/**
 * Makes plain-language renderings of labelled criteria with the local model and
 * saves them under `data/plain/`, where the page reads them (0006 spec §4.4).
 *
 *   npm run plain:render -- NCT04316364           one study, resuming
 *   npm run plain:render -- --all                 every labelled study
 *   npm run plain:render -- NCT04316364 --force   start the study again
 *
 * Run by a person, deliberately, like `parse:criteria`. Never imported by the
 * application and never part of `npm test`. It writes the file after every
 * criterion, so an interrupted run resumes where it stopped. If the model
 * cannot be reached twice in a row it stops: check
 * http://127.0.0.1:8000/health before suspecting the code.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadLabelSet, loadLabelSets } from "../evals/cases/load.js";
import { fromLabels } from "../evals/screening-input.js";
import {
  createLocalAdapter,
  describeSettings,
  isConnectionFailure,
  type ModelAdapter,
  type ModelDescriptor,
  ModelError,
  type ModelRunMetadata,
  monthStamp,
  parseModelSpec,
} from "../src/models/index.js";
import type { Attempt, CriterionWords, PlainFile, Rendering } from "../src/plain/index.js";
import {
  checkPlain,
  DEFAULT_PLAIN_DIR,
  describeProblem,
  loadPlainFile,
  PLAIN_PROMPT_VERSION,
  PlainError,
  plainPath,
  renderPlain,
  retryPlain,
  textSha,
} from "../src/plain/index.js";

const HEALTH_URL = "http://127.0.0.1:8000/health";

/** The settings a file was made with; a resume must match them all. */
const RUN_KEYS = [
  "model",
  "quantization",
  "temperature",
  "seed",
  "thinking",
  "promptVersion",
] as const;

export type Work =
  | { refuse: string }
  | {
      /** Criteria needing a first attempt, in document order. Each is retried at once if it fails. */
      render: string[];
      /** Criteria with one attempt that the check refuses: the one retry, never a second. */
      retry: string[];
      fresh: boolean;
    };

/**
 * What a run should do for one study. Pure, so the rules are tested without a
 * model: criteria already rendered from their current wording are skipped; a
 * file made with another prompt or other settings is never added to, unless
 * `force` starts the study again.
 */
export function workFor(
  criteria: readonly CriterionWords[],
  file: PlainFile | undefined,
  run: Omit<ModelRunMetadata, "timestamp">,
  force: boolean,
): Work {
  if (file === undefined || force) {
    return { render: criteria.map((c) => c.id), retry: [], fresh: true };
  }
  const differs = RUN_KEYS.filter((key) => file.run[key] !== run[key]);
  if (differs.length > 0) {
    const was = differs.map((key) => `${key} ${String(file.run[key])} → ${String(run[key])}`);
    return {
      refuse: `${file.nctId} was rendered with other settings (${was.join(", ")}). Use --force to start it again.`,
    };
  }
  const current = new Map(file.renderings.map((r) => [r.criterionId, r]));
  const render: string[] = [];
  const retry: string[] = [];
  for (const c of criteria) {
    const r = current.get(c.id);
    if (r === undefined || r.textSha !== textSha(c.text)) {
      render.push(c.id);
    } else if (r.attempts.length === 1 && !checkPlain(c.text, r.attempts[0]?.plain ?? null).pass) {
      retry.push(c.id);
    }
  }
  return { render, retry, fresh: false };
}

/** What the check says about an attempt, as recorded on it and given to a retry. */
export function reportOn(text: string, attempt: Attempt): string[] {
  return checkPlain(text, attempt.plain).problems.map(describeProblem);
}

/** The file with one criterion's rendering put in place, in the criteria's order. */
export function withRendering(
  file: PlainFile,
  criteria: readonly CriterionWords[],
  rendering: Rendering,
): PlainFile {
  const byId = new Map(file.renderings.map((r) => [r.criterionId, r]));
  byId.set(rendering.criterionId, rendering);
  return {
    ...file,
    renderings: criteria.flatMap((c) => {
      const r = byId.get(c.id);
      return r === undefined ? [] : [r];
    }),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const ids = args.filter((a) => /^NCT\d{8}$/i.test(a)).map((a) => a.toUpperCase());
  const all = args.includes("--all");
  if (ids.length === 0 && !all) {
    console.error("Name a labelled study (NCT…), or pass --all.");
    process.exitCode = 1;
    return;
  }

  let adapter: ModelAdapter;
  try {
    // Local only: renderings are committed and shown to the coordinator (0008 spec §6.2).
    adapter = createLocalAdapter(parseModelSpec("omlx"), { thinking: false });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const run = { ...adapter.descriptor, promptVersion: PLAIN_PROMPT_VERSION };
  console.log(describe(adapter.descriptor));

  const labelSets = all ? loadLabelSets() : ids.map((id) => loadLabelSet(id));
  let failuresInARow = 0;
  for (const labels of labelSets) {
    const criteria = fromLabels(labels);
    let file: PlainFile | undefined;
    try {
      file = loadPlainFile(labels.nctId);
    } catch (error) {
      console.error(error instanceof PlainError ? error.message : String(error));
      process.exitCode = 1;
      return;
    }
    const work = workFor(criteria, file, run, force);
    if ("refuse" in work) {
      console.error(work.refuse);
      process.exitCode = 1;
      continue;
    }
    console.log(
      `\n${labels.nctId}: ${work.render.length} of ${criteria.length} to render, ${work.retry.length} to retry`,
    );
    let current: PlainFile =
      file === undefined || work.fresh
        ? {
            nctId: labels.nctId,
            source: "labels",
            run: { ...run, timestamp: monthStamp() },
            renderings: [],
          }
        : file;

    const jobs = [
      ...work.render.map((id) => ({ id, first: undefined as Attempt | undefined })),
      ...work.retry.map((id) => ({
        id,
        first: current.renderings.find((r) => r.criterionId === id)?.attempts[0],
      })),
    ];
    for (const { id, first } of jobs) {
      const criterion = criteria.find((c) => c.id === id);
      if (criterion === undefined) {
        continue;
      }
      const started = performance.now();
      const passes = (a: Attempt) => checkPlain(criterion.text, a.plain).pass;
      const attempts: Attempt[] = first === undefined ? [] : [first];
      let reached = true;
      // A first attempt if there is none, then the one retry if it is refused.
      while (
        reached &&
        (attempts.length === 0 || (attempts.length === 1 && !passes(attempts[0] as Attempt)))
      ) {
        const outcome = await attempt(adapter, criterion.text, attempts[0]);
        if (outcome === "unreachable") {
          failuresInARow += 1;
          console.error(`  ${id}: the model could not be reached`);
          reached = false;
        } else {
          failuresInARow = 0;
          attempts.push(outcome);
        }
      }
      // Whatever was made is kept, so a resume never repeats a finished attempt.
      if (attempts.length > 0 && (attempts.length > 1 || first === undefined)) {
        current = withRendering(current, criteria, {
          criterionId: id,
          textSha: textSha(criterion.text),
          attempts: attempts.map((a) => ({
            ...a,
            reportAtGeneration: a.reportAtGeneration ?? reportOn(criterion.text, a),
          })),
        });
        save(current);
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        const shown = attempts.find(passes);
        const mark =
          shown === undefined ? "refused" : shown === attempts[0] ? "first try" : "retry";
        console.log(
          `  ${id.padEnd(4)} ${seconds.padStart(5)} s  ${mark.padEnd(9)}  ${attempts.at(-1)?.plain ?? "(none)"}`,
        );
      }
      if (!reached && failuresInARow >= 2) {
        console.error(`Stopping after two failures in a row. Check ${HEALTH_URL}.`);
        process.exitCode = 1;
        return;
      }
    }
  }
}

/**
 * One call: a first attempt, or the retry of an earlier one. A reply with
 * nothing usable is recorded as an attempt; only an unreachable model is not.
 */
async function attempt(
  adapter: ModelAdapter,
  text: string,
  earlier: Attempt | undefined,
): Promise<Attempt | "unreachable"> {
  try {
    if (earlier === undefined || earlier.plain === null) {
      return await renderPlain(adapter, text);
    }
    return await retryPlain(adapter, text, earlier.plain, reportOn(text, earlier));
  } catch (error) {
    if (isConnectionFailure(error)) {
      return "unreachable";
    }
    if (!(error instanceof ModelError)) {
      throw error;
    }
    return { plain: null, reportAtGeneration: [error.message.split("\n")[0] ?? ""] };
  }
}

function save(file: PlainFile): void {
  const path = plainPath(file.nctId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

function describe(d: ModelDescriptor): string {
  return [
    `model: ${d.model} (${d.quantization})`,
    `${describeSettings(d)}, prompt ${PLAIN_PROMPT_VERSION}`,
    `writing to ${DEFAULT_PLAIN_DIR}`,
  ].join("\n");
}

if (import.meta.main) {
  await main();
}
