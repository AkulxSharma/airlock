import { describe, expect, it } from "vitest";
import { extractText, isAllowed, maskHandle, matchWake, messageText, normalizeHandle, parseAllowlist } from "../src/imessage/text.js";

// Builds a blob shaped like Apple's typedstream: header, "NSString", marker bytes, '+', length, text.
function blob(text: string, form: "short" | "u16" | "u32" = "short"): Uint8Array {
  const body = Buffer.from(text, "utf8");
  const len =
    form === "short" ? Buffer.from([body.length]) :
    form === "u16" ? Buffer.from([0x81, body.length & 0xff, body.length >> 8]) :
    (() => { const b = Buffer.alloc(5); b[0] = 0x82; b.writeUInt32LE(body.length, 1); return b; })();
  return Buffer.concat([Buffer.from("streamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92\x84\x84\x84\x08NSString\x01"), Buffer.from([0x94, 0x84, 0x01, 0x2b]), len, body, Buffer.from([0x86, 0x84, 0x02, 0x69, 0x49])]);
}

describe("extractText", () => {
  it("reads a short message", () => {
    expect(extractText(blob("send 0.01 to vitalik.eth"))).toBe("send 0.01 to vitalik.eth");
  });
  it("reads a long message with a 2-byte length", () => {
    const t = "a".repeat(300);
    expect(extractText(blob(t, "u16"))).toBe(t);
  });
  it("reads a very long message with a 4-byte length", () => {
    const t = "b".repeat(70_000);
    expect(extractText(blob(t, "u32"))).toBe(t);
  });
  it("keeps emoji and non-latin text intact", () => {
    expect(extractText(blob("yes ✅ 你好 café"))).toBe("yes ✅ 你好 café");
  });
  it("returns null for missing, empty, truncated or unrelated data", () => {
    expect(extractText(null)).toBeNull();
    expect(extractText(undefined)).toBeNull();
    expect(extractText(new Uint8Array())).toBeNull();
    expect(extractText(Buffer.from("no marker here"))).toBeNull();
    expect(extractText(Buffer.from("NSString"))).toBeNull();
    const cut = blob("hello world").slice(0, blob("hello world").length - 8);
    expect(extractText(cut.slice(0, cut.length - 6))).toBeNull();
  });
});

describe("messageText", () => {
  it("prefers the plain text column", () => {
    expect(messageText("  yes ", blob("ignored"))).toBe("yes");
  });
  it("falls back to the blob when text is empty or null", () => {
    expect(messageText(null, blob("hello"))).toBe("hello");
    expect(messageText("   ", blob("hello"))).toBe("hello");
  });
  it("an attachment marker alone is not text", () => {
    expect(messageText("\uFFFC", null)).toBe("");
    expect(messageText(null, blob("\uFFFC"))).toBe("");
    expect(messageText("\uFFFC hello", null)).toBe("hello");
  });
  it("is empty when there is nothing readable", () => {
    expect(messageText(null, null)).toBe("");
  });
});

describe("handles and the allowlist", () => {
  it("compares phone numbers by digits, ignoring formatting and a country code", () => {
    expect(normalizeHandle("+1 (716) 555-0100")).toBe(normalizeHandle("7165550100"));
    expect(normalizeHandle("+17165550100")).toBe("7165550100");
  });
  it("lowercases emails", () => {
    expect(normalizeHandle(" Me@Example.COM ")).toBe("me@example.com");
  });
  it("allows only listed senders", () => {
    const list = parseAllowlist("+1 716 555 0100, me@example.com");
    expect(isAllowed(list, "+17165550100")).toBe(true);
    expect(isAllowed(list, "ME@example.com")).toBe(true);
    expect(isAllowed(list, "+17165550199")).toBe(false);
    expect(isAllowed(list, "")).toBe(false);
  });
  it("an empty or missing list allows nobody", () => {
    for (const raw of [undefined, "", " , "]) {
      const list = parseAllowlist(raw);
      expect(isAllowed(list, "+17165550100")).toBe(false);
      expect(isAllowed(list, "me@example.com")).toBe(false);
    }
  });
  it("* allows anyone, but only when written explicitly", () => {
    expect(isAllowed(parseAllowlist("*"), "+19998887777")).toBe(true);
    expect(isAllowed(parseAllowlist("+17165550100"), "+19998887777")).toBe(false);
  });
  it("masks handles for logs", () => {
    expect(maskHandle("+17165550100")).toBe("***0100");
    expect(maskHandle("someone@example.com")).toBe("s***@example.com");
    expect(maskHandle("12")).toBe("***");
  });
});

describe("matchWake", () => {
  it("returns what follows Airlock or Hey Airlock, in any case and spelling", () => {
    expect(matchWake("Airlock send 0.01 to a.eth")).toBe("send 0.01 to a.eth");
    expect(matchWake("hey airlock, send 0.01 to a.eth")).toBe("send 0.01 to a.eth");
    expect(matchWake("HEY AIRLOCK send")).toBe("send");
    expect(matchWake("air lock send")).toBe("send");
    expect(matchWake("Hey Airlock")).toBe("");
    expect(matchWake("  airlock!  ")).toBe("");
  });
  it("returns null when the name is not said", () => {
    for (const t of ["send 0.01 to a.eth", "yes", "", "hello there", "airline lock", "unlocked"]) {
      expect(matchWake(t)).toBeNull();
    }
  });
  it("a message that only mentions an airlock.eth domain is not a wake word", () => {
    expect(matchWake("send 0.01 to airlock.eth")).toBeNull();
    expect(matchWake("my airlock.eth domain expired")).toBeNull();
  });
  it("but the name plus a domain still counts when it is said on its own too", () => {
    expect(matchWake("airlock send 0.01 to airlock.eth")).toBe("send 0.01 to airlock.eth");
  });
});

import { matchWakeSpoken } from "../src/imessage/text.js";

describe("matchWakeSpoken (voice notes only)", () => {
  it("still accepts everything the strict matcher accepts", () => {
    expect(matchWakeSpoken("Hey Airlock, send 0.01 to a.eth")).toBe("send 0.01 to a.eth");
    expect(matchWakeSpoken("airlock")).toBe("");
  });
  it("accepts near-miss spellings of the name right after a greeting", () => {
    expect(matchWakeSpoken("Hey Erlak send 0.01 to a.eth")).toBe("send 0.01 to a.eth");
    expect(matchWakeSpoken("Hey, Air Lock. Send 0.01 to a.eth")).toBe("Send 0.01 to a.eth");
    expect(matchWakeSpoken("hi aerlok")).toBe("");
    expect(matchWakeSpoken("OK earlock send it")).toBe("send it");
    expect(matchWakeSpoken("Hey, hair lock, send 0.01")).toBe("send 0.01");
  });
  it("does not accept other words, or a near-miss with no greeting", () => {
    for (const t of ["Hey Eric send 0.01", "Hello world", "hey there", "Hey Alexa send it", "erlak send 0.01", "happy birthday", "Hey, how are you"]) {
      expect(matchWakeSpoken(t)).toBeNull();
    }
  });
  it("the typed matcher stays strict", () => {
    expect(matchWake("Hey Erlak send 0.01")).toBeNull();
  });
});
