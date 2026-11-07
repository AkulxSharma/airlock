import { describe, expect, it } from "vitest";
import { auditBytecode } from "../src/auditor/index.js";
import { checkUpgradeableProxy } from "../src/auditor/checks.js";
import {
  cleanInit,
  cleanRuntime,
  cloneInit,
  cloneRuntime,
  drainerInit,
  drainerRuntime,
  proxyInit,
  proxyRuntime,
} from "../src/demo/bytecode.js";

const IMPL = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
const T = "0x0000000000000000000000000000000000000001";
const audit = (runtime: string, extra = []) => auditBytecode("0x" + runtime, T, 11155111, extra);
const ids = (r: ReturnType<typeof audit>) => r.findings.map((f) => f.id);

describe("demo target bytecode audits as intended", () => {
  it("drainer is HIGH because of selfdestruct, with nothing else flagged", () => {
    const r = audit(drainerRuntime);
    expect(r.verdict).toBe("HIGH");
    expect(ids(r)).toEqual(["selfdestruct"]);
  });

  it("clean contract is LOW with no findings", () => {
    const r = audit(cleanRuntime);
    expect(r.verdict).toBe("LOW");
    expect(r.findings).toEqual([]);
  });

  it("proxy runtime has delegatecall, and with a stored implementation it is MEDIUM", () => {
    const proxy = checkUpgradeableProxy(["0x" + "00".repeat(12) + "ab".repeat(20)]);
    const r = audit(proxyRuntime, proxy ? [proxy] : []);
    expect(ids(r).sort()).toEqual(["delegatecall", "upgradeable-proxy"]);
    expect(r.verdict).toBe("MEDIUM");
  });

  it("clone is flagged as a minimal proxy and MEDIUM", () => {
    const r = audit(cloneRuntime(IMPL));
    expect(ids(r)).toEqual(["minimal-proxy"]);
    expect(r.verdict).toBe("MEDIUM");
  });
});

describe("hand-assembled layout", () => {
  it("proxy runtime is 67 bytes and its jump target is a JUMPDEST", () => {
    expect(proxyRuntime.length / 2).toBe(67);
    const target = parseInt(proxyRuntime.slice(56 * 2 + 2, 56 * 2 + 4), 16); // PUSH1 operand before JUMPI
    expect(target).toBe(0x3e);
    expect(proxyRuntime.slice(target * 2, target * 2 + 2)).toBe("5b");
    expect(proxyRuntime.slice(57 * 2, 57 * 2 + 2)).toBe("57");
  });

  it("clone runtime is the 45-byte EIP-1167 layout", () => {
    expect(cloneRuntime(IMPL).length / 2).toBe(45);
  });

  it("every init code ends with its runtime and returns it from the right offset", () => {
    const cases: Array<[string, string, number]> = [
      [drainerInit(), drainerRuntime, 12],
      [cleanInit(), cleanRuntime, 12],
      [proxyInit(IMPL), proxyRuntime, 55 + 12],
    ];
    for (const [init, runtime, offset] of cases) {
      const hex = init.slice(2);
      expect(hex.endsWith(runtime)).toBe(true);
      expect(hex.length / 2 - runtime.length / 2).toBe(offset); // runtime starts at the CODECOPY offset
    }
    expect(cloneInit(IMPL).endsWith(cloneRuntime(IMPL))).toBe(true);
  });

  it("proxy init stores the implementation address", () => {
    expect(proxyInit(IMPL).toLowerCase()).toContain(IMPL.slice(2).toLowerCase());
  });

  it("rejects an invalid implementation address", () => {
    expect(() => proxyInit("0x1234")).toThrow();
    expect(() => cloneInit("nope")).toThrow();
  });
});
