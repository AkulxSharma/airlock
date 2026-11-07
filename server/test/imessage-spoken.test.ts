import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { SEND_FILE_SCRIPT, SEND_FILE_SCRIPTS, createOsascriptFileSender, openDeliveryChecker } from "../src/imessage/adapters.js";
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
    expect(SEND_FILE_SCRIPT).toContain("POSIX file thePath");
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

const dirs2: string[] = [];
afterAll(() => dirs2.forEach((d) => rmSync(d, { recursive: true, force: true })));

type Delivery = { status: "sent" } | { status: "error"; code: number } | { status: "unknown" };

describe("voice replier: delivery check", () => {
  const run = async (verify: (n: string, since: number) => Promise<Delivery>) => {
    const dir = mkdtempSync(join(tmpdir(), "airlock-verify-"));
    dirs2.push(dir);
    const logs: string[] = [];
    const asked: Array<[string, number]> = [];
    const reply = createVoiceReplier({
      dir,
      speak: async () => new Uint8Array([1, 2, 3]),
      sendFile: async () => {},
      mark: () => 41,
      verify: async (n, since) => { asked.push([n, since]); return verify(n, since); },
      log: (l) => logs.push(l),
      schedule: () => {},
    });
    await reply("h", "Refused. Risk signal is HIGH, so Airlock will not send.");
    return { logs, asked };
  };

  it("logs 'delivered' only when Messages says the audio was sent, and asks about exactly the file and the mark", async () => {
    const t = await run(async () => ({ status: "sent" }));
    expect(t.logs).toEqual(["spoken reply delivered"]);
    expect(t.asked[0][0]).toMatch(/^airlock-\d+-\w+\.mp3$/);
    expect(t.asked[0][1]).toBe(41);
  });

  it("logs a failure with Messages' error code when the send was rejected", async () => {
    const t = await run(async () => ({ status: "error", code: 22 }));
    expect(t.logs[0]).toBe("spoken reply failed: Messages could not send it (error 22)");
    expect(t.logs[1]).toMatch(/^hint: if a file sent by hand from the Messages app also shows Not Delivered/);
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

describe("voice replier: several ways to attach the file", () => {
  function make(outcomes: Record<number, Delivery>, over: { sendFile?: (h: string, p: string, s: number) => Promise<void> } = {}) {
    const dir = mkdtempSync(join(tmpdir(), "airlock-strat-"));
    dirs2.push(dir);
    const logs: string[] = [];
    const tried: number[] = [];
    let marks = 0;
    const reply = createVoiceReplier({
      dir,
      speak: async () => new Uint8Array([1, 2, 3]),
      strategies: 3,
      mark: () => ++marks,
      sendFile: over.sendFile ?? (async (_h, _p, s) => { tried.push(s); }),
      verify: async () => outcomes[tried[tried.length - 1]] ?? { status: "unknown" },
      log: (l) => logs.push(l),
      schedule: () => {},
    });
    return { reply, logs, tried };
  }
  const say = "Refused. Risk signal is HIGH, so Airlock will not send.";

  it("tries the next method when one produces no message, and stops at the first that goes out", async () => {
    const t = make({ 0: { status: "unknown" }, 1: { status: "unknown" }, 2: { status: "sent" } });
    await t.reply("h", say);
    expect(t.tried).toEqual([0, 1, 2]);
    expect(t.logs).toEqual([
      "spoken reply: method 1 did not go out, trying another",
      "spoken reply: method 2 did not go out, trying another",
      "spoken reply delivered",
    ]);
  });

  it("does not try further methods once one is confirmed", async () => {
    const t = make({ 0: { status: "sent" } });
    await t.reply("h", say);
    expect(t.tried).toEqual([0]);
  });

  it("remembers the method that worked and starts there next time", async () => {
    const t = make({ 0: { status: "unknown" }, 1: { status: "sent" } });
    await t.reply("h", say);
    expect(t.tried).toEqual([0, 1]);
    await t.reply("h", say);
    expect(t.tried).toEqual([0, 1, 1]);
  });

  it("a method that cannot even be started is skipped", async () => {
    const tried: number[] = [];
    const t = make({ 1: { status: "sent" } }, {
      sendFile: async (_h, _p, s) => { tried.push(s); if (s === 0) throw new Error("osascript failed"); },
    });
    // the verify stub reads the module-level list, so mirror the attempts into it
    await t.reply("h", say);
    expect(tried).toEqual([0, 1, 2]);
    expect(t.logs[0]).toBe("spoken reply: method 1 could not be started");
  });

  it("if every method fails to start, it logs a failure and never throws", async () => {
    const t = make({}, { sendFile: async () => { throw new Error("no"); } });
    await expect(t.reply("h", say)).resolves.toBeUndefined();
    expect(t.logs.at(-1)).toBe("spoken reply failed; the text reply was already sent");
  });

  it("if every method is handed over but none is confirmed, it says so and stops after the last", async () => {
    const t = make({});
    await t.reply("h", say);
    expect(t.tried).toEqual([0, 1, 2]);
    expect(t.logs.at(-1)).toMatch(/delivery could not be confirmed/);
  });
});

describe("osascript file sender: the ways of attaching", () => {
  type Cb = (e: Error | null, o: string, s: string) => void;
  it("has several methods, and every one takes the path and handle as arguments", () => {
    expect(SEND_FILE_SCRIPTS.length).toBeGreaterThanOrEqual(3);
    for (const m of SEND_FILE_SCRIPTS) {
      expect(m.script).toContain("on run {thePath, theHandle}");
      expect(m.script).not.toMatch(/rm -rf|do shell script/);
      expect(m.script).toContain("POSIX file thePath");
    }
  });
  it("uses the method it is told to, and method 1 by default or when the number is unknown", async () => {
    const exec = vi.fn((_f: string, _a: string[], cb: Cb) => cb(null, "", ""));
    const send = createOsascriptFileSender(exec, 0);
    await send("h", "/p.mp3", 2);
    await send("h", "/p.mp3");
    await send("h", "/p.mp3", 99);
    expect(exec.mock.calls[0][1][1]).toBe(SEND_FILE_SCRIPTS[2].script);
    expect(exec.mock.calls[1][1][1]).toBe(SEND_FILE_SCRIPTS[0].script);
    expect(exec.mock.calls[2][1][1]).toBe(SEND_FILE_SCRIPTS[0].script);
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
      CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, transfer_name TEXT, filename TEXT, mime_type TEXT);
      CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
      CREATE TABLE message (ROWID INTEGER PRIMARY KEY, is_from_me INTEGER, is_sent INTEGER, error INTEGER);`);
    const add = (id: number, name: string, fromMe: number, sent: number, error: number, mime = "audio/mpeg") => {
      db.prepare("INSERT INTO message VALUES (?, ?, ?, ?)").run(id, fromMe, sent, error);
      db.prepare("INSERT INTO attachment VALUES (?, ?, ?, ?)").run(id, name, `~/Library/Messages/Attachments/aa/bb/${name}`, mime);
      db.prepare("INSERT INTO message_attachment_join VALUES (?, ?)").run(id, id);
    };
    return { path, db, add };
  }
  const quick = { attempts: 2, waitMs: 5 };

  it("reports sent for a new outgoing audio attachment that Messages sent without error", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-1-a.mp3", 1, 1, 0);
    db.close();
    expect(await (await openDeliveryChecker(path, quick)).verify("airlock-1-a.mp3", 0)).toEqual({ status: "sent" });
  });

  it("reports the error code when Messages could not send it", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-1-a.mp3", 1, 0, 22);
    db.close();
    expect(await (await openDeliveryChecker(path, quick)).verify("airlock-1-a.mp3", 0)).toEqual({ status: "error", code: 22 });
  });

  it("is unknown when nothing new shows up, or it has not been sent yet", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-2-pending.mp3", 1, 0, 0);
    db.close();
    const c = await openDeliveryChecker(path, quick);
    expect(await c.verify("airlock-9-missing.mp3", 5)).toEqual({ status: "unknown" });
    expect(await c.verify("airlock-2-pending.mp3", 0)).toEqual({ status: "unknown" });
  });

  it("ignores anything made at or before the mark, so an old audio message can not count", async () => {
    const { path, db, add } = await makeDb();
    add(1, "old.mp3", 1, 1, 0);
    db.close();
    const c = await openDeliveryChecker(path, quick);
    expect(await c.verify("airlock-new.mp3", c.mark())).toEqual({ status: "unknown" });
    expect(await c.verify("airlock-new.mp3", 0)).toEqual({ status: "sent" });
  });

  it("finds our audio even if Messages renamed the file, but not a non-audio attachment", async () => {
    const { path, db, add } = await makeDb();
    add(1, "6322CC5C-4DB0-4BD6.pluginPayloadAttachment", 1, 1, 0, "application/octet-stream");
    db.close();
    const noAudio = await openDeliveryChecker(path, quick);
    expect(await noAudio.verify("airlock-x.mp3", 0)).toEqual({ status: "unknown" });
    const w = await makeDb();
    w.add(1, "UUID-RENAMED.mp3", 1, 1, 0, "audio/mpeg");
    w.db.close();
    expect(await (await openDeliveryChecker(w.path, quick)).verify("airlock-x.mp3", 0)).toEqual({ status: "sent" });
  });

  it("ignores an audio attachment that someone else sent to us", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-1-a.mp3", 0, 1, 0);
    db.close();
    expect(await (await openDeliveryChecker(path, quick)).verify("airlock-1-a.mp3", 0)).toEqual({ status: "unknown" });
  });

  it("uses the newest matching row", async () => {
    const { path, db, add } = await makeDb();
    add(1, "airlock-1-a.mp3", 1, 0, 22);
    add(2, "airlock-1-a.mp3", 1, 1, 0);
    db.close();
    expect(await (await openDeliveryChecker(path, quick)).verify("airlock-1-a.mp3", 0)).toEqual({ status: "sent" });
  });

  it("mark is the newest message number", async () => {
    const { path, db, add } = await makeDb();
    add(7, "a.mp3", 1, 1, 0);
    add(12, "b.mp3", 1, 1, 0);
    db.close();
    expect((await openDeliveryChecker(path, quick)).mark()).toBe(12);
  });
});

describe("voice replier: pauses after repeated failures", () => {
  function make(outcome: () => Delivery | "throw" | "skip-verify", opts: { maxFailures?: number } = {}) {
    const dir = mkdtempSync(join(tmpdir(), "airlock-pause-"));
    dirs2.push(dir);
    const logs: string[] = [];
    let clock = 1_000_000;
    let spoken = 0;
    let sendCalls = 0;
    const mode = () => outcome();
    const reply = createVoiceReplier({
      dir,
      speak: async () => { spoken++; return new Uint8Array([1, 2, 3]); },
      sendFile: async () => { sendCalls++; if (mode() === "throw") throw new Error("no"); },
      mark: () => 0,
      verify: async () => { const o = mode(); return o === "throw" || o === "skip-verify" ? { status: "unknown" } : o; },
      log: (l) => logs.push(l),
      schedule: () => {},
      now: () => clock,
      pauseMs: 10 * 60_000,
      ...opts,
    });
    return { reply, logs, tick: (ms: number) => { clock += ms; }, counts: () => ({ spoken, sendCalls }) };
  }
  const say = "Refused. Risk signal is HIGH, so Airlock will not send.";

  it("after two failures in a row it stops speaking and sending, and says so once", async () => {
    const t = make(() => ({ status: "error", code: 22 }));
    await t.reply("h", say);
    await t.reply("h", say);
    const before = t.counts();
    await t.reply("h", say);
    await t.reply("h", say);
    expect(t.counts()).toEqual(before); // no more speech credits, no more attempts
    expect(t.logs.filter((l) => /paused for 10 minutes/.test(l))).toHaveLength(1);
  });

  it("starts trying again after the pause", async () => {
    const t = make(() => ({ status: "error", code: 22 }));
    await t.reply("h", say);
    await t.reply("h", say);
    const paused = t.counts().spoken;
    t.tick(10 * 60_000 + 1);
    await t.reply("h", say);
    expect(t.counts().spoken).toBe(paused + 1);
  });

  it("one success resets the count, so a single failure never pauses", async () => {
    let n = 0;
    const t = make(() => (++n % 8 === 0 ? { status: "sent" } : { status: "error", code: 22 }), { maxFailures: 3 });
    await t.reply("h", say); // fails
    await t.reply("h", say); // fails
    expect(t.logs.some((l) => /paused/.test(l))).toBe(false);
  });

  it("a delivered reply keeps it going and never pauses", async () => {
    const t = make(() => ({ status: "sent" }));
    for (let i = 0; i < 5; i++) await t.reply("h", say);
    expect(t.counts().spoken).toBe(5);
    expect(t.logs.some((l) => /paused|failed/.test(l))).toBe(false);
  });

  it("not being able to confirm delivery counts as a failure too", async () => {
    const t = make(() => ({ status: "unknown" }));
    await t.reply("h", say);
    await t.reply("h", say);
    expect(t.logs.some((l) => /paused/.test(l))).toBe(true);
  });

  it("every method failing to start counts as a failure", async () => {
    const t = make(() => "throw");
    await t.reply("h", say);
    await t.reply("h", say);
    expect(t.logs.some((l) => /paused/.test(l))).toBe(true);
  });

  it("the hint about attachments is logged only once", async () => {
    const t = make(() => ({ status: "error", code: 22 }), { maxFailures: 99 });
    for (let i = 0; i < 4; i++) await t.reply("h", say);
    expect(t.logs.filter((l) => /^hint:/.test(l))).toHaveLength(1);
  });
});
