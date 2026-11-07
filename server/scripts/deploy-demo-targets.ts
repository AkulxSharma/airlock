// One-time: deploys the demo target contracts to Sepolia and records their addresses in
// src/demo/demo-targets.json. Test ETH only. Refuses to redeploy unless --force.
// Run: npx tsx scripts/deploy-demo-targets.ts
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { cleanInit, cloneInit, drainerInit, proxyInit } from "../src/demo/bytecode.js";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const OUT = fileURLToPath(new URL("../src/demo/demo-targets.json", import.meta.url));
if (existsSync(OUT) && !process.argv.includes("--force")) {
  console.error("demo-targets.json already exists. Use --force to redeploy.");
  process.exit(1);
}

const WETH = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"; // public Sepolia WETH9, used as the implementation
const key = process.env.PRIVATE_KEY_TESTNET as `0x${string}`;
const urls = [process.env.RPC_URL_SEPOLIA, process.env.RPC_URL_SEPOLIA_FALLBACK].filter(Boolean) as string[];
const transport = fallback(urls.map((u) => http(u, { timeout: 15_000, retryCount: 1 })));
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain: sepolia, transport });
const pub = createPublicClient({ chain: sepolia, transport });

if ((await pub.getChainId()) !== 11155111) throw new Error("not Sepolia");

async function deploy(name: string, data: string): Promise<`0x${string}`> {
  const hash = await wallet.sendTransaction({ data: data as `0x${string}` });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`${name} deploy failed`);
  console.log(`${name}: ${receipt.contractAddress}  tx ${hash}`);
  return receipt.contractAddress;
}

const drainer = await deploy("drainer", drainerInit());
const clean = await deploy("clean", cleanInit());
const proxy = await deploy("proxy", proxyInit(WETH));
const clone = await deploy("clone", cloneInit(WETH));

const fixture = {
  chainId: 11155111,
  note: "Demo targets on Sepolia. Test contracts only, no real value. Hand-assembled bytecode from src/demo/bytecode.ts.",
  targets: {
    "drainer.demo": { address: drainer, expected: "HIGH", why: "SELFDESTRUCT" },
    "clean.demo": { address: clean, expected: "LOW", why: "nothing flagged" },
    "proxy.demo": { address: proxy, expected: "MEDIUM", why: "DELEGATECALL and upgradeable proxy (EIP-1967 slot set)" },
    "clone.demo": { address: clone, expected: "MEDIUM", why: "minimal proxy (EIP-1167)" },
    "weth.demo": { address: WETH, expected: "LOW", why: "real Sepolia WETH9, nothing flagged" },
  },
};
writeFileSync(OUT, JSON.stringify(fixture, null, 2) + "\n");
console.log("wrote", OUT);
