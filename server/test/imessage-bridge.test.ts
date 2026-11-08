import { describe, expect, it, vi } from "vitest";
import { createBridge, type AirlockReply, type CursorStore, type InboundMessage, type MessageSource } from "../src/imessage/bridge.js";
import { parseAllowlist } from "../src/imessage/text.js";

const ME = "+17165550100";
const STRANGER = "+19998887777";

type Opts = {
  messages?: InboundMessage[];
  cursor?: number | null;
  allow?: string;
  api?: (s: string, t: string, c?: "imessage" | "voice") => Promise<AirlockReply>;
  send?: (h: string, t: string) => Promise<void>;
  max?: number;
  maxGlobal?: number;
  sessionIdleMs?: number;
};

function setup(opts: Opts = {}) {
  const messages = opts.messages ?? [];
  let saved: number | null = opts.cursor === undefined ? null : opts.cursor;
  const cursor: CursorStore = { load: () => saved, save: (n) => { saved = n; } };
  const source: MessageSource = {
    maxRowId: () => Math.max(0, ...messages.map((m) => m.rowid)),
    since: (r) => messages.filter((m) => m.rowid > r),
  };
  const api = vi.fn(opts.api ?? (async (_s: string, t: string, _c?: "imessage" | "voice") => ({ reply: `reply to: ${t}`, needsConfirm: false })));
  const send = vi.fn(opts.send ?? (async () => {}));
  let t = 1_000_000;
  const logs: string[] = [];
  const bridge = createBridge({
    source, cursor, api, send,
    allowlist: parseAllowlist(opts.allow ?? "*"),
    now: () => t,
    log: (l) => logs.push(l),
    maxPerMinute: opts.max,
    maxGlobalPerMinute: opts.maxGlobal,
    sessionIdleMs: opts.sessionIdleMs ?? 0, // sessions off unless a test asks for them
  });
  return { bridge, api, send, getCursor: () => saved, tick: (ms: number) => { t += ms; }, logs, messages };
}
const m = (rowid: number, handle: string, text: string): InboundMessage => ({ rowid, handle, text });
const asks = (reply = "Reply YES to send") => async () => ({ reply, needsConfirm: true });

describe("the wake word", () => {
  it("answers a message that starts with Airlock or Hey Airlock, in any case", async () => {
    for (const text of ["Airlock send 0.01 to a.eth", "hey airlock send 0.01 to a.eth", "HEY AIRLOCK, send 0.01 to a.eth", "airlock: send 0.01 to a.eth"]) {
      const t = setup({ messages: [m(2, ME, text)], cursor: 1 });
      expect(await t.bridge.poll()).toBe(1);
      expect(t.api).toHaveBeenCalledWith(`imessage:${ME}`, "send 0.01 to a.eth", "imessage");
    }
  });

  it("strips the wake word before the command reaches the server", async () => {
    const t = setup({ messages: [m(2, ME, "Hey Airlock, send 0.01 to vitalik.eth")], cursor: 1 });
    await t.bridge.poll();
    expect(t.api.mock.calls[0][1]).toBe("send 0.01 to vitalik.eth");
  });

  it("only the wake word gets the help text", async () => {
    const t = setup({ messages: [m(2, ME, "Hey Airlock")], cursor: 1 });
    await t.bridge.poll();
    expect(t.api.mock.calls[0][1]).toBe("help");
  });

  it("ignores everything without the wake word, with no API call, no reply and no trace of the text", async () => {
    const chat = ["send 0.01 to vitalik.eth", "yes", "lol what's up", "happy birthday!!", "my airlock.eth domain expired"];
    const t = setup({ messages: chat.map((x, i) => m(i + 2, ME, x)), cursor: 1 });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).not.toHaveBeenCalled();
    expect(t.send).not.toHaveBeenCalled();
    expect(t.logs.join("\n")).not.toMatch(/birthday|vitalik|lol/);
    expect(t.getCursor()).toBe(chat.length + 1);
  });

  it("anyone may use it when the allowlist is *, as long as they say the name", async () => {
    const t = setup({ messages: [m(2, STRANGER, "airlock send 0.001 to weth.demo")], cursor: 1 });
    expect(await t.bridge.poll()).toBe(1);
    expect(t.send).toHaveBeenCalledWith(STRANGER, expect.any(String));
  });

  it("a listed allowlist still blocks other senders, wake word or not", async () => {
    const t = setup({ allow: ME, messages: [m(2, STRANGER, "airlock help")], cursor: 1 });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).not.toHaveBeenCalled();
  });
});

