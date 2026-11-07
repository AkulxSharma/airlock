// Rule-based command parser. No LLM. Gemini replaces this later behind the same Agent
// interface; this parser stays as the fallback when there is no key or the call fails.

export type Intent =
  | { kind: "send"; amountEth: string; target: string }
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "help" };

export interface Agent {
  handle(text: string): Intent | Promise<Intent>;
}

const YES_RE = /^(?:yes|y|yep|yeah|confirm)[.! ]*$/i;
const NO_RE = /^(?:no|n|nope|cancel|stop)[.! ]*$/i;
// "send 0.01 to vitalik.eth", "transfer 0.005 eth to 0xabc...", "please send 0.01 test eth to x"
const SEND_RE =
  /^(?:please\s+)?(?:send|transfer)\s+(\d+(?:\.\d+)?)\s*(?:test\s+)?(?:sepolia\s+)?(?:eth|ether|sepeth)?\s+to\s+(\S+?)[.!]?$/i;

export function parseCommand(text: string): Intent {
  const t = text.trim();
  if (YES_RE.test(t)) return { kind: "yes" };
  if (NO_RE.test(t)) return { kind: "no" };
  const m = SEND_RE.exec(t);
  if (m) return { kind: "send", amountEth: m[1], target: m[2] };
  return { kind: "help" };
}

export const ruleBasedAgent: Agent = { handle: parseCommand };
