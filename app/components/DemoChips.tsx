"use client";

import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

type Target = { name: string; expected?: "LOW" | "MEDIUM" | "HIGH" };

const dot = { LOW: "bg-low", MEDIUM: "bg-medium", HIGH: "bg-high" } as const;
const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

/** Every demo target by name, colored by the verdict it should get. Click one to try a 0.001 test transfer to it. */
export function DemoChips({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/wallets`, { headers: { "ngrok-skip-browser-warning": "1" } });
        if (!res.ok) return;
        const body = (await res.json()) as { targets?: Target[] };
        const list = (body.targets ?? []).filter((t) => t.name.endsWith(".demo"));
        list.sort((a, b) => order[a.expected ?? "LOW"] - order[b.expected ?? "LOW"] || a.name.localeCompare(b.name));
        if (alive) setTargets(list);
      } catch {
        /* the chips are a convenience: no list, no chips */
      }
    })();
    return () => { alive = false; };
  }, []);

  if (targets.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Or pick a demo target ({targets.length})</p>
      <div className="flex flex-wrap gap-2">
        {targets.map((t) => (
          <button
            key={t.name}
            disabled={disabled}
            onClick={() => onPick(`send 0.001 to ${t.name}`)}
            title={t.expected ? `Expected: ${t.expected}` : undefined}
            className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 font-mono text-xs transition-colors hover:bg-accent disabled:opacity-50"
          >
            {t.expected && <span className={`h-2 w-2 rounded-full ${dot[t.expected]}`} />}
            {t.name}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Red should be refused, amber asks you to confirm, green is clean.</p>
    </div>
  );
}
