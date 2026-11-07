// The API returns the verdict as plain text (see server/src/api/message.ts). This turns that text
// into structured data for the verdict card. If Akul adds a structured `audit` field to the
// response, use that instead and delete this file (see docs/GUI_REQUIREMENTS.md section 6).
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
