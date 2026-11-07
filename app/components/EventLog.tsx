"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "@/lib/useAirlock";

const COLOR = { stage: "text-low", message: "text-foreground", system: "text-medium" } as const;

export function EventLog({ log, tall = false }: { log: LogEntry[]; tall?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [log.length]);
  return (
    <div className={`overflow-y-auto rounded-2xl border border-border bg-card/80 p-4 font-mono text-xs backdrop-blur ${tall ? "h-[70vh]" : "h-44"}`} role="log" aria-label="Event log">
      {log.length === 0 && <p className="text-muted-foreground">Nothing yet. Events appear here as they happen.</p>}
      {log.map((e) => (
        <p key={e.id} className="py-0.5">
          <span className="text-muted-foreground">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>{" "}
          <span className={COLOR[e.kind]}>{e.kind}</span> <span className="text-foreground">{e.text}</span>
        </p>
      ))}
      <div ref={end} />
    </div>
  );
}
