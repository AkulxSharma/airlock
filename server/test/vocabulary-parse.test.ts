import { describe, expect, it } from "vitest";
import { normalizeTranscript } from "../../voice/normalize.js";
import { parseCommand } from "../src/agent/parse.js";

// The strict rule parser only knows "send <amount> [eth] to <name>", "yes" and "no". The voice
// pipeline maps many spoken ways of saying those onto them. This checks the two work together.
const kind = (spoken: string) => parseCommand(normalizeTranscript(spoken)).kind;

describe("spoken synonyms reach the parser as the right intent", () => {
  it.each([
    "Pay 0.01 ETH to vitalik.eth",
    "Transfer zero point zero one ETH to vitalik dot eth",
    "Could you please send 0.01 ether to vitalik.eth",
    "I want to send 0.005 test ETH over to vitalik.eth",
    "Hey Airlock, shoot over point zero one ETH to vitalik dot eth",
    "Airlock, wire 0.01 ethereum to vitalik dot eth",
  ])("send: %s", (spoken) => {
    const intent = parseCommand(normalizeTranscript(spoken));
    expect(intent.kind).toBe("send");
    if (intent.kind === "send") expect(intent.target).toBe("vitalik.eth");
  });

  it("keeps the right amount", () => {
    expect(parseCommand(normalizeTranscript("Pay zero point zero zero five ether to vitalik dot eth"))).toEqual({
      kind: "send", amountEth: "0.005", target: "vitalik.eth",
    });
  });

  it.each(["Yes please", "go ahead", "Confirm the transfer", "Yep", "Hey Airlock, proceed", "affirmative"])("yes: %s", (spoken) => {
    expect(kind(spoken)).toBe("yes");
  });

  it.each(["never mind", "cancel that", "Don't send it", "hold on", "No, cancel", "Abort the transfer", "Airlock stop"])("no: %s", (spoken) => {
    expect(kind(spoken)).toBe("no");
  });

  it.each(["ok", "sure", "alright", "do it", "send it", "maybe", "what is the weather", "pay bob"])("not a command: %s", (spoken) => {
    expect(kind(spoken)).toBe("help");
  });
});
