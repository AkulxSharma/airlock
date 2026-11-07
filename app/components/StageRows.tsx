"use client";

import { Check, Circle, Loader2, Minus, TriangleAlert, X } from "lucide-react";
import { STAGE_NAMES } from "@/lib/useAirlock";
import type { Stage } from "@/lib/api";
import { stageTone, type StageTone } from "@/lib/stageTone";

const LABEL: Record<Stage["name"], string> = { address: "Address", bytecode: "Bytecode", source: "Source", gate: "Gate" };

// Green means "this check ran and passed". Skipped steps are grey, caution is amber, failures red.
const LOOK: Record<StageTone, { icon: typeof Check; text: string; card: string; word: string }> = {
  idle: { icon: Circle, text: "text-muted-foreground", card: "border-border", word: "waiting" },
  pending: { icon: Loader2, text: "text-muted-foreground", card: "border-border", word: "pending" },
  pass: { icon: Check, text: "text-low", card: "animate-stage-done border-low/40", word: "done" },
  skipped: { icon: Minus, text: "text-muted-foreground", card: "border-dashed border-border opacity-80", word: "skipped" },
  caution: { icon: TriangleAlert, text: "text-medium", card: "border-medium/50", word: "caution" },
  fail: { icon: X, text: "text-high", card: "animate-stage-error border-high/40", word: "failed" },
};

export function StageRows({ stages }: { stages: Partial<Record<Stage["name"], Stage>> }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Audit stages">
      {STAGE_NAMES.map((name) => {
        const s = stages[name];
        const tone = stageTone(s);
        const look = LOOK[tone];
        const Icon = look.icon;
        return (
          <li key={`${name}-${tone}`} className={`rounded-xl border bg-card/80 p-3 backdrop-blur ${look.card}`}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon className={`h-4 w-4 ${look.text} ${tone === "pending" ? "animate-spin" : ""}`} />
              {LABEL[name]}
              <span className="sr-only">{look.word}</span>
            </div>
            <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]" title={s?.detail}>{s?.detail ?? look.word}</p>
          </li>
        );
      })}
    </ol>
  );
}
