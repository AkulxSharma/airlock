import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { config } from "dotenv";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { auditAddress, auditTimeoutFromEnv, readerFromEnv } from "./auditor/chain.js";
import { createApp, parseAllowedOrigins } from "./api/app.js";
import { createMessageHandler } from "./api/message.js";
import { resolveTarget, type EnsClient } from "./api/resolve.js";
import { createStageBus } from "./api/stream.js";
import { DEFAULT_TTL_MS, createConfirmStore } from "./gate/confirm.js";
import { createSepoliaWallet, maxTransferFromEnv, type WalletLike } from "./wallet/send.js";

// Keys live in airlock/.env (git-ignored), one level above server/.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const env = process.env;
const reader = readerFromEnv(env);
const auditTimeoutMs = auditTimeoutFromEnv(env);

// ENS lives on Ethereum mainnet even though transfers go out on Sepolia.
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(env.ENS_RPC_URL || "https://ethereum-rpc.publicnode.com", { timeout: 8_000 }),
}) as unknown as EnsClient;

let wallet: WalletLike | null = null;
try {
  wallet = createSepoliaWallet(env);
} catch (err) {
  console.warn(`Sending is disabled: ${err instanceof Error ? err.message : err}`);
}

const ttlSeconds = Number(env.CONFIRM_TTL_SECONDS);
const bus = createStageBus();
const handle = createMessageHandler({
  resolve: (input) => resolveTarget(input, ensClient),
  audit: (address) => auditAddress(address, reader, auditTimeoutMs),
  store: createConfirmStore(),
  wallet,
  now: () => Date.now(),
  maxTransferEth: maxTransferFromEnv(env),
  ttlMs: Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds * 1000 : DEFAULT_TTL_MS,
  publish: bus.publish,
});

const app = createApp({ handle, bus, allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS) });
const port = Number(env.PORT) || 8787;
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`Airlock server listening on http://127.0.0.1:${port}`);
});
