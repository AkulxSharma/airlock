// The verdict card reads the server's structured `audit` and `pending` fields when they are there
// (parseResponse). It falls back to reading the plain-text reply (parseReply), so an older server
// or a reworded message still works.
import type { MessageResponse } from "./api";

export type Verdict = "LOW" | "MEDIUM" | "HIGH";
export type Severity = "low" | "medium" | "high";
export interface ParsedFinding { severity: Severity; message: string }

export interface ParsedReply {
  kind: "confirm" | "refused" | "sent" | "cancelled" | "info";
  verdict?: Verdict;
  score?: number;
  findings: ParsedFinding[];
  amountEth?: string;
  to?: string;
  expiresInSeconds?: number;
  expiresAt?: number; // exact expiry (server clock, ms), from the structured `pending` field
  txUrl?: string;
  headline: string; // first line, for the chat bubble and for speech
}

const ADDR = "0x[0-9a-fA-F]{40}";

export function parseReply(reply: string, needsConfirm: boolean): ParsedReply {
  const lines = reply.split("\n");
  const headline = lines[0]?.trim() ?? "";
  const findings: ParsedFinding[] = [];
  for (const m of reply.matchAll(/^- \[(low|medium|high)\] (.+)$/gm)) {
    findings.push({ severity: m[1] as Severity, message: m[2] });
  }

  const sent = reply.match(new RegExp(`^Sent ([0-9.]+) test ETH to (${ADDR})\\.`));
  if (sent) {
    // Only ever link to Sepolia Etherscan, whatever else the text contains.
    const tx = reply.match(/https:\/\/sepolia\.etherscan\.io\/tx\/0x[0-9a-fA-F]+/);
    return { kind: "sent", findings, amountEth: sent[1], to: sent[2], txUrl: tx?.[0], headline };
  }

  const risk = reply.match(/Risk signal: (LOW|MEDIUM|HIGH) \(score (\d+)\)/);
  if (needsConfirm && risk) {
    const send = reply.match(new RegExp(`To send: ([0-9.]+) test ETH to (${ADDR})`));
    const expires = reply.match(/expires in (\d+) seconds/);
    return {
      kind: "confirm",
      verdict: risk[1] as Verdict,
      score: Number(risk[2]),
      findings,
      amountEth: send?.[1],
      to: send?.[2],
      expiresInSeconds: expires ? Number(expires[1]) : undefined,
      headline,
    };
  }

  if (/^Refused\./.test(reply)) {
    return { kind: "refused", verdict: findings.some((f) => f.severity === "high") ? "HIGH" : undefined, findings, headline };
  }
  if (/^Cancelled/.test(reply)) return { kind: "cancelled", findings, headline };
  return { kind: "info", findings, headline };
}

/** Build the verdict-card data from a server response, preferring the structured fields. */
export function parseResponse(res: MessageResponse): ParsedReply {
  const base = parseReply(res.reply, res.needsConfirm);
  const a = res.audit;
  const p = res.pending;
  if (!a && !p) return base;
  // The server only attaches `audit` without `needsConfirm` when it refused. Trust that even if the
  // wording of the text changed and the text parse could not tell.
  const kind: ParsedReply["kind"] =
    res.needsConfirm && a ? "confirm" : !res.needsConfirm && a && base.kind === "info" ? "refused" : base.kind;
  return {
    ...base,
    kind,
    verdict: a?.verdict ?? base.verdict,
    score: a?.riskScore ?? base.score,
    findings: a ? a.findings.map((f) => ({ severity: f.severity, message: f.message })) : base.findings,
    to: p?.to ?? base.to,
    amountEth: p?.amountEth ?? base.amountEth,
    expiresAt: p?.expiresAt,
  };
}

/**
 * When the confirm window ends, in this browser's clock. Prefer the server's exact time, but only if
 * it is plausible next to our clock (a different machine's clock could be far off); otherwise use
 * the "expires in N seconds" the reply states.
 */
export function resolveExpiry(expiresAt: number | undefined, secondsFromText: number | undefined, now: number): number | undefined {
  if (expiresAt !== undefined && expiresAt > now - 5_000 && expiresAt < now + 10 * 60_000) return expiresAt;
  if (secondsFromText !== undefined) return now + secondsFromText * 1000;
  return undefined;
}

/** What the voice says. Short on purpose: the screen carries the details. */
export function speechFor(p: ParsedReply): string {
  switch (p.kind) {
    case "confirm":
      return `Risk signal ${p.verdict}, score ${p.score}. ${p.amountEth ?? ""} test ETH to the address ${p.to ?? ""}. Press yes or say yes to send. This is a risk signal, not a guarantee.`;
    case "sent":
      return `Sent ${p.amountEth} test ETH. The transaction link is on screen.`;
    default:
      return p.headline;
  }
}
