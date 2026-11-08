import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/auditor/source.js";

// Contract source is written by whoever published the contract. Hostile text must not freeze the server.
const KB = 400 * 1024;
const repeat = (s: string) => s.repeat(Math.ceil(KB / s.length));
const hostile: Record<string, string> = {
  "unclosed functions": repeat("function f() {"),
  "unclosed parens": repeat("function f("),
  "if without end": repeat("if ("),
  "require without end": repeat("require("),
  "tx.origin copies": repeat("a = tx.origin; "),
  "nested braces": "{".repeat(KB),
  "loops": repeat("for (i < x.length) { "),
  "unchecked": repeat("unchecked { balance"),
  "modifiers": repeat("modifier m() { "),
  "calls": repeat(".call{ value: "),
};

describe("source analyzer on hostile input", () => {
  for (const [name, code] of Object.entries(hostile)) {
    it(`stays fast: ${name}`, () => {
      const t0 = performance.now();
      analyzeSource({ "X.sol": code });
      expect(performance.now() - t0).toBeLessThan(1500);
    });
  }
});
