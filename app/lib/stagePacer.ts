import type { Stage } from "./api";

/**
 * Plays audit-stage updates one at a time, with a pause after each, so people can watch the check
 * move step by step. The real audit can finish in under a second; this only paces what the screen
 * shows (the live log still records the true times). Rules:
 *  - updates are shown in the order they were pushed
 *  - a stage that is already done or failed never goes back to "pending" (a late event is dropped)
 *  - an update that repeats what was already queued is dropped
 */
export function createStagePacer(
  apply: (stage: Stage) => void,
  delayMs = 550,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  const queue: Stage[] = [];
  const last = new Map<Stage["name"], Stage>();
  let running: Promise<void> | null = null;
  let epoch = 0;

  const run = async () => {
    const mine = epoch;
    while (queue.length && mine === epoch) {
      apply(queue.shift() as Stage);
      await wait(delayMs);
    }
    if (mine === epoch) running = null;
  };

  return {
    push(stage: Stage) {
      const prev = last.get(stage.name);
      if (prev && (prev.status === "done" || prev.status === "error") && stage.status === "pending") return;
      if (prev && prev.status === stage.status && prev.detail === stage.detail) return;
      last.set(stage.name, stage);
      queue.push(stage);
      if (!running) running = run();
    },
    /** Resolves once everything pushed so far has been shown. */
    drain(): Promise<void> {
      return running ?? Promise.resolve();
    },
    /** Forget everything (a new request is starting). */
    reset() {
      epoch++;
      queue.length = 0;
      last.clear();
      running = null;
    },
  };
}
