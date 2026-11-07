import type { Stage } from "../types.js";

// Per-session publish/subscribe for audit stages. `GET /api/stream` subscribes,
// the message handler publishes. In memory only, which is fine for a demo.
export type StageBus = {
  subscribe(sessionId: string, listener: (stage: Stage) => void): () => void;
  publish(sessionId: string, stage: Stage): void;
};

export function createStageBus(): StageBus {
  const listeners = new Map<string, Set<(stage: Stage) => void>>();
  return {
    subscribe(sessionId, listener) {
      const set = listeners.get(sessionId) ?? new Set();
      set.add(listener);
      listeners.set(sessionId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(sessionId);
      };
    },
    publish(sessionId, stage) {
      for (const listener of listeners.get(sessionId) ?? []) listener(stage);
    },
  };
}
