// Run with: npm run imessage   (from server/, with the Airlock server already running)
// Flags: --dry-run  read and answer but do not send anything (prints what it would send).
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createVoiceReplier, createVoiceTranscriber, toSpoken } from "./audio.js";
import { createFileCursor, createHttpApi, createOsascriptFileSender, createOsascriptSender, openDeliveryChecker, openMessagesDb } from "./adapters.js";
import { createBridge } from "./bridge.js";
import { parseAllowlist } from "./text.js";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const env = process.env;
const dryRun = process.argv.includes("--dry-run");
const allowlist = parseAllowlist(env.IMESSAGE_ALLOWLIST);

if (!allowlist.anyone && allowlist.handles.size === 0) {
  console.error(
    "IMESSAGE_ALLOWLIST is empty, so nobody may use the line. Set it in airlock/.env to a comma-separated list of\n" +
      "phone numbers and emails (for example +17165550100,me@example.com). Use * only if you really want anyone to be able to text it.",
  );
  process.exit(1);
}
if (allowlist.anyone) {
  console.warn("IMESSAGE_ALLOWLIST=*: anyone may text this line, but it only answers messages that say \"Airlock\" or \"Hey Airlock\" (plus a YES or NO to a confirmation it asked for).");
}

const dbPath = env.IMESSAGE_DB_PATH || `${homedir()}/Library/Messages/chat.db`;
let source;
try {
  source = await openMessagesDb(dbPath);
} catch (err) {
  console.error(
    `Cannot read ${dbPath}: ${err instanceof Error ? err.message : err}\n` +
      "macOS blocks this until you allow it: System Settings > Privacy & Security > Full Disk Access, turn on the app that\n" +
      "runs this command (Terminal, iTerm, or your editor), then quit and reopen that app and run this again.",
  );
  process.exit(1);
}

const api = createHttpApi(`http://127.0.0.1:${Number(env.PORT) || 8787}`);
const realSend = createOsascriptSender();
const send = dryRun
  ? async (handle: string, text: string) => console.log(`[dry run] would reply (${text.length} characters):\n${text}\n`)
  : realSend;

// Voice notes: on when an ElevenLabs key is set, unless IMESSAGE_VOICE=off.
const voiceOn = env.IMESSAGE_VOICE !== "off" && Boolean(env.ELEVENLABS_API_KEY?.trim());
console.log(
  voiceOn
    ? "Voice notes: on (short notes from allowed senders are transcribed by ElevenLabs, only to check for the wake word)"
    : "Voice notes: off (set ELEVENLABS_API_KEY in airlock/.env to turn on)",
);

// Spoken replies: only to people who sent a voice note, after the text reply. A dry run prints
// what it would say and spends no speech credits.
const repliesOn = voiceOn && env.IMESSAGE_VOICE_REPLIES !== "off";
console.log(repliesOn ? "Spoken replies: on (to voice notes only, after the text reply)" : "Spoken replies: off");
const logLine = (line: string) => console.log(`${new Date().toISOString()} ${line}`);
const voiceReply = !repliesOn
  ? undefined
  : dryRun
    ? async (_handle: string, text: string) => console.log(`[dry run] would also send a spoken reply: ${toSpoken(text)}`)
    : createVoiceReplier({ sendFile: createOsascriptFileSender(), verify: await openDeliveryChecker(dbPath), log: logLine });

if (env.IMESSAGE_DEBUG_TRANSCRIPTS === "1") {
  console.warn("DEBUG: transcripts of ignored voice notes will be printed here. Turn this off when you are done.");
}

const bridge = createBridge({
  source,
  send,
  api,
  cursor: createFileCursor(fileURLToPath(new URL("../../.data/imessage-cursor.json", import.meta.url))),
  allowlist,
  log: (line) => console.log(`${new Date().toISOString()} ${line}`),
  maxPerMinute: Number(env.IMESSAGE_MAX_PER_MINUTE) || 8,
  maxGlobalPerMinute: Number(env.IMESSAGE_MAX_GLOBAL_PER_MINUTE) || 20,
  maxVoicePerMinute: Number(env.IMESSAGE_MAX_VOICE_PER_MINUTE) || 6,
  voiceReply,
  debugTranscripts: env.IMESSAGE_DEBUG_TRANSCRIPTS === "1",
  maxSpokenRepliesPerMinute: Number(env.IMESSAGE_MAX_VOICE_PER_MINUTE) || 6,
  transcribe: voiceOn ? createVoiceTranscriber({ languageCode: env.IMESSAGE_VOICE_LANG || "en", log: (line) => console.log(`${new Date().toISOString()} ${line}`) }) : undefined,
});

console.log(`Airlock iMessage bridge running${dryRun ? " (dry run)" : ""}. Press Ctrl+C to stop.`);
const intervalMs = Number(env.IMESSAGE_POLL_MS) || 1_500;
let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await bridge.poll();
  } catch (err) {
    console.error("poll failed:", err instanceof Error ? err.message : err);
  } finally {
    busy = false;
  }
}, intervalMs);
