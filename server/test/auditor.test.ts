import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditBytecode } from "../src/auditor/index.js";
import { hexToBytes, scanOpcodes } from "../src/auditor/opcodes.js";
import { scoreFindings, verdictFor } from "../src/auditor/score.js";
import { AuditResultSchema, type Finding } from "../src/types.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.hex`, import.meta.url), "utf8").trim();

const TARGET = "0x0000000000000000000000000000000000000001";
const CHAIN = 11155111;
const ids = (hex: string) => auditBytecode(hex, TARGET, CHAIN).findings.map((f) => f.id);

describe("opcode scanner", () => {
  it("skips PUSH data, so 0xff inside PUSH1 data is not an opcode", () => {
    const ops = scanOpcodes(hexToBytes(fixture("ff-in-push-data")));
    expect(ops.has(0xff)).toBe(false);
  });

  it("sees a real 0xff opcode", () => {
    const ops = scanOpcodes(hexToBytes(fixture("selfdestruct-real")));
    expect(ops.has(0xff)).toBe(true);
  });

  it("does not crash on a PUSH truncated at the end of the code", () => {
    expect(() => scanOpcodes(hexToBytes("0x7f01"))).not.toThrow();
  });

  it("rejects invalid hex", () => {
    expect(() => hexToBytes("0xzz")).toThrow();
    expect(() => hexToBytes("0xabc")).toThrow();
  });
});

describe("auditBytecode", () => {
  it("empty code gives no-code and LOW", () => {
    const r = auditBytecode(fixture("empty"), TARGET, CHAIN);
    expect(r.findings.map((f) => f.id)).toEqual(["no-code"]);
    expect(r.verdict).toBe("LOW");
  });

  it("minimal proxy gives minimal-proxy once, with no duplicate delegatecall", () => {
    const found = ids(fixture("minimal-proxy"));
    expect(found).toContain("minimal-proxy");
    expect(found).not.toContain("delegatecall");
  });

  it("real SELFDESTRUCT gives selfdestruct and HIGH", () => {
    const r = auditBytecode(fixture("selfdestruct-real"), TARGET, CHAIN);
    expect(r.findings.map((f) => f.id)).toContain("selfdestruct");
    expect(r.verdict).toBe("HIGH");
  });

  it("0xff inside PUSH data gives no selfdestruct finding", () => {
    expect(ids(fixture("ff-in-push-data"))).not.toContain("selfdestruct");
  });

  it("real DELEGATECALL gives delegatecall and MEDIUM", () => {
    const r = auditBytecode(fixture("delegatecall-real"), TARGET, CHAIN);
    expect(r.findings.map((f) => f.id)).toContain("delegatecall");
    expect(r.verdict).toBe("MEDIUM");
  });

  it("plain code with nothing flagged is LOW with no findings", () => {
    const r = auditBytecode(fixture("clean"), TARGET, CHAIN);
    expect(r.findings).toEqual([]);
    expect(r.verdict).toBe("LOW");
    expect(r.riskScore).toBe(0);
  });

  it("flags very short non-proxy code as tiny-code", () => {
    expect(ids("0x6000")).toContain("tiny-code");
  });

  it("every result validates against the AuditResult schema", () => {
    for (const name of ["empty", "minimal-proxy", "selfdestruct-real", "ff-in-push-data", "delegatecall-real", "clean"]) {
      const r = auditBytecode(fixture(name), TARGET, CHAIN);
      expect(AuditResultSchema.safeParse(r).success).toBe(true);
    }
  });

  it("never produces a verdict outside LOW, MEDIUM, HIGH", () => {
    const r = auditBytecode(fixture("clean"), TARGET, CHAIN);
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(r.verdict);
  });
});

describe("scoring", () => {
  const f = (severity: Finding["severity"]): Finding => ({ id: severity, severity, message: "x" });

  it("a high finding forces HIGH even with a low score", () => {
    expect(verdictFor(10, [f("high")])).toBe("HIGH");
  });

  it("thresholds: below 30 LOW, 30 to 69 MEDIUM, 70 or more HIGH", () => {
    expect(verdictFor(29, [])).toBe("LOW");
    expect(verdictFor(30, [])).toBe("MEDIUM");
    expect(verdictFor(69, [])).toBe("MEDIUM");
    expect(verdictFor(70, [])).toBe("HIGH");
  });

  it("weights are high 40, medium 20, low 5, capped at 100", () => {
    expect(scoreFindings([f("high"), f("medium"), f("low")])).toBe(65);
    expect(scoreFindings([f("high"), f("high"), f("high")])).toBe(100);
  });
});
