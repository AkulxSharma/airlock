import { describe, expect, it } from "vitest";
import { DEMO_NAMES, KEYTERMS, transferVocabularyForPrompt } from "../../voice/vocabulary.js";
import { loadDemoTargets } from "../src/demo/aliases.js";
import { normalizeTranscript } from "../../voice/normalize.js";

describe("demo contract names in the voice vocabulary", () => {
  const files = Object.keys(loadDemoTargets()).map((n) => n.replace(/\.demo$/, ""));
  it("lists every demo target", () => expect([...DEMO_NAMES].sort()).toEqual([...files].sort()));
  it("sends every one to Scribe and to the Gemini prompt", () => {
    for (const n of files) {
      expect(KEYTERMS).toContain(n);
      expect(transferVocabularyForPrompt()).toContain(`${n}.demo`);
    }
  });
  it("turns 'drainer dot demo' into drainer.demo", () => {
    expect(normalizeTranscript("Hey Airlock, send 0.001 to drainer dot demo")).toContain("drainer.demo");
  });
});
