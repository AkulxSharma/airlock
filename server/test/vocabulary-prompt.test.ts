import { describe, expect, it, vi } from "vitest";
import { createGeminiAgent, type GeminiClient } from "../src/agent/gemini.js";

describe("the Gemini intent prompt carries the vocabulary", () => {
  function fakeClient() {
    const generate = vi.fn(async () => ({ text: "", calls: [] }));
    return { client: { generate } as GeminiClient, generate };
  }

  it("lists the send verbs, the coin words and the 'to' words, and keeps the literal-copy rule", async () => {
    const { client, generate } = fakeClient();
    await createGeminiAgent(client).handle("could you possibly shoot over a little eth to my friend");
    const system = (generate.mock.calls[0] as unknown as [{ system: string }])[0].system;
    for (const word of ["shoot over", "transfer", "pay", "wire", "ethereum", "sepolia eth", "over to", "into"]) expect(system).toContain(word);
    expect(system).toMatch(/copied exactly|copy the amount and the destination exactly/i);
    expect(system).toMatch(/Never guess/);
  });

  it("does not hand the model the confirm or cancel words (YES and NO never reach it)", async () => {
    const { client, generate } = fakeClient();
    await createGeminiAgent(client).handle("could you possibly shoot over a little eth to my friend");
    const system = (generate.mock.calls[0] as unknown as [{ system: string }])[0].system;
    expect(system).not.toMatch(/affirmative|approve|proceed|never mind|nevermind|abort|forget it|negative|confirm a pending transfer|cancel it/i);
    expect(system).not.toMatch(/NOT confirmations/);
  });
});
