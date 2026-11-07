import { describe, expect, it } from "vitest";
import { createConfirmStore, DEFAULT_TTL_MS } from "../src/gate/confirm.js";
import { decide } from "../src/gate/decide.js";
import type { AuditResult } from "../src/types.js";

const audit = (verdict: AuditResult["verdict"]): AuditResult => ({
  target: "0x0000000000000000000000000000000000000001",
  chainId: 11155111,
  verdict,
  riskScore: verdict === "HIGH" ? 80 : verdict === "MEDIUM" ? 40 : 0,
  findings: [],
});

describe("decide (risk gate)", () => {
  it("verdict HIGH refuses", () => {
    expect(decide(audit("HIGH")).action).toBe("refuse");
  });

  it("verdict MEDIUM asks for confirmation", () => {
    expect(decide(audit("MEDIUM")).action).toBe("confirm");
  });

  it("verdict LOW asks for confirmation", () => {
    expect(decide(audit("LOW")).action).toBe("confirm");
  });

  it("an error object refuses", () => {
    expect(decide({ error: "rpc failed" }).action).toBe("refuse");
  });

  it("a timeout object refuses", () => {
    expect(decide({ timeout: true }).action).toBe("refuse");
  });

  it("a malformed object refuses", () => {
    expect(decide({ verdict: "LOW" }).action).toBe("refuse");
    expect(decide({ ...audit("LOW"), verdict: "SAFE" }).action).toBe("refuse");
    expect(decide({ ...audit("LOW"), riskScore: 500 }).action).toBe("refuse");
  });

  it("null, undefined and non-objects refuse", () => {
    for (const bad of [null, undefined, "LOW", 0, true, []]) {
      expect(decide(bad).action).toBe("refuse");
    }
  });

  it("a result that carries both a LOW verdict and an error still refuses", () => {
    expect(decide({ ...audit("LOW"), error: "late failure" }).action).toBe("refuse");
    expect(decide({ ...audit("LOW"), timeout: true }).action).toBe("refuse");
  });

  it("never uses the words safe, secure or trusted in a reason", () => {
    const inputs: unknown[] = [audit("HIGH"), audit("MEDIUM"), audit("LOW"), { error: "x" }, { timeout: true }, null];
    for (const input of inputs) {
      expect(decide(input).reason).not.toMatch(/\b(safe|secure|trusted)\b/i);
    }
  });

  it("says it is a risk signal, not a guarantee, when asking for confirmation", () => {
    expect(decide(audit("LOW")).reason).toMatch(/risk signal, not a guarantee/i);
  });
});