describe("answering YES or NO without the wake word", () => {
  it("is accepted from a sender whose confirmation is open", async () => {
    const t = setup({ api: asks(), messages: [m(2, ME, "airlock send 0.001 to weth.demo")], cursor: 1 });
    await t.bridge.poll();
    t.messages.push(m(3, ME, "yes"));
    expect(await t.bridge.poll()).toBe(1);
    expect(t.api.mock.calls[1]).toEqual([`imessage:${ME}`, "yes", "imessage"]);
  });

  it("works for no, and for the exact YES/NO words only", async () => {
    const t = setup({ api: asks(), messages: [m(2, ME, "airlock send 0.001 to weth.demo")], cursor: 1 });
    await t.bridge.poll();
    t.messages.push(m(3, ME, "sure, go ahead"), m(4, ME, "yes please do it now"));
    expect(await t.bridge.poll()).toBe(0); // loose phrasing is never a confirmation
    t.messages.push(m(5, ME, "no"));
    expect(await t.bridge.poll()).toBe(1);
  });

  it("is ignored from a different sender, even while someone else has a confirmation open", async () => {
    const t = setup({ api: asks(), messages: [m(2, ME, "airlock send 0.001 to weth.demo")], cursor: 1 });
    await t.bridge.poll();
    t.messages.push(m(3, STRANGER, "yes"));
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).toHaveBeenCalledTimes(1);
  });

  it("is ignored once the confirmation window has passed", async () => {
    const t = setup({ api: asks(), messages: [m(2, ME, "airlock send 0.001 to weth.demo")], cursor: 1 });
    await t.bridge.poll();
    t.tick(61_000);
    t.messages.push(m(3, ME, "yes"));
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).toHaveBeenCalledTimes(1);
  });

  it("is ignored when the last reply was not a confirmation request", async () => {
    const t = setup({ messages: [m(2, ME, "airlock help")], cursor: 1 });
    await t.bridge.poll();
    t.messages.push(m(3, ME, "yes"));
    expect(await t.bridge.poll()).toBe(0);
  });

  it("only one answer: after YES the window is closed", async () => {
    let n = 0;
    const t = setup({
      api: async () => (++n === 1 ? { reply: "confirm?", needsConfirm: true } : { reply: "sent", needsConfirm: false }),
      messages: [m(2, ME, "airlock send 0.001 to weth.demo")],
      cursor: 1,
    });
    await t.bridge.poll();
    t.messages.push(m(3, ME, "yes"));
    await t.bridge.poll();
    t.messages.push(m(4, ME, "yes"));
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).toHaveBeenCalledTimes(2);
  });

  it("the wake word plus yes also works", async () => {
    const t = setup({ api: asks(), messages: [m(2, ME, "airlock send 0.001 to weth.demo")], cursor: 1 });
    await t.bridge.poll();
    t.messages.push(m(3, ME, "Airlock yes"));
    await t.bridge.poll();
    expect(t.api.mock.calls[1][1]).toBe("yes");
  });
});

describe("first run and restarts", () => {
  it("first run starts after the newest message and replies to nothing old", async () => {
    const t = setup({ messages: [m(1, ME, "airlock send 0.01 to a.eth"), m(2, ME, "airlock yes")] });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).not.toHaveBeenCalled();
    expect(t.getCursor()).toBe(2);
  });

  it("a restart with a saved cursor does not replay handled messages", async () => {
    const t = setup({ messages: [m(5, ME, "airlock hello")], cursor: 4 });
    expect(await t.bridge.poll()).toBe(1);
    const t2 = setup({ messages: [m(5, ME, "airlock hello")], cursor: t.getCursor() });
    expect(await t2.bridge.poll()).toBe(0);
    expect(t2.send).not.toHaveBeenCalled();
  });

  it("handles only messages newer than the cursor, oldest first", async () => {
    const t = setup({ messages: [m(3, ME, "airlock one"), m(4, ME, "airlock two"), m(5, ME, "airlock three")], cursor: 3 });
    await t.bridge.poll();
    expect(t.api.mock.calls.map((c) => c[1])).toEqual(["two", "three"]);
  });
});

