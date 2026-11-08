// Read-only: proves every demo target is a real smart contract (has code on Sepolia), not a plain wallet,
// and shows how its source is known. Sends nothing. Run: npx tsx scripts/check-contract-code.ts
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createPublicClient, fallback, http } from "viem";
import { sepolia } from "viem/chains";
import { createSourcifyFetcher } from "../src/auditor/source.js";
import { loadDemoTargets } from "../src/demo/aliases.js";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
const urls = [process.env.RPC_URL_SEPOLIA, process.env.RPC_URL_SEPOLIA_FALLBACK].filter(Boolean) as string[];
const pub = createPublicClient({ chain: sepolia, transport: fallback(urls.map((u) => http(u, { timeout: 15_000 }))) });
const fetchSource = createSourcifyFetcher();

let bad = 0;
for (const [name, t] of Object.entries(loadDemoTargets())) {
  const code = (await pub.getCode({ address: t.address as `0x${string}` })) ?? "0x";
  const bytes = (code.length - 2) / 2;
  const src = bytes > 0 ? await fetchSource(t.address, 11155111) : { status: "none" as const };
  const kind = t.aliasOf ? `alias of ${t.aliasOf}` : src.status === "verified" ? "Solidity, source verified" : bytes > 0 ? "contract, no published source" : "NO CODE";
  if (bytes === 0) bad++;
  console.log(`${bytes > 0 ? "CONTRACT" : "WALLET!!"} ${name.padEnd(20)} ${String(bytes).padStart(5)} bytes  ${kind}`);
}
console.log(bad === 0 ? "all targets are smart contracts" : `${bad} target(s) are plain wallets`);
