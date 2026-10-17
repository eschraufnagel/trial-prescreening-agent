/**
 * Runs the prescreening test page on this machine.
 *
 * The agent and the trial reader run on the model chosen in the page's
 * Settings (slice 0017): the local model until a person chooses Anthropic,
 * OpenAI or xAI there and saves a key, which is kept in `local/`, gitignored.
 *
 *   npm run app                       your own trials, the local model, http://127.0.0.1:5005
 *   npm run app -- --examples         also the five built-in example trials and the eval run
 *   npm run app -- --examples --source parse   the examples from cached parses, not labels
 *   npm run app -- --fake             a scripted agent, with the examples; no oMLX needed
 *   npm run app -- --port 5010
 *   npm run app -- --chats-dir <dir>  save conversations there instead of chats/
 *   npm run app -- --trials-dir <dir> keep added trials there instead of added-trials/
 *   npm run app -- --settings-dir <dir>  keep Settings and keys there instead of local/
 *
 * `npm run app` builds the page first (`vite build`), then runs this. It loads
 * the criteria, because the server may not: the labels live under `evals/`,
 * which nothing under `src/` imports (spec D3). It is the same pair of inputs
 * 0004's results compare, through the same functions.
 *
 * Use made-up answers. Conversations are saved under `chats/`, which is
 * gitignored, after every change, and the page lists them to continue.
 * `screening:chat` saves there too, so a terminal chat can be continued here.
 *
 * A finished conversation opens in the coordinator review (slice 0007). With
 * `--examples`, so do the 30 conversations of the committed eval run
 * `EVAL_RUN` names, since showing them needs no model. They come from its
 * committed review file (slice 0010).
 *
 * The five labelled trials and the eval run are the project's test material.
 * Since slice 0013 they're served only with `--examples` (or `--fake`, which
 * implies it), so someone running the app for their own trials sees only the
 * ones they added.
 *
 * `--chats-dir` is for the browser test (slice 0010), which starts from an
 * empty directory and must never read or add to a person's `chats/`.
 *
 * The Trials screen (slice 0013) adds any trial by its ClinicalTrials.gov link.
 * The server fetches it with `fetchStudy`, the one runtime network call, and
 * parses it with the local model at the parser's defaults. Added trials are
 * kept in `added-trials/`, gitignored, or `--trials-dir`. With `--fake`, the
 * registry is one invented study on disk and the parser is scripted, so
 * nothing reaches the network or a model.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLabelSets } from "../evals/cases/load.js";
import { cacheKey } from "../evals/runner.js";
import { fromLabels, fromParse, studyContext } from "../evals/screening-input.js";
import type { ParsedCriteria } from "../src/criteria/types.js";
import type { ModelAdapter } from "../src/models/index.js";
import { DEFAULT_MODEL, FakeModelAdapter, SEED } from "../src/models/index.js";
import { displayFor, loadPlainFile } from "../src/plain/index.js";
import type {
  AgentSource,
  CriteriaSource,
  ServedStudy,
  SettingsRoutesOptions,
  TrialsOptions,
} from "../src/server/index.js";
import {
  choiceKey,
  choiceName,
  fixedAgent,
  localModels,
  SettingsStore,
  settingsAgent,
  settingsParser,
  startServer,
  testConnection,
} from "../src/server/index.js";
import { getTrial } from "../src/trials/index.js";
import { fetchStudy } from "../src/trials/registry.js";
import { appEstimates } from "./app/estimates.js";
import { loadEvalRun } from "./app/eval-run.js";
import { FAKE_STUDY, fakeFetchStudy } from "./app/fake-registry.js";
import { scriptedAgent } from "./app/scripted-agent.js";
import { scriptedParser } from "./app/scripted-parser.js";

const WEB_DIR = fileURLToPath(new URL("../dist/web", import.meta.url));
const CHATS_DIR = fileURLToPath(new URL("../chats", import.meta.url));
const ADDED_TRIALS_DIR = fileURLToPath(new URL("../added-trials", import.meta.url));
const SETTINGS_DIR = fileURLToPath(new URL("../local", import.meta.url));
const PARSES_DIR = fileURLToPath(new URL("../evals/results/parses", import.meta.url));
const DEFAULT_PORT = 5005;

export interface Args {
  source: CriteriaSource;
  fake: boolean;
  /** Serve the built-in example trials and the eval run. `--fake` implies it. */
  examples: boolean;
  port: number;
  chatsDir: string;
  trialsDir: string;
  /** Settings and the app's spend ledger (slice 0017): `local/`, gitignored. */
  settingsDir: string;
}

