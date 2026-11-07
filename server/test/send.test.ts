import { describe, expect, it, vi } from "vitest";
import { createConfirmStore, type ConsumedTransfer } from "../src/gate/confirm.js";
import {
  DEFAULT_MAX_TRANSFER_ETH,
  createSepoliaWallet,
  maxTransferFromEnv,
  sendTestnet,
  type WalletLike,
} from "../src/wallet/send.js";

const TO = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const HASH = ("0x" + "ab".repeat(32)) as `0x${string}`;

// The only way to get a ConsumedTransfer is through the store, same as production.
function consumed(amountEth: string, to: string = TO): ConsumedTransfer {
  const store = createConfirmStore();
  store.create("s", { id: "t", to, amountEth }, 0);
  const r = store.consume("s", "t", 1);
  if (!r.ok) throw new Error("fixture failed");
  return r.transfer;
}

function fakeWallet(chainId = 11155111, fail = false) {
  const sendTransaction = vi.fn(async () => {
    if (fail) throw new Error("boom");
    return HASH;
  });
  const wallet: WalletLike = { getChainId: async () => chainId, sendTransaction };
  return { wallet, sendTransaction };
}

describe("sendTestnet", () => {
  it("sends a valid amount under the cap and returns the hash", async () => {
    const { wallet, sendTransaction } = fakeWallet();
    expect(await sendTestnet(consumed("0.005"), wallet)).toEqual({ ok: true, hash: HASH });
    expect(sendTransaction).toHaveBeenCalledWith({ to: TO, value: 5_000_000_000_000_000n });
  });

  it("allows exactly the cap", async () => {
    const { wallet } = fakeWallet();
    expect((await sendTestnet(consumed("0.01"), wallet)).ok).toBe(true);
  });

  it("refuses above the cap before signing", async () => {
    const { wallet, sendTransaction } = fakeWallet();
    expect(await sendTestnet(consumed("0.0100001"), wallet)).toEqual({ ok: false, reason: "over-cap" });
    expect(await sendTestnet(consumed("5"), wallet)).toEqual({ ok: false, reason: "over-cap" });
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("respects a custom cap", async () => {
    const { wallet, sendTransaction } = fakeWallet();
    expect(await sendTestnet(consumed("0.003"), wallet, "0.002")).toEqual({ ok: false, reason: "over-cap" });
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses zero, negative and non-decimal amounts", async () => {
    const { wallet, sendTransaction } = fakeWallet();
    for (const bad of ["0", "0.0", "-1", "abc", "", " 1", "1e3", "0x10", "1.", ".5", "1.0000000000000000001"]) {
      expect(await sendTestnet(consumed(bad), wallet)).toEqual({ ok: false, reason: "invalid-amount" });
    }
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses an invalid address", async () => {
    const { wallet, sendTransaction } = fakeWallet();
    expect(await sendTestnet(consumed("0.001", "0x1234"), wallet)).toEqual({ ok: false, reason: "invalid-address" });
    expect(await sendTestnet(consumed("0.001", "vitalik.eth"), wallet)).toEqual({ ok: false, reason: "invalid-address" });
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses when the RPC reports a chain other than Sepolia", async () => {
    const { wallet, sendTransaction } = fakeWallet(1);
    expect(await sendTestnet(consumed("0.001"), wallet)).toEqual({ ok: false, reason: "wrong-chain" });
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("returns send-failed, not a crash, when sending throws", async () => {
    const { wallet } = fakeWallet(11155111, true);
    expect(await sendTestnet(consumed("0.001"), wallet)).toEqual({ ok: false, reason: "send-failed" });
  });

  it("returns send-failed when reading the chain id throws", async () => {
    const wallet: WalletLike = {
      getChainId: async () => {
        throw new Error("rpc down");
      },
      sendTransaction: vi.fn(),
    };
    expect(await sendTestnet(consumed("0.001"), wallet)).toEqual({ ok: false, reason: "send-failed" });
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });
});

describe("maxTransferFromEnv", () => {
  it("uses a valid MAX_TRANSFER_ETH", () => {
    expect(maxTransferFromEnv({ MAX_TRANSFER_ETH: "0.002" })).toBe("0.002");
  });

  it("falls back to the default, never to no cap, on bad values", () => {
    for (const raw of [undefined, "", "abc", "-1", "0", "1e3"]) {
      expect(maxTransferFromEnv({ MAX_TRANSFER_ETH: raw })).toBe(DEFAULT_MAX_TRANSFER_ETH);
    }
  });
});

describe("createSepoliaWallet", () => {
  const rpc = { RPC_URL_SEPOLIA: "https://example.invalid" };

  it("refuses a missing, malformed or all-zero key", () => {
    expect(() => createSepoliaWallet({ ...rpc })).toThrow();
    expect(() => createSepoliaWallet({ ...rpc, PRIVATE_KEY_TESTNET: "0x1234" })).toThrow();
    expect(() => createSepoliaWallet({ ...rpc, PRIVATE_KEY_TESTNET: "0x" + "00".repeat(32) })).toThrow();
  });

  it("refuses when no RPC URL is set", () => {
    expect(() => createSepoliaWallet({ PRIVATE_KEY_TESTNET: "0x" + "11".repeat(32) })).toThrow();
  });

  it("builds a wallet from a valid key and RPC", () => {
    expect(() => createSepoliaWallet({ ...rpc, PRIVATE_KEY_TESTNET: "0x" + "11".repeat(32) })).not.toThrow();
  });
});
