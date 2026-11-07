import { describe, expect, it, vi } from "vitest";
import { createMessageHandler } from "../src/api/message.js";
import type { Agent } from "../src/agent/parse.js";
import { HELP_REPLY, createSmallTalk, loadSmallTalk, normalizeTalk } from "../src/agent/smalltalk.js";
import { createConfirmStore } from "../src/gate/confirm.js";
import type { MessageRequest } from "../src/types.js";

const GUI = "send 0.01 to vitalik.eth";
const data = loadSmallTalk();
const first = () => createSmallTalk(data, () => 0); // always the first variant, so tests are stable
const talk = (text: string, pending = false) => first()(text, GUI, pending);

describe("small talk: what gets a canned reply", () => {
  it.each([
    ["hi", /I'm Airlock/],
    ["Hello!", /Airlock/],
    ["hey", /Airlock/],
    ["Hi there", /Airlock/],
    ["good morning", /Airlock/],
    ["Assalamu alaikum", /Airlock/],
    ["how are you?", /doing great/],
    ["How's it going", /doing great/],
    ["what's up", /doing great/],
    ["what does it do?", /risk check/],
    ["what do you do", /risk check/],
    ["How does this work?", /risk check/],
    ["what is airlock", /risk check/],
    ["tell me about yourself", /risk check/],
    ["who are you", /I'm Airlock/],
    ["is it safe?", /risk signal, not a guarantee|can't promise/],
    ["Can I trust you", /can't promise/],
    ["is it legit", /can't promise/],
    ["do you use real money?", /test network/],
    ["is it free", /free to try/],
    ["how do I use this", /1\)/],
    ["thanks!", /welcome/],
    ["thank you so much", /welcome/],
    ["bye", /Goodbye/],
    ["see you later", /./], // "see you" is goodbye only as a whole message; this one is simply not small talk
  ])("%s", (text, pattern) => {
    const reply = talk(text);
    if (text === "see you later") { expect(reply).toBeNull(); return; }
    expect(reply).not.toBeNull();
    expect(reply).toMatch(pattern);
  });

  it("answers the greeting even when it is addressed to Airlock", () => {
    expect(talk("Hey Airlock, how are you?")).toMatch(/doing great/);
    expect(talk("airlock thanks")).toMatch(/welcome/);
    expect(talk("hi airlock")).toMatch(/I'm Airlock/);
    expect(talk("Hello there")).toMatch(/Airlock/);
  });

  it("help and an empty message use the channel's standard help text", () => {
    expect(talk("help")).toBe(HELP_REPLY);
    expect(talk("what can I say")).toBe(HELP_REPLY);
    expect(talk("")).toBe(HELP_REPLY);
    expect(talk("Hey Airlock")).toBe(HELP_REPLY);
  });

  it("normalizes the wake phrase and punctuation", () => {
    expect(normalizeTalk("Hey, Airlock! How are you?")).toBe("how are you");
    expect(normalizeTalk("AIRLOCK")).toBe("");
  });
});

describe("small talk: what it must never touch", () => {
  it.each([
    "send 0.01 to vitalik.eth",
    "yes",
    "no",
    "send 0.01 to thanks.eth",
    "hi 0.01",
    "hello 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "send to hello.eth",
    "what is the weather",
    "explain quantum physics",
    "show me the weather",
    "could you send a bit of eth to my friend",
  ])("%s", (text) => {
    expect(talk(text)).toBeNull();
  });
});

describe("small talk: a transfer is waiting", () => {
  it("'ok' is not a YES, and the reply says so instead of inviting a new request", () => {
    const r = talk("ok", true);
    expect(r).toMatch(/isn't a YES/);
    expect(r).toMatch(/nothing has been sent/);
    expect(r).not.toMatch(/Try/);
  });
  it("other small talk gets a reminder that a transfer is still waiting", () => {
    expect(talk("hi", true)).toMatch(/A transfer is still waiting for you: say YES to send or NO to cancel/);
    expect(talk("hi", false)).not.toMatch(/still waiting/);
  });
  it("'ok' with nothing waiting just invites a request", () => {
    expect(talk("ok", false)).toMatch(/Sounds good/);
  });
});

describe("small talk: the cache file itself", () => {
  const BANNED = /\b(safe|safely|secure|secured|trusted|trustworthy|legit|legitimate)\b/i;
  const replies = data.intents.flatMap((i) => [...i.replies, ...(i.repliesPending ?? [])]);

  it("is not empty and every intent has triggers and replies", () => {
    expect(data.intents.length).toBeGreaterThan(10);
    for (const i of data.intents) {
      expect(i.triggers.length, i.id).toBeGreaterThan(0);
      expect(i.replies.length, i.id).toBeGreaterThan(0);
    }
  });
  it("no reply calls anything safe, secure or trusted (Airlock gives a risk signal, not a guarantee)", () => {
    for (const r of [...replies, data.pendingNote ?? ""]) expect(r).not.toMatch(BANNED);
  });
  it("replies are short enough to read or hear, and never promise anything", () => {
    for (const r of replies) {
      expect(r.length).toBeLessThanOrEqual(520);
      expect(r).not.toMatch(/\bguarantee(d)?\b(?<!not a guarantee)/i);
    }
  });
  it("every reply that is not a goodbye or a help marker invites the person to try, or tells them what to say", () => {
    for (const i of data.intents) {
      if (["goodbye", "help", "empty"].includes(i.id)) continue;
      for (const r of [...i.replies, ...(i.repliesPending ?? [])]) {
        expect(r, `${i.id}: ${r}`).toMatch(/\{try\}|YES|NO to cancel|“\{try\}”/);
      }
    }
  });
  it("the first intent that matches wins, so specific questions come before greetings", () => {
    const ids = data.intents.map((i) => i.id);
    expect(ids.indexOf("how-are-you")).toBeLessThan(ids.indexOf("greeting"));
    expect(ids.indexOf("what-is-it")).toBeLessThan(ids.indexOf("greeting"));
    expect(ids.indexOf("safety-question")).toBeLessThan(ids.indexOf("what-is-it"));
  });
  it("rotates through the variants of a reply", () => {
    const rotating = createSmallTalk(data);
    const seen = new Set([rotating("hi", GUI), rotating("hi", GUI), rotating("hi", GUI)]);
    expect(seen.size).toBe(3);
  });
});

describe("small talk inside the message handler: no model call, per-channel example", () => {
  function handler() {
    const agent: Agent = { handle: vi.fn(async () => ({ kind: "help" as const })) };
    const handle = createMessageHandler({
      resolve: async () => ({ error: "unused" }),
      audit: async () => ({ error: "unused" }),
      store: createConfirmStore(),
      wallet: null,
      now: () => 1,
      maxTransferEth: "0.01",
      publish: () => {},
      agent,
      smallTalk: first(),
    });
    const say = (text: string, channel: MessageRequest["channel"] = "gui", sessionId = "s1") => handle({ sessionId, channel, text });
    return { agent, say };
  }

  it("a greeting is answered without asking the agent (so Gemini is never called)", async () => {
    const { agent, say } = handler();
    const r = await say("hi");
    expect(r.reply).toMatch(/I'm Airlock/);
    expect(r.reply).toContain("send 0.01 to vitalik.eth");
    expect(r.needsConfirm).toBe(false);
    expect(r.stages).toEqual([]);
    expect(agent.handle).not.toHaveBeenCalled();
  });

  it("texting and voice are told to say the name in the example", async () => {
    const { say } = handler();
    for (const channel of ["imessage", "voice"] as const) {
      const r = await say("how are you", channel);
      expect(r.reply).toContain("Airlock send 0.01 to vitalik.eth");
    }
  });

  it("a real request still goes to the agent", async () => {
    const { agent, say } = handler();
    await say("send 0.01 to vitalik.eth");
    await say("yes");
    expect(agent.handle).toHaveBeenCalledTimes(2);
  });

  it("an unknown message still goes to the agent (the model or the help text handles it)", async () => {
    const { agent, say } = handler();
    const r = await say("what is the weather");
    expect(agent.handle).toHaveBeenCalledTimes(1);
    expect(r.reply).toMatch(/Try: send 0\.01 to vitalik\.eth/); // the standard help text
  });

  it("help still returns the standard help text for each channel", async () => {
    const { say } = handler();
    expect((await say("help", "gui")).reply).toMatch(/I check a crypto address/);
    expect((await say("help", "imessage")).reply).toMatch(/Text me: Airlock send/);
  });
});
