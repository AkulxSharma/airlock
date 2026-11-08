"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../lib/api";

type Row = { name: string; address: string; balanceEth: string | null; expected?: "LOW" | "MEDIUM" | "HIGH"; why?: string };
type Snapshot = { updatedAt: number; agent: Row | null; targets: Row[] };

const tone = { LOW: "text-low", MEDIUM: "text-medium", HIGH: "text-high" } as const;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const eth = (v: string | null) => (v === null ? "unavailable" : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`);

/** Sepolia test ETH held by the agent wallet and each demo contract. Refreshes every 20 seconds. */
export function WalletsPanel({ onPick }: { onPick: (text: string) => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/wallets`, { cache: "no-store", headers: { "ngrok-skip-browser-warning": "1" } });
      if (!res.ok) throw new Error(String(res.status));
      setSnap((await res.json()) as Snapshot);
      setError(null);
    } catch {
      setError("Cannot read balances. Is the server running with the latest code?");
    }
  }, []);

  useEffect(() => {
    // The first read sets state after the await, which is the point of the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex items-end justify-between">
        <h2 className="font-serif text-4xl italic">Wallets</h2>
        <button onClick={() => void load()} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent">Refresh</button>
      </div>
      {error && <p role="alert" className="text-sm text-high">{error}</p>}
      {snap?.agent && (
        <div className="rounded-2xl border border-border bg-card/80 p-5 backdrop-blur">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Agent wallet (sends the test ETH)</p>
          <p className="mt-1 text-2xl font-semibold">{eth(snap.agent.balanceEth)}</p>
          <a className="font-mono text-xs text-muted-foreground underline" href={`https://sepolia.etherscan.io/address/${snap.agent.address}`} target="_blank" rel="noreferrer">{snap.agent.address}</a>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {snap?.targets.map((t) => (
          <button key={t.name} onClick={() => onPick(`send 0.001 to ${t.name}`)} className="rounded-2xl border border-border bg-card/80 p-4 text-left backdrop-blur transition-colors hover:bg-accent">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{t.name}</p>
              {t.expected && <span className={`text-xs font-semibold ${tone[t.expected]}`}>{t.expected}</span>}
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{short(t.address)}</p>
            <p className="mt-2 text-sm">{eth(t.balanceEth)}</p>
            {t.why && <p className="mt-1 text-xs text-muted-foreground">{t.why}</p>}
          </button>
        ))}
      </div>
      {!snap && !error && <p className="text-sm text-muted-foreground">Loading balances…</p>}
      <p className="text-xs text-muted-foreground">Sepolia test ETH only. Click a contract to run a 0.001 test transfer to it.</p>
    </div>
  );
}
