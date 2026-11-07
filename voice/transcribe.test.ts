import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES, transcribe } from "./transcribe.js";

const KEY = "test-key-123";
function fakeFetch(status: number, json: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const AUDIO = new Uint8Array([1, 2, 3, 4]);

describe("transcribe", () => {
  it("returns trimmed text and posts multipart audio with the key header", async () => {
    const { impl, calls } = fakeFetch(200, { text: "  send 0.01 to vitalik.eth  " });
    const text = await transcribe(AUDIO, { apiKey: KEY, fetchImpl: impl });
    expect(text).toBe("send 0.01 to vitalik.eth");
    expect(calls[0].url).toContain("/v1/speech-to-text");
    expect((calls[0].init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
    const form = calls[0].init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v1");
    expect((form.get("file") as Blob).size).toBe(4);
  });
  it("rejects empty audio before calling the network", async () => {
    const { impl, calls } = fakeFetch(200, { text: "x" });
    await expect(transcribe(new Uint8Array(), { apiKey: KEY, fetchImpl: impl })).rejects.toThrow("empty");
    expect(calls.length).toBe(0);
  });
  it("rejects audio over the size cap", async () => {
    const { impl } = fakeFetch(200, { text: "x" });
    await expect(transcribe(new Uint8Array(MAX_AUDIO_BYTES + 1), { apiKey: KEY, fetchImpl: impl })).rejects.toThrow("10 MB");
  });
  it("throws when no key is available", async () => {
    const saved = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    try {
      await expect(transcribe(AUDIO, { fetchImpl: fakeFetch(200, { text: "x" }).impl })).rejects.toThrow("not set");
    } finally {
      if (saved !== undefined) process.env.ELEVENLABS_API_KEY = saved;
    }
  });
  it("throws on a non-200 response without leaking the key", async () => {
    const err = await transcribe(AUDIO, { apiKey: KEY, fetchImpl: fakeFetch(401, {}).impl }).catch((e: Error) => e);
    expect((err as Error).message).toContain("401");
    expect((err as Error).message).not.toContain(KEY);
  });
  it("throws when the response has no text field", async () => {
    await expect(transcribe(AUDIO, { apiKey: KEY, fetchImpl: fakeFetch(200, {}).impl })).rejects.toThrow("no text");
  });
});

describe("transcribe: language", () => {
  it("sends language_code only when one is given", async () => {
    const a = fakeFetch(200, { text: "x" });
    await transcribe(AUDIO, { apiKey: KEY, fetchImpl: a.impl });
    expect((a.calls[0].init.body as FormData).get("language_code")).toBeNull();
    const b = fakeFetch(200, { text: "x" });
    await transcribe(AUDIO, { apiKey: KEY, fetchImpl: b.impl, languageCode: "en" });
    expect((b.calls[0].init.body as FormData).get("language_code")).toBe("en");
  });
});
