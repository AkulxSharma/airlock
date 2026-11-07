import { describe, expect, it, vi } from "vitest";
import { createMessageHandler, type MessageDeps } from "../src/api/message.js";
import type { LiveAuditOutcome } from "../src/auditor/chain.js";
import { createConfirmStore } from "../src/gate/confirm.js";
import type { AuditResult, MessageRequest, Stage } from "../src/types.js";
import type { WalletLike } from "../src/wallet/send.js";

const ADDR = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const ADDR2 = "0x1111111111111111111111111111111111111111";
const HASH = ("0x" + "cd".repeat(32)) as `0x${string}`;

const audit = (verdict: AuditResult["verdict"], findings: AuditResult["findings"] = []): AuditResult => ({
  target: ADDR,
  chainId: 11155111,
  verdict,
  riskScore: verdict === "HIGH" ? 80 : verdict === "MEDIUM" ? 40 : 0,
  findings,
});
const SELFDESTRUCT = {
  id: "selfdestruct",
  severity: "high" as const,
  message: "Contract code contains SELFDESTRUCT, which can erase the contract and send out its funds.",
};

function setup(over: Partial<MessageDeps> & { outcome?: LiveAuditOutcome; chainId?: number } = {}) {
  const sendTransaction = vi.fn(async () => HASH);
  const wallet: WalletLike = { getChainId: async () => over.chainId ?? 11155111, sendTransaction };
  const resolve = vi.fn(async (input: string) =>
    input === "nobody.eth" ? { error: "No address is registered for nobody.eth." } : { address: ADDR as `0x${string}` },
  );
  const auditFn = vi.fn(async () => over.outcome ?? audit("LOW"));
  const published: Array<[string, Stage]> = [];
  const clock = { t: 1_000_000 };
  const store = createConfirmStore();
  const handle = createMessageHandler({
    resolve,
    audit: auditFn,
    store,
    wallet,
    now: () => clock.t,
    maxTransferEth: "0.01",
    ttlMs: 60_000,
    publish: (s, stage) => published.push([s, stage]),
    newId: (() => {
      let n = 0;
      return () => `t${++n}`;
    })(),
    ...over,
  });
  const say = (text: string, sessionId = "s1", channel: MessageRequest["channel"] = "gui") =>
    handle({ sessionId, channel, text });
  return { say, sendTransaction, resolve, auditFn, published, clock, store };
}

const replies: string[] = [];
const track = async (p: ReturnType<ReturnType<typeof setup>["say"]>) => {
  const r = await p;
  replies.push(r.reply);
  return r;
};

