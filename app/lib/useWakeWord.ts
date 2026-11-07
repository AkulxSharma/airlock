"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { extractWakeCommand } from "../../voice/wake";

// Hands-free mode: listen for "Hey Airlock" / "Airlock" and run the command that follows.
// It uses the browser's built-in speech recognition (Chrome, Edge, Safari), which keeps listening
// without spending ElevenLabs credits. It is on by default (the browser asks for microphone permission,
// and shows its own recording indicator), and it pauses while Airlock is speaking so it cannot hear
// its own voice. Every command still goes through the same server path as hold-to-talk: the address
// guard and the YES confirmation apply unchanged.
//
// It reports what it is doing (started, heard, errors) so a failure is visible instead of silent.
interface RecAlt { transcript: string }
interface RecResult { isFinal: boolean; 0: RecAlt }
interface RecEvent { resultIndex: number; results: ArrayLike<RecResult> }
interface Rec {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onstart: (() => void) | null;
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
  live: boolean; // the browser's recognition is running right now
  awaiting: boolean; // heard "Hey Airlock", waiting for the command
  heard: string; // the last phrase the browser heard, so a failure to trigger is visible
  error: string | null;
  toggle: () => void;
}

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Microphone blocked. Allow it in the browser to use hands-free.",
  "service-not-allowed": "This browser blocked speech recognition. Allow the microphone in its settings.",
  network: "The browser's speech service could not be reached. Hands-free needs an internet connection.",
  "audio-capture": "No microphone was found for hands-free.",
};

export function useWakeWord(onCommand: (text: string) => void, paused: boolean, onEvent?: (message: string) => void): WakeControls {
  const supported = useSyncExternalStore(() => () => {}, () => ctor() !== null, () => false);
  const [enabled, setEnabled] = useState(true); // on by default; the browser still asks for mic permission first
  const [live, setLive] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);
  const awaitUntil = useRef(0);
  const pausedRef = useRef(paused);
  const commandRef = useRef(onCommand);
  const eventRef = useRef(onEvent);
  useEffect(() => { pausedRef.current = paused; commandRef.current = onCommand; eventRef.current = onEvent; });

  useEffect(() => {
    if (!enabled) return;
    const Ctor = ctor();
    if (!Ctor) { eventRef.current?.("hands-free: this browser has no speech recognition"); return; }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    let stopped = false;
    let restart: ReturnType<typeof setTimeout> | undefined;
    const say = (m: string) => eventRef.current?.(m);

    rec.onstart = () => { setLive(true); setError(null); say("hands-free: listening for “Hey Airlock”"); };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r.isFinal) continue;
        const text = r[0].transcript.trim();
        if (!text) continue;
        setHeard(text);
        if (pausedRef.current) { say(`hands-free heard (ignored, busy): “${text}”`); continue; }

        if (Date.now() < awaitUntil.current) { // the command after a bare "Hey Airlock"
          awaitUntil.current = 0;
          setAwaiting(false);
          const cmd = extractWakeCommand(text).command || text;
          say(`hands-free command: “${cmd}”`);
          commandRef.current(cmd);
          continue;
        }
        const wake = extractWakeCommand(text);
        if (!wake.woke) { say(`hands-free heard (no wake phrase): “${text}”`); continue; }
        if (wake.command) {
          say(`hands-free command: “${wake.command}”`);
          commandRef.current(wake.command);
        } else {
          say("hands-free: heard “Hey Airlock”, waiting for the command");
          awaitUntil.current = Date.now() + AWAIT_MS;
          setAwaiting(true);
          setTimeout(() => { if (Date.now() >= awaitUntil.current) setAwaiting(false); }, AWAIT_MS + 100);
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") say(`hands-free error: ${e.error}`);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopped = true;
        setEnabled(false);
      }
      if (ERROR_TEXT[e.error]) setError(ERROR_TEXT[e.error]);
    };
    // The browser ends recognition after a pause in speech; start it again.
    rec.onend = () => {
      setLive(false);
      if (!stopped) restart = setTimeout(() => { try { rec.start(); } catch { /* already running */ } }, 400);
    };
    try { rec.start(); } catch (err) { say(`hands-free could not start: ${err instanceof Error ? err.message : "unknown error"}`); }

    return () => {
      stopped = true;
      clearTimeout(restart);
      rec.onend = null;
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      try { rec.stop(); } catch { /* not started */ }
      awaitUntil.current = 0;
    };
  }, [enabled]);

  const toggle = useCallback(() => { setError(null); setAwaiting(false); setEnabled((v) => !v); }, []);
  return { supported, enabled, live: enabled && live, awaiting: enabled && awaiting, heard, error, toggle };
}
