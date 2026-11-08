"use client";

import { Clock, RotateCcw, SendHorizonal, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ChatMessage, LogEntry, Pending } from "@/lib/useAirlock";
import type { ParsedReply } from "@/lib/parseReply";
import type { Stage } from "@/lib/api";
import { EventLog, LogHeader } from "./EventLog";
import { StageRows } from "./StageRows";
import { VerdictCard } from "./VerdictCard";
import { MicButton, type VoiceControls } from "./VoicePanel";

interface Props {
  messages: ChatMessage[];
  stages: Partial<Record<Stage["name"], Stage>>;
  log: LogEntry[];
  verdict: ParsedReply | null;
  pending: Pending | null;
  busy: boolean;
  voice: VoiceControls;
  onSend: (text: string) => void;
  onAnswer: (yes: boolean) => void;
  onReset: () => void;
  onClearLog: () => void;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{children}</h3>
);

export function Console({ messages, stages, log, verdict, pending, busy, voice, onSend, onAnswer, onReset, onClearLog }: Props) {
  const [text, setText] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="space-y-12">
      <header className="animate-fade-in-up text-center">
        <p className="flex items-center justify-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <span className="flex items-center gap-2 text-foreground"><Sparkles className="h-3.5 w-3.5" /> Airlock console</span>
          <span className="text-border">|</span>
          <span suppressHydrationWarning>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</span>
        </p>
        <h2 className="mt-5 font-serif text-6xl tracking-tight">Check it before it moves</h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Sepolia testnet</span>
          <span className="flex items-center gap-2 rounded-full border border-low/40 bg-low/10 px-3 py-1 text-low"><ShieldCheck className="h-4 w-4" /> Risk signal, not a guarantee</span>
          <button onClick={onReset} aria-label="Start a new session" title="Start a new session" className="rounded-full p-2 transition-colors hover:bg-accent hover:text-foreground">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <VerdictCard data={verdict} pending={pending} busy={busy} onAnswer={onAnswer} />

      <section aria-label="Audit stages" className="space-y-4">
        <Label>Audit stages</Label>
        <StageRows stages={stages} />
      </section>

      <section aria-label="Conversation" className="space-y-4">
        <Label>Conversation</Label>
        {messages.length === 0 && <p className="text-sm text-muted-foreground">Try: <button className="underline underline-offset-4 hover:text-foreground" onClick={() => onSend("send 0.01 to vitalik.eth")}>send 0.01 to vitalik.eth</button></p>}
        {messages.map((m) => (
          <div key={m.id} className={`animate-fade-in-up flex ${m.from === "you" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm ${m.from === "you" ? "bg-foreground text-background" : "border border-border bg-card/80 text-foreground backdrop-blur"}`}>
              {m.channel === "voice" && <span className="mb-1 block text-[10px] uppercase tracking-widest opacity-70">heard by voice</span>}
              {m.channel === "imessage" && <span className="mb-1 block text-[10px] uppercase tracking-widest opacity-70">iMessage {m.from === "you" ? `from ${m.who ?? "someone"}` : `reply to ${m.who ?? "someone"}`}</span>}
              {m.text}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Checking…</p>}
      </section>

      <form onSubmit={submit} className="sticky bottom-4 z-10 flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur">
        <div className="lg:hidden"><MicButton voice={voice} size="sm" /></div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="send 0.01 to vitalik.eth"
          aria-label="Message"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="rounded-xl bg-foreground p-2.5 text-background transition-opacity hover:opacity-90 disabled:opacity-40">
          <SendHorizonal className="h-4 w-4" />
        </button>
      </form>

      <section aria-label="Recent events" className="space-y-4">
        <LogHeader title="Live log" count={log.length} onClear={onClearLog} />
        <EventLog log={log} />
      </section>
    </div>
  );
}
