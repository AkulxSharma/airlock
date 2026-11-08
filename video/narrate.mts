// Turns video/narration.json into one mp3 per line with ElevenLabs text-to-speech (same voice as the website).
// Run from voice/:  npx tsx --env-file=../.env ../video/narrate.mts <output folder> [line ids...]
// With line ids, only those lines are generated again (saves speech credits).
// The key is read from the environment by voice/speak.ts and is never printed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { speak } from "../voice/speak.ts";

const out = process.argv[2];
if (!out) throw new Error("usage: narrate.mts <output folder>");
mkdirSync(out, { recursive: true });
const lines = JSON.parse(readFileSync(new URL("./narration.json", import.meta.url), "utf8")) as Record<string, string>;
const only = process.argv.slice(3);
for (const [id, text] of Object.entries(lines)) {
  if (only.length > 0 && !only.includes(id)) continue;
  const audio = await speak(text);
  writeFileSync(`${out}/${id}.mp3`, audio);
  console.log(id, text.length, "characters,", audio.byteLength, "bytes");
}
