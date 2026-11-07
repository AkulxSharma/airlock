import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { speak as elevenLabsSpeak, MAX_SPEAK_CHARS } from "../../../voice/speak.js";
import { toSpeakable } from "../../../voice/speakable.js";
import { transcribe as elevenLabsTranscribe } from "../../../voice/transcribe.js";

// iMessage voice notes arrive as "Audio Message.caf" files (Opus inside a CAF container) in
// ~/Library/Messages/Attachments. We convert one to a small 16 kHz WAV with macOS's own
// afconvert (ffmpeg as a fallback), send it to ElevenLabs speech-to-text, and hand the
// transcript to the bridge. Nothing is kept: the temp files are always deleted, and the
// transcript is never logged.

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // a spoken command is a few tens of KB
export const MAX_SECONDS = 20; // longer notes are not commands, and are never uploaded
const WAV_HEADER_BYTES = 44;
const WAV_BYTES_PER_SECOND = 16_000 * 2; // 16 kHz, mono, 16-bit

type Exec = (
  file: string,
  args: string[],
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => unknown;

export type VoiceDeps = {
  exec?: Exec;
  transcribe?: (audio: Uint8Array, opts: { mimeType: string }) => Promise<string>;
  attachmentsRoot?: string;
  maxSeconds?: number;
  log?: (line: string) => void;
};

const run = (exec: Exec, file: string, args: string[]) =>
  new Promise<void>((res, rej) => exec(file, args, (err) => (err ? rej(err) : res())));

// The path comes from the Messages database. Only files under the Attachments folder are
// ever opened, so a crafted row can not point this at some other file.
export function attachmentPath(raw: string, root: string = join(homedir(), "Library/Messages/Attachments")): string | null {
  const expanded = raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
  const abs = resolve(expanded);
  const base = resolve(root) + sep;
  return abs.startsWith(base) ? abs : null;
}

// Converts any audio file macOS can read to mono 16 kHz WAV bytes, or throws.
export async function convertToWav(input: string, exec: Exec = execFile as unknown as Exec): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "airlock-voice-"));
  const out = join(dir, "voice.wav");
  try {
    try {
      await run(exec, "/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", input, out]);
    } catch {
      await run(exec, "ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", out]);
    }
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function wavSeconds(wav: Uint8Array): number {
  return Math.max(0, wav.byteLength - WAV_HEADER_BYTES) / WAV_BYTES_PER_SECOND;
}

// Returns the transcript, or null for anything that stops us (not a readable file under
// Attachments, too big, too long, conversion or transcription failed). Never throws.
export function createVoiceTranscriber(deps: VoiceDeps = {}) {
  const log = deps.log ?? (() => {});
  const maxSeconds = deps.maxSeconds ?? MAX_SECONDS;
  const send = deps.transcribe ?? ((audio, opts) => elevenLabsTranscribe(audio, opts));

  return async function transcribeFile(rawPath: string): Promise<string | null> {
    try {
      const path = attachmentPath(rawPath, deps.attachmentsRoot);
      if (!path) {
        log("voice note skipped: file is outside the Messages attachments folder");
        return null;
      }
      const info = await stat(path);
      if (!info.isFile() || info.size === 0 || info.size > MAX_FILE_BYTES) {
        log("voice note skipped: file is empty or too large");
        return null;
      }
      const wav = await convertToWav(path, deps.exec);
      if (wavSeconds(wav) > maxSeconds) {
        log(`voice note skipped: longer than ${maxSeconds} seconds`);
        return null;
      }
      const text = (await send(wav, { mimeType: "audio/wav" })).trim();
      return text === "" ? null : text;
    } catch {
      log("voice note skipped: could not convert or transcribe it");
      return null;
    }
  };
}

// --- spoken replies ----------------------------------------------------------------------

// A short spoken version of a text reply: the verdict and the decision, one finding, the amount
// and the question. Never the links, never the whole findings list. Long numbers and addresses
// then go through toSpeakable, which says only a recognisable fragment of an address and
// spells amounts digit by digit. The full text reply always carries the exact values.
export function toSpoken(reply: string): string {
  const out: string[] = [];
  let findings = 0;
  for (const raw of reply.split("\n")) {
    const line = raw.trim();
    if (!line || /https?:\/\//i.test(line)) continue;
    const bullet = /^-\s*\[(?:low|medium|high)\]\s*(.*)$/i.exec(line);
    if (bullet) {
      if (findings++ >= 1) continue;
      out.push(bullet[1].replace(/^Heuristic:\s*/i, ""));
      continue;
    }
    out.push(line);
  }
  const text = toSpeakable(out.join(" ").replace(/\s+/g, " ").trim());
  return text.length > MAX_SPEAK_CHARS ? text.slice(0, MAX_SPEAK_CHARS - 1).trimEnd() + "." : text;
}

export type VoiceReplyDeps = {
  speak?: (text: string) => Promise<Uint8Array>;
  sendFile: (handle: string, path: string) => Promise<void>;
  dir?: string;
  log?: (line: string) => void;
  schedule?: (fn: () => void, ms: number) => void;
  cleanupAfterMs?: number;
};

const DEFAULT_REPLY_DIR = () => join(homedir(), "Library", "Caches", "airlock-imessage");

// Speaks a reply with ElevenLabs and sends it as an audio message. Best effort: the text reply
// has already gone out, so every failure here is logged and swallowed.
export function createVoiceReplier(deps: VoiceReplyDeps) {
  const dir = deps.dir ?? DEFAULT_REPLY_DIR();
  const log = deps.log ?? (() => {});
  const speakFn = deps.speak ?? ((t: string) => elevenLabsSpeak(t));
  const schedule =
    deps.schedule ??
    ((fn: () => void, ms: number) => {
      setTimeout(fn, ms).unref();
    });
  const cleanupAfterMs = deps.cleanupAfterMs ?? 120_000;

  // Old files are removed on each use, in case the process stopped before a scheduled delete.
  async function sweep(): Promise<void> {
    try {
      for (const name of await readdir(dir)) {
        if (!/^airlock-.*\.mp3$/.test(name)) continue;
        const f = join(dir, name);
        if (Date.now() - (await stat(f)).mtimeMs > 10 * 60_000) await rm(f, { force: true });
      }
    } catch {
      /* nothing to sweep */
    }
  }

  return async function voiceReply(handle: string, replyText: string): Promise<void> {
    let file: string | null = null;
    try {
      const spoken = toSpoken(replyText);
      if (!spoken) return;
      await mkdir(dir, { recursive: true });
      await sweep();
      const audio = await speakFn(spoken);
      file = join(dir, `airlock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`);
      await writeFile(file, audio, { mode: 0o600 });
      await deps.sendFile(handle, file);
      log("sent a spoken reply");
    } catch {
      log("spoken reply failed; the text reply was already sent");
    } finally {
      // Not deleted at once: Messages may still be reading the file when send returns.
      if (file) {
        const f = file;
        schedule(() => void rm(f, { force: true }), cleanupAfterMs);
      }
    }
  };
}
