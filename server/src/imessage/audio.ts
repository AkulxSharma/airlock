import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
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
  transcribe?: (audio: Uint8Array, opts: { mimeType: string; languageCode?: string }) => Promise<string>;
  languageCode?: string; // default "en": auto-detect misfires on very short clips
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
  const languageCode = deps.languageCode ?? "en";
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
      const text = (await send(wav, { mimeType: "audio/wav", languageCode })).trim();
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
    if (!line || /https?:\/\//i.test(line) || /^Note:/i.test(line) || /^No findings\.?$/i.test(line)) continue;
    const bullet = /^-\s*\[(?:low|medium|high)\]\s*(.*)$/i.exec(line);
    if (bullet) {
      if (findings++ >= 1) continue;
      out.push(bullet[1].replace(/^Heuristic:\s*/i, ""));
      continue;
    }
    out.push(line);
  }
  // The expiry is in the text reply; saying it aloud only makes the voice note longer.
  const joined = out.join(" ").replace(/\s*It expires in \d+ seconds\.?/i, "");
  const text = toSpeakable(joined.replace(/\s+/g, " ").trim());
  return text.length > MAX_SPEAK_CHARS ? text.slice(0, MAX_SPEAK_CHARS - 1).trimEnd() + "." : text;
}

// What the Messages database says about an audio file we sent.
export type DeliveryResult = { status: "sent" } | { status: "error"; code: number } | { status: "unknown" };

export type VoiceReplyDeps = {
  // Asks Messages whether the file really went out. Without it the replier can only say it was handed over.
  verify?: (fileName: string, since: number) => Promise<DeliveryResult>;
  // The newest message number before sending, so verify only looks at messages made after it.
  mark?: () => number;
  // How many different ways there are to attach the file. They are tried in turn until one goes out.
  strategies?: number;
  speak?: (text: string) => Promise<Uint8Array>;
  sendFile: (handle: string, path: string, strategy: number) => Promise<void>;
  dir?: string;
  log?: (line: string) => void;
  schedule?: (fn: () => void, ms: number) => void;
  cleanupAfterMs?: number;
  now?: () => number;
  // "caf" sends the reply in the format a phone's own voice notes use (Opus in a CAF file named
  // "Audio Message.caf"); "mp3" sends the file as ElevenLabs returned it. If converting to caf
  // fails, the mp3 is sent instead.
  format?: "mp3" | "caf";
  convert?: (inputPath: string, outputPath: string) => Promise<void>;
  // After this many failed spoken replies in a row, stop trying for `pauseMs`. Each try spends
  // speech credits and leaves a failed bubble in the conversation on the Mac.
  maxFailures?: number;
  pauseMs?: number;
};

// MP3 to the Opus-in-CAF format iMessage voice notes use, with macOS's own converter.
export function convertToVoiceNote(input: string, output: string, exec: Exec = execFile as unknown as Exec): Promise<void> {
  return run(exec, "/usr/bin/afconvert", ["-f", "caff", "-d", "opus@24000", "-c", "1", input, output]);
}

// Messages could not read the file from ~/Library/Caches (the send was accepted, then nothing arrived).
// ~/Pictures is a place the Messages app can read.
const DEFAULT_REPLY_DIR = () => join(homedir(), "Pictures", "airlock-imessage");

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
  const convertFn = deps.convert ?? ((i: string, o: string) => convertToVoiceNote(i, o));
  let preferred = 0; // the method that last worked
  const now = deps.now ?? Date.now;
  const maxFailures = deps.maxFailures ?? 2;
  const pauseMs = deps.pauseMs ?? 10 * 60_000;
  let failStreak = 0;
  let pausedUntil = 0;
  let hinted = false;

  // Old files are removed on each use, in case the process stopped before a scheduled delete.
  async function sweep(): Promise<void> {
    try {
      for (const name of await readdir(dir)) {
        if (!name.startsWith("airlock-")) continue; // our files, and the folders of voice-note replies
        const f = join(dir, name);
        if (Date.now() - (await stat(f)).mtimeMs > 10 * 60_000) await rm(f, { recursive: true, force: true });
      }
    } catch {
      /* nothing to sweep */
    }
  }

  return async function voiceReply(handle: string, replyText: string): Promise<void> {
    if (now() < pausedUntil) return; // paused after repeated failures; the text reply already went out
    let file: string | null = null;
    const cleanupPaths: string[] = [];
    let delivered = false;
    try {
      const spoken = toSpoken(replyText);
      if (!spoken) return;
      await mkdir(dir, { recursive: true });
      await sweep();
      const audio = await speakFn(spoken);
      const id = `airlock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const mp3 = join(dir, `${id}.mp3`);
      await writeFile(mp3, audio, { mode: 0o600 });
      cleanupPaths.push(mp3);
      file = mp3;
      if ((deps.format ?? "mp3") === "caf") {
        // The format of a phone's own voice notes, in a folder of its own so the file can be named
        // "Audio Message.caf" every time.
        const folder = join(dir, id);
        cleanupPaths.push(folder);
        try {
          await mkdir(folder, { recursive: true });
          const caf = join(folder, "Audio Message.caf");
          await convertFn(mp3, caf);
          file = caf;
        } catch {
          log("could not convert the reply to a voice-note file, sending the mp3 instead");
        }
      }
      const count = Math.max(1, deps.strategies ?? 1);
      let result: DeliveryResult | null = null;
      let handedOver = false;
      for (let i = 0; i < count; i++) {
        const method = (preferred + i) % count;
        const since = deps.mark ? deps.mark() : 0;
        try {
          await deps.sendFile(handle, file, method);
        } catch {
          log(`spoken reply: method ${method + 1} could not be started`);
          continue;
        }
        handedOver = true;
        result = deps.verify ? await deps.verify(basename(file), since) : null;
        if (!deps.verify || result?.status === "sent") {
          preferred = method; // remember what worked
          break;
        }
        if (i < count - 1) log(`spoken reply: method ${method + 1} did not go out, trying another`);
      }
      if (!handedOver) throw new Error("no way of sending the file could be started");
      if (!result) log("sent a spoken reply");
      else if (result.status === "sent") {
        delivered = true;
        log("spoken reply delivered");
      } else if (result.status === "error") {
        log(`spoken reply failed: Messages could not send it (error ${result.code})`);
        if (!hinted) {
          hinted = true;
          log("hint: if a file sent by hand from the Messages app also shows Not Delivered, this Mac's network or iMessage account is blocking attachments (text replies are unaffected). Try another network, such as a phone hotspot.");
        }
      } else log("spoken reply handed to Messages, but delivery could not be confirmed");
      if (!deps.verify) delivered = true; // nothing to check against: treat a successful hand-over as success
    } catch {
      log("spoken reply failed; the text reply was already sent");
    } finally {
      if (delivered) {
        failStreak = 0;
      } else if (++failStreak >= maxFailures) {
        pausedUntil = now() + pauseMs;
        failStreak = 0;
        log(`spoken replies paused for ${Math.round(pauseMs / 60_000)} minutes after repeated failures; text replies are unaffected`);
      }
      // Not deleted at once: Messages may still be reading the file when send returns.
      for (const p of cleanupPaths) schedule(() => void rm(p, { recursive: true, force: true }), cleanupAfterMs);
    }
  };
}
