import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AirlockApi, CursorStore, InboundMessage, MessageSource, ReplySender } from "./bridge.js";
import { messageText } from "./text.js";

// --- reads inbound texts from the Messages database, read-only ---------------------------

type Row = { ROWID: number; text: string | null; attributedBody: Uint8Array | null; handle: string | null };

// Only incoming, one-to-one, non-reaction messages. Group chats (cache_roomnames set) and
// tapbacks (associated_message_type not 0) are skipped.
const SINCE_SQL = `
  SELECT m.ROWID AS ROWID, m.text AS text, m.attributedBody AS attributedBody, h.id AS handle
  FROM message m
  LEFT JOIN handle h ON m.handle_id = h.ROWID
  WHERE m.ROWID > ?
    AND m.is_from_me = 0
    AND m.cache_roomnames IS NULL
    AND COALESCE(m.associated_message_type, 0) = 0
  ORDER BY m.ROWID ASC
  LIMIT 100`;

export async function openMessagesDb(dbPath: string): Promise<MessageSource> {
  // Loaded here, not at the top, so tests and machines without the module are unaffected.
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const maxStmt = db.prepare("SELECT COALESCE(MAX(ROWID), 0) AS m FROM message");
  const sinceStmt = db.prepare(SINCE_SQL);
  return {
    maxRowId: () => Number((maxStmt.get() as { m: number }).m),
    since: (rowid) =>
      (sinceStmt.all(rowid) as Row[]).map(
        (r): InboundMessage => ({
          rowid: Number(r.ROWID),
          handle: r.handle ?? "",
          text: messageText(r.text, r.attributedBody),
        }),
      ),
  };
}

// --- sends a reply through the Messages app ----------------------------------------------

// The text and the handle are passed as arguments, never spliced into the script, so a
// message can not inject AppleScript. If sending to the buddy fails, fall back to the chat id.
export const SEND_SCRIPT = `on run {theText, theHandle}
  tell application "Messages"
    try
      set svc to 1st service whose service type = iMessage
      send theText to buddy theHandle of svc
    on error
      send theText to chat id ("iMessage;-;" & theHandle)
    end try
  end tell
end run`;

type ExecFile = (
  file: string,
  args: string[],
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => unknown;

export function createOsascriptSender(
  exec: ExecFile = execFile as unknown as ExecFile,
  retries = 2,
  waitMs = 1_000,
): ReplySender {
  const once = (handle: string, text: string) =>
    new Promise<void>((resolve, reject) => {
      exec("/usr/bin/osascript", ["-e", SEND_SCRIPT, text, handle], (err) => (err ? reject(err) : resolve()));
    });
  return async (handle, text) => {
    let last: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await once(handle, text);
      } catch (err) {
        last = err;
        if (i < retries) await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    throw last;
  };
}

// --- remembers how far we have read, so a restart never replays old messages -------------

export function createFileCursor(path: string): CursorStore {
  return {
    load() {
      try {
        const n = Number(JSON.parse(readFileSync(path, "utf8")).rowid);
        return Number.isInteger(n) && n >= 0 ? n : null;
      } catch {
        return null;
      }
    },
    save(rowid) {
      if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ rowid }) + "\n");
    },
  };
}

// --- talks to the local Airlock server ---------------------------------------------------

export function createHttpApi(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 45_000): AirlockApi {
  return async (sessionId, text) => {
    const res = await fetchImpl(`${baseUrl}/api/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, channel: "imessage", text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`airlock server answered ${res.status}`);
    const body = (await res.json()) as { reply?: unknown };
    if (typeof body.reply !== "string" || body.reply === "") throw new Error("empty reply");
    return body.reply;
  };
}
