import { z } from "zod";

export const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string(),
});

export const AuditResultSchema = z.object({
  target: z.string(),
  chainId: z.number().int(),
  verdict: z.enum(["LOW", "MEDIUM", "HIGH"]),
  riskScore: z.number().min(0).max(100),
  findings: z.array(FindingSchema),
});

export const MessageRequestSchema = z.object({
  sessionId: z.string().min(1).max(200), // a browser makes a UUID; 200 leaves room for "imessage:+1..." style ids
  channel: z.enum(["gui", "imessage", "voice"]),
  text: z.string().min(1).max(2000), // a command or a spoken sentence, never a document
  // Voice only. "hands-free" = the always-listening mic (anyone nearby can speak), "hold" = push-to-talk.
  // A spoken YES from hands-free is refused: confirm with the on-screen button instead.
  source: z.enum(["hold", "hands-free"]).optional(),
});

export const StageSchema = z.object({
  name: z.enum(["address", "bytecode", "source", "gate"]),
  status: z.enum(["pending", "done", "error", "skipped"]),
  detail: z.string().optional(),
});

export const PendingSchema = z.object({
  to: z.string(),
  amountEth: z.string(),
  expiresAt: z.number(),
});

// `audit` and `pending` are optional additions for the GUI (see docs/GUI_REQUIREMENTS.md
// section 6). They never replace `reply`, so a client that ignores them keeps working.
export const MessageResponseSchema = z.object({
  reply: z.string(),
  stages: z.array(StageSchema),
  needsConfirm: z.boolean(),
  audit: AuditResultSchema.optional(),
  pending: PendingSchema.optional(),
});

export type Finding = z.infer<typeof FindingSchema>;
export type AuditResult = z.infer<typeof AuditResultSchema>;
export type MessageRequest = z.infer<typeof MessageRequestSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
