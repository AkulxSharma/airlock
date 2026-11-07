// Canonicalize speech-to-text output so "zero point zero one" and "0.01", "self-destruct" and
// "selfdestruct", "vitalik dot eth" and "vitalik.eth" compare equal. The command parser should
// run on normalizeTranscript(text) so spoken and typed input behave the same.
import { stripWakeWord } from "./wake.js";

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
    if (tokens[i] in ONES || tokens[i] in TENS) {
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

export function normalizeTranscript(input: string): string {
  // "Hey Airlock, send ..." and "Airlock, send ..." mean the same as "send ...".
  let s = stripWakeWord(input).toLowerCase().replace(/[-–—_]/g, " ");
  s = s.replace(/[.,;:!?]+(?=\s|$)/g, ""); // trailing punctuation, keeps 0.01 and 11,155,111
  s = s.replace(/\bzero\s?x(?=\s|[0-9a-f])/g, "0x");
  s = s.replace(/\s+dot\s+eth\b/g, ".eth");
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
  return s.replace(/\s+/g, " ").trim();
}
