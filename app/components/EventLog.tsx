"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { LogEntry } from "@/lib/useAirlock";

const COLOR = { stage: "text-low", message: "text-foreground", system: "text-medium" } as const;

/** Small header row for a log: the title and a Clear button (hidden when there is nothing to clear). */
export function LogHeader({ title, count, onClear }: { title: string; count: number; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
      <button
        onClick={onClear}
        disabled={count === 0}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Trash2 className="h-3.5 w-3.5" /> Clear
      </button>
    </div>
  );
}

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
