/**
 * One live call per provider, run by the repository owner with their own key, so the adapters'
 * fixtures are recordings of the real API rather than a reading of its
 * documentation (0008 intent, decision 4).
 *
 *   npm run models:smoke -- anthropic                  dry: prints the estimate
 *   npm run models:smoke -- anthropic --spend          one ask and one read, a fraction of a cent
 *   npm run models:smoke -- anthropic --batch --spend  the same two as one batch; up to 24 hours
 *   npm run models:smoke -- openai --spend             (or xai) needs that provider's key
 *
 * It sends the real agent's `ask` and `read` calls, on a made-up criterion and
 * a made-up reply, through the provider's cheapest admitted model, inside a
 * budget of 4 calls and $0.05. It says whether each came back in a shape the
 * agent accepts, which is whether the adapter works end to end, not whether
 * the model is any good. Then it writes each response over its fixture in
 * `tests/fixtures/models/<provider>/`, scrubbed (`scripts/lib/scrub.ts`),
 * prints how far the estimate's token count was off, and logs the spend.
 *
 * Nothing it records is a result. No number from it goes in the README.
 * Never run by Claude: it spends the owner's money with the owner's key.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ModelAdapter, ModelSpec, Provider, Workload } from "../src/models/index.js";
import {
  CHARS_PER_TOKEN,
  createAdapter,
  formatUsd,
  isFrontier,
  ModelError,
  monthStamp,
  parseModelSpec,
  tokensFor,
} from "../src/models/index.js";
import { ask, READ_MAX_OUTPUT_TOKENS, read } from "../src/screening/calls.js";
import { CHECK_ASK_CONTEXT, CHECK_READ_CONTEXT } from "../src/screening/check.js";
import {
  ASK_SYSTEM_PROMPT,
  buildAskPrompt,
  buildReadPrompt,
  READ_SYSTEM_PROMPT,
} from "../src/screening/prompts.js";
import type { ModelFlags, RunPlan } from "./lib/model-flags.js";
import { logSpend, planPaidRun, roleLine } from "./lib/model-flags.js";
import { scrubForFixture } from "./lib/scrub.js";

const FIXTURES = fileURLToPath(new URL("../tests/fixtures/models/", import.meta.url));
const BATCH_LEDGER = fileURLToPath(new URL("../evals/results/batches/", import.meta.url));

/** The smoke's own budget, whatever the defaults elsewhere. */
export const SMOKE_BUDGET = { maxCalls: 4, maxUsd: 0.05 };

const PROMPTS = {
  ask: { system: ASK_SYSTEM_PROMPT, user: buildAskPrompt(CHECK_ASK_CONTEXT) },
  read: { system: READ_SYSTEM_PROMPT, user: buildReadPrompt(CHECK_READ_CONTEXT) },
};

export interface SmokePlan {
  spec: ModelSpec & { provider: Provider };
  batch: boolean;
  plan: RunPlan;
}

/** Which provider, and whether this run may spend. Builds no adapter and reads no key. */
export function planSmoke(args: readonly string[], spendLog?: string): SmokePlan {
  const name = args.find((a) => !a.startsWith("--"));
  if (name === undefined) {
    throw new ModelError("Name a provider", ["npm run models:smoke -- anthropic | openai | xai"]);
  }
  const spec = parseModelSpec(name);
  if (!isFrontier(spec)) {
    throw new ModelError("Nothing to smoke-test", ["oMLX is local; name anthropic, openai or xai"]);
  }
  const batch = args.includes("--batch");
  if (batch && spec.provider !== "anthropic") {
    throw new ModelError("Cannot use --batch here", ["the batch path is built for Anthropic only"]);
  }
  const flags: ModelFlags = {
    roles: { smoke: spec },
    spend: args.includes("--spend"),
    maxCalls: SMOKE_BUDGET.maxCalls,
    maxUsd: SMOKE_BUDGET.maxUsd,
    batch,
    all: false,
  };
  const plan = planPaidRun({
    flags,
    paid: [{ role: "smoke", spec, workload: smokeWorkload() }],
    scope: batch ? "one ask and one read, as one batch" : "one ask and one read",
    ...(spendLog === undefined ? {} : { spendLog }),
  });
  return { spec, batch, plan };
}

function smokeWorkload(): Workload {
  const input = Object.values(PROMPTS).map((p) => tokensFor(p.system) + tokensFor(p.user));
  return {
    expected: { calls: 2, inputTokens: input.reduce((x, y) => x + y, 0), outputTokens: 60 + 150 },
    perCallCeiling: { inputTokens: Math.max(...input), outputTokens: READ_MAX_OUTPUT_TOKENS },
  };
}

export interface Recorded {
  label: string;
  url: string;
  status: number;
  retryAfter: string | null;
  text: string;
}