describe("replies and sessions", () => {
  it("replies through the same API as the GUI, one session per sender", async () => {
    const t = setup({ messages: [m(2, ME, "airlock a"), m(3, STRANGER, "airlock b")], cursor: 1 });
    await t.bridge.poll();
    expect(t.api.mock.calls.map((c) => c[0])).toEqual([`imessage:${ME}`, `imessage:${STRANGER}`]);
    expect(t.send).toHaveBeenCalledWith(ME, "reply to: a");
  });

  it("the log never contains a full number or the message text", async () => {
    const t = setup({ messages: [m(2, ME, "airlock secret words")], cursor: 1 });
    await t.bridge.poll();
    const all = t.logs.join("\n");
    expect(all).not.toContain("secret words");
    expect(all).not.toContain(ME);
  });

  it("skips empty messages (attachments, reactions with no text)", async () => {
    const t = setup({ messages: [m(2, ME, "")], cursor: 1 });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).not.toHaveBeenCalled();
  });
});

describe("failures and loops", () => {
  it("when the server is down, the sender gets a short unavailable notice, and no confirmation stays open", async () => {
    const t = setup({ messages: [m(2, ME, "airlock yes")], cursor: 1, api: async () => { throw new Error("ECONNREFUSED"); } });
    expect(await t.bridge.poll()).toBe(1);
    expect(t.send.mock.calls[0][1]).toMatch(/not available right now/i);
    expect(t.send.mock.calls[0][1]).toMatch(/nothing was sent/i);
  });

  it("a failing send does not stop the next message or replay this one", async () => {
    let n = 0;
    const t = setup({ messages: [m(2, ME, "airlock one"), m(3, ME, "airlock two")], cursor: 1, send: async () => { if (++n === 1) throw new Error("osascript failed"); } });
    expect(await t.bridge.poll()).toBe(1);
    expect(t.getCursor()).toBe(3);
    expect(await t.bridge.poll()).toBe(0);
  });

  it("ignores a message that is just one of our own replies echoed back", async () => {
    const t = setup({ messages: [m(2, ME, "airlock hello")], cursor: 1 });
    await t.bridge.poll();
    const reply = t.send.mock.calls[0][1];
    t.messages.push(m(3, ME, reply));
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).toHaveBeenCalledTimes(1);
  });

  it("rate limits one sender and recovers after a minute", async () => {
    const msgs = Array.from({ length: 5 }, (_, i) => m(i + 2, ME, `airlock msg ${i}`));
    const t = setup({ messages: msgs, cursor: 1, max: 3 });
    expect(await t.bridge.poll()).toBe(3);
    t.tick(61_000);
    t.messages.push(m(10, ME, "airlock later"));
    expect(await t.bridge.poll()).toBe(1);
  });

  it("a rate-limited sender does not block other senders", async () => {
    const t = setup({ messages: [m(2, ME, "airlock a"), m(3, ME, "airlock b"), m(4, STRANGER, "airlock c")], cursor: 1, max: 1 });
    expect(await t.bridge.poll()).toBe(2);
  });

  it("a global limit stops a crowd of different numbers from flooding the line", async () => {
    const msgs = Array.from({ length: 6 }, (_, i) => m(i + 2, `+1999888770${i}`, "airlock hi"));
    const t = setup({ messages: msgs, cursor: 1, maxGlobal: 4 });
    expect(await t.bridge.poll()).toBe(4);
  });
});

