import { isSameOriginRequest } from "@/lib/sameOrigin";
import { transcribe, MAX_AUDIO_BYTES } from "../../../../voice/transcribe";

// Server-side only: holds the ElevenLabs key. Takes a recording, returns the text.
export async function POST(req: Request) {
  if (!isSameOriginRequest(req.headers)) return Response.json({ error: "forbidden" }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a multipart audio upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return Response.json({ error: "No audio received." }, { status: 400 });
  if (file.size > MAX_AUDIO_BYTES) return Response.json({ error: "That recording is too long." }, { status: 413 });
  const mimeType = typeof form.get("mimeType") === "string" ? (form.get("mimeType") as string) : file.type || "audio/webm";
  try {
    const text = await transcribe(new Uint8Array(await file.arrayBuffer()), { mimeType });
    return Response.json({ text });
  } catch (e) {
    // transcribe() errors never contain the key (it reports the HTTP status only)
    return Response.json({ error: e instanceof Error ? e.message : "Transcription failed." }, { status: 502 });
  }
}
