import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { SEND_FILE_SCRIPT, createOsascriptFileSender } from "../src/imessage/adapters.js";
import { createVoiceReplier, toSpoken } from "../src/imessage/audio.js";

const FULL = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const CONFIRM = `Risk signal: MEDIUM (score 40).\n- [medium] Contract code contains DELEGATECALL, which runs other code with this contract's storage and funds.\n- [medium] Contract stores an implementation or admin address (EIP-1967). The logic can be swapped later.\nIn plain words: The logic behind this contract can be swapped after you check it.\nTo send: 0.005 test ETH to ${FULL}.\nThis is a risk signal, not a guarantee. Reply YES to send or NO to cancel. It expires in 60 seconds.`;
const REFUSED = `Refused. Risk signal is HIGH, so Airlock will not send.\n- [high] Contract code contains SELFDESTRUCT, which can erase the contract and send out its funds.`;
const SENT = `Sent 0.0001 test ETH to ${FULL}.\nhttps://sepolia.etherscan.io/tx/0x${"ab".repeat(32)}`;

describe("toSpoken", () => {
  it("keeps the verdict, one finding, the amount and the question", () => {
    const s = toSpoken(CONFIRM);
    expect(s).toContain("Risk signal: MEDIUM");
    expect(s).toContain("DELEGATECALL");
    expect(s).not.toContain("EIP-1967"); // only the first finding
    expect(s).toContain("In plain words");
    expect(s).toMatch(/Reply YES to send or NO to cancel/);
  });

  it("never says a full address: only the start and end, spelled out", () => {
    const s = toSpoken(CONFIRM);
    expect(s).not.toContain(FULL);
    expect(s).not.toMatch(/0x[0-9a-fA-F]{8,}/);
    expect(s).toContain("starting zero x 5 a A e");
    expect(s).toContain("ending e A e d");
  });

  it("says amounts digit by digit so 0.005 can not be heard as 0.05", () => {
    expect(toSpoken(CONFIRM)).toContain("zero point zero zero five");
    expect(toSpoken(SENT)).toContain("zero point zero zero zero one");
  });

  it("drops links and the heuristic label", () => {
    expect(toSpoken(SENT)).not.toMatch(/https?:|etherscan|0x[0-9a-f]{20,}/i);
    expect(toSpoken("- [medium] Heuristic: the owner can change fees.")).toBe("the owner can change fees.");
  });

  it("a refusal says the decision and the reason", () => {
    const s = toSpoken(REFUSED);
    expect(s).toMatch(/^Refused\./);
    expect(s).toContain("SELFDESTRUCT");
  });

  it("is capped at the speech limit, ends cleanly, and is empty for empty input", () => {
    expect(toSpoken("word ".repeat(600)).length).toBeLessThanOrEqual(1000);
    expect(toSpoken("")).toBe("");
    expect(toSpoken("\n\n")).toBe("");
  });

  it("never contains safe, secure or trusted for the replies Airlock writes", () => {
    for (const r of [CONFIRM, REFUSED, SENT]) expect(toSpoken(r)).not.toMatch(/\b(safe|secure|trusted)\b/i);
  });
});

