import type { MessageResponse, Stage } from "../types.js";

// A public feed of what happens on the iMessage line, so the website can show it live.
// Only iMessage sessions are published. The sender is masked (last 4 digits or first letter).
export type ActivityEvent =
  | { kind: "message"; channel: "imessage" | "voice"; who: string; text: string }
  | { kind: "stage"; who: string; stage: Stage }
  | { kind: "reply"; who: string; response: MessageResponse };

export type StoredActivity = { id: number; at: number } & ActivityEvent;

export type ActivityBus = {
  emit(ev: ActivityEvent): void;
  subscribe(listener: (ev: StoredActivity) => void): () => void;
  /** The most recent events, oldest first, so a page that opens late still sees what just happened. */
  recent(): StoredActivity[];
};

export function createActivityBus(opts: { max?: number; now?: () => number } = {}): ActivityBus {
  const max = opts.max ?? 40;
  const now = opts.now ?? Date.now;
  const buf: StoredActivity[] = [];
  const listeners = new Set<(ev: StoredActivity) => void>();
  let n = 0;
  return {
    emit(ev) {
      const stored = { id: ++n, at: now(), ...ev } as StoredActivity;
      buf.push(stored);
      if (buf.length > max) buf.shift();
      for (const l of listeners) l(stored);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recent: () => [...buf],
  };
}

const IMESSAGE_PREFIX = "imessage:";
export const isIMessageSession = (sessionId: string) => sessionId.startsWith(IMESSAGE_PREFIX);
export const handleOf = (sessionId: string) => sessionId.slice(IMESSAGE_PREFIX.length);
