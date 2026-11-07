import type { Finding } from "../types.js";

export const OP = {
  SELFDESTRUCT: 0xff,
  DELEGATECALL: 0xf4,
  CALLCODE: 0xf2,
} as const;

// EIP-1167 minimal proxy: fixed prefix, 20-byte implementation address, fixed suffix.
const MINIMAL_PROXY_PREFIX = "363d3d373d3d3d363d73";
const MINIMAL_PROXY_SUFFIX = "5af43d82803e903d91602b57fd5bf3";
const MINIMAL_PROXY_HEX_LENGTH = (10 + 20 + 15) * 2;

export const TINY_CODE_BYTES = 32;

export function normalizedHex(hex: string): string {
  return hex.trim().replace(/^0x/i, "").toLowerCase();
}

export function isMinimalProxy(hex: string): boolean {
  const h = normalizedHex(hex);
  return (
    h.length === MINIMAL_PROXY_HEX_LENGTH &&
    h.startsWith(MINIMAL_PROXY_PREFIX) &&
    h.endsWith(MINIMAL_PROXY_SUFFIX)
  );
}

export function checkNoCode(byteLength: number): Finding | null {
  if (byteLength !== 0) return null;
  return {
    id: "no-code",
    severity: "low",
    message:
      "Address has no contract code, so it looks like a normal wallet. That is informational, not a risk by itself.",
  };
}

export function checkSelfdestruct(ops: Set<number>): Finding | null {
  if (!ops.has(OP.SELFDESTRUCT)) return null;
  return {
    id: "selfdestruct",
    severity: "high",
    message:
      "Contract code contains SELFDESTRUCT, which can erase the contract and send out its funds.",
  };
}

export function checkDelegatecall(ops: Set<number>): Finding | null {
  if (!ops.has(OP.DELEGATECALL)) return null;
  return {
    id: "delegatecall",
    severity: "medium",
    message:
      "Contract code contains DELEGATECALL, which runs other code with this contract's storage and funds.",
  };
}

export function checkCallcode(ops: Set<number>): Finding | null {
  if (!ops.has(OP.CALLCODE)) return null;
  return {
    id: "callcode",
    severity: "medium",
    message:
      "Contract code contains CALLCODE, a legacy opcode that is rarely used legitimately.",
  };
}

export function checkMinimalProxy(hex: string): Finding | null {
  if (!isMinimalProxy(hex)) return null;
  return {
    id: "minimal-proxy",
    severity: "medium",
    message:
      "Contract is a minimal proxy (EIP-1167). The real logic lives at another address, so this code alone proves nothing.",
  };
}

export function checkTinyCode(byteLength: number, minimalProxy: boolean): Finding | null {
  if (byteLength === 0 || minimalProxy || byteLength >= TINY_CODE_BYTES) return null;
  return {
    id: "tiny-code",
    severity: "low",
    message: "Contract code is very short, which often means a stub that forwards elsewhere.",
  };
}
