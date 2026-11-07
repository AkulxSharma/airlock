import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditAddress, auditTimeoutFromEnv, type ChainReader } from "../src/auditor/chain.js";
import { decide } from "../src/gate/decide.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.hex`, import.meta.url), "utf8").trim();

const ADDR = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const ZERO = "0x" + "00".repeat(32);
const NONZERO = "0x" + "00".repeat(12) + "ab".repeat(20);

const reader = (over: Partial<ChainReader> & { code?: string | undefined } = {}): ChainReader => ({
  getCode: over.getCode ?? (async () => ("code" in over ? over.code : fixture("clean"))),
  getStorageAt: over.getStorageAt ?? (async () => ZERO),
});

describe("auditAddress", () => {
  it("returns an AuditResult for plain code with empty proxy slots", async () => {
    const r = await auditAddress(ADDR, reader(), 1_000);
    expect("verdict" in r && r.verdict).toBe("LOW");
    expect("findings" in r && r.findings).toEqual([]);
  });

  it("treats no code (undefined from the RPC) as a normal wallet", async () => {
    const r = await auditAddress(ADDR, reader({ code: undefined }), 1_000);
    expect("findings" in r && r.findings.map((f) => f.id)).toEqual(["no-code"]);
  });

  it("adds upgradeable-proxy when the implementation slot is non-zero", async () => {
    const r = await auditAddress(
      ADDR,
      reader({ getStorageAt: async (_a, slot) => (slot.startsWith("0x3608") ? NONZERO : ZERO) }),
      1_000,
    );
    expect("findings" in r && r.findings.map((f) => f.id)).toContain("upgradeable-proxy");
    expect("verdict" in r && r.verdict).toBe("MEDIUM");
  });

  it("adds upgradeable-proxy when only the admin slot is non-zero", async () => {
    const r = await auditAddress(
      ADDR,
      reader({ getStorageAt: async (_a, slot) => (slot.startsWith("0xb531") ? NONZERO : ZERO) }),
      1_000,
    );
    expect("findings" in r && r.findings.map((f) => f.id)).toContain("upgradeable-proxy");
  });

  it("flags real SELFDESTRUCT code as HIGH", async () => {
    const r = await auditAddress(ADDR, reader({ code: fixture("selfdestruct-real") }), 1_000);
    expect("verdict" in r && r.verdict).toBe("HIGH");
  });

  it("returns an error object, not a crash, when the RPC throws", async () => {
    const r = await auditAddress(
      ADDR,
      reader({
        getCode: async () => {
          throw new Error("rpc unreachable");
        },
      }),
      1_000,
    );
    expect(r).toEqual({ error: "rpc unreachable" });
  });

  it("returns a timeout object when the RPC hangs", async () => {
    const r = await auditAddress(ADDR, reader({ getCode: () => new Promise(() => {}) }), 30);
    expect(r).toEqual({ timeout: true });
  });

  it("does not leak an unhandled rejection when the RPC fails after the timeout", async () => {
    const r = await auditAddress(
      ADDR,
      reader({
        getCode: () => new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 60)),
      }),
      20,
    );
    expect(r).toEqual({ timeout: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it("a failure or timeout is always refused by the gate, never approved", async () => {
    const failed = await auditAddress(
      ADDR,
      reader({
        getStorageAt: async () => {
          throw new Error("down");
        },
      }),
      1_000,
    );
    const hung = await auditAddress(ADDR, reader({ getCode: () => new Promise(() => {}) }), 20);
    expect(decide(failed).action).toBe("refuse");
    expect(decide(hung).action).toBe("refuse");
  });
});

describe("auditTimeoutFromEnv", () => {
  it("uses AUDIT_TIMEOUT_MS when valid, else 10 seconds", () => {
    expect(auditTimeoutFromEnv({ AUDIT_TIMEOUT_MS: "2500" })).toBe(2500);
    expect(auditTimeoutFromEnv({})).toBe(10_000);
    expect(auditTimeoutFromEnv({ AUDIT_TIMEOUT_MS: "abc" })).toBe(10_000);
    expect(auditTimeoutFromEnv({ AUDIT_TIMEOUT_MS: "-5" })).toBe(10_000);
  });
});
