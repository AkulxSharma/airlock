import { describe, expect, it } from "vitest";
import { guardVoiceInput } from "./guard.js";

const refused = (t: string) => guardVoiceInput(t).ok === false;

describe("guardVoiceInput", () => {
  it("refuses a full address", () => {
    expect(refused("Send 0.01 ETH to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F")).toBe(true);
  });
  it("refuses the wrong-but-valid address Scribe actually produced in a live run", () => {
    expect(refused("Send 0.01 ETH to 0x71c7656ec7ab88b798dfeb751b7401b5f6d8976f.")).toBe(true);
  });
  it("refuses spelled and garbled hex", () => {
    expect(refused("Contract address zero x d e a d b e e f")).toBe(true);
    expect(refused("zero XD EAD BE EF")).toBe(true);
    expect(refused("begins with zero x a b c one two three")).toBe(true);
  });
  it("lets ENS names, amounts and normal commands through", () => {
    for (const t of ["Send zero point zero one ETH to vitalik dot eth", "Send 0.01 ETH to vitalik.eth", "Yes, confirm the transfer.", "Is this contract risky?", "Chain ID 11155111"]) {
      expect(guardVoiceInput(t).ok).toBe(true);
    }
  });
  it("returns the offending fragments and a message that tells the user what to do", () => {
    const g = guardVoiceInput("send to 0xdeadbeef");
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.found).toEqual(["0xdeadbeef"]);
      expect(g.reason).toMatch(/paste/i);
    }
  });
});
