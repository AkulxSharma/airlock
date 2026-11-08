import { describe, expect, it } from "vitest";
import { createActivityBus, handleOf, isIMessageSession } from "../src/api/activity.js";
import { createApp } from "../src/api/app.js";

describe("iMessage activity feed", () => {
  it("numbers events, keeps the latest ones, and tells listeners", () => {
    const bus = createActivityBus({ max: 2, now: () => 5 });
    const seen: number[] = [];
    const off = bus.subscribe((e) => seen.push(e.id));
    bus.emit({ kind: "message", channel: "imessage", who: "***1234", text: "a" });
    bus.emit({ kind: "message", channel: "imessage", who: "***1234", text: "b" });
    bus.emit({ kind: "message", channel: "voice", who: "***1234", text: "c" });
    off();
    bus.emit({ kind: "message", channel: "imessage", who: "***1234", text: "d" });
    expect(seen).toEqual([1, 2, 3]);
    expect(bus.recent().map((e) => e.id)).toEqual([3, 4]); // max 2
    expect(bus.recent()[0]).toMatchObject({ at: 5, kind: "message", text: "c" });
  });

  it("recognises iMessage sessions only", () => {
    expect(isIMessageSession("imessage:+17165550100")).toBe(true);
    expect(isIMessageSession("2f1c-gui-session")).toBe(false);
    expect(handleOf("imessage:+17165550100")).toBe("+17165550100");
  });

  it("GET /api/activity replays recent events, keeps the origin check, and is 404 when off", async () => {
    const bus = createActivityBus();
    bus.emit({ kind: "message", channel: "imessage", who: "***0100", text: "Airlock send 0.001 to vault.demo" });
    const handle = async () => ({ reply: "", stages: [], needsConfirm: false });
    const stages = { publish() {}, subscribe: () => () => {} };
    const app = createApp({ handle, bus: stages, allowedOrigins: ["http://localhost:3100"], activity: bus });
    const res = await app.request("/api/activity", { headers: { origin: "http://localhost:3100" } });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    let text = "";
    while (!text.includes("vault.demo")) text += new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    expect(text).toContain("event: activity");
    expect(text).toContain("***0100");
    expect((await app.request("/api/activity", { headers: { origin: "http://evil.example" } })).status).toBe(403);
    expect((await createApp({ handle, bus: stages, allowedOrigins: [] }).request("/api/activity")).status).toBe(404);
  });
});

describe("bridge token on a public server", () => {
  const handle = async () => ({ reply: "hi", stages: [], needsConfirm: false });
  const stages = { publish() {}, subscribe: () => () => {} };
  const post = (app: ReturnType<typeof createApp>, sessionId: string, token?: string) =>
    app.request("/api/message", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-airlock-bridge": token } : {}) },
      body: JSON.stringify({ sessionId, channel: "imessage", text: "hello" }),
    });

  it("an imessage: session needs the token; GUI sessions do not", async () => {
    const app = createApp({ handle, bus: stages, allowedOrigins: [], bridgeToken: "s3cret-token" });
    expect((await post(app, "imessage:+17165550100")).status).toBe(403);
    expect((await post(app, "imessage:+17165550100", "wrong")).status).toBe(403);
    expect((await post(app, "imessage:+17165550100", "s3cret-token")).status).toBe(200);
    expect((await post(app, "gui-session-1")).status).toBe(200);
  });

  it("with no token configured (local use) nothing changes", async () => {
    const app = createApp({ handle, bus: stages, allowedOrigins: [] });
    expect((await post(app, "imessage:+17165550100")).status).toBe(200);
  });
});

import { originAllowed } from "../src/api/app.js";

describe("allowed origins with a wildcard", () => {
  const list = ["http://localhost:3100", "https://*.vercel.app"];
  it("matches one host label for *, and exact entries exactly", () => {
    expect(originAllowed(list, "https://airlock-abc123.vercel.app")).toBe(true);
    expect(originAllowed(list, "http://localhost:3100")).toBe(true);
    expect(originAllowed(list, "https://evil.example")).toBe(false);
    expect(originAllowed(list, "https://a.b.vercel.app")).toBe(false); // * is one label, not many
    expect(originAllowed(list, "https://vercel.app.evil.example")).toBe(false);
    expect(originAllowed(list, "http://airlock.vercel.app")).toBe(false); // scheme must match
    expect(originAllowed(list, "https://xvercel.app")).toBe(false);
  });
});
