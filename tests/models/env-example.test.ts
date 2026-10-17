import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `.env.example` is the file in this repository most likely to acquire a
 * secret by accident: it is committed, it sits next to the gitignored `.env`,
 * and filling it in is a natural thing to do while debugging.
 *
 * `CLAUDE.md` forbids secrets in the repository including in example config.
 * This turns that from discipline into something that fails.
 */
const ENV_EXAMPLE = fileURLToPath(new URL("../../.env.example", import.meta.url));

interface Assignment {
  key: string;
  value: string;
}

/**
 * Takes the text rather than the path, so the detector below can be proved
 * against a file with a value in it without one ever being written to disk.
 */
function parseAssignments(text: string): Assignment[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return { key: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
    });
}

describe(".env.example", () => {
  const assignments = parseAssignments(readFileSync(ENV_EXAMPLE, "utf8"));

  it("documents the variables the adapters read", () => {
    expect(assignments.map((a) => a.key)).toEqual([
      "OMLX_API_KEY",
      "OMLX_BASE_URL",
      "OMLX_MODEL",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "XAI_API_KEY",
    ]);
  });

  it("carries no values at all", () => {
    expect(assignments.filter((a) => a.value.length > 0)).toEqual([]);
  });

  // Proves the check above would catch a value, using the same reader it uses.
  // A check that cannot fail is not doing its job, and this one guards the
  // constraint with the worst consequence for being wrong.
  it("would catch a value if one were added", () => {
    const withSecret = parseAssignments("# comment\nOMLX_API_KEY=some-key-value\nOMLX_MODEL=\n");

    expect(withSecret.filter((a) => a.value.length > 0)).toEqual([
      { key: "OMLX_API_KEY", value: "some-key-value" },
    ]);
  });
});
