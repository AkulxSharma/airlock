import { describe, expect, it } from "vitest";
import type { MessageResponse } from "./api";
import { parseReply, parseResponse, resolveExpiry, speechFor } from "./parseReply";

const ADDR = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
const CONFIRM = [
  "Risk signal: MEDIUM (score 25).",
  "- [medium] Contract uses DELEGATECALL, so other code can run with this contract's storage.",
  "- [low] Very short contract code. It may be a stub.",
  `To send: 0.01 test ETH to ${ADDR}.`,
  "This is a risk signal, not a guarantee. Reply YES to send or NO to cancel. It expires in 60 seconds.",
].join("\n");

describe("parseReply", () => {
  it("parses a confirm reply into verdict, score, findings, amount, address and expiry", () => {
    const p = parseReply(CONFIRM, true);
    expect(p.kind).toBe("confirm");
    expect(p.verdict).toBe("MEDIUM");
    expect(p.score).toBe(25);
    expect(p.findings).toEqual([
      { severity: "medium", message: "Contract uses DELEGATECALL, so other code can run with this contract's storage." },
      { severity: "low", message: "Very short contract code. It may be a stub." },
    ]);
    expect(p.amountEth).toBe("0.01");
    expect(p.to).toBe(ADDR);
    expect(p.expiresInSeconds).toBe(60);
  });

  it("does not treat a reply as a confirmation unless the server said needsConfirm", () => {
    expect(parseReply(CONFIRM, false).kind).not.toBe("confirm");
  });

  it("parses a refusal and marks HIGH when a high finding is listed", () => {
    const p = parseReply("Refused. This address is high risk.\n- [high] Contract contains SELFDESTRUCT.", false);
    expect(p.kind).toBe("refused");
    expect(p.verdict).toBe("HIGH");
    expect(p.findings).toHaveLength(1);
  });

  it("parses refusals without findings (cap, timeout) and leaves the verdict empty", () => {
    const p = parseReply("Refused. The cap is 0.01 test ETH per transfer.", false);
    expect(p.kind).toBe("refused");
    expect(p.verdict).toBeUndefined();
    expect(p.headline).toContain("cap");
  });

  it("parses a sent reply and keeps only a Sepolia Etherscan link", () => {
    const p = parseReply(`Sent 0.01 test ETH to ${ADDR}.\nhttps://sepolia.etherscan.io/tx/0xabc123`, false);
    expect(p.kind).toBe("sent");
    expect(p.txUrl).toBe("https://sepolia.etherscan.io/tx/0xabc123");
    const evil = parseReply(`Sent 0.01 test ETH to ${ADDR}.\nhttps://evil.example/tx/0xabc123`, false);
    expect(evil.txUrl).toBeUndefined();
  });

  it("parses cancelled and unknown replies as info", () => {
    expect(parseReply("Cancelled. Nothing was sent.", false).kind).toBe("cancelled");
    expect(parseReply("I check a crypto address before any funds move.", false).kind).toBe("info");
  });
});

describe("parseReply on a real server reply", () => {
  // Captured from the running server on 2026-11-07: send 0.01 to vitalik.eth (Sepolia, no contract code).
  const REAL = "Risk signal: LOW (score 5).\n- [low] Address has no contract code, so it looks like a normal wallet. That is informational, not a risk by itself.\nTo send: 0.01 test ETH to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045.\nThis is a risk signal, not a guarantee. Reply YES to send or NO to cancel. It expires in 4 seconds.";
  it("parses the live confirm reply", () => {
    const p = parseReply(REAL, true);
    expect(p.kind).toBe("confirm");
    expect(p.verdict).toBe("LOW");
    expect(p.score).toBe(5);
    expect(p.findings).toHaveLength(1);
    expect(p.findings[0].severity).toBe("low");
    expect(p.amountEth).toBe("0.01");
    expect(p.to).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
    expect(p.expiresInSeconds).toBe(4);
  });
});

describe("speechFor", () => {
  it("speaks a short confirm summary that says it is not a guarantee, and never says safe", () => {
    const s = speechFor(parseReply(CONFIRM, true));
    expect(s).toContain("Risk signal MEDIUM, score 25");
    expect(s).toContain("not a guarantee");
    expect(s.toLowerCase()).not.toMatch(/\b(safe|secure|trusted)\b/);
  });
  it("speaks only the first line for other replies", () => {
    expect(speechFor(parseReply("Refused. The audit timed out.\n- [high] x", false))).toBe("Refused. The audit timed out.");
  });
});

describe("parseResponse (structured fields first)", () => {
  const audit = {
    target: ADDR, chainId: 11155111, verdict: "MEDIUM" as const, riskScore: 25,
    findings: [{ id: "delegatecall", severity: "medium" as const, message: "Uses DELEGATECALL." }],
  };
  const pending = { to: ADDR, amountEth: "0.01", expiresAt: 1_700_000_060_000 };
  const base: MessageResponse = { reply: "", stages: [], needsConfirm: true, audit, pending };

  it("reads verdict, score, findings, amount, address and exact expiry from the fields, not the text", () => {
    // The text is reworded on purpose: the old text parser would find nothing in it.
    const p = parseResponse({ ...base, reply: "Heads up! Looks medium-ish. Say yes to continue." });
    expect(p.kind).toBe("confirm");
    expect(p.verdict).toBe("MEDIUM");
    expect(p.score).toBe(25);
    expect(p.findings).toEqual([{ severity: "medium", message: "Uses DELEGATECALL." }]);
    expect(p.to).toBe(ADDR);
    expect(p.amountEth).toBe("0.01");
    expect(p.expiresAt).toBe(1_700_000_060_000);
  });

  it("treats audit without needsConfirm as a refusal even when the wording changed", () => {
    const high = { ...audit, verdict: "HIGH" as const, riskScore: 90 };
    const p = parseResponse({ reply: "No. That is too risky.", stages: [], needsConfirm: false, audit: high });
    expect(p.kind).toBe("refused");
    expect(p.verdict).toBe("HIGH");
  });

  it("falls back to the text when the server sends no structured fields", () => {
    const p = parseResponse({ reply: CONFIRM, stages: [], needsConfirm: true });
    expect(p.kind).toBe("confirm");
    expect(p.verdict).toBe("MEDIUM");
    expect(p.expiresInSeconds).toBe(60);
    expect(p.expiresAt).toBeUndefined();
  });

  it("keeps a sent reply and a cancel as before when there are no fields", () => {
    expect(parseResponse({ reply: "Cancelled. Nothing was sent.", stages: [], needsConfirm: false }).kind).toBe("cancelled");
  });
});

describe("resolveExpiry", () => {
  const now = 1_700_000_000_000;
  it("uses the server's exact time when it is plausible", () => {
    expect(resolveExpiry(now + 58_000, 60, now)).toBe(now + 58_000);
  });
  it("ignores a server time that is far off our clock and uses the text instead", () => {
    expect(resolveExpiry(now + 3 * 3_600_000, 60, now)).toBe(now + 60_000);
    expect(resolveExpiry(now - 3_600_000, 60, now)).toBe(now + 60_000);
  });
  it("uses the text when there is no exact time, and gives nothing when there is neither", () => {
    expect(resolveExpiry(undefined, 60, now)).toBe(now + 60_000);
    expect(resolveExpiry(undefined, undefined, now)).toBeUndefined();
  });
});
