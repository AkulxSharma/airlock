import { AuditResultSchema } from "../types.js";

export type GateDecision = { action: "refuse" | "confirm"; reason: string };

// The safety rule as plain code. No I/O, no clock, no model.
// Anything that is not a well-formed LOW or MEDIUM audit result is a refusal.
// There is no "approve" outcome: the best case is "ask the user to confirm".
export function decide(input: unknown): GateDecision {
  if (typeof input !== "object" || input === null) {
    return { action: "refuse", reason: "Audit result was missing or malformed." };
  }

  const obj = input as Record<string, unknown>;

  if ("timeout" in obj && obj.timeout === true) {
    return { action: "refuse", reason: "The audit timed out, so Airlock cannot check this address." };
  }
  if ("error" in obj) {
    return { action: "refuse", reason: "The audit failed, so Airlock cannot check this address." };
  }

  const parsed = AuditResultSchema.safeParse(input);
  if (!parsed.success) {
    return { action: "refuse", reason: "Audit result was missing or malformed." };
  }

  const { verdict } = parsed.data;
  if (verdict === "HIGH") {
    return { action: "refuse", reason: "Risk signal is HIGH, so Airlock will not send." };
  }
  return {
    action: "confirm",
    reason: `Risk signal is ${verdict}. This is a risk signal, not a guarantee. Confirm to send.`,
  };
}
