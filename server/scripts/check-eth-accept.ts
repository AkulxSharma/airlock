// Read-only diagnosis: asks the network whether a plain test-ETH transfer to each demo target would go through
// (estimateGas from the agent wallet). Sends nothing. A target that REVERTS cannot receive a plain send.
// Run: npx tsx scripts/check-eth-accept.ts
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createPublicClient, fallback, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { loadDemoTargets } from "../src/demo/aliases.js";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
const urls = [process.env.RPC_URL_SEPOLIA, process.env.RPC_URL_SEPOLIA_FALLBACK].filter(Boolean) as string[];
const pub = createPublicClient({ chain: sepolia, transport: fallback(urls.map((u) => http(u, { timeout: 15_000 }))) });
const from = privateKeyToAccount(process.env.PRIVATE_KEY_TESTNET as `0x${string}`).address;

for (const [name, t] of Object.entries(loadDemoTargets())) {
  try {
    await pub.estimateGas({ account: from, to: t.address as `0x${string}`, value: parseEther("0.001") });
    console.log("accepts ETH ", name.padEnd(20), t.expected);
  } catch (e) {
    console.log("REVERTS     ", name.padEnd(20), t.expected, "-", (e as Error).message.split("\n")[0].slice(0, 70));
  }
}
