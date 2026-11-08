import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/api/app.js";
import { createStageBus } from "../src/api/stream.js";
import type { MessageResponse } from "../src/types.js";

const RESPONSE: MessageResponse = { reply: "ok", stages: [], needsConfirm: false };

function setup() {
  const handle = vi.fn(async () => RESPONSE);
  const app = createApp({ handle, bus: createStageBus(), allowedOrigins: ["http://localhost:3000"] });
  const post = (body: unknown) =>
    app.request("/api/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { handle, post };
}
const VALID = { sessionId: "s1", channel: "gui", text: "send 0.01 to vitalik.eth" };

// Found by stress-testing the live server: a 100 MB request was accepted (the server's memory went from
// 203 MB to 533 MB), and a 100 KB session id was stored as a map key. A request has a few hundred bytes.
describe("request size limits", () => {
  it("accepts normal requests, including the longest allowed text and session id", async () => {
    const t = setup();
    expect((await t.post(VALID)).status).toBe(200);
    expect((await t.post({ ...VALID, text: "a".repeat(2000) })).status).toBe(200);
    expect((await t.post({ ...VALID, sessionId: "s".repeat(200) })).status).toBe(200);
    expect((await t.post({ ...VALID, sessionId: "imessage:+17165550100" })).status).toBe(200);
  });

  it("refuses text longer than 2000 characters with a 400 and never calls the handler", async () => {
    const t = setup();
    const res = await t.post({ ...VALID, text: "a".repeat(2001) });
    expect(res.status).toBe(400);
    expect(t.handle).not.toHaveBeenCalled();
  });

  it("refuses a session id longer than 200 characters", async () => {
    const t = setup();
    expect((await t.post({ ...VALID, sessionId: "s".repeat(201) })).status).toBe(400);
    expect(t.handle).not.toHaveBeenCalled();
  });

  it("refuses a body larger than 16 KB with a 413 before reading it", async () => {
    const t = setup();
    const res = await t.post({ ...VALID, text: "a".repeat(20_000) });
    expect([400, 413]).toContain(res.status); // 413 from the body limit (the text rule would also refuse it)
    const big = await t.post(JSON.stringify({ ...VALID, padding: "x".repeat(20_000) }));
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: "request too large" });
    expect(t.handle).not.toHaveBeenCalled();
  });
});