describe("voice notes", () => {
  const voice = (rowid: number, handle: string, audioPath = `/a/${rowid}.caf`): InboundMessage => ({ rowid, handle, text: "", audioPath });

  function vsetup(transcripts: Record<string, string | null>, opts: Opts & { noTranscriber?: boolean; maxVoice?: number } = {}) {
    const transcribe = vi.fn(async (p: string) => transcripts[p] ?? null);
    let saved: number | null = 1;
    const messages = opts.messages ?? [];
    const api = vi.fn(opts.api ?? (async (_s: string, t: string, _c?: "imessage" | "voice") => ({ reply: `reply to: ${t}`, needsConfirm: false })));
    const send = vi.fn(async () => {});
    const logs: string[] = [];
    const bridge = createBridge({ sessionIdleMs: 0,
      source: { maxRowId: () => 0, since: (r) => messages.filter((x) => x.rowid > r) },
      cursor: { load: () => saved, save: (n) => { saved = n; } },
      api, send,
      allowlist: parseAllowlist(opts.allow ?? "*"),
      now: () => 1_000_000,
      log: (l) => logs.push(l),
      transcribe: opts.noTranscriber ? undefined : transcribe,
      maxVoicePerMinute: opts.maxVoice,
    });
    return { bridge, api, send, transcribe, logs, messages };
  }

  it("a voice note that says the wake word is answered, and the server is told it was spoken", async () => {
    const t = vsetup({ "/a/2.caf": "Hey Airlock, send zero point zero one eth to weth dot demo." }, { messages: [voice(2, ME)] });
    expect(await t.bridge.poll()).toBe(1);
    expect(t.api).toHaveBeenCalledWith(`imessage:${ME}`, "send zero point zero one eth to weth dot demo.", "voice");
    expect(t.send).toHaveBeenCalledWith(ME, expect.any(String));
  });

  it("typed messages are still sent as the imessage channel", async () => {
    const t = vsetup({}, { messages: [m(2, ME, "airlock help")] });
    await t.bridge.poll();
    expect(t.api.mock.calls[0][2]).toBe("imessage");
  });

  it("a voice note without the wake word gets no reply and its words are not logged", async () => {
    const t = vsetup({ "/a/2.caf": "happy birthday to you, call me back later" }, { messages: [voice(2, ME)] });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).not.toHaveBeenCalled();
    expect(t.logs.join("\n")).not.toMatch(/birthday|call me/);
  });

  it("a voice note from a sender who is not allowed is never transcribed", async () => {
    const t = vsetup({ "/a/2.caf": "airlock help" }, { allow: ME, messages: [voice(2, STRANGER)] });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.transcribe).not.toHaveBeenCalled();
  });

  it("without a transcriber, voice notes are ignored silently", async () => {
    const t = vsetup({ "/a/2.caf": "airlock help" }, { noTranscriber: true, messages: [voice(2, ME)] });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.send).not.toHaveBeenCalled();
  });

  it("a note that could not be transcribed is ignored", async () => {
    const t = vsetup({ "/a/2.caf": null }, { messages: [voice(2, ME)] });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).not.toHaveBeenCalled();
  });

  it("caps how many notes are transcribed per minute", async () => {
    const msgs = Array.from({ length: 5 }, (_, i) => voice(i + 2, `+1999888770${i}`));
    const tr: Record<string, string> = {};
    msgs.forEach((x) => (tr[x.audioPath!] = "airlock hi"));
    const t = vsetup(tr, { messages: msgs, maxVoice: 3 });
    expect(await t.bridge.poll()).toBe(3);
    expect(t.transcribe).toHaveBeenCalledTimes(3);
    expect(t.logs.join("\n")).toMatch(/voice quota/);
  });

  it("a spoken yes answers an open confirmation, a spoken yes with nothing open does not", async () => {
    const t = vsetup({ "/a/3.caf": "Yes.", "/a/5.caf": "Yes." }, {
      api: async (_s, text) => (text.startsWith("send") ? { reply: "confirm?", needsConfirm: true } : { reply: "sent", needsConfirm: false }),
      messages: [m(2, ME, "airlock send 0.001 to weth.demo")],
    });
    await t.bridge.poll();
    t.messages.push(voice(3, ME));
    expect(await t.bridge.poll()).toBe(1);
    expect(t.api.mock.calls[1]).toEqual([`imessage:${ME}`, "Yes.", "voice"]);
    t.messages.push(voice(5, ME));
    expect(await t.bridge.poll()).toBe(0); // the confirmation was used up
  });
});

