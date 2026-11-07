import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/agent/parse.js";

describe("parseCommand", () => {
  it("parses a send to an ENS name", () => {
    expect(parseCommand("send 0.01 to vitalik.eth")).toEqual({
      kind: "send",
      amountEth: "0.01",
      target: "vitalik.eth",
    });
  });

  it("parses a send to an address, keeping the amount as the typed string", () => {
    const to = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    expect(parseCommand(`Send 0.005 ETH to ${to}`)).toEqual({ kind: "send", amountEth: "0.005", target: to });
  });

  it("accepts transfer, please, test and trailing punctuation", () => {
    expect(parseCommand("please transfer 1 test eth to bob.eth!")).toEqual({
      kind: "send",
      amountEth: "1",
      target: "bob.eth",
    });
  });

  it("does not turn the amount into a float", () => {
    const r = parseCommand("send 0.1000000000000000001 to a.eth");
    expect(r).toMatchObject({ kind: "send", amountEth: "0.1000000000000000001" });
  });

  it("parses yes and no variants", () => {
    for (const t of ["yes", "YES", "Yes.", "y", "yep", "confirm", " yes! "]) {
      expect(parseCommand(t)).toEqual({ kind: "yes" });
    }
    for (const t of ["no", "NO", "n", "cancel", "stop", "nope."]) {
      expect(parseCommand(t)).toEqual({ kind: "no" });
    }
  });

  it("does not treat a sentence that merely contains yes as a confirmation", () => {
    expect(parseCommand("yes please send it to someone else").kind).toBe("help");
    expect(parseCommand("say yes").kind).toBe("help");
  });

  it("returns help for anything else", () => {
    for (const t of ["", "hello", "send", "send to vitalik.eth", "send 0.01", "send abc to vitalik.eth"]) {
      expect(parseCommand(t).kind).toBe("help");
    }
  });
});
