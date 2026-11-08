import { describe, expect, it, vi } from "vitest";
import { MODEL, describeGeminiError, modelFromEnv, withCooldown, type GeminiClient } from "../src/agent/gemini.js";

// Found when a teammate's new API key answered 404 ("gemini-2.5-flash is no longer available to new
// users"): the call failed silently, the app fell back to the rule parser, and nobody saw why.
describe("which Gemini model is used", () => {
  it("defaults to a current model, not the one Google withdrew for new keys", () => {
    expect(MODEL).toBe("gemini-3.5-flash");
    expect(modelFromEnv({})).toBe(MODEL);
  });
  it("GEMINI_MODEL overrides it, and a blank value falls back to the default", () => {
    expect(modelFromEnv({ GEMINI_MODEL: "gemini-3.1-flash-lite" })).toBe("gemini-3.1-flash-lite");
    expect(modelFromEnv({ GEMINI_MODEL: "  gemini-3.7-flash  " })).toBe("gemini-3.7-flash");
    expect(modelFromEnv({ GEMINI_MODEL: "   " })).toBe(MODEL);
    expect(modelFromEnv({ GEMINI_MODEL: "" })).toBe(MODEL);
  });
});

describe("a Gemini failure is visible", () => {
  const failing = (err: unknown): GeminiClient => ({ generate: vi.fn(async () => { throw err; }) });

  it("reports the error once, then cools down without reporting the cool-down itself", async () => {
    const onError = vi.fn();
    let t = 0;
    const client = withCooldown(failing(new Error("404 model gone")), 20_000, () => t, onError);
    await expect(client.generate({ system: "s", user: "u", withTransferTool: false })).rejects.toThrow("404 model gone");
    expect(onError).toHaveBeenCalledTimes(1);
    await expect(client.generate({ system: "s", user: "u", withTransferTool: false })).rejects.toThrow("cooling down");
    expect(onError).toHaveBeenCalledTimes(1); // the cool-down is not a new failure
    t = 25_000;
    await expect(client.generate({ system: "s", user: "u", withTransferTool: false })).rejects.toThrow("404 model gone");
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("still works without an error handler", async () => {
    const client = withCooldown(failing(new Error("boom")));
    await expect(client.generate({ system: "s", user: "u", withTransferTool: false })).rejects.toThrow("boom");
  });

  it("describes the failure on one short line and never includes the API key", () => {
    const key = "AIzaSyFAKE-KEY-1234567890";
    const text = describeGeminiError(new Error(`bad request\nurl=https://x?key=${key}\n  more text`), key);
    expect(text).not.toContain(key);
    expect(text).toContain("***");
    expect(text).not.toMatch(/\n/);
    expect(describeGeminiError(new Error("x".repeat(1000)), key).length).toBeLessThanOrEqual(220);
    expect(describeGeminiError("plain string", key)).toBe("plain string");
  });
});