describe("confirm store", () => {
  const transfer = { id: "t1", to: "0x0000000000000000000000000000000000000002", amountEth: "0.01" };
  const T0 = 1_000_000;

  it("accepts YES within the TTL, same session and id", () => {
    const store = createConfirmStore();
    store.create("s1", transfer, T0);
    const r = store.consume("s1", "t1", T0 + 1_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transfer.to).toBe(transfer.to);
  });

  it("accepts YES only once", () => {
    const store = createConfirmStore();
    store.create("s1", transfer, T0);
    expect(store.consume("s1", "t1", T0 + 1_000).ok).toBe(true);
    expect(store.consume("s1", "t1", T0 + 2_000)).toEqual({ ok: false, reason: "none" });
  });

  it("rejects YES after the TTL and clears the pending transfer", () => {
    const store = createConfirmStore();
    store.create("s1", transfer, T0);
    expect(store.consume("s1", "t1", T0 + DEFAULT_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
    expect(store.peek("s1")).toBeUndefined();
  });

  it("rejects YES exactly at the expiry moment", () => {
    const store = createConfirmStore();
    store.create("s1", transfer, T0);
    expect(store.consume("s1", "t1", T0 + DEFAULT_TTL_MS).ok).toBe(false);
  });

  it("rejects YES from a different session", () => {
    const store = createConfirmStore();
    store.create("s1", transfer, T0);
    expect(store.consume("s2", "t1", T0 + 1_000)).toEqual({ ok: false, reason: "none" });
    expect(store.peek("s1")).toBeDefined();
  });

  it("rejects YES with a different transfer id and keeps the pending transfer", () => {
    const store = createConfirmStore();
    store.create("s1", transfer, T0);
    expect(store.consume("s1", "other", T0 + 1_000)).toEqual({ ok: false, reason: "wrong-id" });
    expect(store.consume("s1", "t1", T0 + 2_000).ok).toBe(true);
  });

  it("a new request replaces the older pending transfer", () => {
    const store = createConfirmStore();
    store.create("s1", transfer, T0);
    store.create("s1", { ...transfer, id: "t2" }, T0 + 1_000);
    expect(store.consume("s1", "t1", T0 + 2_000).ok).toBe(false);
    expect(store.consume("s1", "t2", T0 + 2_000).ok).toBe(true);
  });

  it("NO (cancel) clears the pending transfer", () => {
    const store = createConfirmStore();
    store.create("s1", transfer, T0);
    store.cancel("s1");
    expect(store.consume("s1", "t1", T0 + 1_000)).toEqual({ ok: false, reason: "none" });
  });

  it("respects a custom TTL", () => {
    const store = createConfirmStore();
    store.create("s1", transfer, T0, 5_000);
    expect(store.consume("s1", "t1", T0 + 5_001).ok).toBe(false);
  });

  it("with nothing pending, YES is rejected", () => {
    expect(createConfirmStore().consume("s1", "t1", T0)).toEqual({ ok: false, reason: "none" });
  });
});

describe("decide: chain and target", () => {
  const T = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
  const forTarget = (over: Partial<AuditResult> = {}): AuditResult => ({ ...audit("LOW"), target: T, ...over });

  it("refuses a result for any chain other than Sepolia", () => {
    for (const chainId of [1, 10, 137, 8453, 0, 11155112]) {
      const d = decide(forTarget({ chainId }));
      expect(d.action).toBe("refuse");
      expect(d.reason).toMatch(/Sepolia/);
    }
  });

  it("refuses when the audit is for a different address than the one requested", () => {
    const d = decide(forTarget(), { target: "0x1111111111111111111111111111111111111111" });
    expect(d.action).toBe("refuse");
    expect(d.reason).toMatch(/different address/);
  });

  it("accepts the requested address in any letter case", () => {
    expect(decide(forTarget(), { target: T }).action).toBe("confirm");
    expect(decide(forTarget(), { target: T.toLowerCase() }).action).toBe("confirm");
    expect(decide(forTarget({ target: T.toLowerCase() }), { target: T.toUpperCase().replace("0X", "0x") }).action).toBe("confirm");
  });

  it("without an expected target only the chain is checked", () => {
    expect(decide(forTarget()).action).toBe("confirm");
  });

  it("a wrong chain or target refuses even when the verdict is LOW, and HIGH still refuses", () => {
    expect(decide(forTarget({ verdict: "LOW", riskScore: 0, chainId: 1 }), { target: T }).action).toBe("refuse");
    expect(decide(forTarget({ verdict: "HIGH", riskScore: 80 }), { target: T }).action).toBe("refuse");
  });

  it("errors, timeouts and malformed input still refuse when a target is given", () => {
    expect(decide({ error: "x" }, { target: T }).action).toBe("refuse");
    expect(decide({ timeout: true }, { target: T }).action).toBe("refuse");
    expect(decide(null, { target: T }).action).toBe("refuse");
  });

  it("no reason uses safe, secure or trusted", () => {
    for (const d of [decide(forTarget({ chainId: 1 })), decide(forTarget(), { target: "0x1111111111111111111111111111111111111111" })]) {
      expect(d.reason).not.toMatch(/\b(safe|secure|trusted)\b/i);
    }
  });
});
