import { describe, expect, it } from "vitest";
import { keyHint, keyVariable, withSavedKeys } from "../../src/models/keys.js";
import { SENTINEL_KEY } from "./fixtures.js";

describe("saved keys (slice 0017)", () => {
  it("shows the last four characters of a key, and nothing of a short one", () => {
    expect(keyHint(`  ${SENTINEL_KEY} `)).toBe(`…${SENTINEL_KEY.slice(-4)}`);
    expect(keyHint("short-key")).toBe("…");
  });

  it("puts each saved key under its provider's variable and changes nothing else", () => {
    const env = { PATH: "/bin", OMLX_API_KEY: "local", [keyVariable("xai")]: "from-env" };
    const out = withSavedKeys(env, { anthropic: ` ${SENTINEL_KEY} `, openai: "  " });
    expect(out[keyVariable("anthropic")]).toBe(SENTINEL_KEY);
    expect(out[keyVariable("openai")]).toBeUndefined();
    expect(out[keyVariable("xai")]).toBe("from-env");
    expect(out["PATH"]).toBe("/bin");
    expect(out["OMLX_API_KEY"]).toBe("local");
    expect(env[keyVariable("anthropic")]).toBeUndefined();
  });
});
