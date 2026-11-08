import type { MessageResponse, Stage } from "../../server/src/types";

export type { MessageResponse, Stage };
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export class ApiError extends Error {}

export async function sendMessage(body: { sessionId: string; channel: "gui" | "voice"; text: string; source?: "hold" | "hands-free" }): Promise<MessageResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/message`, {
      method: "POST",
      headers: { "content-type": "application/json" }, // required by the server (415 otherwise)
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the Airlock server. Is it running?");
  }
  if (!res.ok) throw new ApiError(`The server rejected the request (HTTP ${res.status}).`);
  return (await res.json()) as MessageResponse;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export function streamUrl(sessionId: string): string {
  return `${API_URL}/api/stream?sessionId=${encodeURIComponent(sessionId)}`;
}
