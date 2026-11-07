import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCommand } from "./parse.js";

// Small talk: "hi", "how are you", "what does it do", "thanks", "bye".
// The replies are written in advance (smalltalk.json), so they cost no model tokens and no
// waiting, and each one is polite and invites the person to try a transfer. This runs BEFORE
// the model is asked anything, and it never touches a real command: yes, no and send requests
// go to the normal parser, and anything with an amount or an address is left alone.

const FILE = fileURLToPath(new URL("./smalltalk.json", import.meta.url));

/** A reply with this value means "use the standard help text for the channel" (kept in api/message.ts). */
export const HELP_REPLY = "@help";

export type SmallTalkIntent = {
  id: string;
  match: "exact" | "contains";
  triggers: string[];
  replies: string[];
  repliesPending?: string[]; // used instead of `replies` when a transfer is waiting for YES or NO
};
export type SmallTalkData = { pendingNote?: string; intents: SmallTalkIntent[] };

export function loadSmallTalk(file: string = FILE): SmallTalkData {
  if (!existsSync(file)) return { intents: [] };
  return JSON.parse(readFileSync(file, "utf8")) as SmallTalkData;
}

// "Hey Airlock, how are you?" -> "how are you"
const WAKE_PREFIX = /^(?:(?:hey|hi|hello|ok|okay|yo)\s+)?(?:air\s?lock)\b\s*/;
const ADDRESSEE_SUFFIX = /\s+(?:airlock|air lock|there|bot|buddy|friend|mate|man|dude)$/;

export function normalizeTalk(text: string): string {
  let t = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  // "hi airlock" is a greeting. A bare "hey airlock" or "airlock" is just the name (standard help text).
  if (/^(?:hi|hello) air ?lock$/.test(t)) return "hi";
  t = t.replace(WAKE_PREFIX, "").trim();
  return t;
}

/** The same text without a trailing name ("thanks airlock" -> "thanks"), used for whole-message matches. */
const withoutAddressee = (n: string) => (/^(?:hi|hello|hey) there$/.test(n) ? n : n.replace(ADDRESSEE_SUFFIX, "").trim());

export type SmallTalk = (text: string, example: string, hasPending?: boolean) => string | null;

/** `pick(count, id)` chooses which variant to use; the default rotates, so the same intent varies. */
export function createSmallTalk(
  data: SmallTalkData = loadSmallTalk(),
  pick: (count: number, id: string) => number = (() => {
    const used = new Map<string, number>();
    return (count: number, id: string) => {
      const n = used.get(id) ?? 0;
      used.set(id, n + 1);
      return n % count;
    };
  })(),
): SmallTalk {
  return (text, example, hasPending = false) => {
    // Anything that carries an amount or an address is a request, not small talk.
    if (/\d|0x|\.eth\b|\.demo\b/i.test(text)) return null;
    // Real commands (yes, no, send ...) belong to the parser.
    if (parseCommand(text).kind !== "help") return null;

    const n = normalizeTalk(text);
    const bare = withoutAddressee(n);
    const padded = ` ${n} `;
    for (const intent of data.intents) {
      const hit =
        intent.match === "exact"
          ? intent.triggers.includes(n) || intent.triggers.includes(bare)
          : intent.triggers.some((t) => padded.includes(` ${t} `));
      if (!hit) continue;
      const list = hasPending && intent.repliesPending?.length ? intent.repliesPending : intent.replies;
      if (list.length === 0) return null;
      let reply = list[pick(list.length, intent.id)].replaceAll("{try}", example);
      if (reply === HELP_REPLY) return reply;
      // While a transfer waits for YES or NO, remind the person (unless the reply already says so).
      if (hasPending && !intent.repliesPending?.length && data.pendingNote) reply += data.pendingNote;
      return reply;
    }
    return null; // not small talk: let the model (or the help text) handle it
  };
}

export const smallTalkReply: SmallTalk = createSmallTalk();
