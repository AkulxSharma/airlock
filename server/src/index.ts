import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { config } from "dotenv";
import { createPublicClient, fallback, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { createExplainer, createGeminiAgent, createGeminiClient, describeGeminiError, modelFromEnv, withCooldown } from "./agent/gemini.js";
import { auditAddress, auditTimeoutFromEnv, readerFromEnv } from "./auditor/chain.js";
import { createSourcifyFetcher } from "./auditor/source.js";
import { createActivityBus, handleOf, isIMessageSession } from "./api/activity.js";
import { createApp, parseAllowedOrigins } from "./api/app.js";
import { isAllowed, maskHandle, parseAllowlist } from "./imessage/text.js";
import { createMessageHandler } from "./api/message.js";
import { resolveTarget, type EnsClient } from "./api/resolve.js";
import { createStageBus } from "./api/stream.js";
import { loadDemoAliases, loadDemoTargets } from "./demo/aliases.js";
import { createWalletsService } from "./demo/balances.js";
import { DEFAULT_TTL_MS, createConfirmStore } from "./gate/confirm.js";
import { createSepoliaWallet, maxTransferFromEnv, type WalletLike } from "./wallet/send.js";

// Keys live in airlock/.env (git-ignored), one level above server/.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const env = process.env;
const reader = readerFromEnv(env);
const auditTimeoutMs = auditTimeoutFromEnv(env);
const fetchSource = createSourcifyFetcher();

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

const demoAliases = loadDemoAliases();

// With a Gemini key: loose phrasing and plain-language notes. Without one, or if a call
// fails, the rule-based parser and the fixed replies still work.
const geminiKey = env.GEMINI_API_KEY?.trim();
const geminiModel = modelFromEnv(env);
const gemini = geminiKey
  ? withCooldown(createGeminiClient(geminiKey, 8_000, geminiModel), 20_000, Date.now, (err) => {
      // Say what failed (never the key), then carry on with the rule parser and the template reply.
      const msg = describeGeminiError(err, geminiKey);
      if (!/cooling down/.test(msg)) console.warn(`Gemini call failed, using the rule parser for now: ${msg}`);
    })
  : null;
console.log(gemini ? `Gemini: on (${geminiModel})` : "Gemini: off (no GEMINI_API_KEY), using the rule-based parser");
const ttlSeconds = Number(env.CONFIRM_TTL_SECONDS);
// Item 12. IMESSAGE_CONFIRM_ALLOWLIST (comma list of phone numbers/emails): only these iMessage senders may
// confirm a send. Unset = any sender may (demo-friendly). GUI and voice sessions are never blocked by it.
const confirmList = parseAllowlist(env.IMESSAGE_CONFIRM_ALLOWLIST);
const confirmRestricted = confirmList.handles.size > 0 && !confirmList.anyone;
console.log(confirmRestricted ? `Confirm allowlist: ${confirmList.handles.size} iMessage sender(s)` : "Confirm allowlist: off (any iMessage sender may confirm a send)");
const dailyCapEth = env.DAILY_CAP_ETH?.trim() || "0.05";
const bus = createStageBus();
// What happens on the iMessage line, shown live on the website (sender masked).
const activity = createActivityBus();
const who = (sessionId: string) => maskHandle(handleOf(sessionId));
const handleMessage = createMessageHandler({
  resolve: (input) => resolveTarget(input, ensClient, demoAliases),
  audit: (address) => auditAddress(address, reader, auditTimeoutMs, fetchSource),
  store: createConfirmStore(),
  wallet,
  now: () => Date.now(),
  maxTransferEth: maxTransferFromEnv(env),
  dailyCapEth,
  canConfirm: confirmRestricted
    ? (sid) => !sid.startsWith("imessage:") || isAllowed(confirmList, sid.slice("imessage:".length))
    : undefined,
  ttlMs: Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds * 1000 : DEFAULT_TTL_MS,
  publish: (sessionId, stage) => {
    bus.publish(sessionId, stage);
    if (isIMessageSession(sessionId)) activity.emit({ kind: "stage", who: who(sessionId), stage });
  },
  agent: gemini ? createGeminiAgent(gemini) : undefined,
  explain: gemini ? createExplainer(gemini) : undefined,
});

const handle: typeof handleMessage = async (req) => {
  if (!isIMessageSession(req.sessionId)) return handleMessage(req);
  activity.emit({ kind: "message", channel: req.channel === "voice" ? "voice" : "imessage", who: who(req.sessionId), text: req.text });
  const response = await handleMessage(req);
  activity.emit({ kind: "reply", who: who(req.sessionId), response });
  return response;
};

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: fallback(
    [env.RPC_URL_SEPOLIA, env.RPC_URL_SEPOLIA_FALLBACK].filter((u): u is string => !!u?.trim()).map((u) => http(u, { timeout: 8_000, retryCount: 1 })),
  ),
});
const wallets = createWalletsService({
  read: (address) => sepoliaClient.getBalance({ address: address as `0x${string}` }),
  targets: loadDemoTargets(),
  agentAddress: wallet?.address,
});

const app = createApp({ handle, bus, allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS), wallets, activity });
const port = Number(env.PORT) || 8787;
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`Airlock server listening on http://127.0.0.1:${port}`);
});
