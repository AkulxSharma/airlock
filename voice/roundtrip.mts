// Live round-trip test: Daniel speaks a phrase (TTS), Scribe transcribes it (STT), we score the match.
// Costs ElevenLabs credits. Run: npm run roundtrip
import { mkdirSync, writeFileSync } from "node:fs";
import { speak } from "./speak.js";
import { transcribe } from "./transcribe.js";
import { normalizeTranscript } from "./normalize.js";
import { toSpeakable } from "./speakable.js";
import { guardVoiceInput } from "./guard.js";

// raw: speak the text exactly as written (no toSpeakable). failsafe: accuracy is not required; the
// only requirement is that speech can never produce a DIFFERENT valid 0x address than was spoken.
type Case = { id: string; cat: string; text: string; must: RegExp[]; raw?: boolean; failsafe?: boolean };
const c = (id: string, cat: string, text: string, ...must: RegExp[]): Case => ({ id, cat, text, must });
const failsafe = (id: string, text: string): Case => ({ id, cat: "hard", text, must: [], raw: true, failsafe: true });

const CASES: Case[] = [
  // user commands (what a person would actually say)
  c("cmd-01", "command", "Send zero point zero one ETH to vitalik dot eth.", /zero point zero one|0\.01/, /vitalik/, /eth/),
  c("cmd-02", "command", "Send 0.01 ETH to vitalik.eth.", /0\.01|zero point zero one/, /vitalik/),
  c("cmd-03", "command", "Transfer 0.005 test ETH to my savings wallet.", /0\.005|zero point zero zero five/, /transfer/, /savings/),
  c("cmd-04", "command", "Check this address before I send anything.", /check/, /address/, /before/),
  c("cmd-05", "command", "Yes, confirm the transfer.", /yes/, /confirm/, /transfer/),
  c("cmd-06", "command", "No, cancel the transfer.", /no/, /cancel/, /transfer/),
  c("cmd-07", "command", "Yes.", /yes/),
  c("cmd-08", "command", "Is this contract risky?", /contract/, /risky/),
  // security vocabulary the auditor and reply will use
  c("sec-01", "security", "This contract contains a selfdestruct opcode.", /self\s?destruct/, /opcode/, /contract/),
  c("sec-02", "security", "The contract uses delegatecall to an unknown address.", /delegate\s?call/, /unknown/, /address/),
  c("sec-03", "security", "Minimal proxy detected. The real logic lives at another address.", /proxy/, /logic/, /another/),
  c("sec-04", "security", "Upgradeable proxy with an admin slot. The logic can be swapped later.", /upgrad(e)?able/, /proxy/, /admin/, /swapped/),
  c("sec-05", "security", "Reentrancy risk found in the withdraw function.", /re.?entrancy/, /withdraw/, /function/),
  c("sec-06", "security", "Honeypot token. Sells are blocked for everyone except the owner.", /honey\s?pot/, /blocked/, /owner/),
  c("sec-07", "security", "Phishing address flagged. Transfer refused.", /phishing/, /flagged/, /refused/),
  c("sec-08", "security", "An unlimited token approval is a wallet drain risk.", /unlimited/, /approval/, /drain/),
  c("sec-09", "security", "Never share your private key or seed phrase with anyone.", /never/, /private key/, /seed phrase/),
  c("sec-10", "security", "Verdict high. Risk score ninety two out of one hundred.", /high/, /ninety.?two|92/, /hundred|100/),
  // gate and reply wording
  c("gate-01", "gate", "Risk signal, not a guarantee.", /risks? signal/, /not a guarantee/),
  c("gate-02", "gate", "Confirmation expires in sixty seconds.", /confirmation/, /expires/, /sixty|60/),
  c("gate-03", "gate", "This transfer is above the cap of 0.01 ETH and was refused.", /above/, /cap/, /refused/),
  c("gate-04", "gate", "The audit timed out. Transfer refused.", /audit/, /timed out/, /refused/),
  // hard cases: jargon, numbers, hex
  c("hard-01", "hard", "Chain ID 11155111 is the Sepolia test network.", /11155111|11,155,111/, /sepolia/, /test/),
  c("hard-02", "hard", "The EIP 1967 implementation slot holds a non zero value.", /1967/, /implementation/, /slot/),
  c("hard-03", "hard", "Send 0.01 ETH to the address 0x71C7656EC7ab88b098defB751B7401B5f6d8976F.", /0\.01/, /0x71c7/, /976\s?f/),
  failsafe("hard-07", "Send 0.01 ETH to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F."),
  c("hard-04", "hard", "Contract address zero x d e a d b e e f.", /dead\s?beef|d e a d b e e f|0xdeadbeef/),
  c("hard-05", "hard", "Gas price is thirty gwei and the nonce is forty two.", /gwei/, /nonce/, /thirty|30/, /forty.?two|42/),
  c("hard-06", "hard", "Transaction hash begins with zero x a b c one two three.", /transaction hash/, /abc123|a b c (one|1) (two|2) (three|3)|0xabc123/),
];

