import { describe, expect, it } from "vitest";
import { MAX_SPEAK_CHARS, speak } from "./speak.js";

const KEY = "test-key-123";
function fakeFetch(status: number, body = new Uint8Array([1, 2, 3])) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("speak", () => {
  it("returns the audio bytes and calls the right endpoint with the key header", async () => {
    const { impl, calls } = fakeFetch(200);
    const audio = await speak("Hello", { apiKey: KEY, voiceId: "voice1", fetchImpl: impl });
    expect(Array.from(audio)).toEqual([1, 2, 3]);
    expect(calls[0].url).toContain("/v1/text-to-speech/voice1");
    expect((calls[0].init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
    expect(JSON.parse(calls[0].init.body as string).text).toBe("Hello");
  });
  it("rejects empty text before calling the network", async () => {
    const { impl, calls } = fakeFetch(200);
    await expect(speak("   ", { apiKey: KEY, fetchImpl: impl })).rejects.toThrow("empty");
    expect(calls.length).toBe(0);
  });
  it("rejects text over the cap", async () => {
    const { impl } = fakeFetch(200);
    await expect(speak("a".repeat(MAX_SPEAK_CHARS + 1), { apiKey: KEY, fetchImpl: impl })).rejects.toThrow("longer");
  });
  it("throws when no key is available", async () => {
    const saved = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    try {
      await expect(speak("Hello", { fetchImpl: fakeFetch(200).impl })).rejects.toThrow("not set");
    } finally {
      if (saved !== undefined) process.env.ELEVENLABS_API_KEY = saved;
    }
  });
  it("throws on a non-200 response without leaking the key", async () => {
    const { impl } = fakeFetch(401);
    const err = await speak("Hello", { apiKey: KEY, fetchImpl: impl }).catch((e: Error) => e);
    expect((err as Error).message).toContain("401");
    expect((err as Error).message).not.toContain(KEY);
  });
});
