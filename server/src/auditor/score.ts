import type { Finding } from "../types.js";

export type Verdict = "LOW" | "MEDIUM" | "HIGH";

const WEIGHT: Record<Finding["severity"], number> = { high: 40, medium: 20, low: 5 };

export function scoreFindings(findings: Finding[]): number {
  const sum = findings.reduce((acc, f) => acc + WEIGHT[f.severity], 0);
  return Math.min(100, sum);
}

// Any high finding forces HIGH. Any medium finding forces at least MEDIUM (a lone medium
// scores 20, which would otherwise read as LOW). Otherwise: below 30 LOW, 30 to 69 MEDIUM,
// 70 or more HIGH. There is no "safe" value on purpose.
export function verdictFor(score: number, findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === "high")) return "HIGH";
  if (score >= 70) return "HIGH";
  if (score >= 30 || findings.some((f) => f.severity === "medium")) return "MEDIUM";
  return "LOW";
}
