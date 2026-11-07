import { describe, expect, it } from "vitest";
import { normalizeTranscript as n } from "./normalize.js";
import { toSpeakable } from "./speakable.js";

describe("normalizeTranscript", () => {
  it.each([
    ["Send zero point zero one ETH to vitalik dot eth.", "send 0.01 eth to vitalik.eth"],
    ["Send 0.01 ETH to vitalik.eth", "send 0.01 eth to vitalik.eth"],
    ["transfer zero point zero zero five", "send 0.005"], // "transfer" is a synonym for "send"
    ["This contract contains a self-destruct opcode", "this contract contains a selfdestruct opcode"],
    ["delegate call to an unknown address", "delegatecall to an unknown address"],
    ["Honey pot token", "honeypot token"],
    ["Re-entrancy risk", "reentrancy risk"],
    ["Gas price is thirty gwei and the nonce is forty two.", "gas price is 30 gwei and the nonce is 42"],
    ["Risk score ninety two out of one hundred.", "risk score 92 out of 100"],
    ["expires in sixty seconds", "expires in 60 seconds"],
    ["one hundred and twenty five", "125"],
    ["Chain ID 11,155,111 is Sepolia", "chain id 11155111 is sepolia"],
    ["Chain ID 1 1 1 5 5 1 1 1", "chain id 11155111"],
    ["zero x d e a d b e e f", "0xdeadbeef"],
    ["zero XDEADBEEF", "0xdeadbeef"],
    ["Contract address zero XD EAD BE EF", "contract address 0xdeadbeef"],
    ["begins with zero x a b c one two three.", "begins with 0xabc123"],
    ["EIP 1967 slot", "eip 1967 slot"],
  ])("%s", (input, expected) => {
    expect(n(input)).toBe(expected);
  });

  it("does not turn ordinary words into numbers or merge separate numbers", () => {
    expect(n("go to the store")).toBe("go to the store");
    expect(n("92 out of 100")).toBe("92 out of 100");
    expect(n("two to three")).toBe("2 to 3");
  });

  it("is idempotent", () => {
    for (const s of ["Send zero point zero one ETH to vitalik dot eth.", "zero x d e a d b e e f", "ninety two"]) {
      expect(n(n(s))).toBe(n(s));
    }
  });
});

describe("toSpeakable", () => {
  it("shortens a full address to a spelled start and end, never the whole value", () => {
    const out = toSpeakable("Send to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F now");
    expect(out).toBe("Send to starting zero x 7 1 C 7, ending 9 7 6 F now");
    expect(out).not.toContain("656EC7ab88b098");
  });
  it("spells long digit strings and leaves short numbers alone", () => {
    expect(toSpeakable("Chain ID 11155111")).toBe("Chain ID 1 1 1 5 5 1 1 1");
    expect(toSpeakable("send 60 seconds")).toBe("send 60 seconds");
  });
  it("speaks decimal amounts digit by digit so 0.005 cannot be heard as 0.05", () => {
    expect(toSpeakable("Transfer 0.005 ETH")).toBe("Transfer zero point zero zero five ETH");
    expect(toSpeakable("send 0.01 ETH")).toBe("send zero point zero one ETH");
    expect(n(toSpeakable("Transfer 0.005 ETH"))).toBe("send 0.005 eth");
  });
  it("survives a round trip through the normalizer", () => {
    expect(n(toSpeakable("Chain ID 11155111"))).toBe("chain id 11155111");
    expect(n(toSpeakable("to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F"))).toContain("0x71c7");
  });
});
