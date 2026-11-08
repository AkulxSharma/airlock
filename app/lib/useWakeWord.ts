"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { extractWakeCommand } from "../../voice/wake";
import { createBargeInDetector } from "./bargeIn";
import { createVad } from "./vad";
import { encodeWav, resample } from "./wav";

// Hands-free mode: listen for "Hey Airlock" / "Airlock" and run the command that follows.
//
// How it works: the microphone is read continuously in the browser. A voice-activity detector
// (lib/vad.ts) finds when someone is talking, and only those clips are sent, as 16 kHz WAV, to
// ElevenLabs Scribe through our own /api/transcribe route (the same engine as hold-to-talk, which
// was far more accurate than the browser's built-in recognition in tests). The transcript is then
// checked for the wake phrase. Clips without the phrase are dropped, never acted on.
//
// Protections: it is on by default (the browser asks for microphone permission and shows its own
// recording indicator); it pauses while Airlock speaks or records, so it cannot hear itself; it sends
// at most MAX_CLIPS_PER_MINUTE clips; and every command still goes through the same server path as
// hold-to-talk, so the address guard and the YES confirmation apply unchanged.
const AWAIT_MS = 8000; // after a bare "Hey Airlock", how long to wait for the command
const MAX_CLIPS_PER_MINUTE = 12; // credit and noise protection
const FRAME_SAMPLES = 4096;

type AudioContextCtor = typeof AudioContext;
const audioContextCtor = (): AudioContextCtor | null => {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};
const canCapture = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && audioContextCtor() !== null;

export interface WakeControls {
  supported: boolean;
  enabled: boolean;
  live: boolean; // the microphone is being read right now
  awaiting: boolean; // heard "Hey Airlock", waiting for the command
  heard: string; // the last clip's transcript, so a failure to trigger is visible
  error: string | null;
  toggle: () => void;
}

// While Airlock is speaking, `barge.speaking` is true and the microphone stays live (the browser's echo
// cancellation removes most of Airlock's own voice). If the person talks over it, `barge.onInterrupt`
// is called so the reply stops, and the first moments of what they said are kept, so "Hey Airlock, ..." is not clipped.
export interface BargeInControls {
  speaking: boolean;
  onInterrupt: () => void;
}
const RECENT_FRAMES = 6; // about half a second of audio kept while Airlock speaks

