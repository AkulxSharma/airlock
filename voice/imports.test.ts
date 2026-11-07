import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The GUI (Next.js, in app/) imports these files directly. Next cannot resolve a relative import
// such as "./other.js" from a .ts file, so a file the GUI uses must not import another local file.
// This broke the GUI's transcribe route once (HTTP 500), so it is checked here.
describe("voice files used by the GUI have no relative imports", () => {
  for (const file of ["speak.ts", "speakable.ts", "transcribe.ts", "wake.ts"]) {
    it(file, () => {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/^\s*import[^;]*from\s+["']\.{1,2}\//m);
    });
  }
});