describe("spoken replies", () => {
  const voice = (rowid: number, handle: string): InboundMessage => ({ rowid, handle, text: "", audioPath: `/a/${rowid}.caf` });

  function ssetup(opts: { messages: InboundMessage[]; voiceReply?: (h: string, t: string) => Promise<void>; max?: number; noReplier?: boolean }) {
    const order: string[] = [];
    const send = vi.fn(async () => { order.push("text"); });
    const voiceReply = vi.fn(opts.voiceReply ?? (async () => { order.push("voice"); }));
    const bridge = createBridge({ sessionIdleMs: 0,
      source: { maxRowId: () => 0, since: (r) => opts.messages.filter((x) => x.rowid > r) },
      cursor: { load: () => 1, save: () => {} },
      api: async (_s, t) => ({ reply: `reply to: ${t}`, needsConfirm: false }),
      send,
      allowlist: parseAllowlist("*"),
      now: () => 1_000_000,
      transcribe: async () => "airlock hello",
      voiceReply: opts.noReplier ? undefined : voiceReply,
      maxSpokenRepliesPerMinute: opts.max,
    });
    return { bridge, send, voiceReply, order };
  }

  it("a spoken question gets the text reply first, then a spoken copy", async () => {
    const t = ssetup({ messages: [voice(2, ME)] });
    expect(await t.bridge.poll()).toBe(1);
    expect(t.order).toEqual(["text", "voice"]);
    expect(t.voiceReply).toHaveBeenCalledWith(ME, "reply to: hello");
  });

  it("a typed question gets text only", async () => {
    const t = ssetup({ messages: [m(2, ME, "airlock hello")] });
    await t.bridge.poll();
    expect(t.voiceReply).not.toHaveBeenCalled();
    expect(t.order).toEqual(["text"]);
  });

  it("if the spoken copy fails, the text reply stands and the bridge carries on", async () => {
    const t = ssetup({ messages: [voice(2, ME), voice(3, ME)], voiceReply: async () => { throw new Error("tts down"); } });
    expect(await t.bridge.poll()).toBe(2);
    expect(t.send).toHaveBeenCalledTimes(2);
  });

  it("without a replier configured, only text goes out", async () => {
    const t = ssetup({ messages: [voice(2, ME)], noReplier: true });
    expect(await t.bridge.poll()).toBe(1);
    expect(t.order).toEqual(["text"]);
  });

  it("caps spoken replies per minute but keeps sending text", async () => {
    const msgs = Array.from({ length: 4 }, (_, i) => voice(i + 2, `+1999888770${i}`));
    const t = ssetup({ messages: msgs, max: 2 });
    expect(await t.bridge.poll()).toBe(4);
    expect(t.voiceReply).toHaveBeenCalledTimes(2);
    expect(t.send).toHaveBeenCalledTimes(4);
  });
});

