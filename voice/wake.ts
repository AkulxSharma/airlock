// Wake phrase handling: "Hey Airlock" or just "Airlock". Speech-to-text spells the name in a few
// ways ("air lock", "air-lock", "Airlok"), so the pattern accepts those. No imports, so the browser
// and the server can both use it.
// Two tiers. The name on its own must look like "airlock" (air lock, aer lock, airlok, heir lock...).
// After a greeting ("hey", "hi", "ok"...) we accept looser mishearings too, such as "hey air luck" or
// "hey error lock", because the greeting makes a false trigger unlikely.
const GREETING = "(?:hey|hi|hello|ok|okay|yo)[\\s,.!-]+";
const NAME = "(?:air|aer|ayr|heir)[\\s-]?(?:lock|lok|locke|loc)";
const LOOSE_NAME = "(?:air|aer|ayr|heir|ear|are|ar|erik|eric|err?or?)[\\s-]?(?:lock|lok|locke|loc|luck|look|lack|lark)";
const WAKE = new RegExp(`(?:\\b${GREETING}\\b${LOOSE_NAME}|\\b${NAME})\\b[\\s,.:;!?-]*`, "i");

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
