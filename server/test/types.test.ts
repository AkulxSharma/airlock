import { describe, expect, it } from "vitest";
import { AuditResultSchema, MessageRequestSchema } from "../src/types.js";

describe("shared contract", () => {
  it("accepts a valid auditor result", () => {
    const r = AuditResultSchema.parse({
      target: "0x0000000000000000000000000000000000000001",
      chainId: 11155111,
      verdict: "LOW",
      riskScore: 5,
      findings: [{ id: "no-code", severity: "low", message: "No contract code." }],
    });
    expect(r.verdict).toBe("LOW");
  });

  it("rejects an unknown verdict and an out-of-range score", () => {
    const bad = { target: "0x1", chainId: 1, findings: [] };
    expect(() => AuditResultSchema.parse({ ...bad, verdict: "SAFE", riskScore: 5 })).toThrow();
    expect(() => AuditResultSchema.parse({ ...bad, verdict: "LOW", riskScore: 101 })).toThrow();
  });

  it("rejects an empty message text", () => {
    expect(() => MessageRequestSchema.parse({ sessionId: "s", channel: "gui", text: "" })).toThrow();
  });
});
