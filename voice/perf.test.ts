import { describe, expect, it } from "vitest";
import { guardVoiceInput } from "./guard.js";
import { MAX_TRANSCRIPT_CHARS, normalizeTranscript } from "./normalize.js";
import { extractWakeCommand, stripWakeWord } from "./wake.js";

// A transcript is untrusted input (anyone can speak, or text, to the line). A hostile one must never be
// able to tie up the server. A pattern that retried from every space once took 38 seconds on 200 KB of
// spaces, and the server handles one request at a time, so that froze everything. These inputs are
// 200 KB each; every function must finish in well under a second.
const N = 200_000;
const HOSTILE: Record<string, string> = {
  spaces: " ".repeat(N),
  tabs: "\t".repeat(N),
  newlines: "\n".repeat(N),
  "hey then spaces": "hey" + " ".repeat(N) + "x",
  "dot then spaces": " dot" + " ".repeat(N),
  "hey repeated": "hey ".repeat(N / 4),
  "air lock repeated": "air lock ".repeat(N / 9),
  "zero repeated": "zero ".repeat(N / 5),
  "one repeated": "one ".repeat(N / 4),
  "point repeated": "point ".repeat(N / 6),
  "digits with spaces": "1 ".repeat(N / 2),
  "0x with spaced hex": "0x a ".repeat(N / 5),
  "dot repeated": "dot ".repeat(N / 4),
  "send repeated": "send 1 ".repeat(N / 7),
  "commas": "1,".repeat(N / 2),
  "unicode": "é漢🙂".repeat(N / 8),
};
const LIMIT_MS = 300;

function timed(f: () => unknown) {
  const t0 = performance.now();
  f();
  return performance.now() - t0;
}

describe("hostile transcripts cannot tie the server up", () => {
  for (const [name, text] of Object.entries(HOSTILE)) {
    it(`normalizeTranscript: ${name}`, () => {
      expect(timed(() => normalizeTranscript(text))).toBeLessThan(LIMIT_MS);
    });
    it(`guardVoiceInput: ${name}`, () => {
      expect(timed(() => guardVoiceInput(text))).toBeLessThan(LIMIT_MS);
    });
    it(`wake phrase matching: ${name}`, () => {
      expect(timed(() => { extractWakeCommand(text); stripWakeWord(text); })).toBeLessThan(LIMIT_MS);
    });
  }

  it("only looks at the first part of a very long transcript", () => {
    expect(MAX_TRANSCRIPT_CHARS).toBeLessThanOrEqual(5000);
    const out = normalizeTranscript("send 0.01 to vitalik.eth " + "x ".repeat(100_000));
    expect(out.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS);
    expect(out.startsWith("send 0.01 to vitalik.eth")).toBe(true);
  });

  it("a normal command is unaffected by the bound", () => {
    expect(normalizeTranscript("Hey Airlock, send zero point zero one ETH to vitalik dot eth.")).toBe("send 0.01 eth to vitalik.eth");
  });
});
