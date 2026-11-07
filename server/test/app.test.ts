import { describe, expect, it, vi } from "vitest";
import { createApp, parseAllowedOrigins } from "../src/api/app.js";
import { createStageBus } from "../src/api/stream.js";
import type { MessageResponse } from "../src/types.js";

const RESPONSE: MessageResponse = { reply: "ok", stages: [], needsConfirm: false };

function setup() {
  const handle = vi.fn(async () => RESPONSE);
  const bus = createStageBus();
  const app = createApp({ handle, bus, allowedOrigins: ["http://localhost:3000"] });
  const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
    app.request("/api/message", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { app, handle, bus, post };
}

const VALID = { sessionId: "s1", channel: "gui", text: "send 0.01 to vitalik.eth" };

describe("POST /api/message", () => {
  it("returns the handler's response for a valid request", async () => {
    const t = setup();
    const res = await t.post(VALID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESPONSE);
    expect(t.handle).toHaveBeenCalledWith(VALID);
  });

  it("rejects a non-JSON content type, so a cross-site form post cannot trigger it", async () => {
    const t = setup();
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      const res = await t.post(JSON.stringify(VALID), { "content-type": type });
      expect(res.status).toBe(415);
    }
    const none = await t.post(JSON.stringify(VALID), {});
    expect(none.status).toBe(415);
    expect(t.handle).not.toHaveBeenCalled();
  });

  it("rejects a request from an origin that is not allowed", async () => {
    const t = setup();
    const res = await t.post(VALID, { "content-type": "application/json", origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(t.handle).not.toHaveBeenCalled();
  });

  it("accepts the allowed origin and answers with CORS headers", async () => {
    const t = setup();
    const res = await t.post(VALID, { "content-type": "application/json", origin: "http://localhost:3000" });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("answers a preflight for the allowed origin only", async () => {
    const t = setup();
    const ok = await t.app.request("/api/message", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(ok.status).toBeLessThan(300);
    const bad = await t.app.request("/api/message", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(bad.status).toBe(403);
  });

  it("rejects invalid JSON and invalid shapes", async () => {
    const t = setup();
    expect((await t.post("{not json")).status).toBe(400);
    expect((await t.post({ sessionId: "", channel: "gui", text: "x" })).status).toBe(400);
    expect((await t.post({ sessionId: "s", channel: "sms", text: "x" })).status).toBe(400);
    expect((await t.post({ sessionId: "s", channel: "gui" })).status).toBe(400);
    expect(t.handle).not.toHaveBeenCalled();
  });
});

describe("GET /api/stream and /health", () => {
  it("health answers ok", async () => {
    const res = await setup().app.request("/health");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("stream needs a sessionId", async () => {
    expect((await setup().app.request("/api/stream")).status).toBe(400);
  });

  it("stream refuses an origin that is not allowed", async () => {
    const res = await setup().app.request("/api/stream?sessionId=s1", { headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("stream delivers published stages for that session only", async () => {
    const t = setup();
    const res = await t.app.request("/api/stream?sessionId=s1");
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let seen = "";
    const readUntil = async (needle: string) => {
      while (!seen.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += decoder.decode(value);
      }
    };
    await readUntil("event: ready");
    t.bus.publish("other", { name: "gate", status: "done" });
    t.bus.publish("s1", { name: "address", status: "done", detail: "0xabc" });
    await readUntil("event: stage");
    expect(seen).toContain('"name":"address"');
    expect(seen).not.toContain('"name":"gate"');
    await reader.cancel();
  });
});

describe("parseAllowedOrigins", () => {
  it("defaults to the local GUI origins and trims a custom list", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3100",
      "http://127.0.0.1:3100",
    ]);
    expect(parseAllowedOrigins(" http://a.test , http://b.test ,, ")).toEqual(["http://a.test", "http://b.test"]);
  });
});

describe("stage bus", () => {
  it("unsubscribe stops delivery", () => {
    const bus = createStageBus();
    const got: string[] = [];
    const off = bus.subscribe("s", (s) => got.push(s.name));
    bus.publish("s", { name: "address", status: "done" });
    off();
    bus.publish("s", { name: "gate", status: "done" });
    expect(got).toEqual(["address"]);
  });
});