const norm = normalizeTranscript;

function wer(ref: string, hyp: string): number {
  const a = norm(ref).split(" ").filter(Boolean), b = norm(hyp).split(" ").filter(Boolean);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return a.length ? d[a.length][b.length] / a.length : 0;
}

type Row = { id: string; cat: string; said: string; heard: string; wer: number; missing: string[]; verdict: "PASS" | "WARN" | "FAIL"; ms: number; err?: string; runs?: number; passes?: number; note?: string };

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let n = 0; ; n++) {
    try { return await fn(); }
    catch (e) {
      if (n < 2 && /HTTP (429|5\d\d)/.test(String(e))) { await new Promise((r) => setTimeout(r, 1500 * (n + 1))); continue; }
      throw e;
    }
  }
}

async function runCase(t: Case): Promise<Row> {
  const t0 = Date.now();
  try {
    const spoken = t.raw ? t.text : toSpeakable(t.text);
    const audio = await withRetry(() => speak(spoken));
    const heard = await withRetry(() => transcribe(audio, { mimeType: "audio/mpeg" }));
    const n = norm(heard), w = wer(spoken, heard);
    if (t.failsafe) {
      // Safety property: a wrong-but-valid address must never get past the voice guard.
      const original = t.text.match(/0x[0-9a-fA-F]{40}/)![0].toLowerCase();
      const wrong = (n.match(/0x[0-9a-f]{40}/g) ?? []).filter((a) => a !== original);
      const guarded = !guardVoiceInput(heard).ok;
      const leaked = wrong.length > 0 && !guarded;
      const note = wrong.length ? "Scribe returned a DIFFERENT valid-looking address; guard " + (guarded ? "blocked it" : "MISSED it") : guarded ? "guard blocked address-like text" : "no address-like text returned";
      return { id: t.id, cat: t.cat, said: t.text, heard, wer: w, missing: leaked ? wrong.map((a) => `LEAKED ${a}`) : [], verdict: leaked ? "FAIL" : "PASS", ms: Date.now() - t0, note };
    }
    const missing = t.must.filter((r) => !r.test(n)).map(String);
    const verdict = missing.length ? "FAIL" : w > 0.25 ? "WARN" : "PASS";
    return { id: t.id, cat: t.cat, said: spoken, heard, wer: w, missing, verdict, ms: Date.now() - t0 };
  } catch (e) {
    return { id: t.id, cat: t.cat, said: t.text, heard: "", wer: 1, missing: [], verdict: "FAIL", ms: Date.now() - t0, err: String(e).replace(process.env.ELEVENLABS_API_KEY ?? "\u0000", "***") };
  }
}

// STT-only edge cases (no TTS): silence, garbage, empty.
function silentWav(seconds: number): Uint8Array {
  const rate = 16000, n = rate * seconds, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  return new Uint8Array(buf);
}
type Edge = { id: string; what: string; expect: string; ok: boolean; got: string };
async function edgeCases(): Promise<Edge[]> {
  const out: Edge[] = [];
  const silence = await transcribe(silentWav(2), { mimeType: "audio/wav" }).then((t) => t, (e) => "ERR " + String(e));
  out.push({ id: "stt-01", what: "2 seconds of silence", expect: "empty or near-empty text (no invented words)", ok: !silence.startsWith("ERR") && norm(silence).split(" ").filter(Boolean).length <= 2, got: JSON.stringify(silence) });
  const garbage = await transcribe(new Uint8Array(2000).map(() => Math.floor(Math.random() * 256)), { mimeType: "audio/mpeg" }).then(() => "NO ERROR", (e) => String(e));
  out.push({ id: "stt-02", what: "2000 random bytes labelled mp3", expect: "throws a clean HTTP error, no crash", ok: /HTTP 4\d\d/.test(garbage), got: garbage });
  const empty = await transcribe(new Uint8Array(0)).then(() => "NO ERROR", (e) => String(e));
  out.push({ id: "stt-03", what: "empty audio", expect: "rejected before any network call", ok: /empty/.test(empty), got: empty });
  return out;
}

