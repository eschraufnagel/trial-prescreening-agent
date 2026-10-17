import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { conversationKey } from "../../evals/screening-runner.js";
import { exportReview, reviewText } from "../../scripts/app/eval-run.js";
import { writeDecision } from "../../scripts/review-export.js";
import { EVAL_ONLY_KEYS, keysOf } from "../fixtures/eval-run.js";

const RUN_FILE = "20990101T000000-000000000000.json";
const RUN_PROMPT = "000000000000";
const SIMULATOR = "111111111111";
const DESCRIPTOR = {
  model: "some-model",
  quantization: "8bit",
  temperature: 0,
  seed: 1,
  adapter: "omlx",
};

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A one-conversation run in a temp dir, with its conversation file keyed by
 * the versions the run recorded. `file` replaces the conversation file's
 * contents; `null` leaves it out. `parse` is a parse identity the run records
 * (slice 0011), which the conversation file's key then carries.
 */
function runDir(file: unknown | null = {}, parse?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "prescreen-review-export-"));
  dirs.push(dir);
  mkdirSync(join(dir, "conversations"));
  writeFileSync(
    join(dir, RUN_FILE),
    JSON.stringify({
      ...DESCRIPTOR,
      promptVersion: RUN_PROMPT,
      simulatorVersion: SIMULATOR,
      ...(parse === undefined ? {} : { parseIdentity: parse }),
      conversations: [{ vignetteId: "NCT00000001-v1", nctId: "NCT00000001", source: "parse" }],
    }),
  );
  if (file !== null) {
    const key = conversationKey(
      "NCT00000001-v1",
      "parse",
      DESCRIPTOR,
      {},
      {
        prompt: RUN_PROMPT,
        simulator: SIMULATOR,
        ...(parse === undefined ? {} : { parse }),
      },
    );
    writeFileSync(
      join(dir, "conversations", key),
      JSON.stringify({
        vignetteId: "NCT00000001-v1",
        memory: { facts: [] },
        participant: [{ text: "a simulated reply" }],
        timing: { turns: 1 },
        state: {
          criteria: [{ id: "P1", text: "Age 18 or over", polarity: "inclusion", type: "patient" }],
        },
        result: { findings: [], transcript: [], run: { promptVersion: RUN_PROMPT } },
        ...(file as object),
      }),
    );
  }
  return dir;
}

describe("exporting a run's review file", () => {
  it("keeps the id, study, source, criteria and result, and nothing from the vignette or the grade", () => {
    const review = exportReview(runDir(), RUN_FILE);
    expect(review.runFile).toBe(RUN_FILE);
    expect(review.promptVersion).toBe(RUN_PROMPT);
    expect(review.conversations).toHaveLength(1);
    expect(Object.keys(review.conversations[0] ?? {}).sort()).toEqual([
      "criteria",
      "id",
      "nctId",
      "result",
      "source",
    ]);
    expect(review.conversations[0]?.id).toBe("eval NCT00000001-v1-parse");
    expect(keysOf(review).filter((k) => EVAL_ONLY_KEYS.includes(k))).toEqual([]);
  });

  it("finds conversation files by the versions the run recorded, not this code's", () => {
    // The run's versions aren't today's, so a key from today's would miss the file.
    expect(conversationKey("NCT00000001-v1", "parse", DESCRIPTOR)).not.toContain(RUN_PROMPT);
    expect(exportReview(runDir(), RUN_FILE).conversations).toHaveLength(1);
  });

  it("finds a conversation from a parse by the parse identity the run recorded (slice 0011)", () => {
    expect(exportReview(runDir({}, "222222222222-n2"), RUN_FILE).conversations).toHaveLength(1);
  });

  it("is deterministic", () => {
    const dir = runDir();
    expect(reviewText(exportReview(dir, RUN_FILE))).toBe(reviewText(exportReview(dir, RUN_FILE)));
    expect(reviewText(exportReview(dir, RUN_FILE)).endsWith("}\n")).toBe(true);
  });

  it("refuses a run whose conversation file is missing", () => {
    expect(() => exportReview(runDir(null), RUN_FILE)).toThrow(
      /lists NCT00000001-v1 \(parse\), but .* is missing/,
    );
  });

  it("refuses a conversation with no finished result", () => {
    expect(() => exportReview(runDir({ state: null }), RUN_FILE)).toThrow(/has no finished result/);
    expect(() => exportReview(runDir({ result: undefined }), RUN_FILE)).toThrow(
      /has no finished result/,
    );
  });

  it("refuses a result made with a different prompt than its run says", () => {
    const dir = runDir({
      result: { findings: [], transcript: [], run: { promptVersion: "222222222222" } },
    });
    expect(() => exportReview(dir, RUN_FILE)).toThrow(
      /made with prompt 222222222222, but .* says 000000000000/,
    );
  });
});

describe("writing it", () => {
  it("writes a new file, leaves an identical one, and refuses a different one without --force", () => {
    expect(writeDecision(undefined, "a", false)).toBe("write");
    expect(writeDecision("a", "a", false)).toBe("unchanged");
    expect(writeDecision("a", "b", false)).toBe("refuse");
    expect(writeDecision("a", "b", true)).toBe("write");
  });
});
