import { parseCommand } from "../agent/parse.js";
import { isAllowed, maskHandle, matchWake, matchWakeSpoken, type Allowlist } from "./text.js";

export type InboundMessage = { rowid: number; handle: string; text: string; audioPath?: string };

// Everything the bridge touches is passed in, so tests need no Messages database,
// no AppleScript and no server.
export type MessageSource = {
  maxRowId(): number;
  since(rowid: number): InboundMessage[];
};
export type ReplySender = (handle: string, text: string) => Promise<void>;
export type CursorStore = { load(): number | null; save(rowid: number): void };
// Sends one text to the Airlock server and returns its reply, plus whether it is now waiting
// for the sender to confirm a transfer.
export type AirlockReply = { reply: string; needsConfirm: boolean };
export type AirlockApi = (sessionId: string, text: string, channel?: "imessage" | "voice") => Promise<AirlockReply>;
// Turns a voice note file into text, or null if it can not be used. Never throws.
export type VoiceTranscriber = (audioPath: string) => Promise<string | null>;

export type BridgeDeps = {
  source: MessageSource;
  send: ReplySender;
  api: AirlockApi;
  cursor: CursorStore;
  allowlist: Allowlist;
  now?: () => number;
  log?: (line: string) => void;
  maxPerMinute?: number;
  maxGlobalPerMinute?: number;
  confirmWindowMs?: number;
  transcribe?: VoiceTranscriber;
  // Debug only, off by default: also print the transcript of a voice note that was ignored for
  // not saying the wake word, so a misheard name can be diagnosed. Prints the words themselves.
  debugTranscripts?: boolean;
  maxVoicePerMinute?: number;
  // Sends a spoken copy of a reply (best effort, never throws). Used only when the sender spoke.
  voiceReply?: (handle: string, text: string) => Promise<void>;
  maxSpokenRepliesPerMinute?: number;
  // A session starts when someone says "Hey Airlock" and stays open until they say "End Airlock" or
  // stay silent this long (default 30 minutes). While it is open, everything that person sends goes
  // to Airlock without repeating the name.
  sessionIdleMs?: number;
};

// "End Airlock", "stop airlock", "bye airlock"... closes the person's session.
const END_SESSION = /^\s*(?:hey\s+)?(?:end|stop|close|quit|exit|goodbye|bye)\s+(?:the\s+)?air[\s-]?l(?:o|a)?c?k\b/i;
export const isEndSession = (text: string): boolean => END_SESSION.test(text);

const SESSION_ENDED = "Airlock session ended. Nothing else you send will be read. Say Hey Airlock to start again.";

const UNAVAILABLE = "Airlock is not available right now. Nothing was sent. Try again in a moment.";

