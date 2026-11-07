// Run with: npm run imessage   (from server/, with the Airlock server already running)
// Flags: --dry-run  read and answer but do not send anything (prints what it would send).
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createFileCursor, createHttpApi, createOsascriptSender, openMessagesDb } from "./adapters.js";
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
  console.warn("WARNING: IMESSAGE_ALLOWLIST=* lets anyone who texts this line request a testnet transfer (capped).");
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

const bridge = createBridge({
  source,
  send,
  api,
  cursor: createFileCursor(fileURLToPath(new URL("../../.data/imessage-cursor.json", import.meta.url))),
  allowlist,
  log: (line) => console.log(`${new Date().toISOString()} ${line}`),
  maxPerMinute: Number(env.IMESSAGE_MAX_PER_MINUTE) || 8,
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
