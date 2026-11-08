import { describe, expect, it } from "vitest";
import { resolveTarget, type EnsClient } from "../src/api/resolve.js";
import { loadDemoAliases, loadDemoTargets } from "../src/demo/aliases.js";
import { isAddress } from "viem";

const ensNeverCalled: EnsClient = {
  getEnsAddress: async () => {
    throw new Error("ENS must not be used for .demo names");
  },
};

describe("demo-targets.json", () => {
  const targets = loadDemoTargets();

  it("lists the ten targets with valid checksummed addresses and an expected verdict", () => {
    expect(Object.keys(targets).sort()).toEqual([
      "clean.demo", "clone.demo", "drainer.demo", "honeypot.demo", "proxy.demo",
      "reentrancy.demo", "rugvault.demo", "selfkill.demo", "vault.demo", "weth.demo",
    ]);
    for (const t of Object.values(targets)) {
      expect(isAddress(t.address, { strict: true })).toBe(true);
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(t.expected);
    }
  });

  it("expects HIGH for the drainer, LOW for the verified WETH, MEDIUM for the unverified or proxy ones", () => {
    expect(targets["drainer.demo"].expected).toBe("HIGH");
    expect(targets["clean.demo"].expected).toBe("MEDIUM"); // plain code, but no verified source
    expect(targets["weth.demo"].expected).toBe("LOW");
    expect(targets["proxy.demo"].expected).toBe("MEDIUM");
    expect(targets["clone.demo"].expected).toBe("MEDIUM");
  });

  it("has no duplicate addresses", () => {
    const addrs = Object.values(targets).map((t) => t.address.toLowerCase());
    expect(new Set(addrs).size).toBe(addrs.length);
  });
});

describe("resolving .demo names", () => {
  const aliases = loadDemoAliases();

  it("resolves a known demo name without touching ENS", async () => {
    const r = await resolveTarget("drainer.demo", ensNeverCalled, aliases);
    expect(r).toEqual({ address: loadDemoTargets()["drainer.demo"].address });
  });

  it("is case-insensitive", async () => {
    expect("address" in (await resolveTarget("Drainer.DEMO", ensNeverCalled, aliases))).toBe(true);
  });

  it("returns an error for an unknown demo name", async () => {
    expect("error" in (await resolveTarget("nothing.demo", ensNeverCalled, aliases))).toBe(true);
  });

  it("returns an error when no aliases are loaded", async () => {
    expect("error" in (await resolveTarget("drainer.demo", ensNeverCalled))).toBe(true);
  });

  it("never lets a .demo alias answer for a .eth name", async () => {
    const ens: EnsClient = { getEnsAddress: async () => null };
    expect("error" in (await resolveTarget("drainer.eth", ens, aliases))).toBe(true);
  });
});
