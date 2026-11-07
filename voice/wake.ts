// Wake phrase handling: "Hey Airlock" or just "Airlock". Speech-to-text spells the name in a few
// ways ("air lock", "air-lock", "Airlok"), so the pattern accepts those. No imports, so the browser
// and the server can both use it.
const WAKE = /(?:\b(?:hey|hi|hello|ok|okay|yo)[\s,.!-]+)?\b(?:air|aer|ayr)[\s-]?(?:lock|lok|locke)\b[\s,.:;!?-]*/i;

/** Find the wake phrase anywhere in a transcript. `command` is whatever was said after it. */
export function extractWakeCommand(transcript: string): { woke: boolean; command: string } {
  const m = WAKE.exec(transcript);
  if (!m) return { woke: false, command: "" };
  return { woke: true, command: transcript.slice(m.index + m[0].length).trim() };
}

/** Remove a wake phrase only when it opens the sentence. "send to airlock.eth" is left alone. */
export function stripWakeWord(transcript: string): string {
  const s = transcript.trimStart();
  const m = WAKE.exec(s);
  return m && m.index === 0 ? s.slice(m[0].length) : transcript;
}
