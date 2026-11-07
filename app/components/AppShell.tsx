"use client";

import { useEffect, useRef, useState } from "react";
import { speechFor } from "@/lib/parseReply";
import { useAirlock } from "@/lib/useAirlock";
import { useVoice } from "@/lib/useVoice";
import { useWakeWord } from "@/lib/useWakeWord";
import { Console } from "./Console";
import { EventLog, LogHeader } from "./EventLog";
import { Sidebar, type View } from "./Sidebar";
import { VoicePanel } from "./VoicePanel";

// Quick-start commands. Real demo addresses (draining contract, clean address, proxy) are added
// here once Akul deploys them and lists them in docs/DEMO.md.
const TARGETS = [
  { title: "A normal transfer", text: "send 0.01 to vitalik.eth", note: "Resolves an ENS name, audits it, asks for YES." },
  { title: "A small transfer", text: "send 0.005 to vitalik.eth", note: "Under the cap. Watch the amount on the card." },
  { title: "Over the cap", text: "send 0.5 to vitalik.eth", note: "Refused before any audit: the cap is 0.01 test ETH." },
  { title: "Ask for help", text: "help", note: "Shows what Airlock can do." },
];

export function AppShell() {
  const [view, setView] = useState<View>("console");
  const handleVoiceText = useRef<(t: string) => void>(() => {});
  const voice = useVoice((t) => handleVoiceText.current(t));
  const air = useAirlock();
  // Hands-free: pause while Airlock is speaking, recording, or busy so it never hears itself.
  const wake = useWakeWord((t) => handleVoiceText.current(t), voice.state !== "idle" || air.busy);

  // Keep the latest handler in the ref after each render (refs must not be written during render).
  useEffect(() => {
    handleVoiceText.current = async (t: string) => {
      setView("console");
      const parsed = await air.send(t, "voice");
      if (parsed) void voice.say(speechFor(parsed));
    };
  });

  const sendTyped = async (text: string) => { setView("console"); await air.send(text, "gui"); };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground transition-colors duration-200">
      <Sidebar view={view} onView={setView} online={air.online} />

      <main className="relative z-10 flex-1 overflow-y-auto">
        {air.online === false && (
          <div role="alert" className="sticky top-0 z-20 border-b border-high/40 bg-high/15 px-6 py-2 text-sm text-high backdrop-blur">
            Cannot reach the Airlock server. Start it with <code className="font-mono">npm run dev</code> in <code className="font-mono">server/</code>.
          </div>
        )}
        {air.online && !air.streamUp && (
          <div className="border-b border-medium/40 bg-medium/10 px-6 py-1.5 text-xs text-medium">Live stream reconnecting…</div>
        )}
        <div className="mx-auto max-w-4xl px-8 py-12">
          {view === "console" && (
            <Console
              messages={air.messages} stages={air.stages} log={air.log} verdict={air.verdict} pending={air.pending}
              busy={air.busy} voice={voice} onSend={sendTyped} onAnswer={(yes) => sendTyped(yes ? "yes" : "no")} onReset={air.reset} onClearLog={air.clearLog}
            />
          )}
          {view === "log" && (
            <div className="animate-fade-in-up space-y-4">
              <h2 className="font-serif text-4xl italic">Event log</h2>
              <LogHeader title="All events" count={air.log.length} onClear={air.clearLog} />
              <EventLog log={air.log} tall />
            </div>
          )}
          {view === "targets" && (
            <div className="animate-fade-in-up space-y-6">
              <h2 className="font-serif text-4xl italic">Demo targets</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {TARGETS.map((t) => (
                  <button key={t.text} onClick={() => sendTyped(t.text)} className="rounded-2xl border border-border bg-card/80 p-5 text-left backdrop-blur transition-colors hover:bg-accent">
                    <p className="font-medium">{t.title}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{t.text}</p>
                    <p className="mt-3 text-sm text-muted-foreground">{t.note}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <VoicePanel voice={voice} wake={wake} />
    </div>
  );
}
