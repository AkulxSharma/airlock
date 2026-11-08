// Server-side only: the ElevenLabs key must never reach the browser.
// scribe_v2 supports keyterms: words Scribe should favor, sent with every request, so "Airlock" is not
// heard as "air lock" or "pay lock" and the crypto words in our commands are spelled the way the
// parser expects. Keep the list short and plain text. This stays in this file on purpose: the
// GUI's Next.js routes import this file, and Next cannot resolve a relative "./x.js" import.
export const KEYTERMS = [
  "Airlock", "Hey Airlock", "vitalik", "Sepolia", "testnet", "ETH", "ENS", "gwei", "wei", "Etherscan",
  "Sourcify", "selfdestruct", "delegatecall", "callcode", "bytecode", "reentrancy", "honeypot", "upgradeable",
  "proxy", "blacklist", "tx origin", "minimal proxy", "unverified", "mainnet", "faucet", "nonce",
  "ElevenLabs", "dot eth", "dot demo",
  // demo contract names; proxy, reentrancy and honeypot are already listed above
  "drainer", "clean", "clone", "weth", "rugvault", "selfkill", "vault", "origin", "unchecked", "init", "delegate", "lottery", "strictbalance", "dos", "replay", "backdoor", "approval", "math", "oracle",
];
const DEFAULT_STT_MODEL = "scribe_v2";
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB, far above a spoken command

export interface TranscribeOptions {
  apiKey?: string;
  modelId?: string;
  keyterms?: string[]; // words to favor, default KEYTERMS
  mimeType?: string; // what the browser recorded, e.g. audio/webm or audio/mpeg
  languageCode?: string; // e.g. "en". Without it Scribe auto-detects, which is unreliable on a 2-second clip
  fetchImpl?: typeof fetch; // injected in tests
}

/** Turn recorded audio into text using ElevenLabs speech-to-text (Scribe). */
export async function transcribe(audio: Uint8Array, opts: TranscribeOptions = {}): Promise<string> {
  if (audio.byteLength === 0) throw new Error("transcribe: audio is empty");
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error("transcribe: audio is larger than 10 MB");

  const apiKey = opts.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("transcribe: ELEVENLABS_API_KEY is not set");
  const doFetch = opts.fetchImpl ?? fetch;

  const form = new FormData();
  form.append("model_id", opts.modelId ?? DEFAULT_STT_MODEL);
  form.append("tag_audio_events", "false"); // no "(laughter)" style tags in the text
  for (const term of opts.keyterms ?? KEYTERMS) form.append("keyterms", term);
  if (opts.languageCode) form.append("language_code", opts.languageCode);
  form.append("file", new Blob([audio as BlobPart], { type: opts.mimeType ?? "audio/webm" }), "speech");

  // No content-type header: fetch sets the multipart boundary itself.
  const res = await doFetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  // Report the status only. Never put the key or the response body in the message.
  if (!res.ok) throw new Error(`transcribe: ElevenLabs returned HTTP ${res.status}`);

  const data = (await res.json()) as { text?: unknown };
  if (typeof data.text !== "string") throw new Error("transcribe: response had no text");
  return data.text.trim();
}
