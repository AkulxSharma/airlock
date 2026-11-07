// Safety guard for the voice channel. Speech-to-text can turn a spoken address into a DIFFERENT
// but valid-looking one (seen in live tests). So a transcript that contains hex-address-like text
// must never be used as a destination: the caller must refuse it and ask the user to paste the
// address or use an ENS name. ENS names (vitalik.eth) are words, so they pass.
import { normalizeTranscript } from "./normalize.js";

/** Hex fragments of 6+ characters after "0x" found in a transcript. */
export function findVoiceAddresses(transcript: string): string[] {
  return normalizeTranscript(transcript).match(/0x[0-9a-f]{6,}/g) ?? [];
}

export type VoiceGuard = { ok: true } | { ok: false; reason: string; found: string[] };

export function guardVoiceInput(transcript: string): VoiceGuard {
  const found = findVoiceAddresses(transcript);
  if (found.length === 0) return { ok: true };
  return {
    ok: false,
    found,
    reason: "I can't take an address by voice because speech can mishear it. Paste the address as text, or use an ENS name like vitalik.eth.",
  };
}
