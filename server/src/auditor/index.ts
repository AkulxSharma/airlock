import { AuditResultSchema, type AuditResult, type Finding } from "../types.js";
import { hexToBytes, scanOpcodes } from "./opcodes.js";
import {
  checkCallcode,
  checkDelegatecall,
  checkMinimalProxy,
  checkNoCode,
  checkSelfdestruct,
  checkTinyCode,
  isMinimalProxy,
} from "./checks.js";
import { scoreFindings, verdictFor } from "./score.js";

// Pure function: bytecode in, AuditResult out. No network calls.
export function auditBytecode(hex: string, target: string, chainId: number): AuditResult {
  const code = hexToBytes(hex);
  const ops = scanOpcodes(code);
  const minimalProxy = isMinimalProxy(hex);

  const findings = [
    checkNoCode(code.length),
    checkSelfdestruct(ops),
    // A minimal proxy always contains DELEGATECALL; reporting it twice would be noise.
    minimalProxy ? null : checkDelegatecall(ops),
    checkCallcode(ops),
    checkMinimalProxy(hex),
    checkTinyCode(code.length, minimalProxy),
  ].filter((f): f is Finding => f !== null);

  const riskScore = scoreFindings(findings);
  const result = {
    target,
    chainId,
    verdict: verdictFor(riskScore, findings),
    riskScore,
    findings,
  };
  return AuditResultSchema.parse(result);
}
