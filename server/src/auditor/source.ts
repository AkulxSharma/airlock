import type { Finding } from "../types.js";

// Source checks. Sourcify (a public registry of verified contracts) is used ONLY to fetch
// the source text. All of the analysis below is our own code. Every source finding is a
// heuristic and says so; none of them is a guarantee in either direction.

export type SourceLookup =
  | { status: "verified"; sources: Record<string, string> }
  | { status: "none" }
  | { status: "error"; reason: string };

export type SourceFetcher = (address: string, chainId: number) => Promise<SourceLookup>;

const MAX_TOTAL_CHARS = 600_000;

export function createSourcifyFetcher(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5_000,
  base = "https://sourcify.dev/server",
): SourceFetcher {
  return async (address, chainId) => {
    try {
      const res = await fetchImpl(`${base}/v2/contract/${chainId}/${address}?fields=sources`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" },
      });
      if (res.status === 404) return { status: "none" };
      if (!res.ok) return { status: "error", reason: `Sourcify answered ${res.status}` };
      const body = (await res.json()) as { sources?: Record<string, { content?: unknown }> };
      if (!body || typeof body.sources !== "object" || body.sources === null) {
        return { status: "error", reason: "Sourcify answered with an unexpected shape" };
      }
      const sources: Record<string, string> = {};
      let total = 0;
      for (const [path, file] of Object.entries(body.sources)) {
        if (typeof file?.content !== "string") continue;
        total += file.content.length;
        if (total > MAX_TOTAL_CHARS) return { status: "error", reason: "source is too large to check" };
        sources[path] = file.content;
      }
      if (Object.keys(sources).length === 0) return { status: "none" };
      return { status: "verified", sources };
    } catch (err) {
      return { status: "error", reason: err instanceof Error ? err.message : "lookup failed" };
    }
  };
}

export const UNVERIFIED_SOURCE: Finding = {
  id: "unverified-source",
  severity: "medium",
  message:
    "No verified source code was found for this contract, so only its bytecode was checked. Unverified code is harder to review.",
};

export const SOURCE_UNAVAILABLE: Finding = {
  id: "source-unavailable",
  severity: "medium",
  message:
    "The source lookup failed, so the source checks were skipped and only the bytecode was checked.",
};

// --- analysis ----------------------------------------------------------------------------

// Strings first (a "//" inside a string is not a comment), then comments, so a comment that
// merely mentions tx.origin can not raise a finding.
function strip(code: string): string {
  return code
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""')
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

type Fn = { name: string; header: string; body: string };

// Functions that have a body, found by matching braces. Interface and abstract declarations
// end in ";" and are skipped.
function functionsOf(code: string): Fn[] {
  const out: Fn[] = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < code.length && depth > 0) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") depth--;
      i++;
    }
    let j = i;
    while (j < code.length && code[j] !== "{" && code[j] !== ";") j++;
    if (code[j] !== "{") continue;
    let k = j + 1;
    let d = 1;
    while (k < code.length && d > 0) {
      if (code[k] === "{") d++;
      else if (code[k] === "}") d--;
      k++;
    }
    out.push({ name: m[1], header: code.slice(i, j), body: code.slice(j + 1, k - 1) });
  }
  return out;
}

const GATED_HEADER = /\bonly[A-Z_]\w*/;
const GATED_BODY =
  /require\s*\(\s*(?:_?msgSender\s*\(\s*\)|msg\.sender)\s*==\s*_?(?:owner|admin|governance|deployer|operator)\b|(?:msg\.sender|_?msgSender\s*\(\s*\))\s*!=\s*_?(?:owner|admin|governance|deployer|operator)\b|\b_checkOwner\s*\(\s*\)/;

// Modifiers declared in the source whose body checks the caller against owner/admin, whatever they are
// called ("auth", "restricted", "onlyGov"...). A function that lists one in its header is owner-gated.
function ownerModifiers(code: string): string[] {
  const out: string[] = [];
  const re = /\bmodifier\s+([A-Za-z_$][\w$]*)\s*(?:\([^)]*\))?[^{;]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    let k = re.lastIndex;
    let d = 1;
    while (k < code.length && d > 0) {
      if (code[k] === "{") d++;
      else if (code[k] === "}") d--;
      k++;
    }
    if (GATED_BODY.test(code.slice(re.lastIndex, k - 1))) out.push(m[1]);
  }
  return out;
}
const isGated = (f: Fn, mods: RegExp | null) =>
  GATED_HEADER.test(f.header) || GATED_BODY.test(f.body) || (mods !== null && mods.test(f.header));

