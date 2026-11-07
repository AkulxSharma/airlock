"use client";

import { SendHorizonal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, LogEntry, Pending } from "@/lib/useAirlock";
import type { ParsedReply } from "@/lib/parseReply";
import type { Stage } from "@/lib/api";
import { EventLog } from "./EventLog";
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
}

export function Console({ messages, stages, log, verdict, pending, busy, voice, onSend, onAnswer }: Props) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="space-y-8">
      <header className="animate-fade-in-up">
        <h2 className="font-serif text-4xl italic tracking-tight">Say it. Airlock checks it.</h2>
        <p className="mt-2 text-muted-foreground">Then it moves. Type or hold the mic. A rule in plain code decides, never the model.</p>
      </header>

      <StageRows stages={stages} />
      <VerdictCard data={verdict} pending={pending} busy={busy} onAnswer={onAnswer} />

      <section aria-label="Conversation" className="space-y-3">
        {messages.length === 0 && <p className="text-sm text-muted-foreground">Try: <button className="underline underline-offset-4 hover:text-foreground" onClick={() => onSend("send 0.01 to vitalik.eth")}>send 0.01 to vitalik.eth</button></p>}
        {messages.map((m) => (
          <div key={m.id} className={`animate-fade-in-up flex ${m.from === "you" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm ${m.from === "you" ? "bg-foreground text-background" : "border border-border bg-card/80 text-foreground backdrop-blur"}`}>
              {m.channel === "voice" && <span className="mb-1 block text-[10px] uppercase tracking-widest opacity-70">heard by voice</span>}
              {m.text}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Checking…</p>}
        <div ref={end} />
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

      <section aria-label="Recent events">
        <h3 className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Live log</h3>
        <EventLog log={log} />
      </section>
    </div>
  );
}
