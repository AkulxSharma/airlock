import { extractWakeCommand } from "../../../voice/wake.js";

// Pure helpers for the iMessage bridge: reading message text out of the Messages database
// and deciding who is allowed to use the line.

// Newer macOS versions often leave message.text empty and keep the text inside the
// attributedBody blob (an Apple "typedstream"). The text sits after the class name
// "NSString": a few header bytes, a '+' (0x2b), a length, then the UTF-8 bytes.
// A length under 0x80 is one byte; 0x81 is followed by a 2-byte little-endian length and
// 0x82 by a 4-byte one.
export function extractText(blob: Uint8Array | null | undefined): string | null {
  if (!blob || blob.length === 0) return null;
  const buf = Buffer.from(blob);
  const marker = buf.indexOf("NSString");
  if (marker < 0) return null;

  let p = marker + "NSString".length;
  const limit = Math.min(buf.length, p + 8);
  while (p < limit && buf[p] !== 0x2b) p++;
  if (p >= limit) return null;
  p++;

  let len = buf[p++];
  if (len === undefined) return null;
  if (len === 0x81) {
    if (p + 2 > buf.length) return null;
    len = buf.readUInt16LE(p);
    p += 2;
  } else if (len === 0x82) {
    if (p + 4 > buf.length) return null;
    len = buf.readUInt32LE(p);
    p += 4;
  }
  if (len === 0 || p + len > buf.length) return null;
  return buf.subarray(p, p + len).toString("utf8");
}

// The text of a message row: the plain column when present, else the decoded blob.
// An attachment shows up as the object-replacement character U+FFFC, which is not text.
const clean = (s: string) => s.replace(/\uFFFC/g, "").trim();

export function messageText(text: string | null, attributedBody: Uint8Array | null): string {
  const plain = text ? clean(text) : "";
  if (plain !== "") return plain;
  return clean(extractText(attributedBody) ?? "");
}

// Phone numbers compare by their digits (last 10 when long enough, so +1 prefixes match);
// email handles compare in lowercase.
export function normalizeHandle(raw: string): string {
  const s = raw.trim();
  if (s.includes("@")) return s.toLowerCase();
  const digits = s.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export type Allowlist = { anyone: boolean; handles: Set<string> };

// "*" means anyone may use the line. It must be written explicitly; an empty list allows nobody.
export function parseAllowlist(raw: string | undefined): Allowlist {
  const parts = (raw ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return {
    anyone: parts.includes("*"),
    handles: new Set(parts.filter((p) => p !== "*").map(normalizeHandle).filter(Boolean)),
  };
}

export function isAllowed(list: Allowlist, handle: string): boolean {
  if (list.anyone) return true;
  const h = normalizeHandle(handle);
  return h !== "" && list.handles.has(h);
}

// Never log a full phone number or email.
export function maskHandle(handle: string): string {
  if (handle.includes("@")) {
    const [user, domain] = handle.split("@");
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return handle.length > 4 ? `***${handle.slice(-4)}` : "***";
}

// The wake word ("Airlock" or "Hey Airlock", any case) is required to START anything. Returns what
// was said after it ("" if only the wake word was said), or null if the message is not for us.
// A message that only mentions a domain like airlock.eth does not count as saying the name.
export function matchWake(text: string): string | null {
  const { woke, command } = extractWakeCommand(text);
  if (!woke) return null;
  const domainOnly =
    /\bair[\s-]?lock\.[a-z0-9]/i.test(text) && !/\bair[\s-]?lock(?![.\w-])/i.test(text);
  return domainOnly ? null : command;
}

// Speech-to-text sometimes spells the name oddly ("Erlak", "Air Lock", "Aerlok"). For a VOICE
// note only, and only right after a greeting (hey, hi, hello, ok, okay, yo), one or two words
// that sound like the name count as the name. "Sound like" means the same consonants in the
// same order, r-l-k, so "Eric" or "hello world" do not match. Typed messages never use this.
const GREETING = /^\s*(?:hey|hi|hello|ok|okay|yo)\b[\s,.!-]*/i;
const skeleton = (s: string) =>
  s.toLowerCase().replace(/[^a-z]/g, "").replace(/[aeiouyhw]/g, "").replace(/c/g, "k").replace(/(.)\1+/g, "$1");

export function matchWakeSpoken(text: string): string | null {
  const strict = matchWake(text);
  if (strict !== null) return strict;
  const g = GREETING.exec(text);
  if (!g) return null;
  const rest = text.slice(g[0].length);
  const m = /^([A-Za-z']+)(?:([\s-]+)([A-Za-z']+))?/.exec(rest);
  if (!m) return null;
  const ends: number[] = [];
  if (skeleton(m[1]) === "rlk") ends.push(m[1].length);
  if (m[3] && skeleton(m[1] + m[3]) === "rlk") ends.push(m[1].length + m[2].length + m[3].length);
  if (ends.length === 0) return null;
  return rest.slice(ends[ends.length - 1]).replace(/^[\s,.:;!?-]+/, "").trim();
}
