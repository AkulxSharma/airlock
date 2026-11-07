import { describe, expect, it } from "vitest";
import { createVad } from "./vad";
import { encodeWav, resample } from "./wav";

const FRAME = 4096;
const RATE = 48_000;
const FRAME_MS = (FRAME / RATE) * 1000; // about 85 ms
const tone = (amp: number) => Float32Array.from({ length: FRAME }, (_, i) => amp * Math.sin(i / 7));
const quiet = () => tone(0.002);
const loud = () => tone(0.2);

/** Feed frames and collect finished utterances. */
function run(frames: Float32Array[], vad = createVad({ frameMs: FRAME_MS })) {
  const out: Float32Array[] = [];
  for (const f of frames) { const u = vad.feed(f); if (u) out.push(u); }
  return out;
}
const many = (f: () => Float32Array, n: number) => Array.from({ length: n }, f);

describe("createVad", () => {
  it("returns one utterance for speech between silences, with pre-roll and a trailing hangover", () => {
    const out = run([...many(quiet, 20), ...many(loud, 15), ...many(quiet, 20)]);
    expect(out).toHaveLength(1);
    const frames = out[0].length / FRAME;
    expect(frames).toBeGreaterThan(15); // the speech itself
    expect(frames).toBeLessThan(15 + 8 + 14); // plus pre-roll and hangover, not the whole recording
  });

  it("keeps the audio from just before speech started (the first syllable)", () => {
    const pre = tone(0.05); // quieter than speech but above the background
    const out = run([...many(quiet, 20), pre, ...many(loud, 15), ...many(quiet, 20)]);
    expect(out).toHaveLength(1);
    expect(out[0].length / FRAME).toBeGreaterThan(15);
  });

  it("ignores a short click or cough", () => {
    expect(run([...many(quiet, 20), ...many(loud, 2), ...many(quiet, 30)])).toHaveLength(0);
  });

  it("ignores steady quiet background noise", () => {
    expect(run(many(quiet, 200))).toHaveLength(0);
  });

  it("separates two utterances", () => {
    const out = run([...many(quiet, 20), ...many(loud, 12), ...many(quiet, 20), ...many(loud, 12), ...many(quiet, 20)]);
    expect(out).toHaveLength(2);
  });

  it("does not keep sending clips of steady noise from a loud room", () => {
    const hum = () => tone(0.03);
    const out = run(many(hum, 600)); // about 50 seconds of constant hum
    expect(out.length).toBeLessThanOrEqual(1);
  });

  it("cuts a very long utterance at the maximum length", () => {
    const vad = createVad({ frameMs: FRAME_MS, maxSpeechMs: 2000 });
    const out = run([...many(quiet, 10), ...many(loud, 100)], vad);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].length / FRAME).toBeLessThan(40);
  });

  it("adapts to a noisy room: steady noise does not count as speech, speech on top of it does", () => {
    const noisy = () => tone(0.02);
    const vad = createVad({ frameMs: FRAME_MS });
    const out = run([...many(noisy, 60), ...many(loud, 14), ...many(noisy, 20)], vad);
    expect(out).toHaveLength(1);
  });
});

describe("wav", () => {
  it("resamples 48 kHz to 16 kHz by a factor of three", () => {
    expect(resample(new Float32Array(48_000), 48_000, 16_000)).toHaveLength(16_000);
    expect(resample(new Float32Array(100), 16_000, 16_000)).toHaveLength(100);
  });

  it("writes a valid 16 kHz mono 16-bit WAV header and clamps the samples", () => {
    const wav = encodeWav(Float32Array.from([0, 1, -1, 2, -2]));
    const v = new DataView(wav.buffer);
    const tag = (at: number) => String.fromCharCode(...wav.slice(at, at + 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(10); // 5 samples x 2 bytes
    expect(wav.length).toBe(44 + 10);
    expect(v.getInt16(46, true)).toBe(0x7fff); // 1 -> max
    expect(v.getInt16(48, true)).toBe(-0x8000); // -1 -> min
    expect(v.getInt16(50, true)).toBe(0x7fff); // 2 clamps to max
  });
});
