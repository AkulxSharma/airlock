"use client";

import { ExternalLink, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import type { Pending } from "@/lib/useAirlock";
import type { ParsedReply, Severity } from "@/lib/parseReply";

const TONE = { LOW: "text-low border-low/40", MEDIUM: "text-medium border-medium/40", HIGH: "text-high border-high/40" } as const;
const SEV: Record<Severity, string> = { low: "bg-low/15 text-low", medium: "bg-medium/15 text-medium", high: "bg-high/15 text-high" };

function Countdown({ pending }: { pending: Pending }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((pending.expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((pending.expiresAt - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [pending]);
  return <span className="font-mono tabular-nums">{left}s</span>;
}

export function VerdictCard({
  data, pending, busy, onAnswer,
}: { data: ParsedReply | null; pending: Pending | null; busy: boolean; onAnswer: (yes: boolean) => void }) {
  if (!data) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-3"><ShieldQuestion className="h-5 w-5" /><span>No check yet. Ask Airlock to send test ETH and the verdict will appear here.</span></div>
      </section>
    );
  }
  const { kind, verdict } = data;
  const Icon = verdict === "HIGH" || kind === "refused" ? ShieldAlert : ShieldCheck;
  const tone = verdict ? TONE[verdict] : "text-foreground border-border";

  return (
    <section className={`animate-fade-in-up rounded-2xl border bg-card/90 p-6 shadow-lg backdrop-blur ${tone}`} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className="h-7 w-7" />
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{kind === "sent" ? "Sent on Sepolia" : kind === "refused" ? "Refused" : "Risk signal"}</p>
            <p className="font-serif text-3xl italic">{verdict ?? (kind === "sent" ? "Done" : "Stopped")}</p>
          </div>
        </div>
        {data.score !== undefined && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Score</p>
            <p className="font-mono text-3xl tabular-nums">{data.score}<span className="text-base text-muted-foreground"> / 100</span></p>
          </div>
        )}
      </div>

      {kind === "refused" && <p className="mt-4 text-sm text-foreground">{data.headline}</p>}

      {(data.amountEth || data.to) && (
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-[auto_1fr]">
          {data.amountEth && (<><dt className="text-muted-foreground">Amount</dt><dd className="font-mono text-foreground">{data.amountEth} test ETH</dd></>)}
          {data.to && (<><dt className="text-muted-foreground">To</dt><dd className="break-all font-mono text-foreground">{data.to}</dd></>)}
        </dl>
      )}

      {data.findings.length > 0 && (
        <ul className="mt-5 space-y-2">
          {data.findings.map((f, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-foreground">
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase ${SEV[f.severity]}`}>{f.severity}</span>
              <span>{f.message}</span>
            </li>
          ))}
        </ul>
      )}

      {kind === "sent" && data.txUrl && (
        <a href={data.txUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm text-low underline underline-offset-4">
          View transaction <ExternalLink className="h-4 w-4" />
        </a>
      )}

      {kind === "confirm" && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {pending ? (
            <>
              <button disabled={busy} onClick={() => onAnswer(true)} className="rounded-lg bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50">YES, send</button>
              <button disabled={busy} onClick={() => onAnswer(false)} className="rounded-lg border border-border px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50">NO, cancel</button>
              <span className="text-xs text-muted-foreground">Expires in <Countdown pending={pending} /></span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">This request is no longer waiting. Ask again to start over.</span>
          )}
        </div>
      )}

      <p className="mt-5 text-xs text-muted-foreground">A risk signal, not a guarantee. Testnet only.</p>
    </section>
  );
}
