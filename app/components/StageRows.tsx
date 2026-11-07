"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import { STAGE_NAMES } from "@/lib/useAirlock";
import type { Stage } from "@/lib/api";

const LABEL: Record<Stage["name"], string> = { address: "Address", bytecode: "Bytecode", source: "Source", gate: "Gate" };

export function StageRows({ stages }: { stages: Partial<Record<Stage["name"], Stage>> }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Audit stages">
      {STAGE_NAMES.map((name) => {
        const s = stages[name];
        const status = s?.status;
        const Icon = status === "done" ? Check : status === "error" ? X : status === "pending" ? Loader2 : Circle;
        return (
          <li
            key={`${name}-${status ?? "idle"}`}
            className={`rounded-xl border bg-card/80 p-3 backdrop-blur ${status === "done" ? "animate-stage-done border-low/40" : status === "error" ? "animate-stage-error border-high/40" : "border-border"}`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon className={`h-4 w-4 ${status === "done" ? "text-low" : status === "error" ? "text-high" : "text-muted-foreground"} ${status === "pending" ? "animate-spin" : ""}`} />
              {LABEL[name]}
            </div>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={s?.detail}>{s?.detail ?? (status ?? "waiting")}</p>
          </li>
        );
      })}
    </ol>
  );
}
