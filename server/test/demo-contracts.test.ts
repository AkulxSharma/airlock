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

  it("compiler metadata bytes never trip a bytecode check on a contract that has no such opcode", () => {
    const real = new Set(["UnprotectedKill", "DelegateToUser", "IERC20"]); // IERC20 is an interface: no code
    for (const n of Object.keys(compiled.contracts)) if (!real.has(n)) expect(audit(n).bytecodeIds).toEqual([]);
  });
});

// One contract per vulnerability class. `ids` is exactly what the auditor reports (bytecode + source).
// SpotOracleLender is the one class Airlock does NOT detect (flash-loan price manipulation needs
// economic analysis, not pattern matching). It is listed so the gap is on record, not hidden.
const CLASSES: Array<[string, string, string[], "LOW" | "MEDIUM" | "HIGH"]> = [
  ["ReentrancyBank", "reentrancy", ["reentrancy-risk"], "MEDIUM"],
  ["UncheckedSend", "unchecked call return", ["unchecked-call"], "MEDIUM"],
  ["UnprotectedKill", "unprotected selfdestruct", ["selfdestruct"], "HIGH"],
  ["UnprotectedInit", "unprotected initializer", ["unprotected-init"], "MEDIUM"],
  ["DelegateToUser", "delegatecall to a caller-chosen address", ["delegatecall"], "MEDIUM"],
  ["WeakRandomLottery", "weak randomness", ["weak-randomness"], "MEDIUM"],
  ["StrictBalanceGame", "forced ether / strict balance check", ["strict-balance"], "LOW"],
  ["DosRefund", "denial of service by looped payments", ["dos-loop-payment"], "MEDIUM"],
  ["SignatureReplay", "signature replay", ["signature-replay"], "MEDIUM"],
  ["BackdoorToken", "hidden owner backdoor", ["owner-seize"], "MEDIUM"],
  ["ApprovalDrainer", "approval phishing", ["owner-seize"], "MEDIUM"],
  ["UncheckedMath", "unchecked arithmetic", ["unchecked-math"], "MEDIUM"],
  ["SpotOracleLender", "oracle manipulation (NOT detected)", [], "LOW"],
];

describe("one demo contract per vulnerability class", () => {
  for (const [name, label, ids, verdict] of CLASSES) {
    it(`${name} (${label}): ${verdict}${ids.length ? " with " + ids.join(", ") : ""}`, () => {
      const r = audit(name);
      expect(r.ids).toEqual(ids);
      expect(r.verdict).toBe(verdict);
    });
  }
});
