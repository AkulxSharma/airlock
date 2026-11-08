// Deploys the compiled Solidity demo contracts to Sepolia (test ETH only) and merges them
// into src/demo/demo-targets.json. Run compile-demo-contracts.ts first.
// Run: npx tsx scripts/deploy-solidity-demos.ts   (skips names already recorded)
//      --force redeploys them; --only=a.demo,b.demo limits it to those names (with --force).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, fallback, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const PLAN: Array<{ name: string; contract: string; expected: "LOW" | "MEDIUM" | "HIGH"; why: string }> = [
  { name: "rugvault.demo", contract: "RugVault", expected: "HIGH", why: "owner can sweep the whole pool (owner-sweep)" },
  { name: "reentrancy.demo", contract: "ReentrancyBank", expected: "MEDIUM", why: "sends ether before updating balances (reentrancy-risk)" },
  { name: "honeypot.demo", contract: "HoneypotToken", expected: "MEDIUM", why: "blacklist, sell-fee and trading switches" },
  { name: "selfkill.demo", contract: "UnprotectedKill", expected: "HIGH", why: "anyone can SELFDESTRUCT it" },
  { name: "vault.demo", contract: "CleanVault", expected: "LOW", why: "user-only vault, source verified, nothing flagged" },
  { name: "origin.demo", contract: "OriginWallet", expected: "MEDIUM", why: "authorizes with tx.origin (tx-origin)" },
  { name: "unchecked.demo", contract: "UncheckedSend", expected: "MEDIUM", why: "ignores whether a send succeeded (unchecked-call)" },
  { name: "init.demo", contract: "UnprotectedInit", expected: "HIGH", why: "anyone can call initialize() and become owner (unprotected-init)" },
  { name: "delegate.demo", contract: "DelegateToUser", expected: "MEDIUM", why: "delegatecall to a caller-chosen address" },
  { name: "lottery.demo", contract: "WeakRandomLottery", expected: "MEDIUM", why: "block values used as randomness (weak-randomness)" },
  { name: "strictbalance.demo", contract: "StrictBalanceGame", expected: "LOW", why: "exact balance comparison, forced-ether risk (strict-balance)" },
  { name: "dos.demo", contract: "DosRefund", expected: "MEDIUM", why: "pays everyone in one loop (dos-loop-payment)" },
  { name: "replay.demo", contract: "SignatureReplay", expected: "MEDIUM", why: "signature has no replay protection (signature-replay)" },
  { name: "backdoor.demo", contract: "BackdoorToken", expected: "HIGH", why: "owner can move anyone's tokens (owner-seize)" },
  { name: "approval.demo", contract: "ApprovalDrainer", expected: "HIGH", why: "owner pulls approved tokens out of wallets (owner-seize)" },
  { name: "math.demo", contract: "UncheckedMath", expected: "MEDIUM", why: "balance math in an unchecked block (unchecked-math)" },
  { name: "oracle.demo", contract: "SpotOracleLender", expected: "LOW", why: "flash-loan price manipulation: NOT detected, a known gap" },
];

const FILE = fileURLToPath(new URL("../src/demo/demo-targets.json", import.meta.url));
const compiled = JSON.parse(readFileSync(fileURLToPath(new URL("../src/demo/compiled.json", import.meta.url)), "utf8"));
const fixture = JSON.parse(readFileSync(FILE, "utf8"));

const urls = [process.env.RPC_URL_SEPOLIA, process.env.RPC_URL_SEPOLIA_FALLBACK].filter(Boolean) as string[];
const transport = fallback(urls.map((u) => http(u, { timeout: 15_000, retryCount: 1 })));
const account = privateKeyToAccount(process.env.PRIVATE_KEY_TESTNET as `0x${string}`);
const wallet = createWalletClient({ account, chain: sepolia, transport });
const pub = createPublicClient({ chain: sepolia, transport });
if ((await pub.getChainId()) !== 11155111) throw new Error("not Sepolia");
console.log("deployer", account.address, "balance", formatEther(await pub.getBalance({ address: account.address })), "SepETH");

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);
for (const p of PLAN) {
  if (only && !only.includes(p.name)) continue;
  if (fixture.targets[p.name] && !process.argv.includes("--force")) {
    console.log("skip", p.name, "(already recorded)");
    continue;
  }
  const hash = await wallet.sendTransaction({ data: compiled.contracts[p.contract].creation as `0x${string}` });
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (r.status !== "success" || !r.contractAddress) throw new Error(`${p.contract} deploy failed`);
  console.log(`${p.name}: ${r.contractAddress}  tx ${hash}`);
  fixture.targets[p.name] = { address: r.contractAddress, expected: p.expected, why: p.why, contract: p.contract }; // verified is set by verify-solidity-demos.ts
  writeFileSync(FILE, JSON.stringify(fixture, null, 2) + "\n"); // save after each, so a later failure loses nothing
}
console.log("done");
