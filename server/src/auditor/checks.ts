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

// Every finding id the auditor can produce. The Gemini reply check uses this list to
// catch a reply that mentions a finding the audit did not report.
export const FINDING_IDS = [
  "no-code",
  "selfdestruct",
  "delegatecall",
  "callcode",
  "minimal-proxy",
  "upgradeable-proxy",
  "tiny-code",
] as const;

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

// EIP-1967 storage slots. A non-zero value means the logic address (or the admin who can
// change it) lives in storage, so the code can be swapped after you check it.
export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
export const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

export function isNonZeroSlot(value: string | null | undefined): boolean {
  if (!value) return false;
  return /[1-9a-fA-F]/.test(value.replace(/^0x/i, ""));
}

export function checkUpgradeableProxy(slotValues: Array<string | null | undefined>): Finding | null {
  if (!slotValues.some(isNonZeroSlot)) return null;
  return {
    id: "upgradeable-proxy",
    severity: "medium",
    message:
      "Contract stores an implementation or admin address (EIP-1967). The logic can be swapped later, so today's check may not hold tomorrow.",
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
