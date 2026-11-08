import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AirlockApi, AirlockReply, CursorStore, InboundMessage, MessageSource, ReplySender } from "./bridge.js";
import type { DeliveryResult } from "./audio.js";
import { messageText } from "./text.js";

// --- reads inbound texts from the Messages database, read-only ---------------------------

type Row = {
  ROWID: number;
  text: string | null;
  attributedBody: Uint8Array | null;
  handle: string | null;
  audioFile: string | null;
};

// Only incoming, one-to-one, non-reaction messages. Group chats (cache_roomnames set) and
// tapbacks (associated_message_type not 0) are skipped.
const SINCE_SQL = `
  SELECT m.ROWID AS ROWID, m.text AS text, m.attributedBody AS attributedBody, h.id AS handle,
    (SELECT a.filename FROM message_attachment_join j JOIN attachment a ON a.ROWID = j.attachment_id
      WHERE j.message_id = m.ROWID AND (a.mime_type LIKE 'audio/%' OR a.uti = 'com.apple.coreaudio-format')
      ORDER BY a.ROWID LIMIT 1) AS audioFile
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
          ...(r.audioFile ? { audioPath: r.audioFile } : {}),
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

// Several ways to attach a file through the Messages app. Which one works depends on the macOS
// version, and a send that does nothing raises no error, so the replier tries them in turn and
// checks the Messages database. As with text, the path and the handle are arguments, never part
// of the script.
export const SEND_FILE_SCRIPTS: ReadonlyArray<{ name: string; script: string }> = [
  {
    name: "buddy, as alias",
    script: `on run {thePath, theHandle}
  tell application "Messages"
    set svc to 1st service whose service type = iMessage
    set theBuddy to buddy theHandle of svc
    send ((POSIX file thePath) as alias) to theBuddy
  end tell
end run`,
  },
  {
    name: "existing chat, any service",
    script: `on run {thePath, theHandle}
  tell application "Messages"
    send ((POSIX file thePath) as alias) to chat id ("any;-;" & theHandle)
  end tell
end run`,
  },
  {
    name: "existing chat, iMessage",
    script: `on run {thePath, theHandle}
  tell application "Messages"
    send ((POSIX file thePath) as alias) to chat id ("iMessage;-;" & theHandle)
  end tell
end run`,
  },
  {
    name: "buddy, plain file",
    script: `on run {thePath, theHandle}
  tell application "Messages"
    set svc to 1st service whose service type = iMessage
    send (POSIX file thePath) to buddy theHandle of svc
  end tell
end run`,
  },
];
export const SEND_FILE_SCRIPT = SEND_FILE_SCRIPTS[0].script;

type ExecFile = (
  file: string,
  args: string[],
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => unknown;

export function createOsascriptFileSender(
  exec: ExecFile = execFile as unknown as ExecFile,
  retries = 1,
  waitMs = 1_000,
): (handle: string, path: string, strategy?: number) => Promise<void> {
  const once = (handle: string, path: string, strategy: number) =>
    new Promise<void>((resolve, reject) => {
      const script = SEND_FILE_SCRIPTS[strategy]?.script ?? SEND_FILE_SCRIPT;
      exec("/usr/bin/osascript", ["-e", script, path, handle], (err) => (err ? reject(err) : resolve()));
    });
  return async (handle, path, strategy = 0) => {
    let last: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await once(handle, path, strategy);
      } catch (err) {
        last = err;
        if (i < retries) await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    throw last;
  };
}

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

export function createHttpApi(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 45_000, bridgeToken?: string): AirlockApi {
  return async (sessionId, text, channel = "imessage") => {
    const res = await fetchImpl(`${baseUrl}/api/message`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(bridgeToken ? { "x-airlock-bridge": bridgeToken } : {}) },
      body: JSON.stringify({ sessionId, channel, text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`airlock server answered ${res.status}`);
    const body = (await res.json()) as { reply?: unknown; needsConfirm?: unknown };
    if (typeof body.reply !== "string" || body.reply === "") throw new Error("empty reply");
    return { reply: body.reply, needsConfirm: body.needsConfirm === true } satisfies AirlockReply;
  };
}

// --- checks whether a file we sent really went out -------------------------------------

// The newest message when we start sending, so only messages made after it can count.
const MAX_ROWID_SQL = "SELECT COALESCE(MAX(ROWID), 0) AS m FROM message";

// Any outgoing audio attachment made after the mark, found by our file name or by being audio.
// This does not depend on how Messages renames a sent file.
const DELIVERY_SQL = `
  SELECT m.is_sent AS is_sent, m.error AS error
  FROM message m
  JOIN message_attachment_join j ON j.message_id = m.ROWID
  JOIN attachment a ON a.ROWID = j.attachment_id
  WHERE m.is_from_me = 1 AND m.ROWID > ?
    AND (a.transfer_name = ? OR a.filename LIKE ? OR a.mime_type LIKE 'audio/%')
  ORDER BY m.ROWID DESC
  LIMIT 1`;

export type DeliveryChecker = {
  mark(): number;
  verify(fileName: string, since: number): Promise<DeliveryResult>;
};

export async function openDeliveryChecker(
  dbPath: string,
  opts: { attempts?: number; waitMs?: number } = {},
): Promise<DeliveryChecker> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const maxStmt = db.prepare(MAX_ROWID_SQL);
  const stmt = db.prepare(DELIVERY_SQL);
  const attempts = opts.attempts ?? 4;
  const waitMs = opts.waitMs ?? 1_000;
  return {
    mark: () => Number((maxStmt.get() as { m: number }).m),
    async verify(fileName, since) {
      for (let i = 0; i < attempts; i++) {
        try {
          const row = stmt.get(since, fileName, `%${fileName}`) as { is_sent: number; error: number } | undefined;
          if (row) {
            if (Number(row.error) !== 0) return { status: "error", code: Number(row.error) };
            if (Number(row.is_sent) === 1) return { status: "sent" };
          }
        } catch {
          return { status: "unknown" };
        }
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, waitMs));
      }
      return { status: "unknown" };
    },
  };
}
