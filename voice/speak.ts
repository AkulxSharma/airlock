// Server-side only: the ElevenLabs key must never reach the browser.
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
export const MAX_SPEAK_CHARS = 1000; // protects credits from a runaway reply

export interface SpeakOptions {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  fetchImpl?: typeof fetch; // injected in tests
}

/** Turn reply text into mp3 audio bytes using ElevenLabs text-to-speech. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<Uint8Array> {
  const clean = text.trim();
  if (!clean) throw new Error("speak: text is empty");
  if (clean.length > MAX_SPEAK_CHARS) throw new Error(`speak: text longer than ${MAX_SPEAK_CHARS} characters`);

  const apiKey = opts.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("speak: ELEVENLABS_API_KEY is not set");
  const voiceId = opts.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const doFetch = opts.fetchImpl ?? fetch;

  const res = await doFetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text: clean, model_id: opts.modelId ?? DEFAULT_MODEL_ID }),
    },
  );
  // Report the status only. Never put the key or the response body in the message.
  if (!res.ok) throw new Error(`speak: ElevenLabs returned HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
