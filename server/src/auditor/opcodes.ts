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

export function scanOpcodes(code: Uint8Array): Set<number> {
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
