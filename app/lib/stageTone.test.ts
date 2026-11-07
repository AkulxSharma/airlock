import { describe, expect, it } from "vitest";
import type { Stage } from "./api";
import { stageTone } from "./stageTone";

const st = (status: Stage["status"], detail?: string): Stage => ({ name: "source", status, detail });

describe("stageTone", () => {
  it("is idle before anything arrives, and pending while running", () => {
    expect(stageTone(undefined)).toBe("idle");
    expect(stageTone(st("pending"))).toBe("pending");
  });
  it("is a pass only when the step ran and passed", () => {
    expect(stageTone(st("done"))).toBe("pass");
    expect(stageTone({ name: "address", status: "done", detail: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" })).toBe("pass");
    expect(stageTone({ name: "gate", status: "done", detail: "confirm" })).toBe("pass");
  });
  it("is skipped (not green) when the step did not run, in either wording the server has used", () => {
    expect(stageTone(st("done", "not checked yet"))).toBe("skipped");
    expect(stageTone(st("done", "skipped (no contract code)"))).toBe("skipped");
    expect(stageTone(st("done", "Skipped (audit failed)"))).toBe("skipped");
  });
  it("is a caution when the step ran but found no verified source", () => {
    expect(stageTone(st("done", "no verified source found"))).toBe("caution");
  });
  it("is a failure for any error, whatever the detail says", () => {
    expect(stageTone(st("error", "source lookup failed"))).toBe("fail");
    expect(stageTone(st("error", "skipped (audit failed)"))).toBe("fail");
  });
});
