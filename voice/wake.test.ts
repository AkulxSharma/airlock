import { describe, expect, it } from "vitest";
import { guardVoiceInput } from "./guard.js";
import { normalizeTranscript as n } from "./normalize.js";
import { extractWakeCommand, stripWakeWord } from "./wake.js";

describe("extractWakeCommand", () => {
  it.each([
    ["Hey Airlock, send 0.01 to vitalik.eth", "send 0.01 to vitalik.eth"],
    ["hey airlock send zero point zero one ETH to vitalik dot eth", "send zero point zero one ETH to vitalik dot eth"],
    ["Airlock, check this address", "check this address"],
    ["Airlock send 0.01 to vitalik.eth", "send 0.01 to vitalik.eth"],
    ["Hey, Airlock. Yes.", "Yes."],
    ["ok airlock no", "no"],
    ["Hi Air Lock, is this contract risky?", "is this contract risky?"],
    ["hey air-lock yes", "yes"],
    ["Hey Airlok send 0.01 to vitalik.eth", "send 0.01 to vitalik.eth"],
    ["okay so hey airlock send 0.01 to vitalik.eth", "send 0.01 to vitalik.eth"],
    // looser mishearings are accepted only after a greeting
    ["Hey air luck, send 0.01 to vitalik.eth", "send 0.01 to vitalik.eth"],
    ["hey error lock yes", "yes"],
    ["Hi Aerlock no", "no"],
    ["ok heir lock send 0.01 to vitalik.eth", "send 0.01 to vitalik.eth"],
  ])("%s", (input, command) => {
    const r = extractWakeCommand(input);
    expect(r.woke).toBe(true);
    expect(r.command).toBe(command);
  });

  it("detects the wake phrase with nothing after it", () => {
    for (const s of ["Hey Airlock", "Airlock", "hey airlock.", "Hey, Airlock!"]) {
      expect(extractWakeCommand(s)).toEqual({ woke: true, command: "" });
    }
  });

  it("does not wake on ordinary speech or lookalike words", () => {
    for (const s of ["send 0.01 to vitalik.eth", "yes", "check the airlocks", "I love hockey", "hey there", "unlock it", "the error log", "hey look at this", "hi are you there", "ok the door lock is broken", "my hair look"]) {
      expect(extractWakeCommand(s).woke).toBe(false);
    }
  });
});

describe("stripWakeWord", () => {
  it("removes a leading wake phrase only", () => {
    expect(stripWakeWord("Hey Airlock, send 0.01 to vitalik.eth")).toBe("send 0.01 to vitalik.eth");
    expect(stripWakeWord("  Airlock yes")).toBe("yes");
    expect(stripWakeWord("send 0.01 to airlock.eth")).toBe("send 0.01 to airlock.eth");
    expect(stripWakeWord("tell hey airlock to wait")).toBe("tell hey airlock to wait");
  });
});

describe("the wake phrase inside the voice pipeline", () => {
  it("normalizeTranscript drops a leading wake phrase, so the parser sees the bare command", () => {
    expect(n("Hey Airlock, send zero point zero one ETH to vitalik dot eth.")).toBe("send 0.01 eth to vitalik.eth");
    expect(n("Airlock, yes")).toBe("yes");
    expect(n("Hey Airlock")).toBe("");
  });
  it("the address guard still blocks an address spoken after the wake phrase", () => {
    expect(guardVoiceInput("Hey Airlock, send 0.01 to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F").ok).toBe(false);
    expect(guardVoiceInput("Hey Airlock send 0.01 to vitalik dot eth").ok).toBe(true);
  });
});
