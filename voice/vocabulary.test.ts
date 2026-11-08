import { describe, expect, it } from "vitest";
import { canonicalizeCommand, normalizeTranscript as n } from "./normalize.js";
import { KEYTERMS as TRANSCRIBE_KEYTERMS } from "./transcribe.js";
import {
  CANCEL_PHRASES, CONFIRM_PHRASES, KEYTERMS, NEVER_CONFIRM, SEND_VERBS, vocabularyForPrompt,
} from "./vocabulary.js";

describe("synonyms become the commands the parser knows", () => {
  it.each([
    // ways of asking to send
    ["Pay 0.01 ETH to vitalik.eth", "send 0.01 eth to vitalik.eth"],
    ["Transfer zero point zero one ETH to vitalik dot eth", "send 0.01 eth to vitalik.eth"],
    ["wire 0.01 eth to vitalik.eth", "send 0.01 eth to vitalik.eth"],
    ["Could you please send 0.01 ether to vitalik.eth", "send 0.01 eth to vitalik.eth"],
    ["Can you send zero point zero one ethereum to vitalik dot eth", "send 0.01 eth to vitalik.eth"],
    ["I want to send 0.005 test ETH over to vitalik.eth", "send 0.005 eth to vitalik.eth"],
    ["I'd like to move 0.01 sepolia eth into vitalik.eth", "send 0.01 eth to vitalik.eth"],
    ["Let's send 0.01 to vitalik.eth", "send 0.01 to vitalik.eth"],
    ["Hey Airlock, shoot over point zero one ETH to vitalik dot eth", "send 0.01 eth to vitalik.eth"],
    ["go ahead and send 0.01 to vitalik.eth", "send 0.01 to vitalik.eth"],
    ["Please send 0.01 eth to vitalik.eth", "send 0.01 eth to vitalik.eth"],
    // "point zero one" with no whole number
    ["send point zero one eth to vitalik dot eth", "send 0.01 eth to vitalik.eth"],
  ])("%s", (input, expected) => {
    expect(n(input)).toBe(expected);
  });

  it.each([
    "yes", "Yep", "Yeah!", "yup", "Confirm", "Confirmed.", "approve", "Proceed", "Go ahead", "affirmative",
    "yes please", "Yes, confirm the transfer.", "Confirm the payment", "Hey Airlock, yes", "Airlock go ahead",
    "please confirm", "go ahead please",
  ])("%s means yes", (input) => {
    expect(n(input)).toBe("yes");
  });

  it.each([
    "no", "Nope", "nah", "Cancel", "Cancel it", "cancel that", "Cancel the transfer", "stop", "Stop.", "abort",
    "Never mind", "nevermind", "forget it", "Don't", "Don't send it", "negative", "wait", "Hold on", "halt",
    "No, cancel", "Abort the transfer", "Hey Airlock, never mind",
  ])("%s means no", (input) => {
    expect(n(input)).toBe("no");
  });
});

describe("safety: nothing ambiguous becomes a yes", () => {
  it.each(["ok", "okay", "sure", "fine", "alright", "uh huh", "do it", "send it", "yes I think maybe", "I guess so", "maybe"])(
    "%s is not turned into yes",
    (input) => {
      expect(n(input)).not.toBe("yes");
    },
  );

  it("none of the NEVER_CONFIRM words is also in the confirm list", () => {
    for (const w of NEVER_CONFIRM) expect(CONFIRM_PHRASES).not.toContain(w);
  });

  it("a confirm word inside a longer request does not turn the request into yes or no", () => {
    expect(n("send 0.01 to confirm.eth")).toBe("send 0.01 to confirm.eth");
    expect(n("stop sending money to bob")).toBe("stop sending money to bob");
    expect(n("cancel the order for pizza and send money")).not.toBe("no");
    expect(n("yes send 0.5 to vitalik.eth")).not.toBe("yes");
  });

  it("only rewrites a send verb when an amount follows, and only at the start", () => {
    expect(n("give me a hint")).toBe("give me a hint");
    expect(n("move on")).toBe("move on");
    expect(n("send 0.01 to move.eth")).toBe("send 0.01 to move.eth");
    expect(n("is it ok to pay 0.01 to vitalik.eth")).toBe("is it ok to pay 0.01 to vitalik.eth");
  });

  it("leaves ordinary commands exactly as they were", () => {
    for (const s of ["send 0.01 to vitalik.eth", "send 0.01 eth to vitalik.eth", "is this contract risky"]) {
      expect(n(s)).toBe(s);
    }
  });

  it("canonicalizing twice changes nothing", () => {
    for (const s of ["pay 0.01 ether over to vitalik.eth", "go ahead", "never mind", "send 0.01 to vitalik.eth"]) {
      expect(canonicalizeCommand(n(s))).toBe(n(s));
    }
  });

  it("every cancel phrase is harmless to match and every confirm phrase is explicit", () => {
    expect(CANCEL_PHRASES.length).toBeGreaterThan(10);
    for (const w of CONFIRM_PHRASES) expect(NEVER_CONFIRM).not.toContain(w);
    expect(SEND_VERBS).toContain("send");
  });
});

describe("the keyterm list", () => {
  it("is identical in vocabulary.ts and in transcribe.ts (the GUI cannot import a relative file)", () => {
    expect(TRANSCRIBE_KEYTERMS).toEqual(KEYTERMS);
  });
  it("stays well under the 48 the API accepted, with plain text only and no duplicates", () => {
    expect(KEYTERMS.length).toBeLessThanOrEqual(48);
    expect(new Set(KEYTERMS).size).toBe(KEYTERMS.length);
    for (const k of KEYTERMS) expect(k).toMatch(/^[A-Za-z0-9 ]+$/);
  });
  it("includes the words that matter most", () => {
    for (const w of ["Airlock", "Hey Airlock", "Sepolia", "ETH", "vitalik"]) expect(KEYTERMS).toContain(w);
  });
});

describe("the text handed to Gemini", () => {
  it("lists the send verbs, the confirm and cancel words, and the words that must never confirm", () => {
    const p = vocabularyForPrompt();
    expect(p).toMatch(/pay/);
    expect(p).toMatch(/go ahead/);
    expect(p).toMatch(/never mind/);
    expect(p).toMatch(/NOT confirmations/);
    expect(p).toMatch(/okay/);
  });
});
