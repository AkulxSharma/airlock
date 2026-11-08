"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "listening" | "transcribing" | "speaking" | "error";

/**
 * Hold-to-talk microphone plus spoken replies. The ElevenLabs key never reaches the browser:
 * audio goes to our own /api/transcribe and /api/speak routes, which hold the key.
 */
export function useVoice(onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState("");
  const [speakReplies, setSpeakReplies] = useState(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopped = useRef(false);
  const starting = useRef(false); // true while getUserMedia is pending (the permission prompt)
  const wantStop = useRef(false); // button released before the recorder was ready

  /** Stop Airlock mid-sentence (the person interrupted, started talking, or sent something new). */
  const stopSpeaking = useCallback(() => {
    const el = audio.current;
    audio.current = null;
    if (el) { el.pause(); el.onended = el.onerror = null; try { URL.revokeObjectURL(el.src); } catch { /* already gone */ } }
    setState((s) => (s === "speaking" ? "idle" : s));
  }, []);

  const fail = useCallback((msg: string) => { setError(msg); setState("error"); }, []);

  const startListening = useCallback(async () => {
    if (recorder.current || starting.current) return;
    starting.current = true;
    wantStop.current = false;
    setError(null);
    stopped.current = false;
    stopSpeaking(); // talking over Airlock cuts it off
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1500) { setState("idle"); return; } // a tap, not speech
        setState("transcribing");
        try {
          const form = new FormData();
          form.append("file", blob, "speech");
          form.append("mimeType", blob.type);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = (await res.json()) as { text?: string; error?: string };
          if (!res.ok || typeof data.text !== "string") return fail(data.error ?? "Could not transcribe that.");
          setLastHeard(data.text);
          setState("idle");
          if (data.text.trim()) onTranscript(data.text);
        } catch { fail("Could not reach the voice service."); }
      };
      recorder.current = rec;
      rec.start();
      setState("listening");
      starting.current = false;
      // The user let go while the permission prompt was open: stop right away.
      if (wantStop.current) { wantStop.current = false; stopped.current = true; rec.stop(); }
    } catch {
      starting.current = false;
      fail("Microphone blocked. Allow it in the browser to use voice.");
    }
  }, [fail, onTranscript, stopSpeaking]);

  const stopListening = useCallback(() => {
    if (starting.current) { wantStop.current = true; return; }
    const rec = recorder.current;
    if (rec && rec.state !== "inactive" && !stopped.current) { stopped.current = true; rec.stop(); }
  }, []);

  const say = useCallback(async (text: string) => {
    if (!speakReplies || !text.trim()) return;
    stopSpeaking(); // a new reply replaces one still playing
    try {
      const res = await fetch("/api/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) return; // voice is a bonus; the screen already shows the reply
      const url = URL.createObjectURL(await res.blob());
      const el = new Audio(url);
      audio.current = el;
      el.onended = el.onerror = () => { URL.revokeObjectURL(url); if (audio.current === el) audio.current = null; setState((s) => (s === "speaking" ? "idle" : s)); };
      setState("speaking");
      await el.play();
    } catch { setState((s) => (s === "speaking" ? "idle" : s)); }
  }, [speakReplies, stopSpeaking]);

  const toggleSpeak = useCallback(() => {
    setSpeakReplies((v) => { if (v) stopSpeaking(); return !v; });
  }, [stopSpeaking]);

  useEffect(() => () => { audio.current?.pause(); recorder.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  return { state, error, lastHeard, speakReplies, startListening, stopListening, stopSpeaking, say, toggleSpeak };
}
