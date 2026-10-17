import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../../scripts/app.js";

describe("npm run app's arguments", () => {
  it("saves conversations in chats/ unless told otherwise", () => {
    expect(parseArgs([]).chatsDir.endsWith("chats")).toBe(true);
  });

  it("takes --chats-dir, resolved against the working directory", () => {
    expect(parseArgs(["--fake", "--chats-dir", "e2e/.out/chats"])).toMatchObject({
      fake: true,
      chatsDir: resolve("e2e/.out/chats"),
    });
  });

  it("refuses --chats-dir with no directory", () => {
    expect(() => parseArgs(["--chats-dir"])).toThrow(/needs a directory/);
    expect(() => parseArgs(["--chats-dir", "--fake"])).toThrow(/needs a directory/);
  });

  // Slice 0013: where trials added on the Trials screen are kept.
  it("keeps added trials in added-trials/ unless told otherwise", () => {
    expect(parseArgs([]).trialsDir.endsWith("added-trials")).toBe(true);
    expect(parseArgs(["--trials-dir", "e2e/.out/trials"]).trialsDir).toBe(
      resolve("e2e/.out/trials"),
    );
    expect(() => parseArgs(["--trials-dir"])).toThrow("--trials-dir needs a directory");
    expect(() => parseArgs(["--trials-dir", "--fake"])).toThrow("--trials-dir needs a directory");
  });

  // Slice 0013: the project's example trials are served only when asked for.
  it("serves only the person's own trials unless --examples or --fake is given", () => {
    expect(parseArgs([]).examples).toBe(false);
    expect(parseArgs(["--examples"]).examples).toBe(true);
    expect(parseArgs(["--fake"]).examples).toBe(true);
    expect(parseArgs(["--examples", "--source", "parse"]).source).toBe("parse");
    expect(() => parseArgs(["--source", "parse"])).toThrow("add --examples");
  });
});
