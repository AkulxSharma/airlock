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
// --- more vulnerability patterns (all heuristics, all medium or low) -------------------------

const ETHER_CALL = /\.\s*call\s*\{[^}]*value\s*:|\.\s*call\.value\s*\(/;
const STATE_WRITE = /\b\w+(?:\s*\[[^\]]*\])+\s*(?:-=|\+=|=(?!=))/;
const NON_REENTRANT = /\bnonReentrant\b|\block(?:ed)?\b|\bmutex\b/i;

// An external ether call followed, later in the same function, by a write to a mapping entry
// (the balance is zeroed AFTER the money is sent). A guard modifier or lock variable clears it.
function reentrancyRisk(f: Fn): boolean {
  if (NON_REENTRANT.test(f.header) || NON_REENTRANT.test(f.body)) return false;
  const m = ETHER_CALL.exec(f.body);
  return m !== null && STATE_WRITE.test(f.body.slice(m.index + m[0].length));
}

// A call, send or delegatecall used as a bare statement: its success value is thrown away.
function uncheckedCall(body: string): boolean {
  return body
    .split(/[;{}]/)
    .some((st) => /^\s*[\w.$()\[\]\s]*?\.\s*(?:call|send)\s*(?:\{[^}]*\})?\s*\(/.test(st) && !/=|\brequire\b|\bassert\b|\bif\b|\breturn\b|\bemit\b/.test(st.split(/\.\s*(?:call|send)/)[0]));
}

const INIT_NAME = /^(?:initialize|init|__\w*init\w*|setup|setOwner|initOwner)$/i;
const INIT_GUARD = /\binitializer\b|\breinitializer\b|\bonlyInitializing\b|\binitialized\b|\b_initialized\b/i;
const SETS_OWNER = /\b_?(?:owner|admin|governance|operator)\s*=/;
const SEIZE_NAME = /^(?:force|seize|confiscate|clawback|takeFrom|adminTransfer|ownerTransfer|moveFrom|stealFrom)\w*$/i;
const BLOCK_RANDOM = /\b(?:block\s*\.\s*(?:timestamp|number|difficulty|prevrandao|coinbase)|blockhash\s*\()/;
const PAYS_IN_LOOP = /\b(?:for|while)\s*\([^)]*(?:length|\.size)[^)]*\)\s*\{[\s\S]*?(?:\.\s*transfer\s*\(|\.\s*send\s*\(|\.\s*call\s*[({])/;
const ECRECOVER = /\becrecover\s*\(|\bECDSA\s*\.\s*recover\s*\(/;
const REPLAY_GUARD = /\bnonce\w*\b|\bused\w*\b|\bexecuted\b|\bclaimed\b|\bDOMAIN_SEPARATOR\b|\bdeadline\b/i;
const STRICT_BALANCE = /address\s*\(\s*this\s*\)\s*\.\s*balance\s*(?:==|!=)|(?:==|!=)\s*address\s*\(\s*this\s*\)\s*\.\s*balance/;
const UNCHECKED_MATH = /\bunchecked\s*\{[^}]*\b\w*(?:balance|balances|amount|supply|owed|deposit)\w*(?:\s*\[[^\]]*\])*\s*(?:-=|\+=|\*=)/i;

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
  const reentrancy: string[] = [];
  const unchecked: string[] = [];
  const unprotectedInit: string[] = [];
  const seize: string[] = [];
  const randomness: string[] = [];
  const dosLoop: string[] = [];
  let replay = false;
  let strictBalance = false;
  let uncheckedMath = false;

  for (const raw of Object.values(sources)) {
    const code = strip(raw);
    if (TX_ORIGIN_AUTH.test(code) || txOriginViaVariable(code)) txOrigin = true;
    const modNames = ownerModifiers(code);
    const mods = modNames.length > 0 ? new RegExp(`\\b(?:${modNames.map((n) => n.replace(/\$/g, "\\$")).join("|")})\\b`) : null;
    if (ECRECOVER.test(code) && !REPLAY_GUARD.test(code)) replay = true;
    if (STRICT_BALANCE.test(code)) strictBalance = true;
    if (UNCHECKED_MATH.test(code)) uncheckedMath = true;
    for (const f of functionsOf(code)) {
      const gated = isGated(f, mods);
      if (reentrancyRisk(f)) reentrancy.push(f.name);
      if (uncheckedCall(f.body)) unchecked.push(f.name);
      if (INIT_NAME.test(f.name) && !gated && !INIT_GUARD.test(f.header + f.body) && SETS_OWNER.test(f.body)) unprotectedInit.push(f.name);
      if (gated && (SEIZE_NAME.test(f.name) || /\.\s*transferFrom\s*\(\s*(?!msg\.sender|_msgSender)[A-Za-z_]\w*\s*,/.test(f.body))) seize.push(f.name);
      if (BLOCK_RANDOM.test(f.body) && /%|keccak256|blockhash/.test(f.body) && /\.\s*(?:transfer|send|call)\b|\bwinner\b|\bwin\b|\brandom\b/i.test(f.body)) randomness.push(f.name);
      if (PAYS_IN_LOOP.test(f.body)) dosLoop.push(f.name);
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
  const add = (id: string, severity: Finding["severity"], message: string) => findings.push({ id, severity, message });
  if (reentrancy.length > 0) add("reentrancy-risk", "medium", `Heuristic: a function${quoted(reentrancy)} sends ether before it updates its records, so a malicious receiver may call back in and withdraw again.`);
  if (unchecked.length > 0) add("unchecked-call", "medium", `Heuristic: a function${quoted(unchecked)} ignores whether a send or call succeeded, so a failed payment can look like a successful one.`);
  if (unprotectedInit.length > 0) add("unprotected-init", "medium", `Heuristic: an initializer${quoted(unprotectedInit)} sets the owner but has no guard, so anyone may be able to call it and take control.`);
  if (seize.length > 0) add("owner-seize", "medium", `Heuristic: an owner-only function${quoted(seize)} can move tokens out of other people's wallets.`);
  if (randomness.length > 0) add("weak-randomness", "medium", `Heuristic: a function${quoted(randomness)} uses block values as randomness, which miners and other contracts can predict.`);
  if (dosLoop.length > 0) add("dos-loop-payment", "medium", `Heuristic: a function${quoted(dosLoop)} pays many recipients in one loop, so one failing recipient or a long list can block everyone.`);
  if (replay) add("signature-replay", "medium", "Heuristic: the source checks a signature but shows no nonce or used-signature record, so the same signature may be replayable.");
  if (strictBalance) add("strict-balance", "low", "Heuristic: the source compares the contract's balance with an exact value, which anyone can break by force-sending ether.");
  if (uncheckedMath) add("unchecked-math", "medium", "Heuristic: balance or amount arithmetic sits inside an unchecked block, so it can wrap around instead of reverting.");
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
