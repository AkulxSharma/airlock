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
export function messageText(text: string | null, attributedBody: Uint8Array | null): string {
  if (text && text.trim() !== "") return text.trim();
  return (extractText(attributedBody) ?? "").trim();
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
