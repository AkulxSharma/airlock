import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SEND_SCRIPT, createFileCursor, createHttpApi, createOsascriptSender, openMessagesDb } from "../src/imessage/adapters.js";

const tmp = () => mkdtempSync(join(tmpdir(), "airlock-imsg-"));

describe("osascript sender", () => {
  it("passes the text and handle as arguments, never inside the script", async () => {
    const exec = vi.fn((_f: string, _a: string[], cb: (e: Error | null, o: string, s: string) => void) => cb(null, "", ""));
    const evil = 'hi" & (do shell script "rm -rf ~") & "';
    await createOsascriptSender(exec, 0)("+17165550100", evil);
    const [file, args] = exec.mock.calls[0];
    expect(file).toBe("/usr/bin/osascript");
    expect(args).toEqual(["-e", SEND_SCRIPT, evil, "+17165550100"]);
    expect(SEND_SCRIPT).not.toContain("rm -rf");
    expect(SEND_SCRIPT).toContain("on run {theText, theHandle}");
  });

  it("retries a failed send, then succeeds", async () => {
    let n = 0;
    const exec = vi.fn((_f: string, _a: string[], cb: (e: Error | null, o: string, s: string) => void) => cb(++n < 3 ? new Error("fail") : null, "", ""));
    await createOsascriptSender(exec, 2, 0)("h", "t");
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it("gives up after the retries and throws", async () => {
    const exec = vi.fn((_f: string, _a: string[], cb: (e: Error | null, o: string, s: string) => void) => cb(new Error("always"), "", ""));
    await expect(createOsascriptSender(exec, 1, 0)("h", "t")).rejects.toThrow("always");
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe("file cursor", () => {
  it("returns null when there is no file, then remembers the last saved id", () => {
    const dir = tmp();
    try {
      const c = createFileCursor(join(dir, "nested", "cursor.json"));
      expect(c.load()).toBeNull();
      c.save(42);
      expect(createFileCursor(join(dir, "nested", "cursor.json")).load()).toBe(42);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats a corrupt or invalid file as no cursor", () => {
    const dir = tmp();
    try {
      for (const bad of ["not json", '{"rowid":"x"}', '{"rowid":-3}', '{"rowid":1.5}', "{}"]) {
        const p = join(dir, "c.json");
        writeFileSync(p, bad);
        expect(createFileCursor(p).load()).toBeNull();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("http api", () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("posts JSON with the imessage channel and returns the reply", async () => {
    const f = ok({ reply: "hello", stages: [], needsConfirm: false });
    const api = createHttpApi("http://127.0.0.1:8787", f as unknown as typeof fetch);
    expect(await api("imessage:+1", "send 0.01 to a.eth")).toEqual({ reply: "hello", needsConfirm: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8787/api/message");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ sessionId: "imessage:+1", channel: "imessage", text: "send 0.01 to a.eth" });
  });

  it("sends the channel it is given, defaulting to imessage", async () => {
    const f = ok({ reply: "hi", needsConfirm: false });
    const api = createHttpApi("http://x", f as unknown as typeof fetch);
    await api("s", "t", "voice");
    await api("s", "t");
    const sent = (f.mock.calls as unknown as Array<[string, RequestInit]>).map((c) => JSON.parse(c[1].body as string).channel);
    expect(sent).toEqual(["voice", "imessage"]);
  });

  it("passes needsConfirm through, and treats anything but true as false", async () => {
    const yes = createHttpApi("http://x", ok({ reply: "go?", needsConfirm: true }) as unknown as typeof fetch);
    expect(await yes("s", "t")).toEqual({ reply: "go?", needsConfirm: true });
    const odd = createHttpApi("http://x", ok({ reply: "go?", needsConfirm: "true" }) as unknown as typeof fetch);
    expect((await odd("s", "t")).needsConfirm).toBe(false);
  });

  it("throws on a non-200 answer or an empty reply", async () => {
    await expect(createHttpApi("http://x", ok({ error: "bad" }, 400) as unknown as typeof fetch)("s", "t")).rejects.toThrow("400");
    await expect(createHttpApi("http://x", ok({ reply: "" }) as unknown as typeof fetch)("s", "t")).rejects.toThrow("empty");
    await expect(createHttpApi("http://x", ok({}) as unknown as typeof fetch)("s", "t")).rejects.toThrow("empty");
  });

  it("throws when the server is unreachable", async () => {
    const f = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    await expect(createHttpApi("http://x", f as unknown as typeof fetch)("s", "t")).rejects.toThrow("ECONNREFUSED");
  });
});

describe("messages database reader (throwaway database, never the real one)", () => {
  async function makeDb() {
    const { DatabaseSync } = await import("node:sqlite");
    const dir = tmp();
    const path = join(dir, "chat.db");
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, filename TEXT, mime_type TEXT, uti TEXT);
      CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
      CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
      CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB, handle_id INTEGER,
        is_from_me INTEGER, cache_roomnames TEXT, associated_message_type INTEGER);
      INSERT INTO handle VALUES (1, '+17165550100'), (2, 'friend@example.com');
    `);
    const ins = db.prepare("INSERT INTO message (text, attributedBody, handle_id, is_from_me, cache_roomnames, associated_message_type) VALUES (?, ?, ?, ?, ?, ?)");
    return { dir, path, db, ins };
  }
  const blob = (text: string) => Buffer.concat([Buffer.from("xxNSString\x01"), Buffer.from([0x94, 0x84, 0x01, 0x2b, text.length]), Buffer.from(text)]);

  it("returns only incoming, one-to-one, non-reaction messages, oldest first", async () => {
    const { dir, path, db, ins } = await makeDb();
    try {
      ins.run("first", null, 1, 0, null, 0);          // 1 included
      ins.run("mine", null, 1, 1, null, 0);           // 2 sent by me: skipped
      ins.run("group", null, 1, 0, "chat123", 0);     // 3 group chat: skipped
      ins.run("Loved it", null, 1, 0, null, 2000);    // 4 tapback: skipped
      ins.run(null, blob("from the blob"), 2, 0, null, null); // 5 included, text from attributedBody
      ins.run(null, null, 1, 0, null, 0);             // 6 no text at all: included with empty text
      db.close();
      const src = await openMessagesDb(path);
      expect(src.maxRowId()).toBe(6);
      expect(src.since(0).map((r) => [r.rowid, r.handle, r.text])).toEqual([
        [1, "+17165550100", "first"],
        [5, "friend@example.com", "from the blob"],
        [6, "+17165550100", ""],
      ]);
      expect(src.since(5).map((r) => r.rowid)).toEqual([6]);
      expect(src.since(6)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a voice note's audio file, and ignores other attachments", async () => {
    const { dir, path, db, ins } = await makeDb();
    try {
      ins.run("\uFFFC", null, 1, 0, null, 0);            // 1 voice note (the text is just the attachment marker)
      ins.run("\uFFFC", null, 1, 0, null, 0);            // 2 a photo
      ins.run("look", null, 2, 0, null, 0);              // 3 plain text
      ins.run("\uFFFC", null, 1, 0, null, 0);            // 4 audio by uti only
      db.exec(`
        INSERT INTO attachment VALUES (1, '~/Library/Messages/Attachments/aa/bb/Audio Message.caf', 'audio/x-caf', 'com.apple.coreaudio-format');
        INSERT INTO attachment VALUES (2, '~/Library/Messages/Attachments/cc/dd/IMG.heic', 'image/heic', 'public.heic');
        INSERT INTO attachment VALUES (3, '~/Library/Messages/Attachments/ee/ff/clip.caf', NULL, 'com.apple.coreaudio-format');
        INSERT INTO message_attachment_join VALUES (1, 1), (2, 2), (4, 3);`);
      db.close();
      const src = await openMessagesDb(path);
      const rows = src.since(0);
      expect(rows.map((r) => [r.rowid, r.text, r.audioPath])).toEqual([
        [1, "", "~/Library/Messages/Attachments/aa/bb/Audio Message.caf"],
        [2, "", undefined],
        [3, "look", undefined],
        [4, "", "~/Library/Messages/Attachments/ee/ff/clip.caf"],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is read-only: it can not change the database", async () => {
    const { dir, path, db } = await makeDb();
    db.close();
    try {
      const { DatabaseSync } = await import("node:sqlite");
      const ro = new DatabaseSync(path, { readOnly: true });
      expect(() => ro.exec("DELETE FROM message")).toThrow();
      ro.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports an unreadable database as an error the launcher can explain", async () => {
    await expect(openMessagesDb("/nonexistent/chat.db")).rejects.toThrow();
  });
});
