"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { Pending } from "@/lib/useAirlock";
import type { ParsedReply, Severity } from "@/lib/parseReply";

const TEXT = { LOW: "text-low", MEDIUM: "text-medium", HIGH: "text-high" } as const;
const BORDER: Record<Severity, string> = { low: "border-low", medium: "border-medium", high: "border-high" };
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "the address");

function Countdown({ pending }: { pending: Pending }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((pending.expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((pending.expiresAt - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [pending]);
  return <span className="font-mono tabular-nums">{left}s</span>;
}

function narrative(d: ParsedReply): string {
  if (d.kind === "confirm") {
    return `Airlock checked ${short(d.to)} for ${d.amountEth ?? "the"} test ETH. The risk signal is ${d.verdict} with a score of ${d.score} out of 100. ${d.findings.length ? "Review the findings below, then confirm or cancel." : "No findings were reported. Confirm or cancel."}`;
  }
  if (d.kind === "sent") return `Sent ${d.amountEth} test ETH to ${short(d.to)} on Sepolia.`;
  return d.headline;
}

export function VerdictCard({
  data, pending, busy, onAnswer,
}: { data: ParsedReply | null; pending: Pending | null; busy: boolean; onAnswer: (yes: boolean) => void }) {
  if (!data) {
    return (
      <section className="text-[17px] leading-relaxed text-muted-foreground">
        No check yet. Ask Airlock to send test ETH, by typing below or holding the mic. A rule in plain code decides whether it moves, never the model.
      </section>
    );
  }
  const { kind, verdict } = data;
  const label = kind === "sent" ? "Sent" : kind === "refused" ? "Refused" : "Risk signal";

  return (
    <section className="animate-fade-in-up" aria-live="polite">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className={`font-serif text-5xl ${verdict ? TEXT[verdict] : "text-foreground"}`}>{verdict ?? (kind === "sent" ? "Done" : "Stopped")}</span>
        {data.score !== undefined && <span className="font-mono text-lg text-muted-foreground">score {data.score} / 100</span>}
      </div>

      <p className="mt-4 text-[17px] leading-relaxed text-foreground">{narrative(data)}</p>

      {(data.amountEth || data.to) && (
        <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {data.amountEth && (<><dt className="text-muted-foreground">Amount</dt><dd className="font-mono text-foreground">{data.amountEth} test ETH</dd></>)}
          {data.to && (<><dt className="text-muted-foreground">To</dt><dd className="break-all font-mono text-foreground">{data.to}</dd></>)}
        </dl>
      )}

      {data.findings.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Findings</h3>
          <ul className="mt-4 space-y-4">
            {data.findings.map((f, i) => (
              <li key={i} className={`border-l-2 pl-5 ${BORDER[f.severity]}`}>
                <p className="text-[15px] font-medium text-foreground">{f.message}</p>
                <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{f.severity}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {kind === "sent" && data.txUrl && (
        <a href={data.txUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm text-low underline underline-offset-4">
          View transaction <ExternalLink className="h-4 w-4" />
        </a>
      )}

      {kind === "confirm" && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
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

      <p className="mt-6 text-xs text-muted-foreground">A risk signal, not a guarantee. Testnet only.</p>
    </section>
  );
}
