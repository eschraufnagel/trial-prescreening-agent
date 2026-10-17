import { describe, expect, it } from "vitest";
import { isConnectionFailure, ModelError } from "../../src/models/index.js";

describe("isConnectionFailure", () => {
  it("recognises the adapter's report of a request that never reached the model", () => {
    const error = new ModelError("POST http://127.0.0.1:8000/v1/chat/completions", [
      "request failed: fetch failed",
      "is oMLX running and listening on this address?",
    ]);
    expect(isConnectionFailure(error)).toBe(true);
  });

  it("does not treat a bad answer as the model being down", () => {
    expect(isConnectionFailure(new ModelError("read", ["response is not JSON"]))).toBe(false);
  });

  it("is false for anything that is not a ModelError", () => {
    expect(isConnectionFailure(new Error("request failed: fetch failed"))).toBe(false);
    expect(isConnectionFailure("request failed")).toBe(false);
  });
});
