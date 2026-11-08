import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The GUI (Next.js, in app/) imports these files directly. Next cannot resolve a relative import
// such as "./other.js" from a .ts file, so a file the GUI uses must not import another local file.
// This broke the GUI's transcribe route once (HTTP 500), so it is checked here.
describe("voice files used by the GUI have no relative imports", () => {
  // normalize.ts is used by the GUI too and needs vocabulary.ts and wake.ts. It imports them with an explicit
  // ".ts" extension, which Next resolves; a ".js" extension (what the server's other files use) it cannot.
  it("normalize.ts only imports local files with an explicit .ts extension", () => {
    const source = readFileSync(new URL("./normalize.ts", import.meta.url), "utf8");
    const locals = [...source.matchAll(/^\s*(?:import|\}) [^;]*?from\s+["'](\.{1,2}\/[^"']+)["']/gm)].map((m) => m[1]);
    expect(locals.length).toBeGreaterThan(0);
    for (const l of locals) expect(l, `${l} must end in .ts`).toMatch(/\.ts$/);
  });

  for (const file of ["speak.ts", "speakable.ts", "transcribe.ts", "wake.ts"]) {
    it(file, () => {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/^\s*import[^;]*from\s+["']\.{1,2}\//m);
    });
  }
});
