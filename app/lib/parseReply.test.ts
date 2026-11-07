import { describe, expect, it } from "vitest";
import { parseReply, speechFor } from "./parseReply";

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
