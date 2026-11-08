import { describe, expect, it } from "vitest";
import { createBargeInDetector } from "./bargeIn";

const tone = (amp: number, n = 4096) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 7));

describe("barge-in detector", () => {
  it("ignores the echo of Airlock's own voice, however steady", () => {
    const d = createBargeInDetector();
    for (let i = 0; i < 100; i++) expect(d.feed(tone(0.01))).toBe(false);
  });

  it("fires when someone talks clearly over the reply, after two loud frames", () => {
    const d = createBargeInDetector();
    for (let i = 0; i < 10; i++) d.feed(tone(0.01)); // echo
    expect(d.feed(tone(0.15))).toBe(false); // the first loud frame is not enough
    expect(d.feed(tone(0.15))).toBe(true);
  });

  it("a single click does not stop the reply", () => {
    const d = createBargeInDetector();
    for (let i = 0; i < 10; i++) d.feed(tone(0.01));
    expect(d.feed(tone(0.3))).toBe(false);
    expect(d.feed(tone(0.01))).toBe(false);
    expect(d.feed(tone(0.3))).toBe(false); // the count started over
  });

  it("works with a weak microphone (quiet room, quiet voice)", () => {
    const d = createBargeInDetector();
    for (let i = 0; i < 10; i++) d.feed(tone(0.002));
    d.feed(tone(0.03));
    expect(d.feed(tone(0.03))).toBe(true);
  });

  it("does not trigger during the first frames, which only teach the baseline", () => {
    const d = createBargeInDetector();
    expect(d.feed(tone(0.2))).toBe(false);
    expect(d.feed(tone(0.2))).toBe(false);
    expect(d.feed(tone(0.2))).toBe(false);
  });

  it("reset starts a new baseline for the next reply", () => {
    const d = createBargeInDetector();
    for (let i = 0; i < 10; i++) d.feed(tone(0.01));
    d.reset();
    for (let i = 0; i < 3; i++) d.feed(tone(0.1)); // a louder room this time
    expect(d.feed(tone(0.1))).toBe(false);
    expect(d.feed(tone(0.1))).toBe(false);
  });
});
