import { createPublicClient, fallback, http } from "viem";
import { sepolia } from "viem/chains";
import type { AuditResult } from "../types.js";
import { auditBytecode } from "./index.js";
import {
  EIP1967_ADMIN_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  checkUpgradeableProxy,
} from "./checks.js";

export const SEPOLIA_CHAIN_ID = 11155111;

// The only two chain reads the auditor needs. Tests pass a plain fake.
export type ChainReader = {
  getCode(address: string): Promise<string | undefined>;
  getStorageAt(address: string, slot: string): Promise<string | undefined>;
};

// An audit either returns a result, or one of two failure shapes. The gate refuses both.
export type LiveAuditOutcome = AuditResult | { error: string } | { timeout: true };

const TIMED_OUT = Symbol("timed-out");

export async function auditAddress(
  address: string,
  reader: ChainReader,
  timeoutMs: number,
): Promise<LiveAuditOutcome> {
  const work = (async (): Promise<AuditResult> => {
    const [code, implementation, admin] = await Promise.all([
      reader.getCode(address),
      reader.getStorageAt(address, EIP1967_IMPLEMENTATION_SLOT),
      reader.getStorageAt(address, EIP1967_ADMIN_SLOT),
    ]);
    const proxy = checkUpgradeableProxy([implementation, admin]);
    return auditBytecode(code ?? "0x", address, SEPOLIA_CHAIN_ID, proxy ? [proxy] : []);
  })();
  work.catch(() => {}); // a late failure after a timeout must not become an unhandled rejection

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });

  try {
    const outcome = await Promise.race([work, timeout]);
    if (outcome === TIMED_OUT) return { timeout: true };
    return outcome;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "audit failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Real Sepolia reader. The fallback URL, if set, is tried when the first RPC fails.
export function createSepoliaReader(urls: string[]): ChainReader {
  const list = urls.filter((u) => u.trim() !== "");
  if (list.length === 0) throw new Error("No Sepolia RPC URL configured (RPC_URL_SEPOLIA).");
  const client = createPublicClient({
    chain: sepolia,
    transport: fallback(list.map((u) => http(u, { timeout: 8_000, retryCount: 1 }))),
  });
  return {
    getCode: (address) => client.getCode({ address: address as `0x${string}` }),
    getStorageAt: (address, slot) =>
      client.getStorageAt({ address: address as `0x${string}`, slot: slot as `0x${string}` }),
  };
}

export function readerFromEnv(env: NodeJS.ProcessEnv): ChainReader {
  return createSepoliaReader([env.RPC_URL_SEPOLIA ?? "", env.RPC_URL_SEPOLIA_FALLBACK ?? ""]);
}

export function auditTimeoutFromEnv(env: NodeJS.ProcessEnv): number {
  const n = Number(env.AUDIT_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}
