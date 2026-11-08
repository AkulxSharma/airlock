import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/api/app.js";
import { createWalletsService } from "../src/demo/balances.js";

const targets = {
  "a.demo": { address: "0x1111111111111111111111111111111111111111", expected: "HIGH" as const, why: "x" },
  "b.demo": { address: "0x2222222222222222222222222222222222222222", expected: "LOW" as const, why: "y" },
};

describe("wallet balances for the GUI", () => {
  it("returns the agent wallet and every demo target with its balance in ETH", async () => {
    const read = vi.fn(async (a: string) => (a.startsWith("0x11") ? 1_500_000_000_000_000_000n : 0n));
    const snap = await createWalletsService({ read, targets, agentAddress: "0x3333333333333333333333333333333333333333" })();
    expect(snap.agent).toMatchObject({ name: "agent wallet", balanceEth: "0" });
    expect(snap.targets.map((t) => [t.name, t.balanceEth, t.expected])).toEqual([
      ["a.demo", "1.5", "HIGH"],
      ["b.demo", "0", "LOW"],
    ]);
  });

  it("one failing address shows as null and does not fail the list", async () => {
    const read = vi.fn(async (a: string) => {
      if (a.startsWith("0x11")) throw new Error("rpc down");
      return 1n;
    });
    const snap = await createWalletsService({ read, targets })();
    expect(snap.agent).toBeNull();
    expect(snap.targets[0].balanceEth).toBeNull();
    expect(snap.targets[1].balanceEth).not.toBeNull();
  });

  it("is cached for 15 seconds", async () => {
    const read = vi.fn(async () => 0n);
    let t = 1000;
    const svc = createWalletsService({ read, targets, now: () => t });
    await svc();
    await svc();
    expect(read).toHaveBeenCalledTimes(2); // two targets, read once
    t += 16_000;
    await svc();
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("GET /api/wallets serves it, is 404 when not configured, and keeps the origin check", async () => {
    const handle = async () => ({ reply: "", stages: [], needsConfirm: false });
    const bus = { publish() {}, subscribe: () => () => {} };
    const on = createApp({ handle, bus, allowedOrigins: ["http://localhost:3100"], wallets: async () => ({ ok: 1 }) });
    expect(await (await on.request("/api/wallets", { headers: { origin: "http://localhost:3100" } })).json()).toEqual({ ok: 1 });
    expect((await on.request("/api/wallets", { headers: { origin: "http://evil.example" } })).status).toBe(403);
    const off = createApp({ handle, bus, allowedOrigins: [] });
    expect((await off.request("/api/wallets")).status).toBe(404);
  });
});