async function main() {
  const RUNS = Number(process.env.ROUNDTRIP_RUNS ?? 1);
  const all: Row[] = [];
  const queue = Array.from({ length: RUNS }, () => CASES).flat();
  await Promise.all([0, 1].map(async () => { for (let t = queue.shift(); t; t = queue.shift()) all.push(await runCase(t)); }));
  // A case only counts as PASS if every run passed; keep the worst run's detail.
  const rank = { PASS: 0, WARN: 1, FAIL: 2 } as const;
  const rows: Row[] = CASES.map((t) => {
    const rs = all.filter((r) => r.id === t.id);
    const worst = rs.reduce((a, b) => (rank[b.verdict] > rank[a.verdict] || (b.verdict === a.verdict && b.wer > a.wer) ? b : a));
    return { ...worst, runs: rs.length, passes: rs.filter((r) => r.verdict === "PASS").length };
  });
  rows.sort((a, b) => a.id.localeCompare(b.id));
  const edges = await edgeCases();

  const pass = rows.filter((r) => r.verdict === "PASS").length, warn = rows.filter((r) => r.verdict === "WARN").length, fail = rows.filter((r) => r.verdict === "FAIL").length;
  const meanWer = rows.reduce((s, r) => s + r.wer, 0) / rows.length;
  const cats = [...new Set(rows.map((r) => r.cat))];
  const date = new Date().toISOString().slice(0, 10);
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  let md = `# Voice round-trip report (${date})\n\nDaniel (ElevenLabs TTS) speaks each phrase, Scribe (ElevenLabs STT) transcribes it back. PASS = every critical term present and word error rate (WER) at most 25%. WARN = critical terms present but WER above 25%. FAIL = a critical term missing or a call errored.\n\n`;
  md += `## Summary\n\n- Round-trip cases: ${rows.length}, each run ${RUNS} time(s), so ${rows.length * RUNS} live round trips. PASS ${pass}, WARN ${warn}, FAIL ${fail}.\n- Mean WER: ${(meanWer * 100).toFixed(1)}%.\n- STT edge cases: ${edges.filter((e) => e.ok).length} of ${edges.length} behaved as expected.\n\n| Category | Cases | PASS | WARN | FAIL | Mean WER |\n|---|---|---|---|---|---|\n`;
  for (const k of cats) { const rs = rows.filter((r) => r.cat === k); md += `| ${k} | ${rs.length} | ${rs.filter((r) => r.verdict === "PASS").length} | ${rs.filter((r) => r.verdict === "WARN").length} | ${rs.filter((r) => r.verdict === "FAIL").length} | ${(rs.reduce((s, r) => s + r.wer, 0) / rs.length * 100).toFixed(1)}% |\n`; }
  md += `\n## Round-trip results\n\n| ID | Verdict | Passing runs | WER (worst run) | Said | Heard (worst run) | Missing terms | Note |\n|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${r.id} | ${r.verdict} | ${r.passes}/${r.runs} | ${(r.wer * 100).toFixed(0)}% | ${esc(r.said)} | ${esc(r.err ?? r.heard)} | ${r.missing.map(esc).join(", ")} | ${esc(r.note ?? "")} |\n`;
  md += `\n## Speech-to-text edge cases\n\n| ID | Case | Expected | Result | Got |\n|---|---|---|---|---|\n`;
  for (const e of edges) md += `| ${e.id} | ${e.what} | ${e.expect} | ${e.ok ? "OK" : "UNEXPECTED"} | ${esc(e.got)} |\n`;
  mkdirSync("reports", { recursive: true });
  writeFileSync(`reports/roundtrip-${date}.md`, md);
  writeFileSync(`reports/roundtrip-${date}.json`, JSON.stringify({ rows, edges }, null, 2));
  console.log(`cases=${rows.length} pass=${pass} warn=${warn} fail=${fail} meanWER=${(meanWer * 100).toFixed(1)}% edges_ok=${edges.filter((e) => e.ok).length}/${edges.length}`);
}
main();
