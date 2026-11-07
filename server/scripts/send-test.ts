// Manual check: npx tsx scripts/send-test.ts [amountEth] [to]
// Sends a tiny Sepolia test transfer through the same gated path the app uses.
// Reads ../.env (airlock/.env). Never prints the key.
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createConfirmStore } from "../src/gate/confirm.js";
import { createSepoliaWallet, maxTransferFromEnv, sendTestnet } from "../src/wallet/send.js";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const amountEth = process.argv[2] ?? "0.0001";
const to = process.argv[3] ?? "0x000000000000000000000000000000000000dEaD";

const store = createConfirmStore();
store.create("manual", { id: "manual-1", to, amountEth }, Date.now());
const consumed = store.consume("manual", "manual-1", Date.now());
if (!consumed.ok) throw new Error("could not consume the pending transfer");

const result = await sendTestnet(consumed.transfer, createSepoliaWallet(process.env), maxTransferFromEnv(process.env));
console.log(result);
if (result.ok) console.log(`https://sepolia.etherscan.io/tx/${result.hash}`);
