import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/auditor/source.js";
import { auditBytecode } from "../src/auditor/index.js";
import { scoreFindings, verdictFor } from "../src/auditor/score.js";

// The four Solidity demo contracts, compiled by scripts/compile-demo-contracts.ts. This runs the
// real compiled bytecode and the real source through the auditor, the same two layers a live
// audit uses, and checks the verdict each demo contract is supposed to get.
type Art = { file: string; runtime: string };
const compiled = JSON.parse(readFileSync(new URL("../src/demo/compiled.json", import.meta.url), "utf8")) as {
  input: { sources: Record<string, { content: string }> };
  contracts: Record<string, Art>;
};

function audit(name: string) {
  const art = compiled.contracts[name];
  const bytecode = auditBytecode(art.runtime, "0x0000000000000000000000000000000000000001", 11155111);
  const source = analyzeSource({ [art.file]: compiled.input.sources[art.file].content });
  const findings = [...bytecode.findings, ...source];
  const score = scoreFindings(findings);
  return { ids: findings.map((f) => f.id).sort(), verdict: verdictFor(score, findings), bytecodeIds: bytecode.findings.map((f) => f.id) };
}

describe("Solidity demo contracts", () => {
  it("CleanVault: no bytecode or source finding, LOW", () => {
    const r = audit("CleanVault");
    expect(r.ids).toEqual([]);
    expect(r.verdict).toBe("LOW");
  });

  it("RugVault: owner can sweep the pool, MEDIUM", () => {
    const r = audit("RugVault");
    expect(r.ids).toEqual(["owner-sweep"]);
    expect(r.verdict).toBe("MEDIUM");
  });

  it("OriginWallet: tx.origin authorization, MEDIUM", () => {
    const r = audit("OriginWallet");
    expect(r.ids).toEqual(["tx-origin"]);
    expect(r.verdict).toBe("MEDIUM");
  });

  it("HoneypotToken: blacklist, sell fee and trading switch, MEDIUM", () => {
    const r = audit("HoneypotToken");
    expect(r.ids).toEqual(["adjustable-fee", "blacklist-switch", "trading-switch"]);
    expect(r.verdict).toBe("MEDIUM");
  });

  it("no demo contract trips a bytecode check by accident (metadata bytes are not opcodes)", () => {
    for (const n of Object.keys(compiled.contracts)) expect(audit(n).bytecodeIds).toEqual([]);
  });
});
