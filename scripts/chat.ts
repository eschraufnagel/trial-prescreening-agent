/**
 * Screen yourself: you play the participant, the real agent asks the questions.
 *
 *   npm run screening:chat -- NCT04316364
 *   npm run screening:chat -- NCT04316364 --quiet    hide which criterion each question is about
 *
 * A hands-on test, not a measurement. It uses the labelled criteria, the local
 * model and the same `ScreeningSession` the eval runner drives. Nothing is
 * scored and nothing is written to `evals/results/`. The conversation is saved
 * under `chats/` (gitignored) after every turn, so `screening:show --html` can
 * render it and a dropped model connection loses nothing.
 *
 * Use made-up answers. This project handles synthetic data only.
 *
 * While chatting:  /findings  show what has been recorded so far
 *                  /quit      stop and save
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { loadLabelSet } from "../evals/cases/load.js";
import { fromLabels, studyContext } from "../evals/screening-input.js";
import type { ModelAdapter } from "../src/models/index.js";
import { createLocalAdapter, ModelError, parseModelSpec } from "../src/models/index.js";
import type { AgentReply, ScreeningResult } from "../src/screening/index.js";
import { ScreeningError, ScreeningSession } from "../src/screening/index.js";
import { renderText, toView } from "./show-conversation.js";

const CHATS_DIR = fileURLToPath(new URL("../chats", import.meta.url));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const nctId = args.find((a) => /^NCT\d+$/i.test(a))?.toUpperCase();
  const quiet = args.includes("--quiet");
  if (nctId === undefined) {
    console.error("usage: npm run screening:chat -- <NCT ID>   (a study with labels)");
    process.exitCode = 1;
    return;
  }

  let adapter: ModelAdapter;
  let session: ScreeningSession;
  try {
    // Local only: what a person types here never leaves this machine.
    adapter = createLocalAdapter(parseModelSpec("omlx"), { thinking: false });
    session = ScreeningSession.create(
      studyContext(nctId),
      fromLabels(loadLabelSet(nctId)),
      adapter,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  mkdirSync(CHATS_DIR, { recursive: true });
  const path = join(
    CHATS_DIR,
    `${nctId}-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "")}.json`,
  );
  let result: ScreeningResult | undefined;
  const save = () =>
    writeFileSync(
      path,
      `${JSON.stringify({ vignetteId: `chat ${nctId}`, source: "labels", state: session.state(), ...(result ? { result } : {}) }, null, 2)}\n`,
    );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(
    `Screening yourself for ${nctId}. Use made-up answers. /findings shows progress, /quit stops.\n`,
  );

  const say = (reply: AgentReply) => {
    const pending = session.state().pending;
    const about = quiet || pending === null || reply.kind === "done" ? "" : dim(` [${pending}]`);
    console.log(`\nagent${about}: ${reply.text}\n`);
  };

  let reply = await attempt(() => session.start());
  if (reply === undefined) {
    rl.close();
    return;
  }
  save();
  say(reply);

  while (reply.kind === "message") {
    const text = (await rl.question("you: ")).trim();
    if (text === "/quit") {
      break;
    }
    if (text === "/findings") {
      console.log(dim(progressSummary(session)));
      continue;
    }
    if (text === "") {
      continue;
    }
    const next = await attempt(() => session.receive(text));
    if (next === undefined) {
      console.log(dim("Your message was not recorded. Send it again when the model is back."));
      continue;
    }
    reply = next;
    if (reply.kind === "done") {
      result = reply.result;
    }
    save();
    say(reply);
  }
  rl.close();

  if (result !== undefined) {
    console.log(`\n${renderText(toView({ result, state: session.state() }, nctId))}`);
  }
  console.log(`\nsaved ${path}`);
  console.log(`view it: npm run screening:show -- ${path} --html`);
}

async function attempt(step: () => Promise<AgentReply>): Promise<AgentReply | undefined> {
  try {
    return await step();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n${message}`);
    if (error instanceof ModelError || error instanceof ScreeningError) {
      console.error(dim("If the model is down, check http://127.0.0.1:8000/health."));
    }
    return undefined;
  }
}

function progressSummary(session: ScreeningSession): string {
  const state = session.state();
  const text = new Map(state.criteria.map((c) => [c.id, c.text]));
  return state.progress
    .map((p) => {
      const reported = p.reported === undefined ? "" : `, reported ${p.reported}`;
      return `  ${p.criterionId.padEnd(4)} ${p.status}${p.reason ? ` (${p.reason}${reported})` : ""}  ${text.get(p.criterionId) ?? ""}`;
    })
    .join("\n");
}

function dim(text: string): string {
  return process.stdout.isTTY ? `\x1b[2m${text}\x1b[0m` : text;
}

if (import.meta.main) {
  await main();
}
