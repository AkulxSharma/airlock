// Canonicalize speech-to-text output so "zero point zero one" and "0.01", "self-destruct" and
// "selfdestruct", "vitalik dot eth" and "vitalik.eth" compare equal. The command parser should
// run on normalizeTranscript(text) so spoken and typed input behave the same.
import {
  CANCEL_PHRASES, CONFIRM_PHRASES, CONNECTORS, CURRENCY_WORDS, POLITE_OPENERS, SEND_VERBS,
} from "./vocabulary.ts";
import { stripWakeWord } from "./wake.ts";

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const isDigitWord = (t?: string) => t !== undefined && t in ONES && ONES[t] <= 9;

/** Parse a spoken number starting at tokens[i]. Returns [text, nextIndex]. */
function parseNumber(tokens: string[], i: number): [string, number] {
  const t = tokens[i];
  let v = 0;
  let j = i;
  if (isDigitWord(t) && ONES[t] >= 1 && tokens[j + 1] === "hundred") {
    v = ONES[t] * 100;
    j += 2;
    if (tokens[j] === "and") j++;
    if (tokens[j] in TENS) {
      v += TENS[tokens[j++]];
      if (isDigitWord(tokens[j]) && ONES[tokens[j]] >= 1) v += ONES[tokens[j++]];
    } else if (tokens[j] in ONES && ONES[tokens[j]] >= 1) {
      v += ONES[tokens[j++]];
    }
  } else if (t in TENS) {
    v = TENS[t];
    j++;
    if (isDigitWord(tokens[j]) && ONES[tokens[j]] >= 1) v += ONES[tokens[j++]];
  } else {
    v = ONES[t];
    j++;
  }
  let text = String(v);
  if (tokens[j] === "point" && isDigitWord(tokens[j + 1])) {
    j++;
    let dec = "";
    while (isDigitWord(tokens[j])) dec += ONES[tokens[j++]];
    text += "." + dec;
  }
  return [text, j];
}

function wordsToNumbers(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    if (tokens[i] === "point" && isDigitWord(tokens[i + 1]) && !/^[\d.]+$/.test(out[out.length - 1] ?? "")) {
      // "point zero one" with no whole number before it means 0.01
      let dec = "";
      let j = i + 1;
      while (isDigitWord(tokens[j])) dec += ONES[tokens[j++]];
      out.push("0." + dec);
      i = j;
    } else if (tokens[i] in ONES || tokens[i] in TENS) {
      const [text, next] = parseNumber(tokens, i);
      out.push(text);
      i = next;
    } else {
      out.push(tokens[i++]);
    }
  }
  return out;
}

/** After "0x", glue the spelled hex characters that follow into one token. */
function joinHexAfter0x(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const start = /^0x([0-9a-f]*)$/.exec(tokens[i]); // "0x" alone, or "0xd" when a chunk is glued on
    if (start) {
      let hex = start[1];
      while (i + 1 < tokens.length && /^[0-9a-f]+$/.test(tokens[i + 1])) hex += tokens[++i];
      out.push("0x" + hex);
    } else {
      out.push(tokens[i]);
    }
  }
  return out;
}


const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A list of words as a regex alternation (longest first; an apostrophe matches the space it became). */
const alt = (list: string[]) =>
  [...list].sort((a, b) => b.length - a.length).map((w) => esc(w).replace(/'/g, " ").replace(/\s+/g, "\\s+")).join("|");
const TAIL = "(?:\\s+(?:please|now|it|that|this|the\\s+(?:transfer|payment|send)|transfer|payment))*";
const POLITE = new RegExp(`^(?:(?:${alt(POLITE_OPENERS)})\\s+)+`);
const CONFIRM = new RegExp(`^(?:${alt(CONFIRM_PHRASES)})${TAIL}$`);
const CANCEL = new RegExp(`^(?:${alt(CANCEL_PHRASES)})${TAIL}$`);
const SEND_VERB = new RegExp(`^(?:${alt(SEND_VERBS)})(?=\\s+(?:\\d|point\\b))`);
const COIN = new RegExp(`(?<=\\d)\\s+(?:${alt(CURRENCY_WORDS)})\\b`);
const TO = new RegExp(`(?<=\\d(?:\\s+eth)?)\\s+(?:${alt(CONNECTORS)})\\s+`);

/**
 * Map the many ways of saying a command onto the few the strict parser knows:
 *   "could you please pay 0.01 ether over to vitalik.eth" -> "send 0.01 eth to vitalik.eth"
 *   "go ahead" / "yes please" / "confirm the transfer"     -> "yes"
 *   "never mind" / "cancel that" / "hold on"               -> "no"
 * Takes text already cleaned by normalizeTranscript. Words that are easy to say in passing ("ok",
 * "sure", "do it") are NOT mapped to yes (see NEVER_CONFIRM in vocabulary.ts).
 */
export function canonicalizeCommand(text: string): string {
  let t = text.replace(POLITE, "").trim();
  if (CONFIRM.test(t)) return "yes";
  if (CANCEL.test(t)) return "no";
  t = t.replace(SEND_VERB, "send").replace(COIN, " eth").replace(TO, " to ");
  return t.replace(/\s+/g, " ").trim();
}

/** Longest transcript considered. Real commands are a few dozen characters. */
export const MAX_TRANSCRIPT_CHARS = 2000;

export function normalizeTranscript(input: string): string {
  // "Hey Airlock, send ..." and "Airlock, send ..." mean the same as "send ...".
  // A spoken command is short. Bound the input and collapse runs of whitespace first: the patterns below
  // retry from every position in a run of spaces, which took 38 seconds on 200 KB of spaces.
  const bounded = input.slice(0, MAX_TRANSCRIPT_CHARS).replace(/\s+/g, " ");
  let s = stripWakeWord(bounded).toLowerCase().replace(/[-–—_]/g, " ");
  s = s.replace(/[.,;:!?]+(?=\s|$)/g, ""); // trailing punctuation, keeps 0.01 and 11,155,111
  s = s.replace(/\bzero\s?x(?=\s|[0-9a-f])/g, "0x");
  s = s.replace(/\s+dot\s+eth\b/g, ".eth");
  s = s.replace(/\s+dot\s+demo\b/g, ".demo");
  s = s.replace(/(\d),(?=\d{3}\b)/g, "$1"); // thousands separators
  let tokens = s.split(/\s+/).filter(Boolean);
  tokens = joinHexAfter0x(wordsToNumbers(tokens));
  s = tokens.join(" ");
  s = s.replace(/\b\d(?:[\s,]+\d\b)+/g, (m) => m.replace(/[\s,]+/g, "")); // "1 1 1 5" -> "1115"
  s = s
    .replace(/\bself destruct/g, "selfdestruct")
    .replace(/\bdelegate call/g, "delegatecall")
    .replace(/\bhoney pot/g, "honeypot")
    .replace(/\bre entrancy/g, "reentrancy");
  s = s.replace(/[^a-z0-9.\s]/g, " ").replace(/(?<![0-9a-z])\.|\.(?![0-9a-z])/g, " ");
  return canonicalizeCommand(s.replace(/\s+/g, " ").trim());
}
