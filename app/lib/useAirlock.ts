"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, checkHealth, sendMessage, streamUrl, type Stage } from "./api";
import { parseResponse, resolveExpiry, type ParsedReply } from "./parseReply";
import { createStagePacer } from "./stagePacer";

export interface ChatMessage {
  id: number;
  from: "you" | "airlock";
  text: string;
  channel?: "gui" | "voice";
  parsed?: ParsedReply;
}
export interface LogEntry { id: number; at: number; kind: "stage" | "message" | "system"; text: string }
export interface Pending { expiresAt: number; to?: string; amountEth?: string }

export const STAGE_NAMES: Stage["name"][] = ["address", "bytecode", "source", "gate"];

function newSessionId(): string {
  try {
    const saved = localStorage.getItem("airlock-session");
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem("airlock-session", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function useAirlock() {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stages, setStages] = useState<Partial<Record<Stage["name"], Stage>>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const [verdict, setVerdict] = useState<ParsedReply | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [streamUp, setStreamUp] = useState(false);
  // Stage updates play one at a time so people can watch the check move step by step.
  const [pacer] = useState(() => createStagePacer((s) => setStages((prev) => ({ ...prev, [s.name]: s }))));
  const counter = useRef(0);
  const nextId = () => ++counter.current;

  const addLog = useCallback((kind: LogEntry["kind"], text: string) => {
    setLog((l) => [...l.slice(-199), { id: nextId(), at: Date.now(), kind, text }]);
  }, []);

  // One-time read of the saved session id after mount: localStorage does not exist during server rendering.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSessionId(newSessionId()), []);

  // Server health, re-checked every 5 seconds so the banner reflects reality.
  useEffect(() => {
    let alive = true;
    const tick = async () => { const ok = await checkHealth(); if (alive) setOnline(ok); };
    void tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Live audit stages. EventSource reconnects by itself after a drop.
  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(streamUrl(sessionId));
    es.addEventListener("ready", () => { setStreamUp(true); addLog("system", "Live stream connected"); });
    es.addEventListener("stage", (e) => {
      try {
        const stage = JSON.parse((e as MessageEvent).data) as Stage;
        pacer.push(stage);
        addLog("stage", `${stage.name}: ${stage.status}${stage.detail ? ` (${stage.detail})` : ""}`);
      } catch { /* ignore a malformed event */ }
    });
    es.onerror = () => { setStreamUp(false); };
    return () => es.close();
  }, [sessionId, addLog, pacer]);

  // Drop the confirm state when its time is up (the server enforces the real expiry).
  useEffect(() => {
    if (!pending) return;
    const ms = pending.expiresAt - Date.now();
    const t = setTimeout(() => setPending(null), Math.max(ms, 0));
    return () => clearTimeout(t);
  }, [pending]);

  const send = useCallback(async (text: string, channel: "gui" | "voice" = "gui"): Promise<ParsedReply | null> => {
    const clean = text.trim();
    if (!clean || !sessionId) return null;
    setBusy(true);
    setPending(null);
    pacer.reset();
    setStages({});
    setMessages((m) => [...m, { id: nextId(), from: "you", text: clean, channel }]);
    addLog("message", `you (${channel}): ${clean}`);
    try {
      const res = await sendMessage({ sessionId, channel, text: clean });
      const parsed = parseResponse(res);
      // The response carries each stage's final state. Queue them in order after anything the stream
      // already sent (repeats are dropped), then wait for the cards to finish playing before showing
      // the verdict, so the order on screen is: stages one by one, then the answer.
      for (const name of STAGE_NAMES) { const st = res.stages.find((s) => s.name === name); if (st) pacer.push(st); }
      await pacer.drain();
      setMessages((m) => [...m, { id: nextId(), from: "airlock", text: res.reply, parsed }]);
      addLog("message", `airlock: ${parsed.headline}`);
      if (parsed.kind === "confirm" || parsed.kind === "refused" || parsed.kind === "sent") setVerdict(parsed);
      if (parsed.kind === "confirm") {
        const expiresAt = resolveExpiry(parsed.expiresAt, parsed.expiresInSeconds, Date.now());
        if (expiresAt) setPending({ expiresAt, to: parsed.to, amountEth: parsed.amountEth });
      }
      return parsed;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong sending that.";
      setMessages((m) => [...m, { id: nextId(), from: "airlock", text: msg, parsed: { kind: "info", findings: [], headline: msg } }]);
      addLog("system", msg);
      setOnline(false);
      return null;
    } finally {
      setBusy(false);
    }
  }, [sessionId, addLog, pacer]);

  /** Start over: new session id (so the stream and any pending confirm are fresh) and a clean screen. */
  const reset = useCallback(() => {
    const id = crypto.randomUUID();
    try { localStorage.setItem("airlock-session", id); } catch { /* private window */ }
    pacer.reset(); setMessages([]); setStages({}); setVerdict(null); setPending(null); setLog([]); setSessionId(id);
  }, [pacer]);

  const clearLog = useCallback(() => setLog([]), []);
  /** Let other parts of the page (for example hands-free listening) write to the live log. */
  const note = useCallback((text: string) => addLog("system", text), [addLog]);

  return { sessionId, messages, stages, log, verdict, pending, busy, online, streamUp, send, reset, clearLog, note };
}
