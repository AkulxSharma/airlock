import { formatEther } from "viem";
import type { DemoTarget } from "./aliases.js";

export type WalletRow = {
  name: string;
  address: string;
  /** Sepolia test ETH, as a decimal string, or null if the balance could not be read. */
  balanceEth: string | null;
  expected?: DemoTarget["expected"];
  why?: string;
};

export type WalletsSnapshot = { chainId: number; updatedAt: number; agent: WalletRow | null; targets: WalletRow[] };

export type BalanceReader = (address: string) => Promise<bigint>;

const TTL_MS = 15_000;

/**
 * Balances of the agent wallet and every demo contract, for the GUI. Cached for 15 seconds so a page
 * that refreshes does not hit the RPC for 23 addresses each time, and one failing address shows as
 * null instead of failing the whole list.
 */
export function createWalletsService(opts: {
  read: BalanceReader;
  targets: Record<string, DemoTarget>;
  agentAddress?: string;
  now?: () => number;
}) {
  const now = opts.now ?? Date.now;
  let cache: WalletsSnapshot | null = null;
  const one = async (name: string, address: string, t?: DemoTarget): Promise<WalletRow> => {
    let balanceEth: string | null = null;
    try {
      balanceEth = formatEther(await opts.read(address));
    } catch {
      balanceEth = null;
    }
    return { name, address, balanceEth, ...(t ? { expected: t.expected, why: t.why } : {}) };
  };
  return async function snapshot(): Promise<WalletsSnapshot> {
    if (cache && now() - cache.updatedAt < TTL_MS) return cache;
    const [agent, targets] = await Promise.all([
      opts.agentAddress ? one("agent wallet", opts.agentAddress) : Promise.resolve(null),
      Promise.all(Object.entries(opts.targets).map(([name, t]) => one(name, t.address, t))),
    ]);
    cache = { chainId: 11155111, updatedAt: now(), agent, targets };
    return cache;
  };
}