export function parseArgs(argv: readonly string[]): Args {
  const flagValue = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const source = flagValue("--source") ?? "labels";
  if (source !== "labels" && source !== "parse") {
    throw new Error(`--source must be labels or parse, not ${source}`);
  }
  const fake = argv.includes("--fake");
  const examples = fake || argv.includes("--examples");
  if (argv.includes("--source") && !examples) {
    throw new Error("--source chooses how the example trials are read; add --examples");
  }
  const port = Number(flagValue("--port") ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be a port number`);
  }
  const dirFlag = (flag: string, fallback: string) => {
    const dir = flagValue(flag);
    if (argv.includes(flag) && (dir === undefined || dir.startsWith("--"))) {
      throw new Error(`${flag} needs a directory`);
    }
    return dir === undefined ? fallback : resolve(dir);
  };
  return {
    source,
    fake,
    examples,
    port,
    chatsDir: dirFlag("--chats-dir", CHATS_DIR),
    trialsDir: dirFlag("--trials-dir", ADDED_TRIALS_DIR),
    settingsDir: dirFlag("--settings-dir", SETTINGS_DIR),
  };
}

/**
 * The labelled studies, from labels or from the parse 0003 cached for them.
 * A study with no cached parse is left out and named, never parsed here.
 */
function loadStudies(source: CriteriaSource, localModel: string | undefined): ServedStudy[] {
  const labelSets = loadLabelSets();
  if (source === "labels") {
    // Plain-language renderings are made from labelled criteria only (0006).
    return labelSets.map((labels) => {
      const criteria = fromLabels(labels);
      return {
        study: studyContext(labels.nctId),
        criteria,
        plain: displayFor(criteria, loadPlainFile(labels.nctId)),
        conditions: getTrial(labels.nctId).conditions,
        criteriaText: getTrial(labels.nctId).eligibility.criteriaText,
      };
    });
  }
  // The parse cache is keyed by the parser's model and seed, at the parser's
  // default reasoning mode: the agent's is off, and the parser's isn't. In fake
  // mode there is no model, so the key uses the pinned defaults.
  const keyedBy = { model: localModel ?? DEFAULT_MODEL, seed: SEED };
  return labelSets
    .map((l) => l.nctId)
    .flatMap((nctId) => {
      const path = join(PARSES_DIR, cacheKey(nctId, keyedBy));
      if (!existsSync(path)) {
        console.log(`  ${nctId}: no cached parse, left out (npm run eval -- ${nctId} makes one)`);
        return [];
      }
      const parsed = JSON.parse(readFileSync(path, "utf8")) as ParsedCriteria;
      return [
        {
          study: studyContext(nctId),
          criteria: fromParse(parsed).criteria,
          conditions: getTrial(nctId).conditions,
          criteriaText: getTrial(nctId).eligibility.criteriaText,
        },
      ];
    });
}

function scriptedAdapter(): ModelAdapter {
  return new FakeModelAdapter([], {
    respond: scriptedAgent,
    descriptor: { model: "scripted agent", adapter: "fake" },
  });
}

/**
 * Where each screening's model comes from (slice 0017). In fake mode, the
 * scripted agent. Otherwise, the model chosen in Settings, which is the local
 * model until a person chooses another; reasoning off, as the screening agent
 * ran in 0004's measured results.
 */
export function makeAgent(fake: boolean, store: SettingsStore): AgentSource {
  return fake ? fixedAgent(scriptedAdapter()) : settingsAgent({ store });
}

/**
 * Adding trials by link (slice 0013). The parser is the model chosen in
 * Settings, at the parser's default reasoning mode, as `npm run eval`
 * parses; a fresh one per read, under the trial cap (slice 0017). Fake mode
 * never reaches the registry or a model.
 */
export function makeTrials(fake: boolean, dir: string, store: SettingsStore): TrialsOptions {
  if (fake) {
    const parser = new FakeModelAdapter([], {
      respond: scriptedParser,
      descriptor: { model: "scripted parser", adapter: "fake" },
    });
    return { dir, fetchStudy: fakeFetchStudy, parserFor: () => parser };
  }
  return { dir, fetchStudy: (nctId) => fetchStudy(nctId), ...settingsParser({ store }) };
}

/**
 * Settings' routes (slice 0017). In fake mode the connection test is
 * scripted and reaches nothing, and there's no local server to list.
 */
export function makeSettings(fake: boolean, store: SettingsStore): SettingsRoutesOptions {
  if (fake) {
    return {
      store,
      estimates: appEstimates(),
      test: async () => ({ ok: true, usd: 0, servedModel: "scripted agent" }),
      localModels: async () => ({ reachable: false, models: [], problem: "fake mode" }),
    };
  }
  return {
    store,
    estimates: appEstimates(),
    test: (choice) => testConnection({ store }, choice),
    localModels: () => localModels({ store }),
  };
}

async function main(): Promise<void> {
  let args: Args;
  let store: SettingsStore;
  let agent: AgentSource;
  let trials: TrialsOptions;
  try {
    args = parseArgs(process.argv.slice(2));
    store = new SettingsStore(args.settingsDir);
    agent = makeAgent(args.fake, store);
    trials = makeTrials(args.fake, args.trialsDir, store);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (!process.argv.includes("--fake")) {
      console.error("To try the page without the model: npm run app -- --fake");
    }
    process.exitCode = 1;
    return;
  }

  if (!existsSync(join(WEB_DIR, "index.html"))) {
    console.error("The page is not built. Run it with npm run app, which builds it first.");
    process.exitCode = 1;
    return;
  }

  const localModel = args.fake ? undefined : store.view("live", {}).local.model;
  const studies = args.examples ? loadStudies(args.source, localModel) : [];
  if (args.examples && studies.length === 0) {
    console.error("No example trials to serve.");
    process.exitCode = 1;
    return;
  }

  // The eval run is extra: without it the page still runs, it just has nothing
  // from 0004 to review. The loader refuses a run made with another prompt,
  // which is right for the review and wrong as a reason not to start.
  let finished: ReturnType<typeof loadEvalRun> = [];
  let evalRunProblem: string | undefined;
  if (args.examples) {
    try {
      finished = loadEvalRun();
    } catch (error) {
      evalRunProblem = error instanceof Error ? error.message : String(error);
    }
  }

  let url: string;
  try {
    ({ url } = await startServer({
      studies,
      source: args.source,
      agent,
      settings: makeSettings(args.fake, store),
      mode: args.fake ? "scripted" : "local-model",
      examples: args.examples,
      webDir: WEB_DIR,
      chatsDir: args.chatsDir,
      port: args.port,
      finished,
      trials,
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
      throw error;
    }
    console.error(portInUse(args.port));
    process.exitCode = 1;
    return;
  }

  const choice = choiceKey(store.current());
  const mode = args.fake
    ? "scripted agent (no model)"
    : choice === "omlx"
      ? `${store.current().model} on oMLX, reasoning off${store.ready() ? "" : ": no key yet, set one up in Settings"}`
      : `${choiceName(choice)}, chosen in Settings${store.ready() ? "" : ", with no key saved yet"}`;
  console.log(`\nTrial Prescreening: ${url}`);
  console.log(`  ${mode}`);
  if (args.examples) {
    console.log(`  ${studies.length} example trials, criteria from ${args.source}.`);
    if (args.source === "labels") {
      const all = studies.flatMap((s) => Object.values(s.plain ?? {}));
      const withText = all.filter((p) => p.state === "shown").length;
      console.log(`  Plain language for ${withText} of ${all.length} criteria.`);
    }
    console.log(
      evalRunProblem === undefined
        ? `  ${finished.length} eval-run conversations to review (simulated participants).`
        : `  No eval-run conversations to review: ${evalRunProblem}`,
    );
  } else {
    console.log("  Your trials only. Add -- --examples for the five built-in example trials.");
  }
  console.log(
    args.fake
      ? `  Trials screen: fake mode adds only the invented ${FAKE_STUDY}, kept in ${args.trialsDir}.`
      : `  Trials screen: add any trial by its ClinicalTrials.gov link. Kept in ${args.trialsDir}.`,
  );
  console.log(
    `  Use made-up answers. Conversations are saved in ${args.chatsDir}. Ctrl-C stops the server.`,
  );
  if (!args.fake) {
    console.log(`  Settings and keys are kept in ${args.settingsDir}, which isn't committed.`);
    if (choice === "omlx") {
      console.log("  If replies stop, check http://127.0.0.1:8000/health.");
    }
  }
}

/**
 * What to do when the port is taken: usually an earlier `npm run app` still
 * running, often one suspended with Ctrl-Z, which keeps the port while stopped.
 */
export function portInUse(port: number): string {
  return [
    `Port ${port} is already in use on 127.0.0.1, most likely by an earlier npm run app.`,
    `  See what it is:  lsof -nP -iTCP:${port} -sTCP:LISTEN`,
    "  If it was suspended with Ctrl-Z, bring it back with fg and stop it with Ctrl-C.",
    `  Or run this one elsewhere: npm run app -- --port ${port + 1}`,
  ].join("\n");
}

if (import.meta.main) {
  await main();
}
