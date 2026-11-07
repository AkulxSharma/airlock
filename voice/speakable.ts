// Rewrite a reply so a voice can say it reliably. Long hex values and long digit strings are the
// two things speech gets wrong, so they are spoken in short spelled chunks. The full value always
// stays in the on-screen text; voice only ever carries a recognizable fragment of an address.
const spell = (s: string) => s.split("").join(" ");
const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

export function toSpeakable(text: string): string {
  return text
    .replace(/0x[0-9a-fA-F]{8,}/g, (m) => {
      const h = m.slice(2);
      return `starting zero x ${spell(h.slice(0, 4))}, ending ${spell(h.slice(-4))}`;
    })
    .replace(/\d{6,}/g, (d) => spell(d))
    // Amounts: "0.005" is easy to hear as "0.05" (10x off), so say every digit: "zero point zero zero five".
    .replace(/\b(\d+)\.(\d+)\b/g, (_, whole: string, frac: string) => `${DIGIT_WORDS[Number(whole)] ?? whole} point ${[...frac].map((d) => DIGIT_WORDS[Number(d)]).join(" ")}`);
}
