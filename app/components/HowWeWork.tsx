"use client";

import { useState } from "react";

// The text judges and readers get. Kept in one place so the page and the copy button never drift apart.
export const SUBMISSION_PARAGRAPH =
  "Airlock is a safety check for AI agents that move money. You tell it, by voice, by typing or over iMessage, to send test ETH. Before anything moves, our own auditor reads the destination contract two ways: its bytecode (SELFDESTRUCT, DELEGATECALL, proxies and upgradeable proxies), and, when the source is verified, 16 pattern checks for rug-pull and bug signals such as owner-only sweeps, hidden backdoors that move other people's tokens, reentrancy, tx.origin authorization and honeypot switches. The findings become a risk signal, and a rule in plain code decides: HIGH risk, an error or a timeout is refused, while LOW or MEDIUM asks for a YES within 60 seconds. Gemini only turns speech into a structured request and writes a short explanation that code checks before it is shown. ElevenLabs handles the voice in and out. Everything runs on Sepolia with a per-transfer cap, and we deployed 22 vulnerable and safe demo contracts, verified on Sourcify, so you can try both the refusal and the approval yourself. It is a risk signal, not a guarantee: the source checks are heuristics, and we document what they miss.";

const STEPS = [
  { n: "1", h: "You", s: "voice, iMessage or typing" },
  { n: "2", h: "Gemini", s: "turns it into a request. The amount and destination must appear word for word in what you said" },
  { n: "3", h: "Auditor", s: "our own checks, on the contract's bytecode and source" },
  { n: "4", h: "Code gate", s: "plain code: refuse, or ask for YES" },
  { n: "5", h: "Sepolia", s: "test ETH moves, with a link to the transaction" },
];

const BYTECODE = [
  ["SELFDESTRUCT", "can erase the contract and send out its funds"],
  ["DELEGATECALL / CALLCODE", "runs other code with the contract's own storage and funds"],
  ["Minimal proxy (EIP-1167)", "the real logic lives at another address"],
  ["Upgradeable proxy (EIP-1967)", "the logic can be swapped after you check it"],
  ["Very short code, or no code", "a stub that forwards elsewhere, or a plain wallet"],
];