const SENDS_ETHER = /\.\s*(?:transfer|send)\s*\(|\.\s*call\s*[({]|\bcall\s*\(\s*gas\s*\(\s*\)/;
const WHOLE_ETH_BALANCE = /address\s*\(\s*this\s*\)\s*\.\s*balance|\bselfbalance\s*\(\s*\)|\bbalance\s*\(\s*address\s*\(\s*\)\s*\)/;
const WHOLE_TOKEN_BALANCE = /balanceOf\s*\(\s*address\s*\(\s*this\s*\)\s*\)/;
const SENDS_TOKEN = /\.\s*(?:safeT|t)ransfer(?:From)?\s*\(/;

const FEE_NAME = /^(?:set|update|change)(?:Buy|Sell|Transfer|Total|Max)?(?:Fee|Fees|Tax|Taxes)\w*$/i;
const BLACKLIST_NAME = /(?:black|block|deny|ban)list|^freeze|^setBots?$|^addBot/i;
const PAUSE_NAME = /^(?:pause|unpause|setPaused|togglePause)$/i;
const MINT_NAME = /^mint$/i;
// tx.origin copied into a variable that is then compared in a require/if/assert.
function txOriginViaVariable(code: string): boolean {
  const re = /\b([A-Za-z_$][\w$]*)\s*=\s*tx\s*\.\s*origin\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const v = m[1].replace(/\$/g, "\\$");
    if (new RegExp(`(?:require|assert|if)\\s*\\([^;{]*\\b${v}\\b`).test(code.slice(re.lastIndex))) return true;
  }
  return false;
}
const TRADING_NAME = /^(?:enable|disable|open|close|set|toggle|start|stop)Trad(?:e|ing)\w*$|^(?:setTradingEnabled|setTradable|setSwapEnabled|enableSwap)$/i;
const TX_ORIGIN_AUTH =
  /(?:require|assert|if)\s*\([^;{]*\btx\s*\.\s*origin\b|\btx\s*\.\s*origin\s*(?:==|!=)|(?:==|!=)\s*tx\s*\.\s*origin\b/;

// Function names come from untrusted code. Only plain identifiers are quoted, capped in
// length, and any that contain a reassuring word are left out.
function quoted(names: string[]): string {
  const clean = [...new Set(names)]
    .filter((n) => /^[A-Za-z0-9_]{1,40}$/.test(n) && !/safe|secure|trust/i.test(n))
    .slice(0, 3);
  return clean.length > 0 ? ` (${clean.join(", ")})` : "";
}

export function analyzeSource(sources: Record<string, string>): Finding[] {
  let txOrigin = false;
  const sweep: string[] = [];
  const mint: string[] = [];
  const fee: string[] = [];
  const blacklist: string[] = [];
  const pause: string[] = [];
  const trading: string[] = [];

  for (const raw of Object.values(sources)) {
    const code = strip(raw);
    if (TX_ORIGIN_AUTH.test(code) || txOriginViaVariable(code)) txOrigin = true;
    const modNames = ownerModifiers(code);
    const mods = modNames.length > 0 ? new RegExp(`\\b(?:${modNames.map((n) => n.replace(/\$/g, "\\$")).join("|")})\\b`) : null;
    for (const f of functionsOf(code)) {
      const gated = isGated(f, mods);
      if (gated) {
        const ethSweep = WHOLE_ETH_BALANCE.test(f.body) && SENDS_ETHER.test(f.body);
        const tokenSweep = WHOLE_TOKEN_BALANCE.test(f.body) && SENDS_TOKEN.test(f.body);
        if (ethSweep || tokenSweep) sweep.push(f.name);
        if (MINT_NAME.test(f.name)) mint.push(f.name);
      }
      if (FEE_NAME.test(f.name)) fee.push(f.name);
      if (BLACKLIST_NAME.test(f.name)) blacklist.push(f.name);
      if (PAUSE_NAME.test(f.name)) pause.push(f.name);
      if (gated && TRADING_NAME.test(f.name)) trading.push(f.name);
    }
  }

  const findings: Finding[] = [];
  if (txOrigin) {
    findings.push({
      id: "tx-origin",
      severity: "medium",
      message:
        "Heuristic: the source uses tx.origin to decide who is allowed to act. A malicious contract can abuse that to act as the user.",
    });
  }
  if (sweep.length > 0) {
    findings.push({
      id: "owner-sweep",
      severity: "medium",
      message: `Heuristic: an owner-only function${quoted(sweep)} can move this contract's whole balance out.`,
    });
  }
  if (mint.length > 0) {
    findings.push({
      id: "owner-mint",
      severity: "medium",
      message: `Heuristic: an owner-only mint function${quoted(mint)} can create new tokens at will.`,
    });
  }
  if (fee.length > 0) {
    findings.push({
      id: "adjustable-fee",
      severity: "medium",
      message: `Heuristic: fees or taxes can be changed after you buy${quoted(fee)}.`,
    });
  }
  if (blacklist.length > 0) {
    findings.push({
      id: "blacklist-switch",
      severity: "medium",
      message: `Heuristic: the source has a blacklist or block switch${quoted(blacklist)} that can stop an address from moving funds.`,
    });
  }
  if (trading.length > 0) {
    findings.push({
      id: "trading-switch",
      severity: "medium",
      message: `Heuristic: the owner can switch trading or swaps on and off${quoted(trading)}, which a honeypot uses to stop buyers from selling.`,
    });
  }
  if (pause.length > 0) {
    findings.push({
      id: "pause-switch",
      severity: "low",
      message: `Heuristic: the source has a pause switch${quoted(pause)} that can freeze transfers.`,
    });
  }
  return findings;
}
