// Walks EVM bytecode and collects the real opcodes, skipping PUSH data bytes.
// Without the skip, data that happens to equal 0xff would look like SELFDESTRUCT.

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, "");
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("invalid bytecode hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// The Solidity compiler appends a CBOR block (compiler version and an IPFS or Swarm hash) after the code,
// ending in a 2-byte length. Those bytes are data, but they look random, so a plain walk reads them as
// opcodes and flags a clean contract for SELFDESTRUCT (0xff), CALLCODE (0xf2) or DELEGATECALL (0xf4) with
// roughly a coin-flip chance. Cut the block off before scanning, but only when it really looks like
// that block: a CBOR map header, a length that fits, and one of the compiler's own keys inside.
const METADATA_KEYS = ["ipfs", "bzzr0", "bzzr1", "solc", "experimental"];

export function stripMetadata(code: Uint8Array): Uint8Array {
  if (code.length < 4) return code;
  const n = (code[code.length - 2] << 8) | code[code.length - 1];
  const start = code.length - 2 - n;
  if (n < 8 || start < 1) return code;
  if (code[start] < 0xa1 || code[start] > 0xa5) return code; // not a small CBOR map
  const text = String.fromCharCode(...code.slice(start, code.length - 2).map((b) => (b >= 0x20 && b < 0x7f ? b : 0x2e)));
  return METADATA_KEYS.some((k) => text.includes(k)) ? code.slice(0, start) : code;
}

export function scanOpcodes(fullCode: Uint8Array): Set<number> {
  const code = stripMetadata(fullCode);
  const seen = new Set<number>();
  let i = 0;
  while (i < code.length) {
    const op = code[i];
    seen.add(op);
    // PUSH1 (0x60) .. PUSH32 (0x7f) carry 1..32 data bytes that are not opcodes.
    if (op >= 0x60 && op <= 0x7f) {
      i += 1 + (op - 0x5f);
    } else {
      i += 1;
    }
  }
  return seen;
}