describe("just the name, end to end with the real handler", () => {
  it("'Hey airlock' alone gets the help reply, in any case and punctuation", async () => {
    const { createMessageHandler } = await import("../src/api/message.js");
    const { createConfirmStore } = await import("../src/gate/confirm.js");
    const handle = createMessageHandler({
      resolve: async () => ({ error: "unused" }),
      audit: async () => ({ error: "unused" }),
      store: createConfirmStore(),
      wallet: null,
      now: () => 1,
      maxTransferEth: "0.01",
      publish: () => {},
    });
    for (const text of ["Hey airlock", "HEY AIRLOCK!", "airlock", "Airlock?", "hey, airlock."]) {
      const sent: string[] = [];
      const bridge = createBridge({ sessionIdleMs: 0,
        source: { maxRowId: () => 0, since: (r) => (r < 2 ? [{ rowid: 2, handle: ME, text }] : []) },
        cursor: { load: () => 1, save: () => {} },
        api: async (sessionId, t, channel) => {
          const r = await handle({ sessionId, channel: channel ?? "imessage", text: t });
          return { reply: r.reply, needsConfirm: r.needsConfirm };
        },
        send: async (_h, t) => { sent.push(t); },
        allowlist: parseAllowlist("*"),
      });
      expect(await bridge.poll()).toBe(1);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatch(/I'm Airlock/);
      expect(sent[0]).toMatch(/Text me: Airlock send/);
    }
  });
});

describe("voice note logging (what happened, never what was said)", () => {
  const voice = (rowid: number): InboundMessage => ({ rowid, handle: ME, text: "", audioPath: `/a/${rowid}.caf` });
  function lsetup(transcript: string | null, withTranscriber = true) {
    const logs: string[] = [];
    const bridge = createBridge({ sessionIdleMs: 0,
      source: { maxRowId: () => 0, since: (r) => (r < 2 ? [voice(2)] : []) },
      cursor: { load: () => 1, save: () => {} },
      api: async (_s, t) => ({ reply: `r:${t}`, needsConfirm: false }),
      send: async () => {},
      allowlist: parseAllowlist("*"),
      log: (l) => logs.push(l),
      transcribe: withTranscriber ? async () => transcript : undefined,
    });
    return { bridge, logs };
  }

  it("says when a voice note was found and how many words it had, when it did say the wake word", async () => {
    const t = lsetup("Hey Airlock, send zero point zero one ETH to weth dot demo");
    await t.bridge.poll();
    const all = t.logs.join("\n");
    expect(all).toMatch(/voice note from \*\*\*0100: found, transcribing/);
    expect(all).toMatch(/transcribed \(\d+ words\)/);
    expect(all).toMatch(/replied to/);
    expect(all).not.toMatch(/weth|demo|send zero/i);
  });

  it("says plainly when a voice note did not contain the wake word", async () => {
    const t = lsetup("happy birthday to you");
    await t.bridge.poll();
    const all = t.logs.join("\n");
    expect(all).toMatch(/did not say the wake word, ignored/);
    expect(all).not.toMatch(/birthday/i);
  });

  it("says when voice notes are off, and when a note could not be transcribed it stays quiet here (the transcriber logs why)", async () => {
    const off = lsetup("airlock hi", false);
    await off.bridge.poll();
    expect(off.logs.join("\n")).toMatch(/voice notes are off/);
    const failed = lsetup(null);
    await failed.bridge.poll();
    expect(failed.logs.join("\n")).not.toMatch(/did not say the wake word/);
  });
});

describe("debug transcripts (opt-in)", () => {
  const voice: InboundMessage = { rowid: 2, handle: ME, text: "", audioPath: "/a/2.caf" };
  const run = async (debug: boolean | undefined, transcript: string) => {
    const logs: string[] = [];
    const bridge = createBridge({ sessionIdleMs: 0,
      source: { maxRowId: () => 0, since: (r) => (r < 2 ? [voice] : []) },
      cursor: { load: () => 1, save: () => {} },
      api: async () => ({ reply: "r", needsConfirm: false }),
      send: async () => {},
      allowlist: parseAllowlist("*"),
      log: (l) => logs.push(l),
      transcribe: async () => transcript,
      debugTranscripts: debug,
    });
    await bridge.poll();
    return logs.join("\n");
  };

  it("off by default: the words of an ignored note are never logged", async () => {
    expect(await run(undefined, "hey there send it")).not.toMatch(/there send/);
    expect(await run(false, "hey there send it")).not.toMatch(/there send/);
  });

  it("on: the transcript of an ignored note is printed so the misheard name can be seen", async () => {
    expect(await run(true, "hey there send it")).toMatch(/\[debug\] transcript was: "hey there send it"/);
  });

  it("on: a note that did say the wake word prints no transcript", async () => {
    expect(await run(true, "Hey Airlock help")).not.toMatch(/\[debug\]/);
  });
});

describe("misspelled name: voice notes are forgiving, typed texts are not", () => {
  function run(msg: InboundMessage, transcript: string) {
    const calls: string[] = [];
    const bridge = createBridge({ sessionIdleMs: 0,
      source: { maxRowId: () => 0, since: (r) => (r < 2 ? [msg] : []) },
      cursor: { load: () => 1, save: () => {} },
      api: async (_s, t, c) => { calls.push(`${c}:${t}`); return { reply: "r", needsConfirm: false }; },
      send: async () => {},
      allowlist: parseAllowlist("*"),
      transcribe: async () => transcript,
    });
    return { bridge, calls };
  }
  it("a voice note that heard 'Hey Erlak' is answered, as a voice message", async () => {
    const t = run({ rowid: 2, handle: ME, text: "", audioPath: "/a/2.caf" }, "Hey Erlak, send zero point zero one eth to weth dot demo");
    expect(await t.bridge.poll()).toBe(1);
    expect(t.calls).toEqual(["voice:send zero point zero one eth to weth dot demo"]);
  });
  it("a voice note that heard only 'Hey Erlak' gets the help reply", async () => {
    const t = run({ rowid: 2, handle: ME, text: "", audioPath: "/a/2.caf" }, "Hey Erlak.");
    expect(await t.bridge.poll()).toBe(1);
    expect(t.calls).toEqual(["voice:help"]);
  });
  it("a typed 'Hey Erlak' is not answered", async () => {
    const t = run({ rowid: 2, handle: ME, text: "Hey Erlak send 0.01 to a.eth" }, "");
    expect(await t.bridge.poll()).toBe(0);
  });
});

describe("sessions: Hey Airlock opens one, End Airlock closes it", () => {
  const S = 30 * 60_000;

  it("after Hey Airlock, later texts go to Airlock without the name", async () => {
    const t = setup({ messages: [m(2, ME, "Hey Airlock"), m(3, ME, "send 0.001 to vault.demo"), m(4, ME, "what does it do")], cursor: 1, sessionIdleMs: S });
    expect(await t.bridge.poll()).toBe(3);
    expect(t.api.mock.calls.map((c) => c[1])).toEqual(["help", "send 0.001 to vault.demo", "what does it do"]);
    expect(t.logs.join("\n")).toMatch(/session with \*\*\*0100 started/);
  });

  it("End Airlock closes it: nothing after that is read, and the sender is told", async () => {
    const t = setup({ messages: [m(2, ME, "Hey Airlock"), m(3, ME, "End Airlock"), m(4, ME, "send 0.001 to vault.demo"), m(5, ME, "lol")], cursor: 1, sessionIdleMs: S });
    await t.bridge.poll();
    expect(t.api.mock.calls.map((c) => c[1])).toEqual(["help"]); // "End Airlock" is not forwarded
    expect(t.send).toHaveBeenLastCalledWith(ME, expect.stringMatching(/session ended/i));
    expect(t.send).toHaveBeenCalledTimes(2); // the help reply and the goodbye; the later texts get nothing
  });

  it("works for other wordings and for a voice note's transcript", async () => {
    for (const end of ["end airlock", "Stop Airlock", "bye airlock", "Hey Airlock, end airlock"]) {
      const t = setup({ messages: [m(2, ME, "Hey Airlock"), m(3, ME, end), m(4, ME, "send 1 to a.eth")], cursor: 1, sessionIdleMs: S });
      await t.bridge.poll();
      expect(t.api).toHaveBeenCalledTimes(1);
    }
  });

  it("only the person who started it is in the session", async () => {
    const t = setup({ messages: [m(2, ME, "Hey Airlock"), m(3, STRANGER, "send 0.001 to vault.demo")], cursor: 1, sessionIdleMs: S });
    await t.bridge.poll();
    expect(t.api).toHaveBeenCalledTimes(1);
  });

  it("goes quiet after the idle timeout, and the next message needs the name again", async () => {
    const msgs = [m(2, ME, "Hey Airlock")];
    const t = setup({ messages: msgs, cursor: 1, sessionIdleMs: S });
    await t.bridge.poll();
    t.tick(S + 1);
    msgs.push(m(3, ME, "send 0.001 to vault.demo"));
    await t.bridge.poll();
    expect(t.api).toHaveBeenCalledTimes(1);
    expect(t.logs.join("\n")).toMatch(/timed out/);
  });

  it("each message in the session keeps it alive", async () => {
    const msgs = [m(2, ME, "Hey Airlock")];
    const t = setup({ messages: msgs, cursor: 1, sessionIdleMs: S });
    await t.bridge.poll();
    t.tick(S - 1000);
    msgs.push(m(3, ME, "hello"));
    await t.bridge.poll();
    t.tick(S - 1000);
    msgs.push(m(4, ME, "send 0.001 to vault.demo"));
    await t.bridge.poll();
    expect(t.api).toHaveBeenCalledTimes(3);
  });

  it("ending the session cancels an open confirmation", async () => {
    const t = setup({ messages: [m(2, ME, "Hey Airlock send 0.001 to vault.demo"), m(3, ME, "end airlock")], cursor: 1, sessionIdleMs: S, api: asks() });
    await t.bridge.poll();
    expect(t.api.mock.calls.map((c) => c[1])).toEqual(["send 0.001 to vault.demo", "no"]);
  });

  it("End Airlock without an open session does nothing", async () => {
    const t = setup({ messages: [m(2, ME, "end airlock")], cursor: 1, sessionIdleMs: S });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.send).not.toHaveBeenCalled();
  });
});