export function createBridge(deps: BridgeDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const maxPerMinute = deps.maxPerMinute ?? 8;
  const maxGlobalPerMinute = deps.maxGlobalPerMinute ?? 20;
  const confirmWindowMs = deps.confirmWindowMs ?? 60_000;
  const awaiting = new Map<string, number>(); // handle -> when their open confirmation expires
  const sessionIdleMs = deps.sessionIdleMs ?? 30 * 60_000;
  const sessions = new Map<string, number>(); // handle -> time of their last message in an open session
  const inSession = (handle: string): boolean => {
    const last = sessions.get(handle);
    if (last === undefined) return false;
    if (now() - last >= sessionIdleMs) {
      sessions.delete(handle);
      log(`session with ${maskHandle(handle)} timed out`);
      return false;
    }
    return true;
  };
  const maxVoicePerMinute = deps.maxVoicePerMinute ?? 6;
  const maxSpoken = deps.maxSpokenRepliesPerMinute ?? 6;
  const spokenStamps: number[] = [];
  const voiceStamps: number[] = [];
  const globalStamps: number[] = [];
  const recent = new Map<string, number[]>(); // handle -> timestamps of handled messages
  const ownReplies: string[] = []; // our last replies, to ignore a bot that echoes them back

  // Anyone may text the line, so one number or the whole line can not be flooded.
  const globalLimited = (): boolean => {
    const t = now();
    while (globalStamps.length > 0 && t - globalStamps[0] >= 60_000) globalStamps.shift();
    if (globalStamps.length >= maxGlobalPerMinute) return true;
    globalStamps.push(t);
    return false;
  };

  // Every voice note we transcribe uses the speech-to-text quota, so cap those across the line.
  const voiceLimited = (): boolean => {
    const t = now();
    while (voiceStamps.length > 0 && t - voiceStamps[0] >= 60_000) voiceStamps.shift();
    if (voiceStamps.length >= maxVoicePerMinute) return true;
    voiceStamps.push(t);
    return false;
  };

  const spokenLimited = (): boolean => {
    const t = now();
    while (spokenStamps.length > 0 && t - spokenStamps[0] >= 60_000) spokenStamps.shift();
    if (spokenStamps.length >= maxSpoken) return true;
    spokenStamps.push(t);
    return false;
  };

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

      if (!msg.text && !msg.audioPath) continue;
      if (!isAllowed(deps.allowlist, msg.handle)) {
        log(`ignored a message from a sender not on the allowlist (${maskHandle(msg.handle)})`);
        continue;
      }

      // A voice note is transcribed first (only for allowed senders, within a quota). The
      // transcript is then treated exactly like typed text: it still needs the wake word,
      // and the server applies the voice rules (an address spoken aloud is refused).
      let spoken = false;
      let said = msg.text;
      if (!said && msg.audioPath) {
        if (!deps.transcribe) {
          log(`voice note from ${maskHandle(msg.handle)} ignored: voice notes are off`);
          continue;
        }
        if (voiceLimited()) {
          log(`voice note skipped for ${maskHandle(msg.handle)}: voice quota reached`);
          continue;
        }
        log(`voice note from ${maskHandle(msg.handle)}: found, transcribing`);
        said = (await deps.transcribe(msg.audioPath)) ?? "";
        spoken = true;
        if (!said) continue; // the transcriber has already logged why
        // Only the word count is logged, never the words.
        log(`voice note from ${maskHandle(msg.handle)}: transcribed (${said.split(/\s+/).filter(Boolean).length} words)`);
      }
      if (ownReplies.includes(said)) continue;

      // A session opens with the wake word ("Hey Airlock") and stays open until "End Airlock" or an idle
      // timeout: in between, everything this sender writes goes to Airlock without the name. With no open
      // session, the wake word is required, except for a bare YES or NO to a confirmation we asked.
      // Everything else is somebody's private chat and is dropped without a trace.
      const wake = spoken ? matchWakeSpoken(said) : matchWake(said);
      const active = inSession(msg.handle);

      if (isEndSession(said) || (wake !== null && isEndSession(wake))) {
        if (!active) continue; // "End Airlock" with nothing open is not a command for anyone
        sessions.delete(msg.handle);
        const hadOpen = awaiting.has(msg.handle);
        awaiting.delete(msg.handle);
        if (hadOpen) {
          try {
            await deps.api(`imessage:${msg.handle}`, "no", "imessage"); // cancel an open confirmation
          } catch {
            /* the server expires it on its own */
          }
        }
        try {
          await deps.send(msg.handle, SESSION_ENDED);
          ownReplies.push(SESSION_ENDED);
          if (ownReplies.length > 20) ownReplies.shift();
          replied++;
          log(`session with ${maskHandle(msg.handle)} ended`);
        } catch {
          log(`could not send a reply to ${maskHandle(msg.handle)}`);
        }
        continue;
      }

      let text: string;
      if (wake !== null) {
        text = wake === "" ? "help" : wake;
        if (!active) log(`session with ${maskHandle(msg.handle)} started`);
        sessions.set(msg.handle, now());
      } else if (active) {
        text = said;
        sessions.set(msg.handle, now());
      } else {
        const expires = awaiting.get(msg.handle);
        const kind = parseCommand(said).kind;
        if (expires !== undefined && now() < expires && (kind === "yes" || kind === "no")) text = said;
        else {
          if (spoken) {
            log(`voice note from ${maskHandle(msg.handle)} did not say the wake word, ignored`);
            if (deps.debugTranscripts) log(`[debug] transcript was: ${JSON.stringify(said)}`);
          }
          continue;
        }
      }

      if (rateLimited(msg.handle) || globalLimited()) {
        log(`rate limited ${maskHandle(msg.handle)}`);
        continue;
      }

      let reply: string;
      try {
        const r = await deps.api(`imessage:${msg.handle}`, text, spoken ? "voice" : "imessage");
        reply = r.reply;
        if (r.needsConfirm) awaiting.set(msg.handle, now() + confirmWindowMs);
        else awaiting.delete(msg.handle);
      } catch {
        reply = UNAVAILABLE;
        awaiting.delete(msg.handle);
      }
      try {
        await deps.send(msg.handle, reply);
        ownReplies.push(reply);
        if (ownReplies.length > 20) ownReplies.shift();
        replied++;
        log(`replied to ${maskHandle(msg.handle)} (${reply.length} characters)`);
        // Someone who spoke gets the answer spoken back as well, after the text is safely sent.
        if (spoken && deps.voiceReply && !spokenLimited()) {
          try {
            await deps.voiceReply(msg.handle, reply);
          } catch {
            log("spoken reply failed");
          }
        }
      } catch {
        log(`could not send a reply to ${maskHandle(msg.handle)}`);
      }
    }
    return replied;
  }

  return { poll };
}