describe("send flow", () => {
  it("LOW verdict asks for confirmation and shows the full address and amount", async () => {
    const t = setup();
    const r = await track(t.say("send 0.01 to vitalik.eth"));
    expect(r.needsConfirm).toBe(true);
    expect(r.reply).toContain(ADDR);
    expect(r.reply).toContain("0.01");
    expect(r.reply).toMatch(/risk signal, not a guarantee/i);
    expect(t.sendTransaction).not.toHaveBeenCalled();
  });

  it("reports all four stages, and publishes them as they happen", async () => {
    const t = setup();
    const r = await track(t.say("send 0.01 to vitalik.eth"));
    expect(r.stages.map((s) => s.name).sort()).toEqual(["address", "bytecode", "gate", "source"]);
    expect(t.published.map(([, s]) => s.name)).toEqual(["address", "address", "bytecode", "bytecode", "source", "gate"]);
    expect(t.published.every(([session]) => session === "s1")).toBe(true);
  });

  it("YES within the window sends once and replies with the transaction link", async () => {
    const t = setup();
    await track(t.say("send 0.005 to vitalik.eth"));
    const r = await track(t.say("YES"));
    expect(t.sendTransaction).toHaveBeenCalledTimes(1);
    expect(t.sendTransaction).toHaveBeenCalledWith({ to: ADDR, value: 5_000_000_000_000_000n });
    expect(r.reply).toContain(`https://sepolia.etherscan.io/tx/${HASH}`);
    expect(r.needsConfirm).toBe(false);
  });

  it("a second YES does nothing", async () => {
    const t = setup();
    await track(t.say("send 0.005 to vitalik.eth"));
    await track(t.say("yes"));
    const r = await track(t.say("yes"));
    expect(r.reply).toMatch(/nothing is waiting/i);
    expect(t.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("YES after expiry sends nothing", async () => {
    const t = setup();
    await track(t.say("send 0.005 to vitalik.eth"));
    t.clock.t += 61_000;
    const r = await track(t.say("yes"));
    expect(r.reply).toMatch(/expired/i);
    expect(t.sendTransaction).not.toHaveBeenCalled();
  });

  it("YES from a different session sends nothing", async () => {
    const t = setup();
    await track(t.say("send 0.005 to vitalik.eth", "alice"));
    const r = await track(t.say("yes", "bob"));
    expect(r.reply).toMatch(/nothing is waiting/i);
    expect(t.sendTransaction).not.toHaveBeenCalled();
  });

  it("NO cancels, and a later YES sends nothing", async () => {
    const t = setup();
    await track(t.say("send 0.005 to vitalik.eth"));
    await track(t.say("no"));
    const r = await track(t.say("yes"));
    expect(r.reply).toMatch(/nothing is waiting/i);
    expect(t.sendTransaction).not.toHaveBeenCalled();
  });

  it("a newer request replaces the older pending one", async () => {
    const t = setup();
    await track(t.say("send 0.001 to vitalik.eth"));
    await track(t.say("send 0.002 to vitalik.eth"));
    await track(t.say("yes"));
    expect(t.sendTransaction).toHaveBeenCalledTimes(1);
    expect(t.sendTransaction).toHaveBeenCalledWith({ to: ADDR, value: 2_000_000_000_000_000n });
  });

  it("YES with nothing pending sends nothing", async () => {
    const t = setup();
    const r = await track(t.say("yes"));
    expect(r.reply).toMatch(/nothing is waiting/i);
    expect(t.sendTransaction).not.toHaveBeenCalled();
  });

  it("with no wallet configured, YES sends nothing and keeps the request", async () => {
    const t = setup({ wallet: null });
    await track(t.say("send 0.005 to vitalik.eth"));
    const r = await track(t.say("yes"));
    expect(r.reply).toMatch(/not set up/i);
    expect(t.store.peek("s1")).toBeDefined();
  });

  it("reports a wallet failure without claiming a send", async () => {
    const t = setup({ chainId: 1 });
    await track(t.say("send 0.005 to vitalik.eth"));
    const r = await track(t.say("yes"));
    expect(r.reply).toMatch(/not Sepolia/);
    expect(r.reply).not.toContain("etherscan");
    expect(t.sendTransaction).not.toHaveBeenCalled();
  });
});

describe("refusals (the gate decides, never the model)", () => {
  it("HIGH is refused, shows findings, and leaves nothing to confirm", async () => {
    const t = setup({ outcome: audit("HIGH", [SELFDESTRUCT]) });
    const r = await track(t.say("send 0.005 to vitalik.eth"));
    expect(r.needsConfirm).toBe(false);
    expect(r.reply).toMatch(/^Refused/);
    expect(r.reply).toContain("SELFDESTRUCT");
    const y = await track(t.say("yes"));
    expect(y.reply).toMatch(/nothing is waiting/i);
    expect(t.sendTransaction).not.toHaveBeenCalled();
  });

  it("an audit error is refused", async () => {
    const t = setup({ outcome: { error: "rpc down" } });
    const r = await track(t.say("send 0.005 to vitalik.eth"));
    expect(r.needsConfirm).toBe(false);
    expect(r.reply).toMatch(/^Refused/);
    expect(t.store.peek("s1")).toBeUndefined();
  });

  it("an audit timeout is refused", async () => {
    const t = setup({ outcome: { timeout: true } });
    const r = await track(t.say("send 0.005 to vitalik.eth"));
    expect(r.needsConfirm).toBe(false);
    expect(r.reply).toMatch(/timed out/i);
  });

  it("an unresolvable name is refused before any audit", async () => {
    const t = setup();
    const r = await track(t.say("send 0.005 to nobody.eth"));
    expect(r.reply).toMatch(/^Refused/);
    expect(t.auditFn).not.toHaveBeenCalled();
  });

  it("an amount over the cap is refused before resolving or auditing", async () => {
    const t = setup();
    const r = await track(t.say("send 0.5 to vitalik.eth"));
    expect(r.reply).toMatch(/cap is 0\.01/);
    expect(t.resolve).not.toHaveBeenCalled();
    expect(t.auditFn).not.toHaveBeenCalled();
  });

  it("a zero amount is refused", async () => {
    const t = setup();
    const r = await track(t.say("send 0 to vitalik.eth"));
    expect(r.reply).toMatch(/not valid/i);
    expect(t.resolve).not.toHaveBeenCalled();
  });
});

describe("voice channel", () => {
  it("refuses a transcript that contains an address and uses nothing from it", async () => {
    const t = setup();
    const r = await track(t.say("send 0.005 to 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "s1", "voice"));
    expect(r.reply).toMatch(/can't take an address by voice/i);
    expect(r.needsConfirm).toBe(false);
    expect(t.resolve).not.toHaveBeenCalled();
    expect(t.store.peek("s1")).toBeUndefined();
  });

  it("understands a spoken amount and ENS name", async () => {
    const t = setup();
    const r = await track(t.say("send zero point zero one ETH to vitalik dot eth", "s1", "voice"));
    expect(r.needsConfirm).toBe(true);
    expect(t.resolve).toHaveBeenCalledWith("vitalik.eth");
    expect(r.reply).toContain("0.01");
  });

  it("accepts a spoken yes", async () => {
    const t = setup();
    await track(t.say("send zero point zero zero five ETH to vitalik dot eth", "s1", "voice"));
    await track(t.say("yes", "s1", "voice"));
    expect(t.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("a voice transcript with an address does not cancel a pending typed request", async () => {
    const t = setup();
    await track(t.say("send 0.005 to vitalik.eth", "s1", "gui"));
    await track(t.say("send 0.005 to 0xabcdef0123456789", "s1", "voice"));
    expect(t.store.peek("s1")).toBeDefined();
  });
});

describe("wording", () => {
  it("help text for unknown input", async () => {
    const t = setup();
    const r = await track(t.say("what's the weather"));
    expect(r.reply).toMatch(/send 0\.01 to vitalik\.eth/);
  });

  it("no reply ever calls anything safe, secure or trusted", () => {
    expect(replies.length).toBeGreaterThan(10);
    for (const reply of replies) expect(reply).not.toMatch(/\b(safe|secure|trusted)\b/i);
  });

  it("a second session pending transfer to another address is independent", async () => {
    const t = setup({
      resolve: async (input: string) => ({ address: (input === "bob.eth" ? ADDR2 : ADDR) as `0x${string}` }),
    });
    await track(t.say("send 0.001 to alice.eth", "a"));
    await track(t.say("send 0.002 to bob.eth", "b"));
    await track(t.say("yes", "b"));
    expect(t.sendTransaction).toHaveBeenCalledTimes(1);
    expect(t.sendTransaction).toHaveBeenCalledWith({ to: ADDR2, value: 2_000_000_000_000_000n });
    expect(t.store.peek("a")).toBeDefined();
  });
});
