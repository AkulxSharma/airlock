// Submits each deployed Solidity demo contract to Sourcify (public registry, no account or key) so the
// audit's source checks can read its source. Also rewrites addresses in demo-targets.json to checksum form.
// Run: npx tsx scripts/verify-solidity-demos.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAddress } from "viem";

const FILE = fileURLToPath(new URL("../src/demo/demo-targets.json", import.meta.url));
const compiled = JSON.parse(readFileSync(fileURLToPath(new URL("../src/demo/compiled.json", import.meta.url)), "utf8"));
const fixture = JSON.parse(readFileSync(FILE, "utf8"));
const BASE = "https://sourcify.dev/server";
const compilerVersion = compiled.solc.replace(/\.Emscripten.*$/, "");

for (const [name, t] of Object.entries<any>(fixture.targets)) {
  if (!t.contract) continue;
  t.address = getAddress(t.address);
  const art = compiled.contracts[t.contract];
  const res = await fetch(`${BASE}/v2/verify/${fixture.chainId}/${t.address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stdJsonInput: compiled.input, compilerVersion, contractIdentifier: `${art.file}:${t.contract}` }),
  });
  const body: any = await res.json().catch(() => ({}));
  console.log(name, t.address, res.status, JSON.stringify(body).slice(0, 160));
  if (body.verificationId) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const j: any = await (await fetch(`${BASE}/v2/verify/${body.verificationId}`)).json();
      if (j.isJobCompleted) {
        console.log("  ->", j.contract?.match ?? "no match", j.error ? JSON.stringify(j.error).slice(0, 200) : "");
        break;
      }
    }
  }
}
writeFileSync(FILE, JSON.stringify(fixture, null, 2) + "\n");