describe("voice replier", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const make = (over: Partial<Parameters<typeof createVoiceReplier>[0]> = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "airlock-replies-"));
    dirs.push(dir);
    const logs: string[] = [];
    const scheduled: Array<() => void> = [];
    const seen: Array<{ handle: string; path: string; existedAtSend: boolean; bytes: number }> = [];
    const sendFile = vi.fn(async (handle: string, path: string) => {
      seen.push({ handle, path, existedAtSend: existsSync(path), bytes: statSync(path).size });
    });
    const speak = vi.fn(async (_t: string) => new Uint8Array([1, 2, 3, 4, 5]));
    const reply = createVoiceReplier({ dir, speak, sendFile, log: (l) => logs.push(l), schedule: (fn) => scheduled.push(fn), ...over });
    return { reply, dir, logs, scheduled, seen, sendFile, speak };
  };

  it("speaks the short version, writes an mp3, sends it, and logs only that it sent", async () => {
    const t = make();
    await t.reply("+17165550100", CONFIRM);
    expect(t.speak).toHaveBeenCalledTimes(1);
    const said = t.speak.mock.calls[0][0];
    expect(said).not.toContain(FULL);
    expect(said).toContain("zero point zero zero five");
    expect(t.seen).toHaveLength(1);
    expect(t.seen[0]).toMatchObject({ handle: "+17165550100", existedAtSend: true, bytes: 5 });
    expect(t.seen[0].path).toMatch(/airlock-\d+-\w+\.mp3$/);
    expect(t.logs).toEqual(["sent a spoken reply"]);
  });

  it("schedules deletion of the file instead of deleting it at once", async () => {
    const t = make();
    await t.reply("h", REFUSED);
    expect(existsSync(t.seen[0].path)).toBe(true);
    expect(t.scheduled).toHaveLength(1);
    t.scheduled[0]();
    await new Promise((r) => setTimeout(r, 30));
    expect(existsSync(t.seen[0].path)).toBe(false);
  });

  it("never throws when speech or sending fails, and still schedules cleanup of any file made", async () => {
    const noSpeech = make({ speak: async () => { throw new Error("HTTP 401"); } });
    await expect(noSpeech.reply("h", CONFIRM)).resolves.toBeUndefined();
    expect(noSpeech.logs.join()).toMatch(/failed/);
    expect(noSpeech.sendFile).not.toHaveBeenCalled();
    expect(noSpeech.scheduled).toHaveLength(0);

    const noSend = make({ sendFile: async () => { throw new Error("osascript failed"); } });
    await expect(noSend.reply("h", CONFIRM)).resolves.toBeUndefined();
    expect(noSend.scheduled).toHaveLength(1);
    expect(readdirSync(noSend.dir).filter((n) => n.endsWith(".mp3"))).toHaveLength(1);
  });

  it("says nothing for an empty reply", async () => {
    const t = make();
    await t.reply("h", "   ");
    expect(t.speak).not.toHaveBeenCalled();
    expect(t.sendFile).not.toHaveBeenCalled();
  });

  it("removes old leftover files from an earlier run, and leaves other files alone", async () => {
    const t = make();
    const old = join(t.dir, "airlock-1-old.mp3");
    const other = join(t.dir, "notes.txt");
    writeFileSync(old, "x");
    writeFileSync(other, "x");
    const longAgo = new Date(Date.now() - 20 * 60_000);
    utimesSync(old, longAgo, longAgo);
    await t.reply("h", SENT);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(other)).toBe(true);
  });

  it("the logs never contain the reply text or an address", async () => {
    const t = make();
    await t.reply("h", CONFIRM);
    expect(t.logs.join(" ")).not.toMatch(/0x|DELEGATECALL|Risk signal/);
  });
});

