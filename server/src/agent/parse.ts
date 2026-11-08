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

// Nothing here is case-sensitive: every pattern uses the i flag, and the destination keeps its own case only
// because a pasted 0x address carries a checksum in its capitals.

// A YES or NO, with the small extras people add: "yes please", "YES!", "Airlock, yes", "no thanks", "never mind".
const TAIL = String.raw`(?:[,.!\s]+(?:please|pls|plz|thanks|thank you|thx|airlock|go ahead|send it|do it|confirm|confirmed))*[.!\s]*`;
const LEAD = String.raw`(?:(?:hey|hi|ok|okay|yo)\s+)?(?:air\s?lock[,:]?\s+)?`;
const YES_RE = new RegExp(`^${LEAD}(?:yes|y|yep|yeah|yea|yup|confirm|confirmed|i confirm)${TAIL}$`, "i");
const NO_RE = new RegExp(`^${LEAD}(?:no|n|nope|nah|cancel|stop|abort|never\\s?mind|no thanks|no thank you)${TAIL}$`, "i");

// Words people put in front of a command: "Can you send...", "Hey Airlock, could you please...", "I'd like to...".
const FILLER_LEAD = new RegExp(
  String.raw`^(?:(?:hey|hi|hello|yo|ok|okay|so|and|then|now|well|alright|air\s?lock|please|pls|plz|kindly|just|actually|also|can you|can u|could you|could u|would you|will you|would you mind|do you mind|i want to|i wanna|i want you to|i need to|i need you to|i'd like to|i would like to|i'd like you to|i would like you to|let's|lets|let us|go ahead and|try to|you can|help me)\b[\s,:;-]*)+`,
  "i",
);
const FILLER_TRAIL = /(?:[\s,]*\b(?:please|pls|plz|thanks|thank you|thx|now|for me|asap|right now)\b)*[\s.!?]*$/i;

const VERB = String.raw`(?:send|transfer|pay|wire|move|give|ship|forward|tip|shoot)(?:\s+over)?`;
const AMOUNT = String.raw`(\d+(?:\.\d+)?|\.\d+)`; // 5, 0.01, .5
const UNIT = String.raw`\s*(?:test\s+|sepolia\s+)?(?:eth|ether|ethereum|sepeth)?`; // glued or spaced: 0.0001eth, 0.01 ETH, 0.01 test eth
const LINK = String.raw`(?:\s+(?:to|into|over to|towards|for|->|=>))?`; // the word before the destination is optional
const THE = String.raw`(?:(?:the|wallet|address|contract|account)\s+)*`;
const DEST = String.raw`(\S+)`;
// "send 0.01 to vitalik.eth", "Can you send 0.0001eth akul.demo", "pay 0.5 ETH over to 0xabc..."
const SEND_AMOUNT_FIRST = new RegExp(`^${VERB}\\s+${AMOUNT}${UNIT}${LINK}\\s+${THE}${DEST}$`, "i");
// "send akul.demo 0.0001 eth", "send to vitalik.eth 0.01"
const SEND_DEST_FIRST = new RegExp(`^${VERB}\\s+(?:to\\s+)?${THE}${DEST}\\s+${AMOUNT}${UNIT}$`, "i");
const LOOKS_LIKE_DEST = /^(?:0x[0-9a-f]{40}|[a-z0-9_-]+(?:\.[a-z0-9_-]+)+)$/i;

// An amount like ".5" or "5." becomes a plain decimal the sender accepts.
function cleanAmount(raw: string): string {
  const a = raw.startsWith(".") ? "0" + raw : raw;
  return a.replace(/\.$/, "");
}

export function parseCommand(text: string): Intent {
  const t = text.trim();
  if (YES_RE.test(t)) return { kind: "yes" };
  if (NO_RE.test(t)) return { kind: "no" };

  // Take the polite words off both ends, then read what is left as a transfer.
  const core = t.replace(FILLER_LEAD, "").replace(FILLER_TRAIL, "").trim();
  const clean = (dest: string) => dest.replace(/[.,!?;:]+$/, "");
  let m = SEND_AMOUNT_FIRST.exec(core);
  if (m) return { kind: "send", amountEth: cleanAmount(m[1]), target: clean(m[2]) };
  m = SEND_DEST_FIRST.exec(core);
  if (m && LOOKS_LIKE_DEST.test(clean(m[1]))) return { kind: "send", amountEth: cleanAmount(m[2]), target: clean(m[1]) };
  return { kind: "help" };
}

export const ruleBasedAgent: Agent = { handle: parseCommand };
