"use client";

import { Mic, Volume2, VolumeX } from "lucide-react";
import type { VoiceState } from "@/lib/useVoice";

const STATUS: Record<VoiceState, string> = {
  idle: "Hold the button and speak",
  listening: "Listening",
  transcribing: "Transcribing",
  speaking: "Speaking",
  error: "Voice unavailable",
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
  const dims = size === "lg" ? "h-20 w-20" : "h-10 w-10";
  return (
    <button
      type="button"
      aria-label="Hold to talk"
      aria-pressed={live}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); voice.startListening(); }}
      onPointerUp={voice.stopListening}
      onPointerCancel={voice.stopListening}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); voice.startListening(); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") voice.stopListening(); }}
      className={`flex shrink-0 select-none items-center justify-center rounded-full border transition-all duration-200 ${dims} ${live ? "scale-110 border-high bg-high/20 text-high" : "border-border bg-card text-foreground hover:bg-accent"}`}
    >
      <Mic className={size === "lg" ? "h-8 w-8" : "h-4 w-4"} />
    </button>
  );
}

export function VoicePanel({ voice }: { voice: VoiceControls }) {
  const active = voice.state === "listening" || voice.state === "speaking" || voice.state === "transcribing";
  return (
    <aside className="relative z-10 hidden w-[400px] flex-col border-l border-border bg-sidebar/80 backdrop-blur lg:flex">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="font-brand text-xl font-semibold tracking-wide">voice</h2>
        <button
          onClick={voice.toggleSpeak}
          aria-label={voice.speakReplies ? "Mute spoken replies" : "Unmute spoken replies"}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {voice.speakReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
        <div className="flex items-center justify-center gap-3" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-12 w-12 rounded-full ${voice.state === "listening" ? "bg-high/60" : voice.state === "speaking" ? "bg-low/60" : "bg-foreground/20"}`}
              style={{ animation: `orbPulse ${active ? 0.9 : 2.6}s ease-in-out infinite`, animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>

        <MicButton voice={voice} />
        <p className="text-sm text-muted-foreground" aria-live="polite">{STATUS[voice.state]}</p>

        {voice.error && <p className="max-w-[280px] text-center text-sm text-high" role="alert">{voice.error}</p>}
        {voice.lastHeard && (
          <div className="w-full rounded-xl border border-border bg-card/80 p-4 text-sm">
            <p className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">Last heard</p>
            <p className="text-foreground">{voice.lastHeard}</p>
          </div>
        )}
      </div>

      <p className="border-t border-border p-4 text-[11px] leading-relaxed text-muted-foreground">
        Voice never carries an address. Say an ENS name such as vitalik dot eth, or paste an address as text.
      </p>
    </aside>
  );
}