describe("osascript file sender", () => {
  type Cb = (e: Error | null, o: string, s: string) => void;
  it("passes the file and handle as arguments, never inside the script", async () => {
    const exec = vi.fn((_f: string, _a: string[], cb: Cb) => cb(null, "", ""));
    const evil = '/tmp/x.mp3" & (do shell script "rm -rf ~") & "';
    await createOsascriptFileSender(exec, 0)("+17165550100", evil);
    expect(exec.mock.calls[0][0]).toBe("/usr/bin/osascript");
    expect(exec.mock.calls[0][1]).toEqual(["-e", SEND_FILE_SCRIPT, evil, "+17165550100"]);
    expect(SEND_FILE_SCRIPT).not.toContain("rm -rf");
    expect(SEND_FILE_SCRIPT).toContain("POSIX file theFile");
  });
  it("retries once, then throws", async () => {
    const exec = vi.fn((_f: string, _a: string[], cb: Cb) => cb(new Error("fail"), "", ""));
    await expect(createOsascriptFileSender(exec, 1, 0)("h", "/p.mp3")).rejects.toThrow("fail");
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe("toSpoken and the ENS note", () => {
  it("does not read the note aloud", () => {
    const withNote = `Risk signal: LOW (score 5).\nNo findings.\nNote: this name was looked up on Ethereum mainnet, but Airlock audits and sends on the Sepolia test network, where the code at this address can be different.\nTo send: 0.005 test ETH to ${FULL}.\nThis is a risk signal, not a guarantee. Reply YES to send or NO to cancel.`;
    const s = toSpoken(withNote);
    expect(s).not.toMatch(/mainnet|Note:/);
    expect(s).toContain("Reply YES to send or NO to cancel");
  });
});

describe("toSpoken keeps voice replies short", () => {
  it("leaves out 'No findings.' and the expiry, but keeps the decision and the question", () => {
    const s = toSpoken(`Risk signal: LOW (score 0).\nNo findings.\nTo send: 0.005 test ETH to ${FULL}.\nThis is a risk signal, not a guarantee. Reply YES to send or NO to cancel. It expires in 60 seconds.`);
    expect(s).not.toMatch(/No findings|expires/i);
    expect(s).toContain("Risk signal: LOW");
    expect(s).toContain("Reply YES to send or NO to cancel");
    expect(s).toContain("not a guarantee");
  });
  it("the whole confirm summary is now clearly shorter than the full text", () => {
    const full = `Risk signal: LOW (score 0).\nNo findings.\nTo send: 0.005 test ETH to ${FULL}.\nThis is a risk signal, not a guarantee. Reply YES to send or NO to cancel. It expires in 60 seconds.`;
    expect(toSpoken(full).length).toBeLessThan(full.length + 40);
    expect(toSpoken(full)).not.toContain(FULL);
  });
});

import { openDeliveryChecker } from "../src/imessage/adapters.js";

const dirs2: string[] = [];
afterAll(() => dirs2.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("voice replier: delivery check", () => {
  const run = async (verify: (n: string) => Promise<{ status: "sent" } | { status: "error"; code: number } | { status: "unknown" }>) => {
    const dir = mkdtempSync(join(tmpdir(), "airlock-verify-"));
    dirs2.push(dir);
    const logs: string[] = [];
    const asked: string[] = [];
    const reply = createVoiceReplier({
      dir,
      speak: async () => new Uint8Array([1, 2, 3]),
      sendFile: async () => {},
      verify: async (n) => { asked.push(n); return verify(n); },
      log: (l) => logs.push(l),
      schedule: () => {},
    });
    await reply("h", "Refused. Risk signal is HIGH, so Airlock will not send.");
    return { logs, asked };
  };

  it("logs 'delivered' only when Messages says the audio was sent", async () => {
    const t = await run(async () => ({ status: "sent" }));
    expect(t.logs).toEqual(["spoken reply delivered"]);
    expect(t.asked[0]).toMatch(/^airlock-\d+-\w+\.mp3$/); // it asks about exactly the file it sent
  });

  it("logs a failure with Messages' error code when the send was rejected", async () => {
    const t = await run(async () => ({ status: "error", code: 22 }));
    expect(t.logs).toEqual(["spoken reply failed: Messages could not send it (error 22)"]);
  });

  it("says plainly when delivery could not be confirmed", async () => {
    const t = await run(async () => ({ status: "unknown" }));
    expect(t.logs[0]).toMatch(/delivery could not be confirmed/);
    expect(t.logs[0]).not.toMatch(/delivered$/);
  });

  it("a checker that throws never breaks the reply", async () => {
    const t = await run(async () => { throw new Error("db locked"); });
    expect(t.logs).toEqual(["spoken reply failed; the text reply was already sent"]);
  });
});

describe("delivery checker (throwaway Messages database)", () => {
  async function makeDb() {
    const { DatabaseSync } = await import("node:sqlite");
    const dir = mkdtempSync(join(tmpdir(), "airlock-deliv-"));
    dirs2.push(dir);
    const path = join(dir, "chat.db");
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, transfer_name TEXT);
      CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
      CREATE TABLE message (ROWID INTEGER PRIMARY KEY, is_from_me INTEGER, is_sent INTEGER, error INTEGER);`);
    const add = (id: number, name: string, fromMe: number, sent: number, error: number) => {
      db.prepare("INSERT INTO message VALUES (?, ?, ?, ?)").run(id, fromMe, sent, error);
      db.prepare("INSERT INTO attachment VALUES (?, ?)").run(id, name);
      db.prepare("INSERT INTO message_attachment_join VALUES (?, ?)").run(id, id);
    };
    return { path, db, add };
  }
  const quick = { attempts: 2, waitMs: 5 };

  it("reports sent for an outgoing attachment that Messages sent without error", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-1-a.mp3", 1, 1, 0);
    db.close();
    expect(await (await openDeliveryChecker(path, quick))("airlock-1-a.mp3")).toEqual({ status: "sent" });
  });

  it("reports the error code when Messages could not send it", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-1-a.mp3", 1, 0, 22);
    db.close();
    expect(await (await openDeliveryChecker(path, quick))("airlock-1-a.mp3")).toEqual({ status: "error", code: 22 });
  });

  it("is unknown when the file never shows up, or has not been sent yet", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-2-pending.mp3", 1, 0, 0);
    db.close();
    const check = await openDeliveryChecker(path, quick);
    expect(await check("airlock-9-missing.mp3")).toEqual({ status: "unknown" });
    expect(await check("airlock-2-pending.mp3")).toEqual({ status: "unknown" });
  });

  it("ignores an attachment with the same name that someone else sent to us", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-1-a.mp3", 0, 1, 0);
    db.close();
    expect(await (await openDeliveryChecker(path, quick))("airlock-1-a.mp3")).toEqual({ status: "unknown" });
  });

  it("uses the newest matching row", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-1-a.mp3", 1, 0, 22);
    add(2, "airlock-1-a.mp3", 1, 1, 0);
    db.close();
    expect(await (await openDeliveryChecker(path, quick))("airlock-1-a.mp3")).toEqual({ status: "sent" });
  });
});
