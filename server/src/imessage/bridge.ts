import { isAllowed, maskHandle, type Allowlist } from "./text.js";

export type InboundMessage = { rowid: number; handle: string; text: string };

// Everything the bridge touches is passed in, so tests need no Messages database,
// no AppleScript and no server.
export type MessageSource = {
  maxRowId(): number;
  since(rowid: number): InboundMessage[];
};
export type ReplySender = (handle: string, text: string) => Promise<void>;
export type CursorStore = { load(): number | null; save(rowid: number): void };
// Sends one text to the Airlock server and returns its reply.
export type AirlockApi = (sessionId: string, text: string) => Promise<string>;

export type BridgeDeps = {
  source: MessageSource;
  send: ReplySender;
  api: AirlockApi;
  cursor: CursorStore;
  allowlist: Allowlist;
  now?: () => number;
  log?: (line: string) => void;
  maxPerMinute?: number;
};

const UNAVAILABLE = "Airlock is not available right now. Nothing was sent. Try again in a moment.";

export function createBridge(deps: BridgeDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const maxPerMinute = deps.maxPerMinute ?? 8;
  const recent = new Map<string, number[]>(); // handle -> timestamps of handled messages
  const ownReplies: string[] = []; // our last replies, to ignore a bot that echoes them back

  const rateLimited = (handle: string): boolean => {
    const t = now();
    const stamps = (recent.get(handle) ?? []).filter((x) => t - x < 60_000);
    if (stamps.length >= maxPerMinute) {
      recent.set(handle, stamps);
      return true;
    }
    stamps.push(t);
    recent.set(handle, stamps);
    return false;
  };

  // One pass: handle every new inbound message, oldest first. Returns how many got a reply.
  async function poll(): Promise<number> {
    let cursor = deps.cursor.load();
    if (cursor === null) {
      // First run: start from now. Old conversations are never replayed.
      cursor = deps.source.maxRowId();
      deps.cursor.save(cursor);
      log(`first run: starting after message ${cursor}`);
      return 0;
    }

    let replied = 0;
    for (const msg of deps.source.since(cursor)) {
      // Advance the cursor first, so a crash mid-message can never replay it.
      cursor = msg.rowid;
      deps.cursor.save(cursor);

      if (!msg.text) continue;
      if (!isAllowed(deps.allowlist, msg.handle)) {
        log(`ignored a message from a sender not on the allowlist (${maskHandle(msg.handle)})`);
        continue;
      }
      if (ownReplies.includes(msg.text)) continue;
      if (rateLimited(msg.handle)) {
        log(`rate limited ${maskHandle(msg.handle)}`);
        continue;
      }

      let reply: string;
      try {
        reply = await deps.api(`imessage:${msg.handle}`, msg.text);
      } catch {
        reply = UNAVAILABLE;
      }
      try {
        await deps.send(msg.handle, reply);
        ownReplies.push(reply);
        if (ownReplies.length > 20) ownReplies.shift();
        replied++;
        log(`replied to ${maskHandle(msg.handle)} (${reply.length} characters)`);
      } catch {
        log(`could not send a reply to ${maskHandle(msg.handle)}`);
      }
    }
    return replied;
  }

  return { poll };
}
