"use client";

import { Mic, Volume2, VolumeX } from "lucide-react";
import type { VoiceState } from "@/lib/useVoice";
import type { WakeControls } from "@/lib/useWakeWord";

const CAPTION: Record<VoiceState, string> = {
  idle: "Hold to talk",
  listening: "Go ahead, I'm listening...",
  transcribing: "One moment...",
  speaking: "Speaking...",
  error: "Voice unavailable",
};
const STATUS: Record<VoiceState, string> = {
  idle: "Ready",
  listening: "Listening...",
  transcribing: "Transcribing...",
  speaking: "Speaking...",
  error: "Unavailable",
};

export interface VoiceControls {
  state: VoiceState;
  error: string | null;
  lastHeard: string;
  speakReplies: boolean;
  startListening: () => void;
  stopListening: () => void;
  toggleSpeak: () => void;
}

/** Hold-to-talk button. Pointer and keyboard (Space or Enter held) both work. */
export function MicButton({ voice, size = "lg" }: { voice: VoiceControls; size?: "sm" | "lg" }) {
  const live = voice.state === "listening";
  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); voice.startListening(); },
    onPointerUp: voice.stopListening,
    onPointerCancel: voice.stopListening,
    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); voice.startListening(); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") voice.stopListening(); },
  };

  if (size === "sm") {
    return (
      <button type="button" aria-label="Hold to talk" aria-pressed={live} {...handlers}
        className={`flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full transition-all duration-200 ${live ? "scale-110 bg-high text-background" : "bg-foreground text-background hover:opacity-90"}`}>
        <Mic className="h-4 w-4" />
      </button>
    );
  }
  // Large: a dark disc inside a pale ring that pulses while listening.
  return (
    <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-foreground/5">
      {live && <span className="absolute inset-0 rounded-full bg-foreground/15" style={{ animation: "ring 1.2s ease-out infinite" }} aria-hidden />}
      <button type="button" aria-label="Hold to talk" aria-pressed={live} {...handlers}
        className={`relative flex h-16 w-16 select-none items-center justify-center rounded-full bg-foreground text-background transition-transform duration-200 hover:scale-105 ${live ? "scale-110" : ""}`}>
        <Mic className="h-7 w-7" />
      </button>
    </div>
  );
}

export function VoicePanel({ voice, wake }: { voice: VoiceControls; wake: WakeControls }) {
  const active = voice.state === "listening" || voice.state === "speaking" || voice.state === "transcribing" || wake.awaiting;
  const status = wake.awaiting ? "Listening..." : voice.state === "idle" && wake.enabled ? "Say “Hey Airlock”" : STATUS[voice.state];
  const caption = wake.awaiting ? CAPTION.listening : voice.state === "idle" && wake.enabled ? "Say “Hey Airlock”" : CAPTION[voice.state];
  return (
    <aside className="relative z-10 hidden w-[400px] flex-col border-l border-border bg-sidebar/80 backdrop-blur lg:flex">
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-8">
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${voice.state === "error" ? "bg-high" : active ? "bg-low" : "bg-muted-foreground/60"}`} />
          {status}
        </p>

        <div className="flex h-14 items-center justify-center gap-4" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-4 w-2.5 rounded-full ${active ? "bg-foreground/60" : "bg-foreground/15"} ${i === 2 && !active ? "bg-foreground/40" : ""}`}
              style={active ? { animation: "bar 0.9s ease-in-out infinite", animationDelay: `${i * 120}ms` } : undefined}
            />
          ))}
        </div>

        <MicButton voice={voice} />
        <p className="max-w-[220px] text-center text-xs font-medium uppercase leading-relaxed tracking-[0.25em] text-muted-foreground">{caption}</p>

        {(voice.error || wake.error) && <p className="max-w-[280px] text-center text-sm text-high" role="alert">{voice.error ?? wake.error}</p>}
        {voice.lastHeard && (
          <div className="w-full rounded-xl border border-border bg-card/80 p-4 text-sm">
            <p className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">Last heard</p>
            <p className="text-foreground">{voice.lastHeard}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" /> Airlock voice · ElevenLabs
        </p>
        <button
          onClick={voice.toggleSpeak}
          aria-label={voice.speakReplies ? "Mute spoken replies" : "Unmute spoken replies"}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {voice.speakReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
