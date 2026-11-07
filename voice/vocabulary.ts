// Every word and phrase Airlock should recognize, in one place. Plain data with no imports, so any
// part of the project can use it (the voice pipeline, the command parser, the Gemini prompt).
//
// Three uses:
//  1. Scribe keyterms (KEYTERMS): rare words the speech-to-text engine should spell correctly.
//  2. Synonym mapping (voice/normalize.ts, canonicalizeCommand): "pay 0.01 ether to ..." becomes
//     "send 0.01 eth to ...", "go ahead" becomes "yes", so the strict command parser understands it.
//  3. The Gemini intent prompt (vocabularyForPrompt): so the model matches related words.
//
// SAFETY: this list only ever helps Airlock understand a request. It never makes money move: a send
// still needs the audit, the gate, and a YES within the expiry. Words that are easy to say in passing
// (see NEVER_CONFIRM) are deliberately NOT treated as YES.

/** Ways to say "send". Mapped to "send" only when an amount follows ("pay 0.01 ..."). */
export const SEND_VERBS = ["send", "transfer", "pay", "wire", "move", "give", "ship", "forward", "shoot over", "send over", "tip"];

/** Whole-utterance confirmations, mapped to "yes". Only counts when it is the entire command. */
export const CONFIRM_PHRASES = [
  "yes", "yep", "yeah", "yup", "confirm", "confirmed", "approve", "proceed", "go ahead", "affirmative",
  "yes please", "yes confirm", "yes go ahead",
];

/** Whole-utterance cancellations, mapped to "no". A false match here is harmless (nothing is sent). */
export const CANCEL_PHRASES = [
  "no", "nope", "nah", "cancel", "cancel it", "cancel that", "stop", "abort", "never mind", "nevermind",
  "forget it", "don't", "don't send it", "negative", "wait", "hold on", "halt", "no cancel",
];

/** Words that are NOT confirmations, on purpose: they are too easy to say in passing. */
export const NEVER_CONFIRM = ["ok", "okay", "sure", "fine", "alright", "uh huh", "do it", "send it"];

/** Words for the coin. Mapped to "eth" when they follow an amount. */
export const CURRENCY_WORDS = ["eth", "ether", "ethereum", "test eth", "test ether", "sepolia eth", "sepolia ether", "sepolia"];

/** Polite openers that are dropped. "Could you please send ..." means "send ...". */
export const POLITE_OPENERS = [
  "please", "can you", "could you", "would you", "will you", "i want to", "i need to", "i'd like to",
  "i would like to", "let's", "go ahead and", "just",
];

/** Words that mean "to" between the amount and the destination. */
export const CONNECTORS = ["over to", "into", "towards"];

/** Words the user might say about the check itself (for the Gemini prompt and future intents). */
export const CHECK_WORDS = ["check", "audit", "scan", "screen", "review", "verify", "look at", "risky", "risk", "dangerous", "suspicious", "scam"];

/** Verdict and report words the replies use. */
export const VERDICT_WORDS = ["low", "medium", "high", "risk signal", "risk score", "score", "verdict", "finding", "findings", "not a guarantee"];

/** Contract and security terms from the auditor's findings. */
export const SECURITY_TERMS = [
  "selfdestruct", "delegatecall", "callcode", "bytecode", "proxy", "minimal proxy", "upgradeable", "reentrancy",
  "honeypot", "blacklist", "blocklist", "unverified", "tx origin", "owner", "mint", "fee", "pause", "drainer",
  "sweeper", "phishing", "rug pull", "allowance", "approval",
];

/** Crypto and chain words. */
export const CRYPTO_TERMS = [
  "Sepolia", "testnet", "mainnet", "ETH", "ENS", "gwei", "wei", "Etherscan", "Sourcify", "address", "wallet",
  "contract", "transaction", "hash", "nonce", "token", "faucet",
];

/** Names. */
export const NAMES = ["Airlock", "Hey Airlock", "vitalik"];

/**
 * Words sent to ElevenLabs Scribe as keyterms: only the rare ones, because common words like "yes"
 * need no help. Plain text only. The API accepted 48 at once; keep it well under that.
 * (A copy of this list lives in voice/transcribe.ts because the GUI cannot import a relative file;
 * a test checks the two are identical.)
 */
export const KEYTERMS = [
  "Airlock", "Hey Airlock", "vitalik", "Sepolia", "testnet", "ETH", "ENS", "gwei", "wei", "Etherscan",
  "Sourcify", "selfdestruct", "delegatecall", "callcode", "bytecode", "reentrancy", "honeypot", "upgradeable",
  "proxy", "blacklist", "tx origin", "minimal proxy", "unverified", "mainnet", "faucet", "nonce",
];

/** A compact text block for the Gemini system prompt, so the model matches related words. */
export function vocabularyForPrompt(): string {
  return [
    `Ways to ask for a transfer (all mean "send"): ${SEND_VERBS.join(", ")}.`,
    `Words for the coin (all mean ETH): ${CURRENCY_WORDS.join(", ")}.`,
    `Words that mean "to" before the destination: to, ${CONNECTORS.join(", ")}.`,
    `Words that confirm a pending transfer: ${CONFIRM_PHRASES.join(", ")}.`,
    `Words that cancel it: ${CANCEL_PHRASES.join(", ")}.`,
    `These are NOT confirmations, never treat them as yes: ${NEVER_CONFIRM.join(", ")}.`,
    `Polite openers to ignore: ${POLITE_OPENERS.join(", ")}.`,
    `Words about checking an address: ${CHECK_WORDS.join(", ")}.`,
  ].join("\n");
}

/**
 * The part of the vocabulary the Gemini transfer-intent prompt needs: how people ask for a transfer.
 * Gemini never handles YES or NO (the rule parser does), so those lists are left out on purpose.
 */
export function transferVocabularyForPrompt(): string {
  return [
    `Ways to ask for a transfer (all mean "send"): ${SEND_VERBS.join(", ")}.`,
    `Words for the coin (all mean ETH): ${CURRENCY_WORDS.join(", ")}.`,
    `Words that mean "to" before the destination: to, ${CONNECTORS.join(", ")}.`,
    `Polite openers to ignore: ${POLITE_OPENERS.join(", ")}.`,
  ].join("\n");
}
