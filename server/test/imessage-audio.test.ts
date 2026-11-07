import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES, MAX_SECONDS, attachmentPath, convertToWav, createVoiceTranscriber, wavSeconds } from "../src/imessage/audio.js";

const root = mkdtempSync(join(tmpdir(), "airlock-att-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const note = (name: string, bytes = 5_000) => {
  mkdirSync(join(root, "ab", "cd"), { recursive: true });
  const p = join(root, "ab", "cd", name);
  writeFileSync(p, Buffer.alloc(bytes, 1));
  return p;
};

type Cb = (e: Error | null, o: string, s: string) => void;
// A stand-in for afconvert/ffmpeg: writes a WAV of the given length to the output path (last argument).
const wavWriter = (seconds: number, failFirst = false) => {
  let calls = 0;
  const exec = vi.fn((file: string, args: string[], cb: Cb) => {
    calls++;
    if (failFirst && calls === 1) return cb(new Error("afconvert failed"), "", "");
    writeFileSync(args[args.length - 1], Buffer.alloc(44 + Math.round(seconds * 32_000), 2));
    cb(null, "", "");
  });
  return exec;
};

describe("attachmentPath", () => {
  it("accepts files under the attachments folder, expanding ~", () => {
    expect(attachmentPath(join(root, "ab/cd/x.caf"), root)).toBe(join(root, "ab/cd/x.caf"));
    expect(attachmentPath("~/Library/Messages/Attachments/ab/cd/Audio Message.caf")).toMatch(/Library\/Messages\/Attachments\/ab\/cd\/Audio Message\.caf$/);
  });
  it("rejects anything outside it, including traversal and look-alike folders", () => {
    expect(attachmentPath("/etc/passwd", root)).toBeNull();
    expect(attachmentPath(join(root, "../../.ssh/id_rsa"), root)).toBeNull();
    expect(attachmentPath(root + "Evil/file.caf", root)).toBeNull();
    expect(attachmentPath("~/Library/Messages/Attachments/../../../.ssh/id_rsa")).toBeNull();
    expect(attachmentPath("~/Documents/secret.caf")).toBeNull();
    expect(attachmentPath(root, root)).toBeNull(); // the folder itself is not a file under it
  });
});

describe("convertToWav", () => {
  const canMakeAudio = process.platform === "darwin" && existsSync("/usr/bin/afconvert") && existsSync("/usr/bin/say");
  it.skipIf(!canMakeAudio)("really decodes an Opus CAF voice note (the iMessage format) to 16 kHz WAV", async () => {
    const dir = mkdtempSync(join(tmpdir(), "airlock-gen-"));
    try {
      execFileSync("/usr/bin/say", ["-o", join(dir, "a.aiff"), "Hey Airlock. Send zero point zero one eth to weth dot demo."]);
      execFileSync("/usr/bin/afconvert", ["-f", "caff", "-d", "opus@24000", "-c", "1", join(dir, "a.aiff"), join(dir, "Audio Message.caf")]);
      const wav = await convertToWav(join(dir, "Audio Message.caf"));
      expect(Buffer.from(wav.slice(0, 4)).toString()).toBe("RIFF");
      expect(Buffer.from(wav.slice(8, 12)).toString()).toBe("WAVE");
      expect(wavSeconds(wav)).toBeGreaterThan(2);
      expect(wavSeconds(wav)).toBeLessThan(10);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to ffmpeg when afconvert fails", async () => {
    const exec = wavWriter(1, true);
    const wav = await convertToWav("/x/in.caf", exec);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[0][0]).toBe("/usr/bin/afconvert");
    expect(exec.mock.calls[1][0]).toBe("ffmpeg");
    expect(wavSeconds(wav)).toBeCloseTo(1, 1);
  });

  it("deletes its temp files whether it works or fails", async () => {
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith("airlock-voice-")).length;
    await convertToWav("/x/in.caf", wavWriter(1));
    const failing = vi.fn((_f: string, _a: string[], cb: Cb) => cb(new Error("no"), "", ""));
    await expect(convertToWav("/x/in.caf", failing)).rejects.toThrow();
    expect(readdirSync(tmpdir()).filter((n) => n.startsWith("airlock-voice-")).length).toBe(before);
  });

  it("measures the length of a WAV", () => {
    expect(wavSeconds(new Uint8Array(44 + 64_000))).toBe(2);
    expect(wavSeconds(new Uint8Array(10))).toBe(0);
  });
});

describe("voice transcriber", () => {
  const make = (over: Parameters<typeof createVoiceTranscriber>[0] = {}) => {
    const logs: string[] = [];
    const transcribe = vi.fn(async (_a: Uint8Array, _o: { mimeType: string }) => "  Hey Airlock, send 0.01 to weth.demo  ");
    const t = createVoiceTranscriber({ attachmentsRoot: root, exec: wavWriter(3), transcribe, log: (l) => logs.push(l), ...over });
    return { t, logs, transcribe };
  };

  it("converts the note, transcribes it as WAV, and returns the trimmed text", async () => {
    const { t, transcribe } = make();
    expect(await t(note("ok.caf"))).toBe("Hey Airlock, send 0.01 to weth.demo");
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0][1]).toEqual({ mimeType: "audio/wav" });
    expect(transcribe.mock.calls[0][0].byteLength).toBeGreaterThan(44);
  });

  it("skips a file outside the attachments folder without touching it", async () => {
    const { t, transcribe } = make({ exec: wavWriter(3) });
    expect(await t("/etc/passwd")).toBeNull();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("skips a missing, empty or oversized file", async () => {
    const { t, transcribe } = make();
    expect(await t(join(root, "ab/cd/missing.caf"))).toBeNull();
    expect(await t(note("empty.caf", 0))).toBeNull();
    expect(await t(note("big.caf", MAX_FILE_BYTES + 1))).toBeNull();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("never uploads a note longer than the limit", async () => {
    const { t, transcribe } = make({ exec: wavWriter(MAX_SECONDS + 5) });
    expect(await t(note("long.caf"))).toBeNull();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns null, never throws, when conversion, transcription or the text fails", async () => {
    const failExec = vi.fn((_f: string, _a: string[], cb: Cb) => cb(new Error("no"), "", ""));
    expect(await make({ exec: failExec }).t(note("a.caf"))).toBeNull();
    expect(await make({ transcribe: async () => { throw new Error("HTTP 401"); } }).t(note("b.caf"))).toBeNull();
    expect(await make({ transcribe: async () => "   " }).t(note("c.caf"))).toBeNull();
  });

  it("logs no transcript and no path", async () => {
    const { t, logs } = make({ transcribe: async () => { throw new Error("boom"); } });
    await t(note("d.caf"));
    await t("/etc/passwd");
    const all = logs.join("\n");
    expect(all).not.toContain("airlock-att");
    expect(all).not.toContain("passwd");
    expect(logs.length).toBe(2);
  });
});
