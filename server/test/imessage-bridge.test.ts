import { describe, expect, it, vi } from "vitest";
import { createBridge, type CursorStore, type InboundMessage, type MessageSource } from "../src/imessage/bridge.js";
import { parseAllowlist } from "../src/imessage/text.js";

const ME = "+17165550100";
const STRANGER = "+19998887777";

function setup(opts: { messages?: InboundMessage[]; cursor?: number | null; allow?: string; api?: (s: string, t: string) => Promise<string>; send?: (h: string, t: string) => Promise<void>; max?: number } = {}) {
  const messages = opts.messages ?? [];
  let saved: number | null = opts.cursor === undefined ? null : opts.cursor;
  const cursor: CursorStore = { load: () => saved, save: (n) => { saved = n; } };
  const source: MessageSource = {
    maxRowId: () => Math.max(0, ...messages.map((m) => m.rowid)),
    since: (r) => messages.filter((m) => m.rowid > r),
  };
  const api = vi.fn(opts.api ?? (async (_s: string, t: string) => `reply to: ${t}`));
  const send = vi.fn(opts.send ?? (async () => {}));
  let t = 1_000_000;
  const logs: string[] = [];
  const bridge = createBridge({
    source, cursor, api, send,
    allowlist: parseAllowlist(opts.allow ?? ME),
    now: () => t,
    log: (l) => logs.push(l),
    maxPerMinute: opts.max,
  });
  return { bridge, api, send, getCursor: () => saved, tick: (ms: number) => { t += ms; }, logs, messages };
}
const m = (rowid: number, handle: string, text: string): InboundMessage => ({ rowid, handle, text });

describe("first run and restarts", () => {
  it("first run starts after the newest message and replies to nothing old", async () => {
    const t = setup({ messages: [m(1, ME, "send 0.01 to a.eth"), m(2, ME, "yes")] });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).not.toHaveBeenCalled();
    expect(t.getCursor()).toBe(2);
  });

  it("a restart with a saved cursor does not replay handled messages", async () => {
    const t = setup({ messages: [m(5, ME, "hello")], cursor: 4 });
    expect(await t.bridge.poll()).toBe(1);
    const t2 = setup({ messages: [m(5, ME, "hello")], cursor: t.getCursor() });
    expect(await t2.bridge.poll()).toBe(0);
    expect(t2.send).not.toHaveBeenCalled();
  });

  it("handles only messages newer than the cursor, oldest first", async () => {
    const t = setup({ messages: [m(3, ME, "one"), m(4, ME, "two"), m(5, ME, "three")], cursor: 3 });
    await t.bridge.poll();
    expect(t.api.mock.calls.map((c) => c[1])).toEqual(["two", "three"]);
  });
});

describe("who gets a reply", () => {
  it("an allowlisted sender gets a reply through the same API as the GUI", async () => {
    const t = setup({ messages: [m(2, ME, "send 0.01 to vitalik.eth")], cursor: 1 });
    expect(await t.bridge.poll()).toBe(1);
    expect(t.api).toHaveBeenCalledWith(`imessage:${ME}`, "send 0.01 to vitalik.eth");
    expect(t.send).toHaveBeenCalledWith(ME, "reply to: send 0.01 to vitalik.eth");
  });

  it("a sender who is not on the allowlist is ignored and never reaches the API", async () => {
    const t = setup({ messages: [m(2, STRANGER, "send 0.01 to vitalik.eth")], cursor: 1 });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).not.toHaveBeenCalled();
    expect(t.send).not.toHaveBeenCalled();
    expect(t.getCursor()).toBe(2); // still moves past it
  });

  it("the log never contains a full number or the message text", async () => {
    const t = setup({ messages: [m(2, STRANGER, "secret words"), m(3, ME, "hello")], cursor: 1 });
    await t.bridge.poll();
    const all = t.logs.join("\n");
    expect(all).not.toContain("secret words");
    expect(all).not.toContain("hello");
    expect(all).not.toContain(STRANGER);
    expect(all).not.toContain(ME);
  });

  it("a different allowlisted sender gets their own session", async () => {
    const t = setup({ allow: `${ME},${STRANGER}`, messages: [m(2, ME, "a"), m(3, STRANGER, "b")], cursor: 1 });
    await t.bridge.poll();
    expect(t.api.mock.calls.map((c) => c[0])).toEqual([`imessage:${ME}`, `imessage:${STRANGER}`]);
  });

  it("skips empty messages (attachments, reactions with no text)", async () => {
    const t = setup({ messages: [m(2, ME, "")], cursor: 1 });
    expect(await t.bridge.poll()).toBe(0);
    expect(t.api).not.toHaveBeenCalled();
  });
});

describe("failures and loops", () => {
  it("when the server is down, the sender gets a short unavailable notice, not silence or a crash", async () => {
    const t = setup({ messages: [m(2, ME, "yes")], cursor: 1, api: async () => { throw new Error("ECONNREFUSED"); } });
    expect(await t.bridge.poll()).toBe(1);
    expect(t.send.mock.calls[0][1]).toMatch(/not available right now/i);
    expect(t.send.mock.calls[0][1]).toMatch(/nothing was sent/i);
  });

  it("a failing send does not stop the next message or replay this one", async () => {
    let n = 0;
    const t = setup({ messages: [m(2, ME, "one"), m(3, ME, "two")], cursor: 1, send: async () => { if (++n === 1) throw new Error("osascript failed"); } });
    expect(await t.bridge.poll()).toBe(1);
    expect(t.getCursor()).toBe(3);
    expect(await t.bridge.poll()).toBe(0);
  });

  it("ignores a message that is just one of our own replies echoed back", async () => {
    const t = setup({ messages: [m(2, ME, "hello")], cursor: 1 });
    await t.bridge.poll();
    const reply = t.send.mock.calls[0][1];
    const t2 = setup({ messages: [m(2, ME, "hello")], cursor: 1 });
    await t2.bridge.poll();
    t2.messages.push(m(3, ME, t2.send.mock.calls[0][1]));
    expect(await t2.bridge.poll()).toBe(0);
    expect(reply).toBe(t2.send.mock.calls[0][1]);
    expect(t2.api).toHaveBeenCalledTimes(1);
  });

  it("rate limits one sender and recovers after a minute", async () => {
    const msgs = Array.from({ length: 5 }, (_, i) => m(i + 2, ME, `msg ${i}`));
    const t = setup({ messages: msgs, cursor: 1, max: 3 });
    expect(await t.bridge.poll()).toBe(3);
    t.tick(61_000);
    t.messages.push(m(10, ME, "later"));
    expect(await t.bridge.poll()).toBe(1);
  });

  it("a rate-limited sender does not block other senders", async () => {
    const msgs = [m(2, ME, "a"), m(3, ME, "b"), m(4, STRANGER, "c")];
    const t = setup({ allow: `${ME},${STRANGER}`, messages: msgs, cursor: 1, max: 1 });
    expect(await t.bridge.poll()).toBe(2);
  });
});
