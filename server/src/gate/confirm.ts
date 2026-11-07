// Holds at most one pending transfer per session. The YES handler can only act on
// what is in here, and a transfer can be consumed once, before it expires, by the
// same session and the same transfer id. `now` is passed in, so tests need no timers.

export type PendingTransfer = {
  id: string;
  to: string;
  amountEth: string;
  expiresAt: number;
};

export type ConsumeResult =
  | { ok: true; transfer: PendingTransfer }
  | { ok: false; reason: "none" | "expired" | "wrong-id" };

export const DEFAULT_TTL_MS = 60_000;

export type ConfirmStore = {
  create(
    sessionId: string,
    transfer: Omit<PendingTransfer, "expiresAt">,
    now: number,
    ttlMs?: number,
  ): PendingTransfer;
  consume(sessionId: string, id: string, now: number): ConsumeResult;
  cancel(sessionId: string): void;
  peek(sessionId: string): PendingTransfer | undefined;
};

export function createConfirmStore(): ConfirmStore {
  const pending = new Map<string, PendingTransfer>();

  return {
    create(sessionId, transfer, now, ttlMs = DEFAULT_TTL_MS) {
      const full = { ...transfer, expiresAt: now + ttlMs };
      pending.set(sessionId, full); // a new request replaces any older one
      return full;
    },

    consume(sessionId, id, now) {
      const current = pending.get(sessionId);
      if (!current) return { ok: false, reason: "none" };
      if (now >= current.expiresAt) {
        pending.delete(sessionId);
        return { ok: false, reason: "expired" };
      }
      if (current.id !== id) return { ok: false, reason: "wrong-id" };
      pending.delete(sessionId); // single use
      return { ok: true, transfer: current };
    },

    cancel(sessionId) {
      pending.delete(sessionId);
    },

    peek(sessionId) {
      return pending.get(sessionId);
    },
  };
}