const SOURCE = [
  "Owner-only sweep of the whole balance",
  "Owner can move tokens out of other people's wallets",
  "Owner-only mint, changeable fees",
  "Blacklist, pause and trading switches (honeypot signals)",
  "tx.origin used for authorization",
  "Reentrancy: sends ether before updating its records",
  "Unprotected initializer: anyone can take control",
  "Ignored call results, unchecked math, exact-balance checks",
  "Weak randomness, looped payments, signature replay",
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card/80 p-6 backdrop-blur ${className}`}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs uppercase tracking-widest text-muted-foreground">{children}</h3>;
}

export function HowWeWork() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUBMISSION_PARAGRAPH);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is selectable on screen */
    }
  };

  return (
    <div className="animate-fade-in-up space-y-10 pb-16">
      <header className="space-y-3">
        <h2 className="font-serif text-4xl italic">How we work</h2>
        <p className="max-w-3xl text-lg text-muted-foreground">
          Say it. Airlock checks it. Then it moves. A rule in plain code decides whether it moves, never the model.
        </p>
      </header>

      <section aria-label="The pipeline" className="space-y-4">
        <Label>The pipeline</Label>
        <div className="grid gap-3 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <Card key={s.n} className="relative">
              <p className="font-mono text-sm text-muted-foreground">{s.n}</p>
              <p className="mt-1 font-serif text-3xl">{s.h}</p>
              <p className="mt-2 text-sm leading-snug text-muted-foreground">{s.s}</p>
              {i < STEPS.length - 1 && <span aria-hidden className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-2xl text-muted-foreground lg:block">→</span>}
            </Card>
          ))}
        </div>
      </section>

      <section aria-label="How the auditor checks a contract" className="space-y-4">
        <Label>How the auditor checks a contract</Label>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="font-serif text-3xl">Layer 1: bytecode</p>
            <p className="mt-1 text-sm text-muted-foreground">The backbone. It reads the instructions the contract is actually made of, skipping data bytes and the compiler&apos;s metadata block so a clean contract is not flagged by chance.</p>
            <ul className="mt-4 space-y-3">
              {BYTECODE.map(([h, d]) => (
                <li key={h} className="text-sm">
                  <span className="font-mono font-medium">{h}</span>
                  <span className="text-muted-foreground"> — {d}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="font-serif text-3xl">Layer 2: source</p>
            <p className="mt-1 text-sm text-muted-foreground">When the source is verified on Sourcify (used only to fetch the text), our own code reads it for 16 rug-pull and bug patterns. Each finding says &ldquo;Heuristic&rdquo;: a pattern match, not a proof.</p>
            <ul className="mt-4 space-y-2">
              {SOURCE.map((s) => (
                <li key={s} className="flex gap-3 text-sm">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section aria-label="From findings to a verdict" className="space-y-4">
        <Label>From findings to a verdict</Label>
        <Card>
          <p className="text-sm text-muted-foreground">Each finding has a severity. They add up to a score out of 100.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-4"><p className="font-mono text-sm text-high">HIGH finding = 40</p><p className="mt-1 text-sm text-muted-foreground">Any one forces a HIGH verdict.</p></div>
            <div className="rounded-xl border border-border p-4"><p className="font-mono text-sm text-medium">MEDIUM finding = 20</p><p className="mt-1 text-sm text-muted-foreground">Any one gives at least MEDIUM.</p></div>
            <div className="rounded-xl border border-border p-4"><p className="font-mono text-sm text-low">LOW finding = 5</p><p className="mt-1 text-sm text-muted-foreground">Informational.</p></div>
          </div>
          <p className="mt-4 text-sm">A score of 70 or more is HIGH, 30 or more is MEDIUM, anything lower is LOW. <span className="text-muted-foreground">There is no &ldquo;safe&rdquo; value, on purpose.</span></p>
        </Card>
      </section>

      <section aria-label="The gate" className="space-y-4">
        <Label>The gate: plain code, not the AI</Label>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card><p className="font-mono text-sm text-high">HIGH, an error or a timeout</p><p className="mt-2 font-serif text-3xl">Refused</p><p className="mt-2 text-sm text-muted-foreground">If the audit cannot finish, it counts as a no.</p></Card>
          <Card><p className="font-mono text-sm text-medium">LOW or MEDIUM</p><p className="mt-2 font-serif text-3xl">Asks for YES</p><p className="mt-2 text-sm text-muted-foreground">Only a YES within 60 seconds, for that exact transfer, sends anything. A spoken YES from the always-listening mic never counts.</p></Card>
          <Card><p className="font-mono text-sm text-low">Always</p><p className="mt-2 font-serif text-3xl">Testnet only</p><p className="mt-2 text-sm text-muted-foreground">Sepolia, test ETH, with a per-transfer cap and a daily limit.</p></Card>
        </div>
      </section>

      <section aria-label="Honest limits" className="space-y-4">
        <Label>What it does not do</Label>
        <Card>
          <ul className="space-y-2 text-sm">
            <li>The source checks are heuristics. A sweep hidden behind a helper function, or an unusually named fee setter, can slip past them.</li>
            <li>Flash-loan and price-oracle manipulation need economic analysis, not pattern matching, so Airlock does not detect them.</li>
            <li>A contract with no published source gets a MEDIUM &ldquo;unverified source&rdquo; finding, because only its bytecode could be checked.</li>
            <li className="text-muted-foreground">Everything Airlock says is a risk signal, not a guarantee.</li>
          </ul>
        </Card>
      </section>

      <section aria-label="Submission paragraph" className="space-y-4">
        <div className="flex items-end justify-between">
          <Label>For the submission</Label>
          <button onClick={copy} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent">{copied ? "Copied" : "Copy paragraph"}</button>
        </div>
        <Card>
          <p className="max-w-4xl select-all leading-relaxed">{SUBMISSION_PARAGRAPH}</p>
        </Card>
      </section>
    </div>
  );
}
