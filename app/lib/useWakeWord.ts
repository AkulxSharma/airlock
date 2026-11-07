"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { extractWakeCommand } from "../../voice/wake";

// Hands-free mode: listen for "Hey Airlock" / "Airlock" and run the command that follows.
// It uses the browser's built-in speech recognition (Chrome, Edge, Safari), which keeps listening
// without spending ElevenLabs credits. It is on by default (the browser asks for microphone permission, and shows its own recording indicator), and it pauses while
// Airlock is speaking so it cannot hear its own voice. Every command still goes through the same
// server path as hold-to-talk: the address guard and the YES confirmation apply unchanged.
interface RecAlt { transcript: string }
interface RecResult { isFinal: boolean; 0: RecAlt }
interface RecEvent { resultIndex: number; results: ArrayLike<RecResult> }
interface Rec {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onresult: ((e: RecEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecCtor = new () => Rec;

const ctor = (): RecCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const AWAIT_MS = 8000; // after a bare "Hey Airlock", how long to wait for the command

export interface WakeControls {
  supported: boolean;
  enabled: boolean;
  awaiting: boolean; // heard "Hey Airlock", waiting for the command
  error: string | null;
  toggle: () => void;
}

export function useWakeWord(onCommand: (text: string) => void, paused: boolean): WakeControls {
  const supported = useSyncExternalStore(() => () => {}, () => ctor() !== null, () => false);
  const [enabled, setEnabled] = useState(true); // on by default; the browser still asks for mic permission first
  const [awaiting, setAwaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const awaitUntil = useRef(0);
  const pausedRef = useRef(paused);
  const commandRef = useRef(onCommand);
  useEffect(() => { pausedRef.current = paused; commandRef.current = onCommand; });

  useEffect(() => {
    if (!enabled) return;
    const Ctor = ctor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    let stopped = false;
    let restart: ReturnType<typeof setTimeout> | undefined;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r.isFinal || pausedRef.current) continue;
        const text = r[0].transcript.trim();
        if (!text) continue;

        if (Date.now() < awaitUntil.current) { // the command after a bare "Hey Airlock"
          awaitUntil.current = 0;
          setAwaiting(false);
          commandRef.current(extractWakeCommand(text).command || text);
          continue;
        }
        const wake = extractWakeCommand(text);
        if (!wake.woke) continue; // ordinary talking: ignore it
        if (wake.command) commandRef.current(wake.command);
        else {
          awaitUntil.current = Date.now() + AWAIT_MS;
          setAwaiting(true);
          setTimeout(() => { if (Date.now() >= awaitUntil.current) setAwaiting(false); }, AWAIT_MS + 100);
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopped = true;
        setError("Microphone blocked. Allow it in the browser to use hands-free.");
        setEnabled(false);
      }
    };
    // The browser ends recognition after a pause in speech; start it again.
    rec.onend = () => { if (!stopped) restart = setTimeout(() => { try { rec.start(); } catch { /* already running */ } }, 400); };
    try { rec.start(); } catch { /* already running */ }

    return () => {
      stopped = true;
      clearTimeout(restart);
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      try { rec.stop(); } catch { /* not started */ }
      awaitUntil.current = 0;
    };
  }, [enabled]);

  const toggle = useCallback(() => { setError(null); setAwaiting(false); setEnabled((v) => !v); }, []);
  return { supported, enabled, awaiting: enabled && awaiting, error, toggle };
}
