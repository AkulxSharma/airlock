import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { MessageRequestSchema } from "../types.js";
import type { MessageResponse } from "../types.js";
import type { ActivityBus } from "./activity.js";
import type { StageBus } from "./stream.js";

export type AppDeps = {
  handle(req: ReturnType<typeof MessageRequestSchema.parse>): Promise<MessageResponse>;
  bus: StageBus;
  allowedOrigins: string[];
  /** Agent wallet and demo contract balances for the GUI. Omit to leave the route off. */
  wallets?(): Promise<unknown>;
  /** Live feed of iMessage activity for the website. Omit to leave the route off. */
  activity?: ActivityBus;
};

export function parseAllowedOrigins(raw: string | undefined): string[] {
  const list = (raw ?? "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return list;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  // A website the user happens to visit must not be able to drive this local server.
  // Browsers always send Origin on cross-site requests, so an unlisted Origin is refused.
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !deps.allowedOrigins.includes(origin)) {
      return c.json({ error: "origin not allowed" }, 403);
    }
    await next();
  });
  app.use(
    "*",
    cors({
      origin: (origin) => (deps.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type"],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/api/wallets", async (c) => {
    if (!deps.wallets) return c.json({ error: "not available" }, 404);
    try {
      return c.json(await deps.wallets());
    } catch {
      return c.json({ error: "could not read balances" }, 502);
    }
  });

  app.get("/api/activity", (c) => {
    const feed = deps.activity;
    if (!feed) return c.json({ error: "not available" }, 404);
    return streamSSE(c, async (stream) => {
      const send = (ev: { id: number }) => stream.writeSSE({ event: "activity", id: String(ev.id), data: JSON.stringify(ev) });
      const unsubscribe = feed.subscribe((ev) => void send(ev));
      stream.onAbort(unsubscribe);
      await stream.writeSSE({ event: "ready", data: "ok" });
      for (const ev of feed.recent()) await send(ev);
      while (!stream.aborted) await stream.sleep(15_000);
      unsubscribe();
    });
  });

  // The largest legitimate request is a few hundred bytes. Refuse anything big before it is read.
  const tooLarge = bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "request too large" }, 413) });

  app.post("/api/message", tooLarge, async (c) => {
    // Requiring JSON forces a CORS preflight for cross-site pages, so a plain-text form
    // post cannot trigger a send.
    if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return c.json({ error: "content-type must be application/json" }, 415);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }
    const parsed = MessageRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid request" }, 400);
    return c.json(await deps.handle(parsed.data));
  });

  app.get("/api/stream", (c) => {
    const sessionId = c.req.query("sessionId");
    if (!sessionId) return c.json({ error: "sessionId is required" }, 400);
    return streamSSE(c, async (stream) => {
      const unsubscribe = deps.bus.subscribe(sessionId, (stage) => {
        void stream.writeSSE({ event: "stage", data: JSON.stringify(stage) });
      });
      stream.onAbort(unsubscribe);
      await stream.writeSSE({ event: "ready", data: "ok" });
      while (!stream.aborted) await stream.sleep(15_000);
      unsubscribe();
    });
  });

  return app;
}
