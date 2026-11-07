import { MAX_SPEAK_CHARS, speak } from "../../../../voice/speak";
import { toSpeakable } from "../../../../voice/speakable";

// Server-side only: holds the ElevenLabs key. Turns reply text into mp3 audio.
// Addresses and long numbers are rewritten by toSpeakable() so voice never reads a full address.
export async function POST(req: Request) {
  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (typeof body.text !== "string" || !body.text.trim()) return Response.json({ error: "No text to speak." }, { status: 400 });
  const text = toSpeakable(body.text).slice(0, MAX_SPEAK_CHARS);
  try {
    const audio = await speak(text);
    return new Response(audio as BodyInit, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Speech failed." }, { status: 502 });
  }
}
