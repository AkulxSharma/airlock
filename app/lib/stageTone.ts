import type { Stage } from "./api";

/**
 * How a stage card should look. The server sends only pending, done or error, but "done" is also
 * used for a step that was skipped or that ran and found a concern. Green must mean "this check
 * ran and passed", so those two cases get their own look.
 */
export type StageTone = "idle" | "pending" | "pass" | "skipped" | "caution" | "fail";

export function stageTone(stage: Stage | undefined): StageTone {
  if (!stage) return "idle";
  if (stage.status === "pending") return "pending";
  if (stage.status === "error") return "fail";
  const detail = stage.detail ?? "";
  if (/^skipped|not checked/i.test(detail)) return "skipped";
  if (/no verified source|unverified/i.test(detail)) return "caution";
  return "pass";
}