/** Wraps `fetch` to keep each response's body as it arrived, for the fixtures. */
function recordingFetch(inner: typeof fetch, into: Recorded[], label: () => string): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const response = await inner(url, init);
    const text = await response.clone().text();
    into.push({
      label: label(),
      url: String(url),
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      text,
    });
    return response;
  }) as typeof fetch;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let planned: SmokePlan;
  try {
    planned = planSmoke(args);
  } catch (error) {
    console.error(error instanceof ModelError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const { spec, batch, plan } = planned;
  console.log(`${roleLine("smoke", spec)}\n`);
  if (plan.kind !== "spend") {
    if (plan.kind !== "local") console.log(plan.text);
    if (plan.kind === "refused") process.exitCode = 1;
    return;
  }
  console.log(`${plan.text}\n`);

  const recorded: Recorded[] = [];
  let current = "ask";
  let adapter: ModelAdapter;
  try {
    adapter = createAdapter(spec, {
      budget: plan.budget,
      fetchImpl: recordingFetch(fetch, recorded, () => current),
      ...(batch ? { batch: { ledgerDir: BATCH_LEDGER, pollMs: 30_000 } } : {}),
      onRetry: (m) => console.log(`  ${m}`),
      onProgress: (m) => console.log(`  ${m}`),
    });
  } catch (error) {
    console.error(error instanceof ModelError ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  // The agent's own calls, with its own validators: "pass" means the adapter
  // produced something the agent accepts.
  const outcomes: Array<Awaited<ReturnType<typeof check>>> = [];
  if (batch) {
    // Both at once, so they queue together and go as one batch.
    outcomes.push(
      ...(await Promise.all([
        check("ask", () => ask(adapter, CHECK_ASK_CONTEXT)),
        check("read", () => read(adapter, CHECK_READ_CONTEXT)),
      ])),
    );
  } else {
    outcomes.push(await check("ask", () => ask(adapter, CHECK_ASK_CONTEXT)));
    current = "read";
    outcomes.push(await check("read", () => read(adapter, CHECK_READ_CONTEXT)));
  }
  for (const o of outcomes)
    console.log(`${o.label.padEnd(5)} ${o.passed ? "pass" : `FAIL: ${o.detail}`}`);

  writeFixtures(spec.provider, recorded, batch);
  calibrate(recorded, spec.provider);

  const spent = logSpend("models:smoke", [{ role: "smoke", spec, adapter }], { batch });
  console.log(`\nspent about ${formatUsd(spent)} at catalog prices (evals/results/spend.jsonl)`);
  if (outcomes.some((o) => !o.passed)) process.exitCode = 1;
}

async function check(
  label: string,
  call: () => Promise<unknown>,
): Promise<{ label: string; passed: boolean; detail: string }> {
  try {
    await call();
    return { label, passed: true, detail: "" };
  } catch (error) {
    return {
      label,
      passed: false,
      detail: (error instanceof Error ? error.message : String(error))
        .split("\n")
        .slice(0, 3)
        .join(" "),
    };
  }
}

/** Which fixture each recorded response replaces. Only successes are written. */
export function fixtureNameFor(
  r: Recorded,
  provider: Provider,
  batch: boolean,
): string | undefined {
  if (r.status !== 200) return undefined;
  if (!batch) {
    if (r.label === "ask") return provider === "anthropic" ? "ask-ok" : "ok";
    return "read-ok";
  }
  if (r.url.endsWith("/results")) return "batch-results";
  if (r.url.endsWith("/v1/messages/batches")) return "batch-created";
  return /"processing_status"\s*:\s*"ended"/.test(r.text) ? "batch-ended" : "batch-in-progress";
}

function writeFixtures(provider: Provider, recorded: readonly Recorded[], batch: boolean): void {
  const date = monthStamp();
  for (const r of recorded) {
    const name = fixtureNameFor(r, provider, batch);
    if (name === undefined) continue;
    const served = /"model"\s*:\s*"([^"]+)"/.exec(r.text)?.[1] ?? "the API";
    try {
      const fixture = scrubForFixture(provider, r, `recorded ${date} from ${served}`, process.env);
      const path = `${FIXTURES}${provider}/${name}.json`;
      writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
      console.log(`  wrote tests/fixtures/models/${provider}/${name}.json`);
    } catch (error) {
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}

/** How far `CHARS_PER_TOKEN` was off, from the tokens the provider reported. */
function calibrate(recorded: readonly Recorded[], provider: Provider): void {
  for (const label of ["ask", "read"] as const) {
    const r = recorded.find(
      (x) => x.label === label && x.status === 200 && !x.url.includes("batches"),
    );
    if (r === undefined) continue;
    const reported = reportedInput(r.text, provider);
    if (reported === undefined) continue;
    const prompt = PROMPTS[label];
    const estimated = tokensFor(prompt.system) + tokensFor(prompt.user);
    const ratio = estimated / reported;
    const off = Math.abs(ratio - 1) > 0.25;
    console.log(
      `calibration ${label}: estimated ${estimated} input tokens at ${CHARS_PER_TOKEN} chars/token, ` +
        `reported ${reported} (${ratio.toFixed(2)}×)${off ? " — off by more than 25%: change CHARS_PER_TOKEN in a commit that says why" : ""}`,
    );
  }
}

function reportedInput(text: string, provider: Provider): number | undefined {
  try {
    const usage = (JSON.parse(text) as { usage?: Record<string, number> }).usage ?? {};
    return provider === "anthropic"
      ? (usage["input_tokens"] ?? 0) +
          (usage["cache_creation_input_tokens"] ?? 0) +
          (usage["cache_read_input_tokens"] ?? 0)
      : usage["prompt_tokens"];
  } catch {
    return undefined;
  }
}

if (import.meta.main) {
  await main();
}
