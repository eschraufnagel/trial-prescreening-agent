import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR, loadFixture } from "./fixtures.js";

/**
 * The provider fixtures are committed, and some will be recordings of real
 * responses. These checks keep them honest about where they came from and
 * keep anything shaped like a key out of them.
 */

const PROVIDERS = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

/** Key shapes: Anthropic, OpenAI and xAI prefixes followed by a key's worth of characters. */
const KEY_SHAPED = /\b(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|xai-[A-Za-z0-9_-]{20,})/;

function files(): Array<{ provider: string; name: string; text: string }> {
  return PROVIDERS.flatMap((provider) =>
    readdirSync(`${FIXTURES_DIR}${provider}`)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        provider,
        name: f.slice(0, -".json".length),
        text: readFileSync(`${FIXTURES_DIR}${provider}/${f}`, "utf8"),
      })),
  );
}

describe("provider fixtures", () => {
  it("has fixtures for all three providers", () => {
    expect(PROVIDERS).toEqual(["anthropic", "openai", "xai"]);
  });

  // A fixture that doesn't say whether it was recorded or written from the
  // docs would let the README claim more than the tests prove.
  it("says of every fixture whether it was recorded or written from documentation", () => {
    for (const { provider, name } of files()) {
      const { provenance } = loadFixture(provider, name);
      expect(provenance, `${provider}/${name}`).toMatch(
        /^(recorded \d{4}-\d{2} from |written from )/,
      );
    }
  });

  it("carries nothing shaped like a key, and no headers but retry-after", () => {
    for (const { provider, name, text } of files()) {
      expect(KEY_SHAPED.test(text), `${provider}/${name}`).toBe(false);
      for (const header of Object.keys(loadFixture(provider, name).headers ?? {})) {
        expect(header, `${provider}/${name}`).toBe("retry-after");
      }
    }
  });

  it("would catch a key", () => {
    expect(KEY_SHAPED.test(`{"k":"sk-ant-api03-${"a".repeat(30)}"}`)).toBe(true);
    expect(KEY_SHAPED.test(`{"k":"xai-${"B".repeat(40)}"}`)).toBe(true);
    expect(KEY_SHAPED.test('{"id":"msg_recorded"}')).toBe(false);
  });
});
