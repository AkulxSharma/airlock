// Live check of every name in demo-targets.json: real Sepolia chain + real Sourcify, then the gate.
// Run: npx tsx scripts/audit-demo-names.ts
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { auditAddress, auditTimeoutFromEnv, readerFromEnv } from "../src/auditor/chain.js";
import { createSourcifyFetcher } from "../src/auditor/source.js";
import { loadDemoTargets } from "../src/demo/aliases.js";
import { decide } from "../src/gate/decide.js";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
const reader = readerFromEnv(process.env);
const timeout = auditTimeoutFromEnv(process.env);
const fetchSource = createSourcifyFetcher();
for (const [name, t] of Object.entries(loadDemoTargets())) {
  const r = await auditAddress(t.address, reader, timeout, fetchSource);
  const d = decide(r, { target: t.address });
  const v = "verdict" in r ? r.verdict : "ERR";
  const ids = "findings" in r ? r.findings.map((f) => f.id).join(",") : JSON.stringify(r);
  console.log(`${name.padEnd(16)} expected ${t.expected.padEnd(6)} got ${v.padEnd(6)} ${d.action.padEnd(8)} ${ids}${v === t.expected ? "" : "   <-- MISMATCH"}`);
}
