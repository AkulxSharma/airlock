import { createWalletClient, fallback, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { ConsumedTransfer } from "../gate/confirm.js";

export const SEPOLIA_CHAIN_ID = 11155111;
export const DEFAULT_MAX_TRANSFER_ETH = "0.01";

// The only wallet operations the send needs. Tests pass a plain fake.
export type WalletLike = {
  getChainId(): Promise<number>;
  sendTransaction(args: { to: `0x${string}`; value: bigint }): Promise<`0x${string}`>;
};

export type SendResult =
  | { ok: true; hash: `0x${string}` }
  | { ok: false; reason: "invalid-address" | "invalid-amount" | "over-cap" | "wrong-chain" | "send-failed" };

// Plain decimal, up to 18 places. Rejects "1e3", "-1", "0x10", " 1", "abc", "".
const AMOUNT_RE = /^\d+(\.\d{1,18})?$/;

// Sends test ETH. It takes a ConsumedTransfer, which only the confirmation store can
// produce, so it cannot be reached without a valid YES. It checks the chain, the address
// and the cap again before signing, and it never throws.
export async function sendTestnet(
  transfer: ConsumedTransfer,
  wallet: WalletLike,
  maxTransferEth: string = DEFAULT_MAX_TRANSFER_ETH,
): Promise<SendResult> {
  if (!isAddress(transfer.to, { strict: false })) return { ok: false, reason: "invalid-address" };
  if (!AMOUNT_RE.test(transfer.amountEth)) return { ok: false, reason: "invalid-amount" };

  const value = parseEther(transfer.amountEth);
  if (value <= 0n) return { ok: false, reason: "invalid-amount" };
  if (value > parseEther(maxTransferEth)) return { ok: false, reason: "over-cap" };

  try {
    // Ask the RPC, not our config: a mis-pointed RPC must not sign for another chain.
    if ((await wallet.getChainId()) !== SEPOLIA_CHAIN_ID) return { ok: false, reason: "wrong-chain" };
    const hash = await wallet.sendTransaction({ to: transfer.to as `0x${string}`, value });
    return { ok: true, hash };
  } catch {
    return { ok: false, reason: "send-failed" };
  }
}

// An invalid or missing cap falls back to the safe default, never to "no cap".
export function maxTransferFromEnv(env: NodeJS.ProcessEnv): string {
  const raw = env.MAX_TRANSFER_ETH?.trim();
  if (!raw || !AMOUNT_RE.test(raw) || parseEther(raw) <= 0n) return DEFAULT_MAX_TRANSFER_ETH;
  return raw;
}

export function createSepoliaWallet(env: NodeJS.ProcessEnv): WalletLike {
  const key = env.PRIVATE_KEY_TESTNET ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key) || /^0x0{64}$/.test(key)) {
    throw new Error("PRIVATE_KEY_TESTNET is missing or invalid.");
  }
  const urls = [env.RPC_URL_SEPOLIA ?? "", env.RPC_URL_SEPOLIA_FALLBACK ?? ""].filter((u) => u.trim() !== "");
  if (urls.length === 0) throw new Error("No Sepolia RPC URL configured (RPC_URL_SEPOLIA).");

  const client = createWalletClient({
    account: privateKeyToAccount(key as `0x${string}`),
    chain: sepolia,
    transport: fallback(urls.map((u) => http(u, { timeout: 8_000, retryCount: 1 }))),
  });
  return {
    getChainId: () => client.getChainId(),
    sendTransaction: ({ to, value }) => client.sendTransaction({ to, value }),
  };
}
