// Hand-assembled EVM bytecode for the demo targets. No Solidity compiler needed.
// These are demo fixtures for Sepolia only. They exist so the auditor has something real
// to flag: a draining contract (HIGH), an upgradeable proxy (MEDIUM), a minimal-proxy
// clone (MEDIUM) and a plain contract (LOW).

const EIP1967_IMPLEMENTATION_SLOT_HEX =
  "360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

function addressHex(address: string): string {
  const h = address.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(h)) throw new Error("invalid address");
  return h;
}

const byteLength = (hex: string) => hex.length / 2;
const toHexByte = (n: number) => n.toString(16).padStart(2, "0");

// Init code that runs `prefix`, then copies `runtime` out of itself and returns it.
// Layout after the prefix: PUSH2 len, DUP1, PUSH1 offset, PUSH1 0, CODECOPY, PUSH1 0, RETURN.
function initFor(runtimeHex: string, prefixHex = ""): string {
  const len = byteLength(runtimeHex);
  const offset = byteLength(prefixHex) + 12;
  if (len > 0xffff || offset > 0xff) throw new Error("code too large for this helper");
  const lenHex = len.toString(16).padStart(4, "0");
  return "0x" + prefixHex + "61" + lenHex + "80" + "60" + toHexByte(offset) + "6000" + "39" + "6000" + "f3" + runtimeHex;
}

// 32 JUMPDESTs of padding keep the code above the "tiny code" threshold without adding
// any flagged opcode.
const PAD = "5b".repeat(32);

/** Any call runs SELFDESTRUCT to the caller. Audits as HIGH (selfdestruct). */
export const drainerRuntime = PAD + "33ff";
export const drainerInit = () => initFor(drainerRuntime);

/** Accepts ETH and does nothing else. Audits as LOW with no findings. */
export const cleanRuntime = PAD + "00";
export const cleanInit = () => initFor(cleanRuntime);

// EIP-1967-style proxy: every call is delegated to the address stored in the
// implementation slot. 67 bytes. The jump target (0x3e) is the JUMPDEST at index 62.
export const proxyRuntime =
  "36" + "6000" + "6000" + "37" + // calldatacopy(0, 0, calldatasize)
  "6000" + "6000" + "36" + "6000" + "7f" + EIP1967_IMPLEMENTATION_SLOT_HEX + "54" + "5a" + "f4" + // delegatecall(gas, sload(slot), 0, size, 0, 0)
  "3d" + "6000" + "6000" + "3e" + // returndatacopy(0, 0, returndatasize)
  "6000" + "3e" + "57" + // if result != 0 jump to 0x3e (the JUMPDEST below)
  "3d" + "6000" + "fd" + // revert(0, returndatasize)
  "5b" + "3d" + "6000" + "f3"; // return(0, returndatasize)

/** Stores `implementation` in the EIP-1967 slot, then returns the proxy runtime. */
export function proxyInit(implementation: string): string {
  const prefix = "73" + addressHex(implementation) + "7f" + EIP1967_IMPLEMENTATION_SLOT_HEX + "55";
  return initFor(proxyRuntime, prefix);
}

/** EIP-1167 minimal proxy (a clone) pointing at `implementation`. */
export function cloneRuntime(implementation: string): string {
  return "363d3d373d3d3d363d73" + addressHex(implementation) + "5af43d82803e903d91602b57fd5bf3";
}
export function cloneInit(implementation: string): string {
  return "0x" + "3d602d80600a3d3981f3" + cloneRuntime(implementation);
}