export function useWakeWord(onCommand: (text: string) => void, paused: boolean, onEvent?: (message: string) => void, barge?: BargeInControls): WakeControls {
  const supported = useSyncExternalStore(() => () => {}, canCapture, () => false);
  const [enabled, setEnabled] = useState(true); // on by default; the browser still asks for mic permission first
  const [live, setLive] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);
  const awaitUntil = useRef(0);
  const pausedRef = useRef(paused);
  const speakingRef = useRef(barge?.speaking ?? false);
  const interruptRef = useRef(barge?.onInterrupt);
  const commandRef = useRef(onCommand);
  const eventRef = useRef(onEvent);
  const inFlight = useRef(false);
  const sentAt = useRef<number[]>([]);
  useEffect(() => { pausedRef.current = paused; commandRef.current = onCommand; eventRef.current = onEvent; speakingRef.current = barge?.speaking ?? false; interruptRef.current = barge?.onInterrupt; });

  useEffect(() => {
    if (!enabled) return;
    const Ctor = audioContextCtor();
    if (!canCapture() || !Ctor) { eventRef.current?.("hands-free: this browser cannot read the microphone"); return; }
    const say = (m: string) => eventRef.current?.(m);

    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let processor: ScriptProcessorNode | null = null;
    let resume: (() => void) | null = null;

    const handleText = (text: string) => {
      if (!text) return;
      setHeard(text);
      if (pausedRef.current) { say(`hands-free heard (ignored, busy): “${text}”`); return; }

      if (Date.now() < awaitUntil.current) { // the command after a bare "Hey Airlock"
        awaitUntil.current = 0;
        setAwaiting(false);
        const cmd = extractWakeCommand(text).command || text;
        say(`hands-free command: “${cmd}”`);
        commandRef.current(cmd);
        return;
      }
      const wake = extractWakeCommand(text);
      if (!wake.woke) { say(`hands-free heard (no wake phrase, ignored): “${text}”`); return; }
      if (wake.command) {
        say(`hands-free command: “${wake.command}”`);
        commandRef.current(wake.command);
      } else {
        say("hands-free: heard “Hey Airlock”, waiting for the command");
        awaitUntil.current = Date.now() + AWAIT_MS;
        setAwaiting(true);
        setTimeout(() => { if (Date.now() >= awaitUntil.current) setAwaiting(false); }, AWAIT_MS + 100);
      }
    };

    const handleClip = async (pcm: Float32Array, rate: number) => {
      if (inFlight.current) { say("hands-free: still busy with the last clip, skipped this one"); return; }
      const now = Date.now();
      sentAt.current = sentAt.current.filter((t) => now - t < 60_000);
      if (sentAt.current.length >= MAX_CLIPS_PER_MINUTE) { say(`hands-free: cap of ${MAX_CLIPS_PER_MINUTE} clips a minute reached, skipped this one`); return; }
      sentAt.current.push(now);
      inFlight.current = true;
      try {
        const wav = encodeWav(resample(pcm, rate));
        const form = new FormData();
        form.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "speech.wav");
        form.append("mimeType", "audio/wav");
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = (await res.json()) as { text?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || typeof data.text !== "string") { say(`hands-free: transcription failed (${data.error ?? res.status})`); return; }
        handleText(data.text.trim());
      } catch {
        say("hands-free: could not reach the transcription service");
      } finally {
        inFlight.current = false;
      }
    };

    const start = async () => {
      try {
        // The browser's own noise suppression and echo cancellation help a weak microphone.
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setError(name === "NotFoundError" ? "No microphone was found for hands-free." : "Microphone blocked. Allow it in the browser to use hands-free.");
        say(`hands-free error: ${name || "microphone unavailable"}`);
        setEnabled(false);
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

      ctx = new Ctor();
      const audio = ctx;
      // Browsers may start audio suspended until the page is touched once.
      resume = () => { if (audio.state === "suspended") void audio.resume(); };
      resume();
      window.addEventListener("pointerdown", resume);
      window.addEventListener("keydown", resume);
      const sync = () => { setLive(audio.state === "running"); };
      audio.onstatechange = sync;

      source = audio.createMediaStreamSource(stream);
      processor = audio.createScriptProcessor(FRAME_SAMPLES, 1, 1);
      const silent = audio.createGain();
      silent.gain.value = 0; // the processor must be connected to run; this keeps the speakers quiet
      const vad = createVad({ frameMs: (FRAME_SAMPLES / audio.sampleRate) * 1000 });
      const detector = createBargeInDetector();
      let recent: Float32Array[] = [];
      let wasSpeaking = false;
      processor.onaudioprocess = (e) => {
        const samples = e.inputBuffer.getChannelData(0);
        if (speakingRef.current && !pausedRef.current) {
          // Airlock is talking. Do not transcribe its own voice, but listen for the person talking over it.
          if (!wasSpeaking) { wasSpeaking = true; detector.reset(); recent = []; vad.reset(); }
          recent.push(samples.slice());
          if (recent.length > RECENT_FRAMES) recent.shift();
          if (detector.feed(samples)) {
            say("hands-free: you talked over Airlock, so it stopped");
            const kept = recent;
            recent = [];
            wasSpeaking = false;
            interruptRef.current?.();
            // Hand the start of the interruption to the speech detector, so the first word is not lost.
            for (const f of kept) {
              const clip = vad.feed(f);
              if (clip) void handleClip(clip, audio.sampleRate);
            }
          }
          return;
        }
        wasSpeaking = false;
        if (pausedRef.current) { vad.reset(); return; } // drop audio while Airlock records or works
        const clip = vad.feed(samples);
        if (clip) void handleClip(clip, audio.sampleRate);
      };
      source.connect(processor);
      processor.connect(silent);
      silent.connect(audio.destination);
      setError(null);
      sync();
      say("hands-free: listening for “Hey Airlock”");
    };
    void start();

    return () => {
      cancelled = true;
      if (resume) { window.removeEventListener("pointerdown", resume); window.removeEventListener("keydown", resume); }
      if (processor) { processor.onaudioprocess = null; processor.disconnect(); }
      source?.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      if (ctx) { ctx.onstatechange = null; void ctx.close().catch(() => {}); }
      setLive(false);
      awaitUntil.current = 0;
    };
  }, [enabled]);

  const toggle = useCallback(() => { setError(null); setAwaiting(false); setEnabled((v) => !v); }, []);
  return { supported, enabled, live: enabled && live, awaiting: enabled && awaiting, heard, error, toggle };
}
